"""Celery 任务：消费 Redis Streams(kline_updates)，计算指标，写入 TimescaleDB。"""

import asyncio
import json
import logging

import sqlalchemy

from app.core.redis import get_redis_pool, init_redis
from app.data.binance_rest import BinanceRestClient
from app.data.indicators import IndicatorCalculator
from app.models.market_data import IndicatorResult
from workers.celery_app import celery_app
from workers.db import worker_session

logger = logging.getLogger(__name__)

_rest_client = BinanceRestClient()
_calculator = IndicatorCalculator()

_STREAM_KEY = "kline_updates"
_CONSUMER_GROUP = "indicator_workers"
_CONSUMER_NAME = "indicator_worker_1"


def _is_streams_unsupported(exc: Exception) -> bool:
    msg = str(exc).lower()
    return "unknown command" in msg or "not supported" in msg


_UPSERT_INDICATOR_SQL = sqlalchemy.text("""
    INSERT INTO indicators
        (time, symbol, interval, ema7, ema25, ema99, rsi,
         macd, macd_signal, macd_histogram, bb_upper, bb_middle, bb_lower)
    VALUES
        (:time, :symbol, :interval, :ema7, :ema25, :ema99, :rsi,
         :macd, :macd_signal, :macd_histogram, :bb_upper, :bb_middle, :bb_lower)
    ON CONFLICT (time, symbol, interval) DO UPDATE
        SET ema7           = EXCLUDED.ema7,
            ema25          = EXCLUDED.ema25,
            ema99          = EXCLUDED.ema99,
            rsi            = EXCLUDED.rsi,
            macd           = EXCLUDED.macd,
            macd_signal    = EXCLUDED.macd_signal,
            macd_histogram = EXCLUDED.macd_histogram,
            bb_upper       = EXCLUDED.bb_upper,
            bb_middle      = EXCLUDED.bb_middle,
            bb_lower       = EXCLUDED.bb_lower
""")


async def _upsert_indicator(session, result: IndicatorResult) -> None:
    async with session.begin():
        await session.execute(
            _UPSERT_INDICATOR_SQL,
            {
                "time": result.time,
                "symbol": result.symbol,
                "interval": result.interval,
                "ema7": result.ema7,
                "ema25": result.ema25,
                "ema99": result.ema99,
                "rsi": result.rsi,
                "macd": result.macd,
                "macd_signal": result.macd_signal,
                "macd_histogram": result.macd_histogram,
                "bb_upper": result.bb_upper,
                "bb_middle": result.bb_middle,
                "bb_lower": result.bb_lower,
            },
        )


async def _process_stream_message(msg_data: dict) -> None:
    """处理单条 kline_updates 消息：拉取历史 K 线 → 计算指标 → 写入 DB。"""
    try:
        symbol = json.loads(msg_data.get("symbol", '""'))
        interval = json.loads(msg_data.get("interval", '""'))
        is_closed = json.loads(msg_data.get("is_closed", "false"))

        if not is_closed:
            return  # 只处理已关闭的 K 线

        klines = await _rest_client.fetch_klines(symbol, interval, limit=200)
        if len(klines) < 30:
            logger.warning("Not enough klines for indicators", extra={"symbol": symbol, "interval": interval})
            return

        result = _calculator.calculate_all(klines)
        async with worker_session() as session:
            await _upsert_indicator(session, result)

        # 缓存指标到 Redis 供分析引擎读取
        try:
            from app.core.redis import set_with_ttl
            cache_key = f"indicators:{symbol}:{interval}"
            await set_with_ttl(cache_key, result.model_dump(mode="json"), ttl_seconds=600)
        except Exception as cache_exc:
            logger.warning("Failed to cache indicators to Redis", extra={"error": str(cache_exc)})

        logger.info(
            "Indicators calculated and saved",
            extra={"symbol": symbol, "interval": interval, "time": result.time},
        )
    except Exception as exc:
        logger.error(
            "Failed to process stream message",
            extra={"error": str(exc), "msg_data": str(msg_data)},
        )


async def _consume_stream_once() -> int:
    """从 Redis Stream 读取一批消息并处理，返回处理条数。"""
    await init_redis()
    redis = get_redis_pool()

    # 确保 consumer group 存在
    try:
        await redis.xgroup_create(_STREAM_KEY, _CONSUMER_GROUP, id="0", mkstream=True)
    except Exception as exc:
        if _is_streams_unsupported(exc):
            logger.warning(
                "Redis Streams not supported (requires Redis 5.0+), indicator_worker disabled",
            )
            return 0
        pass  # group 已存在

    try:
        messages = await redis.xreadgroup(
            _CONSUMER_GROUP,
            _CONSUMER_NAME,
            {_STREAM_KEY: ">"},
            count=20,
            block=5000,
        )
    except Exception as exc:
        if _is_streams_unsupported(exc):
            logger.warning(
                "Redis Streams not supported (requires Redis 5.0+), indicator_worker disabled",
            )
            return 0
        raise

    count = 0
    if messages:
        for _stream, entries in messages:
            for msg_id, msg_data in entries:
                await _process_stream_message(msg_data)
                await redis.xack(_STREAM_KEY, _CONSUMER_GROUP, msg_id)
                count += 1
    return count


@celery_app.task(name="workers.indicator_worker.calculate_indicators_task", bind=True, max_retries=3)
def calculate_indicators_task(self) -> dict:
    """消费 Redis Streams(kline_updates)，计算技术指标，写入 TimescaleDB。"""
    try:
        processed = asyncio.run(_consume_stream_once())
        return {"processed": processed}
    except Exception as exc:
        logger.error("calculate_indicators_task error", extra={"error": str(exc)})
        raise self.retry(exc=exc, countdown=30)
