"""定期对账 Worker — Celery 任务，定时调用 reconcile_all。"""

import asyncio
import logging

from workers.celery_app import celery_app

logger = logging.getLogger(__name__)


@celery_app.task(name="workers.reconcile_worker.reconcile_balances_task", ignore_result=True)
def reconcile_balances_task():
    """对账合伙人余额和奖励次数（每 6 小时执行一次）。"""
    asyncio.run(_reconcile_all())


async def _reconcile_all():
    try:
        from app.core.database import AsyncSessionLocal
        from app.services.partner_reconcile import reconcile_all

        async with AsyncSessionLocal() as session:
            result = await reconcile_all(session)

        partner = result.get("partner", {})
        bonus = result.get("bonus", {})
        logger.info(
            "对账完成: partner_checked=%d partner_fixed=%d bonus_checked=%d bonus_fixed=%d",
            partner.get("checked", 0),
            partner.get("fixed", 0),
            bonus.get("checked", 0),
            bonus.get("fixed", 0),
        )
    except Exception as exc:
        logger.error("对账任务异常: %s", exc, exc_info=True)
