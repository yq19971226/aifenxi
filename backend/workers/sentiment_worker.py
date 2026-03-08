"""Celery 定时任务：每 30 分钟采集恐慌贪婪指数，写入 Redis 缓存。

数据来源：sentiment.py 的 fetch_fear_greed_index()
缓存键：sentiment:fear_greed（TTL=1h）
消费方：共识引擎 MarketData 组装时优先读取此缓存
"""

import asyncio
import logging

from app.core.redis import init_redis, set_with_ttl
from app.data.sentiment import fetch_fear_greed_index
from workers.celery_app import celery_app

logger = logging.getLogger(__name__)

_REDIS_KEY = "sentiment:fear_greed"
_REDIS_TTL_SECONDS = 3600  # 1 小时


async def _collect_sentiment() -> dict[str, object]:
    """采集恐慌贪婪指数并写入 Redis。"""
    await init_redis()

    data = await fetch_fear_greed_index()
    if data is None:
        logger.warning("fetch_fear_greed_index returned None, skipping Redis write")
        return {"status": "skipped", "reason": "fetch returned None"}

    await set_with_ttl(_REDIS_KEY, data, _REDIS_TTL_SECONDS)
    logger.info(
        "Sentiment data cached",
        extra={"key": _REDIS_KEY, "value": data.get("value"), "ttl": _REDIS_TTL_SECONDS},
    )
    return {"status": "ok", "value": data.get("value")}


@celery_app.task(
    name="workers.sentiment_worker.collect_sentiment_task",
    bind=True,
    max_retries=3,
)
def collect_sentiment_task(self) -> dict[str, object]:
    """Celery Beat 每 30 分钟触发，采集恐慌贪婪指数写入 Redis。"""
    try:
        result = asyncio.run(_collect_sentiment())
        asyncio.run(_set_sentiment_cap(
            "AVAILABLE" if result.get("status") == "ok" else "UNAVAILABLE",
            "" if result.get("status") == "ok" else result.get("reason", "fetch failed"),
        ))
        return result
    except Exception as exc:
        logger.error("collect_sentiment_task error", extra={"error": str(exc)})
        asyncio.run(_set_sentiment_cap("UNAVAILABLE", f"task exception: {exc}"))
        raise self.retry(exc=exc, countdown=120)


async def _set_sentiment_cap(status_str: str, reason: str = "") -> None:
    """写入 sentiment:fear_greed capability 运行时状态。"""
    from app.core.capability_state import CapabilityStatus, set_capability_status

    await init_redis()
    status = CapabilityStatus(status_str.lower())
    await set_capability_status("sentiment:fear_greed", status, reason=reason)
