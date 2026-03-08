"""Celery 任务：CryptoQuant 链上数据采集。

- collect_cryptoquant_data: 每30分钟触发，为 BTC/ETH 采集链上指标
- 20 req/min 节流由 CryptoQuantClient 内部管理
- 采集完成后回写 capability_state
"""

import asyncio
import logging

from app.core.redis import init_redis
from app.data.cryptoquant_client import SYMBOL_TO_ASSET
from app.data.cryptoquant_collector import CryptoQuantCollector
from workers.celery_app import celery_app

logger = logging.getLogger(__name__)


async def _collect_all() -> dict[str, int]:
    """遍历所有支持的币种，采集 CryptoQuant 数据。"""
    await init_redis()

    from app.data.source_gate import is_enabled
    if not await is_enabled("cryptoquant"):
        logger.info("CryptoQuant 数据源已关闭，跳过采集")
        from app.core.capability_state import set_capability_status, CapabilityStatus
        await set_capability_status("onchain", CapabilityStatus.DISABLED, reason="datasource disabled by admin")
        return {"success": 0, "errors": 0, "total": 0}

    collector = CryptoQuantCollector()
    success = 0
    errors = 0

    try:
        for symbol in SYMBOL_TO_ASSET:
            try:
                await collector.collect_and_cache(symbol)
                success += 1
            except Exception as exc:
                errors += 1
                logger.error("cq_collect_failed", extra={"symbol": symbol, "error": str(exc)})
    finally:
        await collector.close()

    logger.info("CryptoQuant 采集完成: success=%d, errors=%d", success, errors)
    return {"success": success, "errors": errors, "total": len(SYMBOL_TO_ASSET)}


@celery_app.task(
    name="workers.cryptoquant_worker.collect_cryptoquant_data",
    bind=True,
    max_retries=2,
)
def collect_cryptoquant_data(self) -> dict[str, int]:
    """Celery Beat 每30分钟触发，采集 CryptoQuant 链上数据。"""
    try:
        result = asyncio.run(_collect_all())
        asyncio.run(_set_cq_cap(
            "AVAILABLE" if result.get("success", 0) > 0 else "UNAVAILABLE",
            "" if result.get("success", 0) > 0 else "all symbols failed",
        ))
        return result
    except Exception as exc:
        logger.error("collect_cryptoquant_data error: %s", exc)
        asyncio.run(_set_cq_cap("UNAVAILABLE", f"task exception: {exc}"))
        raise self.retry(exc=exc, countdown=120)


async def _set_cq_cap(status_str: str, reason: str = "") -> None:
    """写入 onchain capability 运行时状态。"""
    from app.core.capability_state import CapabilityStatus, set_capability_status
    await init_redis()
    status = CapabilityStatus(status_str.lower())
    await set_capability_status("onchain", status, reason=reason)
