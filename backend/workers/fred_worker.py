"""Celery 任务：FRED 宏观数据采集。

- collect_fred_data: 每6小时触发，采集8个核心美国宏观序列
- 采集完成后回写 macro 域 capability_state
"""

import asyncio
import logging

from app.core.redis import init_redis
from app.data.fred_collector import FredCollector
from workers.celery_app import celery_app

logger = logging.getLogger(__name__)


async def _collect_all() -> dict:
    """采集所有 FRED 宏观序列。"""
    await init_redis()

    from app.data.source_gate import is_enabled
    if not await is_enabled("fred"):
        logger.info("FRED 数据源已关闭，跳过采集")
        from app.core.capability_state import set_capability_status, CapabilityStatus
        await set_capability_status("fred_macro", CapabilityStatus.DISABLED, reason="datasource disabled by admin")
        return {"success": 0, "errors": 0, "total": 0}

    collector = FredCollector()
    try:
        snapshot = await collector.collect_and_cache()
        return {
            "success": snapshot.get("ok_count", 0),
            "errors": snapshot.get("total_count", 0) - snapshot.get("ok_count", 0),
            "total": snapshot.get("total_count", 0),
        }
    finally:
        await collector.close()


@celery_app.task(
    name="workers.fred_worker.collect_fred_data",
    bind=True,
    max_retries=2,
)
def collect_fred_data(self) -> dict:
    """Celery Beat 每6小时触发，采集 FRED 宏观数据。"""
    try:
        result = asyncio.run(_collect_all())
        asyncio.run(_set_fred_caps(
            "AVAILABLE" if result.get("success", 0) > 0 else "UNAVAILABLE",
            "" if result.get("success", 0) > 0 else "all series failed",
        ))
        return result
    except Exception as exc:
        logger.error("collect_fred_data error: %s", exc)
        asyncio.run(_set_fred_caps("UNAVAILABLE", f"task exception: {exc}"))
        raise self.retry(exc=exc, countdown=300)


async def _set_fred_caps(status_str: str, reason: str = "") -> None:
    """写入 FRED macro capability 运行时状态。"""
    from app.core.capability_state import CapabilityStatus, set_capability_status
    await init_redis()
    status = CapabilityStatus(status_str.lower())
    await set_capability_status("fred_macro", status, reason=reason)
