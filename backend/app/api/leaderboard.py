"""排行榜 API — 排名查询、个人战绩、系统周报、系统命中率。"""

import logging

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import UserInfo, get_current_user
from app.services.leaderboard import LeaderboardService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/leaderboard", tags=["leaderboard"])

_MODE_PATTERN = "^(all|scalping|intraday|trend)$"


@router.get("/rankings")
async def get_rankings(
    period: str = Query(default="7d", pattern="^(7d|30d|90d)$"),
    mode: str = Query(default="all", pattern=_MODE_PATTERN),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=50),
    user: UserInfo = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> dict:
    """获取排行榜排名。"""
    svc = LeaderboardService(session)
    return await svc.get_rankings(
        period=period,
        mode=mode,
        page=page,
        page_size=page_size,
        current_user_id=user.id,
    )


@router.get("/report")
async def get_system_report(
    period: str = Query(default="7d", pattern="^(7d|30d|90d)$"),
    mode: str = Query(default="all", pattern=_MODE_PATTERN),
    user: UserInfo = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> dict:
    """获取系统整体绩效周报。"""
    svc = LeaderboardService(session)
    return await svc.get_system_report(period=period, mode=mode)


@router.get("/system-accuracy")
async def get_system_accuracy(
    period: str = Query(default="7d", pattern="^(7d|30d|90d)$"),
    user: UserInfo = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> dict:
    """按分析模式分组的系统命中率（不限制 published，展示系统整体分析能力）。"""
    svc = LeaderboardService(session)
    return await svc.get_system_accuracy(period=period)


@router.get("/me")
async def get_my_stats(
    period: str = Query(default="7d", pattern="^(7d|30d|90d)$"),
    mode: str = Query(default="all", pattern=_MODE_PATTERN),
    user: UserInfo = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> dict:
    """获取当前用户个人战绩。"""
    svc = LeaderboardService(session)
    return await svc.get_my_stats(user_id=user.id, period=period, mode=mode)


@router.get("/me/history")
async def get_my_history(
    period: str = Query(default="7d", pattern="^(7d|30d|90d)$"),
    mode: str = Query(default="all", pattern=_MODE_PATTERN),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=50),
    user: UserInfo = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> dict:
    """获取当前用户已发布策略明细。"""
    svc = LeaderboardService(session)
    return await svc.get_my_history(
        user_id=user.id, period=period, mode=mode, page=page, page_size=page_size,
    )
