"""Celery 任务：多币种调度器 — 为每个启用的交易对并行提交采集任务。"""

import asyncio
import logging

from app.core.mode_contract import ALL_MODE_KLINE_INTERVALS
from app.core.redis import get_redis_pool, init_redis
from app.services.symbol_registry import SymbolRegistry
from workers.celery_app import celery_app
from workers.db import worker_engine

logger = logging.getLogger(__name__)

_ERROR_COUNT_KEY = "symbol_error_count:{symbol}"
_ERROR_COUNT_TTL = 3600


async def _increment_error_count(symbol: str) -> int:
    """递增采集失败计数，返回当前计数。"""
    redis = get_redis_pool()
    key = _ERROR_COUNT_KEY.format(symbol=symbol)
    count = await redis.incr(key)
    if count == 1:
        await redis.expire(key, _ERROR_COUNT_TTL)
    return count


async def _reset_error_count(symbol: str) -> None:
    """重置采集失败计数。"""
    redis = get_redis_pool()
    key = _ERROR_COUNT_KEY.format(symbol=symbol)
    await redis.delete(key)


async def _collect_single_symbol(symbol: str, has_onchain: bool, has_derivatives: bool) -> None:
    """单个交易对的完整采集流程 — 并行提交各采集任务到 Celery 队列。"""
    # K线采集（所有交易对都需要）
    celery_app.send_task(
        "workers.kline_collector.collect_klines_task",
        args=([symbol], ALL_MODE_KLINE_INTERVALS),
    )

    # 链上数据采集（仅支持链上数据的交易对）
    if has_onchain:
        celery_app.send_task(
            "workers.onchain_collector.collect_onchain_data",
            args=([symbol],),
        )

    # 合约数据采集（仅支持合约数据的交易对）
    if has_derivatives:
        celery_app.send_task(
            "workers.derivatives_worker.collect_derivatives_snapshot_task",
            args=(symbol,),
        )


async def _schedule_all() -> dict[str, int]:
    """遍历所有启用的交易对，为每个提交采集任务。"""
    await init_redis()

    async with worker_engine() as (_eng, _factory):
        async with _factory() as session:
            registry = SymbolRegistry(session)
            symbols = await registry.list_symbols(enabled_only=True)

        scheduled = 0
        errors = 0

        for sym in symbols:
            try:
                await _collect_single_symbol(sym.symbol, sym.has_onchain, sym.has_derivatives)
                await _reset_error_count(sym.symbol)
                scheduled += 1
            except Exception as exc:
                logger.error("调度交易对 %s 采集失败: %s", sym.symbol, exc)
                error_count = await _increment_error_count(sym.symbol)
                if error_count >= 3:
                    try:
                        async with _factory() as session:
                            async with session.begin():
                                reg = SymbolRegistry(session)
                                await reg.mark_error(sym.symbol, error_count)
                    except Exception as mark_exc:
                        logger.error("标记交易对 %s 异常失败: %s", sym.symbol, mark_exc)
                errors += 1

    return {"scheduled": scheduled, "errors": errors}


@celery_app.task(
    name="workers.multi_symbol_scheduler.schedule_all_symbols",
    bind=True,
    max_retries=2,
)
def schedule_all_symbols(self) -> dict[str, int]:
    """Celery Beat 每分钟触发，为每个启用的交易对提交采集任务。"""
    try:
        result = asyncio.run(_schedule_all())
        logger.info("多币种调度完成: %s", result)
        return result
    except Exception as exc:
        logger.error("schedule_all_symbols error: %s", exc)
        raise self.retry(exc=exc, countdown=30)
