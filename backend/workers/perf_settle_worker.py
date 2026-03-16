"""Celery 任务：绩效结算 Worker — 每分钟检查所有未结算策略，执行止损/目标/超时结算。"""

import asyncio
import logging

from app.core.redis import init_redis
from app.services.performance import PerformanceTracker
from workers.celery_app import celery_app
from workers.db import worker_engine

logger = logging.getLogger(__name__)


async def _settle_all() -> dict[str, int]:
    """遍历所有未结算策略快照，逐条检查并结算。"""
    await init_redis()
    settled = 0
    errors = 0

    async with worker_engine() as (_eng, _factory):
        async with _factory() as session:
            async with session.begin():
                tracker = PerformanceTracker(session)
                pending = await tracker.get_pending_snapshots()

        if not pending:
            return {"settled": 0, "errors": 0, "pending": 0}

        for snapshot in pending:
            try:
                async with _factory() as session:
                    async with session.begin():
                        tracker = PerformanceTracker(session)
                        result = await tracker.check_and_settle(snapshot["id"])
                        if result:
                            settled += 1
                            logger.info(
                                "策略 %s 已结算: status=%s, PnL=%.4f%%",
                                snapshot["strategy_id"],
                                result.status,
                                result.pnl_pct,
                            )
            except Exception as exc:
                errors += 1
                logger.error(
                    "结算失败: snapshot=%s, strategy=%s, error=%s",
                    snapshot["id"],
                    snapshot.get("strategy_id", "unknown"),
                    exc,
                )

    logger.info(
        "绩效结算完成: pending=%d, settled=%d, errors=%d",
        len(pending),
        settled,
        errors,
    )
    return {"settled": settled, "errors": errors, "pending": len(pending)}


@celery_app.task(
    name="workers.perf_settle_worker.settle_strategies_task",
    bind=True,
    max_retries=2,
)
def settle_strategies_task(self) -> dict[str, int]:
    """Celery Beat 每分钟触发，检查所有未结算策略。"""
    try:
        result = asyncio.run(_settle_all())
        return result
    except Exception as exc:
        logger.error("settle_strategies_task error: %s", exc)
        raise self.retry(exc=exc, countdown=30)
