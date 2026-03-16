"""Celery 任务：每 30 分钟采集链上数据，写入 TimescaleDB + Redis 缓存。"""

import asyncio
import logging

import sqlalchemy

from app.core.redis import init_redis, set_with_ttl, publish_stream
from app.data.onchain import OnchainCollector
from app.models.market_data import OnchainSnapshot
from app.services.symbol_registry import get_active_symbols_sync
from workers.celery_app import celery_app
from workers.db import worker_session

logger = logging.getLogger(__name__)

_collector = OnchainCollector()

_REDIS_TTL_SECONDS = 3600  # 60 分钟 (2x collection interval)



async def _upsert_snapshot(snapshot: OnchainSnapshot) -> None:
    """写入 / 更新 TimescaleDB onchain_snapshots 表。"""
    sql = sqlalchemy.text("""
        INSERT INTO onchain_snapshots
            (time, symbol, exchange_netflow, fear_greed_index, mvrv, active_addresses)
        VALUES
            (:time, :symbol, :exchange_netflow, :fear_greed_index, :mvrv, :active_addresses)
        ON CONFLICT (time, symbol) DO UPDATE
            SET exchange_netflow    = EXCLUDED.exchange_netflow,
                fear_greed_index    = EXCLUDED.fear_greed_index,
                mvrv                = EXCLUDED.mvrv,
                active_addresses    = EXCLUDED.active_addresses
    """)
    async with worker_session() as session:
        async with session.begin():
            await session.execute(
                sql,
                {
                    "time": snapshot.time,
                    "symbol": snapshot.symbol,
                    "exchange_netflow": snapshot.exchange_netflow,
                    "fear_greed_index": snapshot.fear_greed_index,
                    "mvrv": snapshot.mvrv,
                    "active_addresses": snapshot.active_addresses,
                },
            )




async def _cache_and_publish(snapshot: OnchainSnapshot) -> None:
    """缓存最新快照到 Redis 并发布到 Redis Stream。"""
    await init_redis()

    cache_key = f"legacy_onchain:{snapshot.symbol}"
    cache_data = snapshot.model_dump(mode="json")
    await set_with_ttl(cache_key, cache_data, _REDIS_TTL_SECONDS)

    await publish_stream("onchain_updates", cache_data)
    logger.info(
        "Onchain snapshot cached and published",
        extra={"symbol": snapshot.symbol, "cache_key": cache_key},
    )


async def _run_collect(symbols: list[str]) -> dict[str, str]:
    """对每个交易对采集链上快照，写入 DB + Redis。"""
    results: dict[str, str] = {}
    for symbol in symbols:
        try:
            snapshot = await _collector.collect_snapshot(symbol)
            try:
                await _upsert_snapshot(snapshot)
            except Exception as db_exc:
                logger.warning(
                    "Onchain DB upsert failed, continue with Redis cache",
                    extra={"symbol": symbol, "error": str(db_exc)},
                )
            await _cache_and_publish(snapshot)
            results[symbol] = "ok"
            logger.info("Onchain snapshot saved", extra={"symbol": symbol})
        except Exception as exc:
            logger.error(
                "collect_onchain_data failed for symbol",
                extra={"symbol": symbol, "error": str(exc)},
            )
            results[symbol] = f"error: {exc}"
    return results


@celery_app.task(
    name="workers.onchain_collector.collect_onchain_data",
    bind=True,
    max_retries=3,
)
def collect_onchain_data(
    self,
    symbols: list[str] | None = None,
) -> dict[str, str]:
    """每 30 分钟采集链上数据，写入 TimescaleDB + Redis 缓存。"""
    _symbols = symbols or get_active_symbols_sync()
    try:
        results = asyncio.run(_run_collect(_symbols))
        ok_count = sum(1 for v in results.values() if v == "ok")
        asyncio.run(_set_onchain_cap(
            "AVAILABLE" if ok_count > 0 else "UNAVAILABLE",
            "" if ok_count > 0 else "all symbols failed",
        ))
        return results
    except Exception as exc:
        logger.error("collect_onchain_data top-level error", extra={"error": str(exc)})
        asyncio.run(_set_onchain_cap("UNAVAILABLE", f"task exception: {exc}"))
        raise self.retry(exc=exc, countdown=120)


async def _set_onchain_cap(status_str: str, reason: str = "") -> None:
    """写入 onchain capability 运行时状态。"""
    from app.core.capability_state import CapabilityStatus, set_capability_status

    await init_redis()
    status = CapabilityStatus(status_str.lower())
    await set_capability_status("onchain", status, reason=reason)
