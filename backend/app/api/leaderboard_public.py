"""排行榜公开 API — 不需要认证，供 SSR / 爬虫使用。

仅暴露排行榜排名、系统周报、系统命中率。
不暴露个人战绩（/me、/me/history）。
"""

import logging

from fastapi import APIRouter, Query
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi import Depends

from app.core.database import get_db
from app.services.leaderboard import LeaderboardService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/public/leaderboard", tags=["leaderboard-public"])

_MODE_PATTERN = "^(all|scalping|intraday|trend)$"


@router.get("/rankings")
async def public_rankings(
    period: str = Query(default="7d", pattern="^(7d|30d|90d)$"),
    mode: str = Query(default="all", pattern=_MODE_PATTERN),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=50),
    session: AsyncSession = Depends(get_db),
) -> dict:
    """公开排行榜排名（无需登录）。"""
    svc = LeaderboardService(session)
    return await svc.get_rankings(
        period=period,
        mode=mode,
        page=page,
        page_size=page_size,
        current_user_id=None,
    )


@router.get("/report")
async def public_report(
    period: str = Query(default="7d", pattern="^(7d|30d|90d)$"),
    mode: str = Query(default="all", pattern=_MODE_PATTERN),
    session: AsyncSession = Depends(get_db),
) -> dict:
    """公开系统整体绩效（无需登录）。"""
    svc = LeaderboardService(session)
    return await svc.get_system_report(period=period, mode=mode)


@router.get("/system-accuracy")
async def public_accuracy(
    period: str = Query(default="7d", pattern="^(7d|30d|90d)$"),
    session: AsyncSession = Depends(get_db),
) -> dict:
    """公开系统命中率（无需登录）。"""
    svc = LeaderboardService(session)
    return await svc.get_system_accuracy(period=period)
