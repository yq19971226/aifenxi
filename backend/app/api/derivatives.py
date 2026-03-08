"""合约数据 API 路由。

- GET /api/derivatives/snapshot/{symbol} — 最新合约快照（免费用户仅资金费率当前值）
- GET /api/derivatives/funding-history/{symbol} — 资金费率历史（专业+旗舰）
- GET /api/derivatives/liquidations/{symbol} — 爆仓流水（专业+旗舰，最多50条）
"""

import logging

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import UserInfo, get_current_user, require_level
from app.services.derivatives import DerivativesService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/derivatives", tags=["derivatives"])


@router.get("/snapshot/{symbol}")
async def get_snapshot(
    symbol: str,
    user: UserInfo = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> dict:
    """获取最新合约数据快照。

    所有认证用户可访问。免费用户仅返回 funding_rate 当前值，
    专业/旗舰用户返回完整快照。
    """
    symbol = symbol.upper()
    svc = DerivativesService(session)

    try:
        snapshot_data = await svc.get_latest_snapshot(symbol)
    except Exception as exc:
        logger.error("获取合约快照失败: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="获取合约快照失败",
        )

    if snapshot_data is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"未找到 {symbol} 的合约数据",
        )

    # 免费用户仅返回资金费率当前值
    if user.membership_level == 0:
        return {
            "symbol": snapshot_data.get("symbol", symbol),
            "time": snapshot_data.get("time"),
            "funding_rate": snapshot_data.get("funding_rate"),
        }

    return snapshot_data


@router.get("/funding-history/{symbol}")
async def get_funding_history(
    symbol: str,
    days: int = Query(default=7, le=30),
    user: UserInfo = Depends(require_level(1)),
    session: AsyncSession = Depends(get_db),
) -> list[dict]:
    """获取资金费率历史趋势。专业+旗舰可用。

    返回 [{time, funding_rate, predicted_funding_rate}, ...] 按时间正序。
    """
    symbol = symbol.upper()
    svc = DerivativesService(session)

    try:
        return await svc.get_funding_history(symbol, days=days)
    except Exception as exc:
        logger.error("查询资金费率历史失败: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="查询资金费率历史失败",
        )


@router.get("/liquidations/{symbol}")
async def get_liquidations(
    symbol: str,
    limit: int = Query(default=50, le=50),
    user: UserInfo = Depends(require_level(1)),
    session: AsyncSession = Depends(get_db),
) -> list[dict]:
    """获取最近爆仓事件流水。专业+旗舰可用，最多50条。

    返回 [{time, symbol, side, quantity, price, usd_value}, ...] 按时间倒序。
    """
    symbol = symbol.upper()
    svc = DerivativesService(session)

    try:
        return await svc.get_liquidations(symbol, limit=limit)
    except Exception as exc:
        logger.error("查询爆仓流水失败: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="查询爆仓流水失败",
        )
