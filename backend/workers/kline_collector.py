"""Celery 任务：定时拉取最新 K 线并写入 TimescaleDB。

v4.0: 币种从数据库动态读取，周期扩展为 5m/15m/1h/4h/1d/1w。
"""

import asyncio
import logging

import sqlalchemy

from app.core.mode_contract import ALL_MODE_KLINE_INTERVALS
from app.data.binance_rest import BinanceRestClient
from app.models.market_data import KlineData
from app.services.symbol_registry import get_active_symbols
from workers.celery_app import celery_app
from workers.db import worker_session

logger = logging.getLogger(__name__)

_client = BinanceRestClient()

DEFAULT_INTERVALS = list(ALL_MODE_KLINE_INTERVALS)


async def _fetch_active_symbols() -> list[str]:
    """从数据库读取已启用的币种列表，失败时回退到 DEFAULT_SYMBOLS。"""
    return await get_active_symbols()


_UPSERT_SQL = sqlalchemy.text("""
    INSERT INTO klines (time, symbol, interval, open, high, low, close, volume)
    VALUES (:time, :symbol, :interval, :open, :high, :low, :close, :volume)
    ON CONFLICT (time, symbol, interval) DO UPDATE
        SET open   = EXCLUDED.open,
            high   = EXCLUDED.high,
            low    = EXCLUDED.low,
            close  = EXCLUDED.close,
            volume = EXCLUDED.volume
""")


async def _upsert_klines(session, klines: list[KlineData]) -> None:
    async with session.begin():
        for k in klines:
            await session.execute(
                _UPSERT_SQL,
                {
                    "time": k.open_time,
                    "symbol": k.symbol,
                    "interval": k.interval,
                    "open": k.open,
                    "high": k.high,
                    "low": k.low,
                    "close": k.close,
                    "volume": k.volume,
                },
            )


async def _cache_klines_to_redis(symbol: str, interval: str, klines: list[KlineData]) -> None:
    """将 K 线数据缓存到 Redis，供分析引擎实时读取。"""
    from app.core.redis import init_redis, set_with_ttl
    await init_redis()
    cache_key = f"klines:{symbol}:{interval}"
    data = [k.model_dump(mode="json") for k in klines]
    await set_with_ttl(cache_key, data, ttl_seconds=600)  # 10 分钟 TTL

    # 同时缓存最新价格（从最后一根 K 线取 close，存为纯数值）
    if klines:
        price_key = f"latest_price:{symbol}"
        await set_with_ttl(price_key, klines[-1].close, ttl_seconds=600)


async def _run_collect(symbols: list[str], intervals: list[str]) -> dict:
    results: dict[str, int] = {}
    async with worker_session() as session:
      for symbol in symbols:
        for interval in intervals:
            try:
                klines = await _client.fetch_klines(symbol, interval, limit=200)
                await _upsert_klines(session, klines)
                results[f"{symbol}_{interval}"] = len(klines)
                logger.info(
                    "Klines collected",
                    extra={"symbol": symbol, "interval": interval, "count": len(klines)},
                )
                # 缓存到 Redis 供分析引擎读取
                try:
                    await _cache_klines_to_redis(symbol, interval, klines)
                except Exception as cache_exc:
                    logger.warning(
                        "Failed to cache klines to Redis",
                        extra={"symbol": symbol, "interval": interval, "error": str(cache_exc)},
                    )
                # 发布到 Redis Streams，触发 indicator_worker
                try:
                    from app.core.redis import init_redis, publish_stream
                    await init_redis()
                    await publish_stream(
                        "kline_updates",
                        {
                            "symbol": symbol,
                            "interval": interval,
                            "is_closed": True,
                            "count": len(klines),
                        },
                    )
                except Exception as stream_exc:
                    logger.warning(
                        "Failed to publish kline_updates stream",
                        extra={"symbol": symbol, "interval": interval, "error": str(stream_exc)},
                    )
            except Exception as exc:
                logger.error(
                    "collect_klines_task failed for pair",
                    extra={"symbol": symbol, "interval": interval, "error": str(exc)},
                )
                results[f"{symbol}_{interval}"] = -1
    return results  # worker_session context manager disposes engine here


@celery_app.task(name="workers.kline_collector.collect_klines_task", bind=True, max_retries=3)
def collect_klines_task(
    self,
    symbols: list[str] | None = None,
    intervals: list[str] | None = None,
) -> dict:
    """每 5 分钟拉取最新 K 线，写入 TimescaleDB。

    symbols=None 时自动从数据库读取已启用币种。
    """
    _intervals = intervals or DEFAULT_INTERVALS
    try:
        _symbols = symbols or asyncio.run(_fetch_active_symbols())
        results = asyncio.run(_run_collect(_symbols, _intervals))
        ok_count = sum(1 for v in results.values() if isinstance(v, int) and v > 0)
        asyncio.run(_set_kline_cap(
            "AVAILABLE" if ok_count > 0 else "UNAVAILABLE",
            "" if ok_count > 0 else "all kline collections failed",
        ))
        return results
    except Exception as exc:
        logger.error("collect_klines_task top-level error", extra={"error": str(exc)})
        asyncio.run(_set_kline_cap("UNAVAILABLE", f"task exception: {exc}"))
        raise self.retry(exc=exc, countdown=60)


async def _set_kline_cap(status_str: str, reason: str = "") -> None:
    """写入 market_klines capability 运行时状态。"""
    from app.core.capability_state import CapabilityStatus, set_capability_status
    from app.core.redis import init_redis

    await init_redis()
    status = CapabilityStatus(status_str.lower())
    await set_capability_status("market_klines", status, reason=reason)
