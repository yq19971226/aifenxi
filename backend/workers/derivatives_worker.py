"""Celery 任务：合约数据采集 Worker — 为所有已启用交易对采集资金费率、多空比和爆仓数据。

- collect_derivatives_snapshot_task: Celery Beat 每5分钟触发，采集资金费率+多空比
- collect_liquidations_task: Celery Beat 每1分钟触发，采集爆仓事件
"""

import asyncio
import logging

from app.data.derivatives import DerivativesCollector
from app.services.symbol_registry import SymbolRegistry
from workers.celery_app import celery_app
from workers.db import worker_engine

logger = logging.getLogger(__name__)


async def _collect_all_snapshots(symbol: str | None = None) -> dict[str, int]:
    """遍历所有已启用交易对，逐个采集合约快照（资金费率+多空比）。"""
    from app.core.redis import init_redis
    await init_redis()

    success = 0
    errors = 0

    async with worker_engine() as (_eng, _factory):
        async with _factory() as session:
            async with session.begin():
                registry = SymbolRegistry(session)
                symbols = await registry.list_symbols(enabled_only=True)

        # 仅采集支持合约数据的交易对；若指定 symbol 则只采集该交易对
        targets = [s for s in symbols if s.has_derivatives]
        if symbol:
            target_symbol = symbol.upper()
            targets = [s for s in targets if s.symbol.upper() == target_symbol]

        if not targets:
            return {"success": 0, "errors": 0, "total": 0}

        for sym_config in targets:
            try:
                async with _factory() as session:
                    async with session.begin():
                        collector = DerivativesCollector(session)
                        await collector.collect_snapshot(sym_config.symbol)
                        success += 1
            except Exception as exc:
                errors += 1
                logger.error(
                    "合约快照采集失败: symbol=%s, error=%s",
                    sym_config.symbol,
                    exc,
                )

    logger.info(
        "合约快照采集完成: total=%d, success=%d, errors=%d",
        len(targets),
        success,
        errors,
    )
    return {"success": success, "errors": errors, "total": len(targets)}


async def _collect_all_liquidations() -> dict[str, int]:
    """遍历所有已启用交易对，逐个采集爆仓事件。"""
    from app.core.redis import init_redis
    await init_redis()

    success = 0
    errors = 0

    async with worker_engine() as (_eng, _factory):
        async with _factory() as session:
            async with session.begin():
                registry = SymbolRegistry(session)
                symbols = await registry.list_symbols(enabled_only=True)

        targets = [s for s in symbols if s.has_derivatives]

        if not targets:
            return {"success": 0, "errors": 0, "total": 0}

        for sym_config in targets:
            try:
                async with _factory() as session:
                    async with session.begin():
                        collector = DerivativesCollector(session)
                        await collector.collect_liquidations(sym_config.symbol)
                        success += 1
            except Exception as exc:
                errors += 1
                logger.error(
                    "爆仓数据采集失败: symbol=%s, error=%s",
                    sym_config.symbol,
                    exc,
                )

    logger.info(
        "爆仓数据采集完成: total=%d, success=%d, errors=%d",
        len(targets),
        success,
        errors,
    )
    return {"success": success, "errors": errors, "total": len(targets)}


@celery_app.task(
    name="workers.derivatives_worker.collect_derivatives_snapshot_task",
    bind=True,
    max_retries=2,
)
def collect_derivatives_snapshot_task(self, symbol: str | None = None) -> dict[str, int]:
    """Celery Beat 每5分钟触发，为所有已启用交易对采集合约快照。"""
    try:
        result = asyncio.run(_collect_all_snapshots(symbol))
        asyncio.run(_set_derivatives_cap(
            "AVAILABLE" if result.get("success", 0) > 0 else "UNAVAILABLE",
            "" if result.get("success", 0) > 0 else "all symbols failed",
        ))
        return result
    except Exception as exc:
        logger.error("collect_derivatives_snapshot_task error: %s", exc)
        asyncio.run(_set_derivatives_cap("UNAVAILABLE", f"task exception: {exc}"))
        raise self.retry(exc=exc, countdown=30)


@celery_app.task(
    name="workers.derivatives_worker.collect_liquidations_task",
    bind=True,
    max_retries=2,
)
def collect_liquidations_task(self) -> dict[str, int]:
    """Celery Beat 每1分钟触发，为所有已启用交易对采集爆仓事件。"""
    try:
        result = asyncio.run(_collect_all_liquidations())
        return result
    except Exception as exc:
        logger.error("collect_liquidations_task error: %s", exc)
        raise self.retry(exc=exc, countdown=15)


async def _set_derivatives_cap(status_str: str, reason: str = "") -> None:
    """写入 derivatives capability 运行时状态。"""
    from app.core.capability_state import CapabilityStatus, set_capability_status
    from app.core.redis import init_redis

    await init_redis()
    status = CapabilityStatus(status_str.lower())
    await set_capability_status("derivatives", status, reason=reason)
