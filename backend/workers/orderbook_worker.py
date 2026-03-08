"""Celery 任务：订单簿快照采集 Worker — 每 10 秒为所有已启用交易对采集深度数据。

- collect_orderbook_task: Celery Beat 每10秒触发，采集所有交易对的订单簿快照
"""

import asyncio
import logging

from app.data.orderbook_collector import collect_all_orderbooks
from workers.celery_app import celery_app

logger = logging.getLogger(__name__)


async def _collect_all() -> dict[str, int]:
    """异步采集所有已启用交易对的订单簿。"""
    from app.core.database import AsyncSessionLocal
    from app.services.symbol_registry import SymbolRegistry

    async with AsyncSessionLocal() as session:
        registry = SymbolRegistry(session)
        symbols = await registry.list_symbols(enabled_only=True)

    sym_list = [s.symbol for s in symbols]
    if not sym_list:
        return {"success": 0, "errors": 0, "total": 0}

    return await collect_all_orderbooks(sym_list)


@celery_app.task(
    name="workers.orderbook_worker.collect_orderbook_task",
    bind=True,
    max_retries=1,
)
def collect_orderbook_task(self) -> dict[str, int]:
    """Celery Beat 每10秒触发，为所有已启用交易对采集订单簿快照。"""
    try:
        result = asyncio.run(_collect_all())
        # 写入 orderbook capability 运行时状态
        success = result.get("success", 0)
        total = result.get("total", 0)
        if success > 0:
            asyncio.run(_set_orderbook_cap("AVAILABLE"))
        elif total > 0:
            asyncio.run(_set_orderbook_cap("UNAVAILABLE", "all symbols failed"))
        return result
    except Exception as exc:
        logger.error("collect_orderbook_task error: %s", exc)
        asyncio.run(_set_orderbook_cap("UNAVAILABLE", f"task exception: {exc}"))
        raise self.retry(exc=exc, countdown=5)


async def _set_orderbook_cap(status_str: str, reason: str = "") -> None:
    """写入 orderbook capability 运行时状态。"""
    from app.core.capability_state import CapabilityStatus, set_capability_status
    from app.core.redis import init_redis

    await init_redis()
    status = CapabilityStatus(status_str.lower())
    await set_capability_status("orderbook", status, reason=reason)
