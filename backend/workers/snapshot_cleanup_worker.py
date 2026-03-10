"""Celery 任务：策略快照清理 — 每天凌晨删除超过保留期的已结算快照。

清理条件（全部满足）：
1. created_at < NOW() - snapshot_retention_days
2. status != 'pending'（绝不删未结算快照）
3. CASCADE 会自动删除关联的 perf_checkpoints

保留天数通过 settings.snapshot_retention_days 配置，默认 180 天。
"""

import asyncio
import logging

from sqlalchemy import text

from app.core.config import settings
from app.core.sql_compat import now_minus_interval_literal
from workers.celery_app import celery_app
from workers.db import worker_session

logger = logging.getLogger(__name__)

_BATCH_SIZE = 1000


async def _cleanup_old_snapshots() -> dict[str, int]:
    """删除超过保留期的已结算快照，返回删除数量。"""
    retention_days = settings.snapshot_retention_days
    cutoff = now_minus_interval_literal(retention_days, "days")

    # 先统计待删除数量
    async with worker_session() as session:
        async with session.begin():
            count_sql = text(f"""
                SELECT COUNT(*) FROM strategy_snapshots
                WHERE created_at < {cutoff}
                  AND status != 'pending'
            """)
            count_result = await session.execute(count_sql)
            total = int(count_result.scalar() or 0)

    if total == 0:
        logger.info("快照清理：无过期数据（保留期 %d 天）", retention_days)
        return {"deleted": 0, "retention_days": retention_days}

    # 分批删除，每批独立事务，避免长事务锁表
    deleted = 0
    while True:
        async with worker_session() as session:
            async with session.begin():
                delete_sql = text(f"""
                    DELETE FROM strategy_snapshots
                    WHERE id IN (
                        SELECT id FROM strategy_snapshots
                        WHERE created_at < {cutoff}
                          AND status != 'pending'
                        LIMIT {_BATCH_SIZE}
                    )
                """)
                result = await session.execute(delete_sql)
                batch = result.rowcount
        deleted += batch
        if batch < _BATCH_SIZE:
            break

    logger.info(
        "快照清理完成：删除 %d 条（保留期 %d 天）",
        deleted, retention_days,
    )
    return {"deleted": deleted, "retention_days": retention_days}


@celery_app.task(
    name="workers.snapshot_cleanup_worker.cleanup_old_snapshots_task",
    bind=True,
    max_retries=1,
)
def cleanup_old_snapshots_task(self) -> dict[str, int]:
    """Celery Beat 每天触发，清理过期策略快照。"""
    try:
        result = asyncio.run(_cleanup_old_snapshots())
        return result
    except Exception as exc:
        logger.error("cleanup_old_snapshots_task error: %s", exc)
        raise self.retry(exc=exc, countdown=300)
