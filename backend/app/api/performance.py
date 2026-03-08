"""策略绩效 API 路由。

- GET /api/performance/stats — 绩效统计（免费用户天数受限）
- GET /api/performance/snapshots/{snapshot_id} — 单条策略详情（专业+旗舰）
- GET /api/performance/trend — 胜率趋势和累计盈亏曲线
"""

import logging
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import UserInfo, get_current_user, require_level
from app.models.performance import PerformanceStats
from app.services.performance import PerformanceTracker

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/performance", tags=["performance"])


async def _get_perf_days_free() -> int:
    """从动态配置读取免费用户绩效查看天数，失败时回退到默认值 7。"""
    try:
        from app.services.config_service import get_config_value

        raw = await get_config_value("perf_days_free", "7")
        return int(raw)
    except Exception:
        logger.warning("读取动态配置失败，使用默认值: key=perf_days_free, default=7")
        return 7


@router.get("/stats", response_model=PerformanceStats)
async def get_stats(
    symbol: str | None = None,
    days: int = Query(default=30, le=90),
    direction: str | None = None,
    user: UserInfo = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> PerformanceStats:
    """获取绩效统计。免费用户天数受限，不返回 by_agent。"""
    if not user.is_admin and user.membership_level == 0:
        days = await _get_perf_days_free()

    tracker = PerformanceTracker(session)
    try:
        stats = await tracker.get_stats(symbol=symbol, days=days, direction=direction)
    except Exception as exc:
        logger.error("获取绩效统计失败: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="获取绩效统计失败",
        )

    if not user.is_admin and user.membership_level == 0:
        stats.by_agent = {}

    return stats


@router.get("/snapshots/{snapshot_id}")
async def get_snapshot_detail(
    snapshot_id: UUID,
    user: UserInfo = Depends(require_level(1)),
    session: AsyncSession = Depends(get_db),
) -> dict:
    """获取单条策略的绩效详情。专业+旗舰可用。"""
    tracker = PerformanceTracker(session)
    try:
        detail = await tracker.get_snapshot_detail(snapshot_id)
    except Exception as exc:
        logger.error("获取快照详情失败: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="获取快照详情失败",
        )

    if detail is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="快照不存在",
        )

    return detail


@router.get("/trend")
async def get_trend(
    days: int = Query(default=30, le=90),
    user: UserInfo = Depends(require_level(1)),
    session: AsyncSession = Depends(get_db),
) -> list[dict]:
    """获取胜率趋势和累计盈亏曲线数据。专业+旗舰可用。"""
    try:
        return await PerformanceTracker(session).get_trend_data(days=days)
    except Exception as exc:
        logger.error("获取趋势数据失败: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="获取趋势数据失败",
        )
