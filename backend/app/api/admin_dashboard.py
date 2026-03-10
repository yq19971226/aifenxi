"""管理后台总览仪表盘 API — 聚合系统关键指标。"""

import logging
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import UserInfo, require_admin
from app.core.redis import get_redis_pool

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/admin/dashboard", tags=["admin-dashboard"])


class DashboardStats(BaseModel):
    """总览仪表盘统计数据。"""

    # 用户统计
    total_users: int = 0
    new_users_today: int = 0
    new_users_7d: int = 0

    # 会员分布
    free_users: int = 0
    pro_users: int = 0
    flagship_users: int = 0

    # 支付统计
    total_revenue_usd: float = 0.0
    revenue_30d_usd: float = 0.0
    pending_payments: int = 0

    # 系统活跃度
    total_strategies: int = 0
    strategies_24h: int = 0
    total_consensus: int = 0
    consensus_24h: int = 0
    total_agent_reports: int = 0
    agent_reports_24h: int = 0

    # 预警
    total_alert_rules: int = 0
    active_alert_rules: int = 0

    # 在线状态
    online_ws_total: int = 0
    online_ws_price: int = 0
    online_ws_alerts: int = 0


@router.get("", response_model=DashboardStats)
async def get_dashboard_stats(
    admin: UserInfo = Depends(require_admin),
    session: AsyncSession = Depends(get_db),
) -> DashboardStats:
    """获取管理后台总览统计数据。"""
    now = datetime.now(timezone.utc)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    seven_days_ago = now - timedelta(days=7)
    thirty_days_ago = now - timedelta(days=30)
    twenty_four_hours_ago = now - timedelta(hours=24)

    stats = DashboardStats()

    try:
        # ── 用户统计 ──────────────────────────────────────
        row = (await session.execute(text(
            "SELECT COUNT(*) AS cnt FROM users"
        ))).scalar_one()
        stats.total_users = row

        row = (await session.execute(text(
            "SELECT COUNT(*) AS cnt FROM users WHERE created_at >= :ts"
        ), {"ts": today_start})).scalar_one()
        stats.new_users_today = row

        row = (await session.execute(text(
            "SELECT COUNT(*) AS cnt FROM users WHERE created_at >= :ts"
        ), {"ts": seven_days_ago})).scalar_one()
        stats.new_users_7d = row

        # ── 会员分布 ──────────────────────────────────────
        membership_rows = (await session.execute(text(
            "SELECT level, COUNT(*) AS cnt FROM memberships GROUP BY level"
        ))).mappings().all()
        for r in membership_rows:
            if r["level"] == 0:
                stats.free_users = r["cnt"]
            elif r["level"] == 1:
                stats.pro_users = r["cnt"]
            elif r["level"] == 2:
                stats.flagship_users = r["cnt"]

        # ── 支付统计 ──────────────────────────────────────
        row = (await session.execute(text(
            "SELECT COALESCE(SUM(amount_usd), 0) AS total "
            "FROM payments WHERE status = 'confirmed'"
        ))).scalar_one()
        stats.total_revenue_usd = float(row)

        row = (await session.execute(text(
            "SELECT COALESCE(SUM(amount_usd), 0) AS total "
            "FROM payments WHERE status = 'confirmed' AND created_at >= :ts"
        ), {"ts": thirty_days_ago})).scalar_one()
        stats.revenue_30d_usd = float(row)

        row = (await session.execute(text(
            "SELECT COUNT(*) AS cnt FROM payments WHERE status = 'pending'"
        ))).scalar_one()
        stats.pending_payments = row

        # ── 策略统计 ──────────────────────────────────────
        row = (await session.execute(text(
            "SELECT COUNT(*) AS cnt FROM strategies"
        ))).scalar_one()
        stats.total_strategies = row

        row = (await session.execute(text(
            "SELECT COUNT(*) AS cnt FROM strategies WHERE created_at >= :ts"
        ), {"ts": twenty_four_hours_ago})).scalar_one()
        stats.strategies_24h = row

        # ── 共识统计 ──────────────────────────────────────
        row = (await session.execute(text(
            "SELECT COUNT(*) AS cnt FROM consensus_reports"
        ))).scalar_one()
        stats.total_consensus = row

        row = (await session.execute(text(
            "SELECT COUNT(*) AS cnt FROM consensus_reports WHERE created_at >= :ts"
        ), {"ts": twenty_four_hours_ago})).scalar_one()
        stats.consensus_24h = row

        # ── 智能体报告统计 ────────────────────────────────
        row = (await session.execute(text(
            "SELECT COUNT(*) AS cnt FROM agent_reports"
        ))).scalar_one()
        stats.total_agent_reports = row

        row = (await session.execute(text(
            "SELECT COUNT(*) AS cnt FROM agent_reports WHERE created_at >= :ts"
        ), {"ts": twenty_four_hours_ago})).scalar_one()
        stats.agent_reports_24h = row

        # ── 预警规则统计 ──────────────────────────────────
        try:
            row = (await session.execute(text(
                "SELECT COUNT(*) AS cnt FROM alert_rules"
            ))).scalar_one()
            stats.total_alert_rules = row

            row = (await session.execute(text(
                "SELECT COUNT(*) AS cnt FROM alert_rules WHERE enabled = true"
            ))).scalar_one()
            stats.active_alert_rules = row
        except Exception:
            # alert_rules 表可能不存在
            logger.debug("alert_rules 表查询失败，跳过")

        # ── 在线状态统计 ──────────────────────────────────
        try:
            from app.api.ws import get_online_count
            price_online = await get_online_count("price")
            alerts_online = await get_online_count("alerts")
            stats.online_ws_price = price_online
            stats.online_ws_alerts = alerts_online
            stats.online_ws_total = price_online + alerts_online
        except Exception:
            logger.debug("在线状态统计失败，跳过")

    except Exception as exc:
        logger.error("获取仪表盘统计失败: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="获取统计数据失败",
        )

    return stats


class LLMCostSummary(BaseModel):
    """LLM 每日成本摘要。"""
    date: str
    total_cost_usd: float
    total_tokens: int
    total_calls: int
    by_model: dict[str, float]


@router.get("/llm-cost", response_model=LLMCostSummary)
async def get_llm_cost(
    admin: UserInfo = Depends(require_admin),
) -> LLMCostSummary:
    """获取今日 LLM 调用成本摘要。"""
    from app.core.llm_client import UnifiedLLMClient

    try:
        data = await UnifiedLLMClient.get_daily_cost_summary()
        return LLMCostSummary(**data)
    except Exception as exc:
        logger.error("获取 LLM 成本摘要失败: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="获取 LLM 成本数据失败",
        )


@router.get("/capability-matrix")
async def get_capability_matrix(
    admin: UserInfo = Depends(require_admin),
) -> dict:
    """返回所有 Redis 数据能力的状态矩阵（available/unavailable/disabled/tier-limited）。"""
    from app.core.capability_state import get_all_capabilities

    try:
        return {"capabilities": await get_all_capabilities()}
    except Exception as exc:
        logger.error("获取能力矩阵失败: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="获取能力矩阵失败",
        )
