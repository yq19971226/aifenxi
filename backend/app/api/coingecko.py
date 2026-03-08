"""CoinGecko 数据 API 路由。

- GET  /api/coingecko/tier-capabilities     — 当前套餐能力矩阵
- GET  /api/coingecko/usage                 — 月度额度使用情况
- PUT  /api/coingecko/tier                  — 切换套餐（管理员）
- GET  /api/coingecko/market/{symbol}       — 市场数据
- GET  /api/coingecko/community/{symbol}    — 社区情绪
- GET  /api/coingecko/developer/{symbol}    — 开发者活跃度
- GET  /api/coingecko/global                — 全局宏观数据
- GET  /api/coingecko/trending              — 热门趋势
"""

import logging
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from app.core.deps import UserInfo, get_current_user, require_level
from app.core.redis import get_json
from app.data.coingecko_tier import CoinGeckoTierManager
from app.models.coingecko import CoinGeckoTier, CoinGeckoTierCapabilities
from app.services.config_service import set_config_value

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/coingecko", tags=["coingecko"])

_tier_manager = CoinGeckoTierManager()


# ============================================================
# 套餐管理
# ============================================================


@router.get("/tier-capabilities")
async def get_tier_capabilities(
    user: UserInfo = Depends(get_current_user),
) -> CoinGeckoTierCapabilities:
    """返回当前 CoinGecko 套餐的能力矩阵。"""
    try:
        tier = await _tier_manager.get_current_tier()
        return _tier_manager.get_capabilities(tier)
    except Exception as exc:
        logger.error("获取 CoinGecko 套餐能力矩阵失败: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="获取套餐能力矩阵失败",
        )


@router.get("/usage")
async def get_usage(
    user: UserInfo = Depends(get_current_user),
) -> dict[str, Any]:
    """返回当月 CoinGecko API 额度使用情况。"""
    try:
        return await _tier_manager.get_monthly_usage()
    except Exception as exc:
        logger.error("获取 CoinGecko 额度使用情况失败: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="获取额度使用情况失败",
        )


class TierUpdateRequest(BaseModel):
    tier: str


@router.put("/tier")
async def update_tier(
    body: TierUpdateRequest,
    user: UserInfo = Depends(require_level("admin")),
) -> dict[str, str]:
    """切换 CoinGecko 套餐（管理员专用）。"""
    try:
        tier_enum = CoinGeckoTier(body.tier.lower().strip())
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"无效的套餐名称: {body.tier}，可选: demo/basic/analyst/lite",
        )

    await set_config_value("coingecko_tier", tier_enum.value, category="datasource")
    logger.info("CoinGecko 套餐已切换: %s", tier_enum.value)
    return {"tier": tier_enum.value, "message": f"套餐已切换为 {tier_enum.value}"}


# ============================================================
# 数据查询
# ============================================================


@router.get("/market/{symbol}")
async def get_market_data(
    symbol: str,
    user: UserInfo = Depends(get_current_user),
) -> dict[str, Any]:
    """获取币种市场数据（市值/供应量/ATH/ATL 等）。"""
    symbol = symbol.upper()
    data = await get_json(f"gecko_market:{symbol}")
    if data is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"{symbol} 市场数据暂无缓存",
        )
    return data


@router.get("/community/{symbol}")
async def get_community_data(
    symbol: str,
    user: UserInfo = Depends(get_current_user),
) -> dict[str, Any]:
    """获取币种社区情绪数据（Reddit/Telegram/投票 等）。"""
    symbol = symbol.upper()
    data = await get_json(f"gecko_community:{symbol}")
    if data is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"{symbol} 社区情绪数据暂无缓存",
        )
    return data


@router.get("/developer/{symbol}")
async def get_developer_data(
    symbol: str,
    user: UserInfo = Depends(get_current_user),
) -> dict[str, Any]:
    """获取币种开发者活跃度数据（GitHub Commits/Stars/PRs 等）。"""
    symbol = symbol.upper()
    data = await get_json(f"gecko_developer:{symbol}")
    if data is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"{symbol} 开发者数据暂无缓存",
        )
    return data


@router.get("/global")
async def get_global_data(
    user: UserInfo = Depends(get_current_user),
) -> dict[str, Any]:
    """获取全局加密市场宏观数据（BTC Dominance/总市值 等）。"""
    data = await get_json("gecko_global")
    if data is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="全局宏观数据暂无缓存",
        )
    return data


@router.get("/trending")
async def get_trending_data(
    user: UserInfo = Depends(get_current_user),
) -> list[dict[str, Any]]:
    """获取热门趋势币种。"""
    data = await get_json("gecko_trending")
    if data is None:
        return []
    return data if isinstance(data, list) else []
