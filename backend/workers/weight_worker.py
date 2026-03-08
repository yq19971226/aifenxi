"""Celery 任务：共识引擎权重更新 Worker — 每6小时重新计算各模型权重。

- update_weights_task: Celery Beat 每6小时触发，基于近30天预测准确率更新权重
"""

import asyncio
import logging

from app.consensus.weights import update_weights
from workers.celery_app import celery_app
from workers.db import worker_session

logger = logging.getLogger(__name__)


async def _run_update() -> dict[str, object]:
    """创建 DB session，调用 update_weights，返回权重字典。"""
    async with worker_session() as session:
        report = await update_weights(session)
        logger.info(
            "权重更新完成",
            extra={"weights": report.weights, "models": len(report.model_details)},
        )
        return {"status": "ok", "weights": report.weights}


@celery_app.task(
    name="workers.weight_worker.update_weights_task",
    bind=True,
    max_retries=2,
)
def update_weights_task(self) -> dict[str, object]:  # type: ignore[override]
    """Celery Beat 每6小时触发，基于近30天预测准确率更新各模型权重。"""
    try:
        return asyncio.run(_run_update())
    except Exception as exc:
        logger.error("update_weights_task error: %s", exc)
        raise self.retry(exc=exc, countdown=60)
