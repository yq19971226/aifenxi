"""合伙人 & 奖励余额对账服务 — 从 DB 真值重建 Redis 余额。

定期运行，自动修复 Redis 与 DB 之间的余额不一致。
典型场景：Redis 重启丢数据、佣金同步写入失败、人工数据库订正。

用法：
    在 Celery Beat 任务中注册为定时任务（建议每 6 小时执行一次）:
    reconcile_all_balances.delay()
"""

import logging

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.redis import get_redis_pool

logger = logging.getLogger(__name__)


async def reconcile_partner_balances(session: AsyncSession) -> dict:
    """从 commissions + withdrawals 表重建精确余额。

    公式: balance = 总确认佣金 - 已完成提现 - 冻结中提现
           frozen  = 冻结中提现总额
    """
    redis = get_redis_pool()

    result = await session.execute(
        text("""
            SELECT
                c.partner_id,
                COALESCE(SUM(c.commission_amount), 0) AS total_earned,
                COALESCE(wd_done.total, 0) AS total_withdrawn,
                COALESCE(wd_pend.total, 0) AS total_frozen
            FROM commissions c
            LEFT JOIN (
                SELECT user_id, SUM(amount) AS total
                FROM withdrawals
                WHERE status = 'completed'
                GROUP BY user_id
            ) wd_done ON wd_done.user_id = c.partner_id
            LEFT JOIN (
                SELECT user_id, SUM(amount) AS total
                FROM withdrawals
                WHERE status = 'pending'
                GROUP BY user_id
            ) wd_pend ON wd_pend.user_id = c.partner_id
            WHERE c.status = 'confirmed'
               OR c.status = 'pending'
            GROUP BY c.partner_id, wd_done.total, wd_pend.total
        """)
    )
    rows = result.mappings().all()

    checked = 0
    fixed = 0
    details: list[dict] = []

    for row in rows:
        uid = str(row["partner_id"])
        expected_balance = max(
            float(row["total_earned"])
            - float(row["total_withdrawn"])
            - float(row["total_frozen"]),
            0.0,
        )
        expected_frozen = float(row["total_frozen"])

        current_balance = float(await redis.get(f"partner_balance:{uid}") or 0)
        current_frozen = float(await redis.get(f"partner_frozen:{uid}") or 0)

        balance_diff = abs(current_balance - expected_balance)
        frozen_diff = abs(current_frozen - expected_frozen)

        checked += 1

        if balance_diff > 0.01:
            await redis.set(f"partner_balance:{uid}", str(round(expected_balance, 2)))
            fixed += 1
            details.append({
                "partner_id": uid,
                "field": "balance",
                "was": current_balance,
                "now": expected_balance,
            })
            logger.warning(
                "对账修正余额: partner=%s was=%.2f now=%.2f",
                uid, current_balance, expected_balance,
            )

        if frozen_diff > 0.01:
            await redis.set(f"partner_frozen:{uid}", str(round(expected_frozen, 2)))
            fixed += 1
            details.append({
                "partner_id": uid,
                "field": "frozen",
                "was": current_frozen,
                "now": expected_frozen,
            })
            logger.warning(
                "对账修正冻结: partner=%s was=%.2f now=%.2f",
                uid, current_frozen, expected_frozen,
            )

    logger.info("合伙人余额对账完成: checked=%d fixed=%d", checked, fixed)
    return {"checked": checked, "fixed": fixed, "details": details}


async def reconcile_bonus_credits(session: AsyncSession) -> dict:
    """从 bonus_credit_logs 表重建奖励余额。

    注意：bonus 的消耗记录在 Redis 的 analysis quota 中，这里仅能
    修复余额为负数或明显异常的情况，不做精确重建（因消耗侧无 DB 记录）。
    """
    redis = get_redis_pool()

    result = await session.execute(
        text("""
            SELECT user_id, mode, SUM(amount) AS total_granted
            FROM bonus_credit_logs
            GROUP BY user_id, mode
        """)
    )
    rows = result.mappings().all()

    checked = 0
    fixed = 0

    for row in rows:
        uid = str(row["user_id"])
        mode = row["mode"]
        total_granted = int(row["total_granted"])
        key = f"bonus_credits:{uid}:{mode}"

        current = int(await redis.get(key) or 0)
        checked += 1

        # 修复负值
        if current < 0:
            await redis.set(key, "0")
            fixed += 1
            logger.warning(
                "对账修正负余额: user=%s mode=%s was=%d now=0",
                uid, mode, current,
            )

        # 修复超限（余额不应超过总发放量）
        if current > total_granted:
            await redis.set(key, str(total_granted))
            fixed += 1
            logger.warning(
                "对账修正超限余额: user=%s mode=%s was=%d max=%d",
                uid, mode, current, total_granted,
            )

    logger.info("奖励余额对账完成: checked=%d fixed=%d", checked, fixed)
    return {"checked": checked, "fixed": fixed}


async def reconcile_all(session: AsyncSession) -> dict:
    """执行全量对账（合伙人余额 + 奖励余额）。"""
    partner_result = await reconcile_partner_balances(session)
    bonus_result = await reconcile_bonus_credits(session)
    return {
        "partner": partner_result,
        "bonus": bonus_result,
    }
