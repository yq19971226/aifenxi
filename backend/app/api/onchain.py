"""链上数据 API — 套餐权限控制 + GlassNode 数据源。"""

import logging

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel

from app.core.deps import UserInfo, get_current_user
from app.services.config_service import get_config_value
from app.services.glassnode import (
    METRIC_MAPPING,
    SYMBOL_MAPPING,
    fetch_onchain_data,
    get_glassnode_client,
)
from app.services.symbol_registry import SymbolRegistry

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/onchain", tags=["onchain"])


# ── 响应模型 ───────────────────────────────────────────────


class OnchainDataPoint(BaseModel):
    """单个数据点。"""

    time: str
    value: float | None
    unit: str = "USD"


class OnchainMetricResponse(BaseModel):
    """链上指标响应。"""

    symbol: str
    metric: str
    data: OnchainDataPoint | None
    source: str = "glassnode"


class UpgradeRequiredError(BaseModel):
    """需要升级套餐错误。"""

    error: str = "upgrade_required"
    message: str
    current_plan: str
    required_plan: str
    upgrade_url: str = "/settings/membership"


class PlanCapabilitiesResponse(BaseModel):
    """套餐能力响应。"""

    plans: dict
    user_capabilities: dict


# ── 套餐配置 ───────────────────────────────────────────────


async def get_plan_symbols(plan_level: int) -> list[str]:
    """获取指定套餐级别可访问的币种列表。"""
    if plan_level == 0:
        # 免费套餐：仅 BTCUSDT
        t1_symbols = await get_config_value("plan_t1_symbols", "BTCUSDT")
        return [s.strip() for s in t1_symbols.split(",") if s.strip()]

    # T1+ : 从 symbol_registry 读取 has_onchain=true 的币种
    from app.core.database import AsyncSessionLocal

    async with AsyncSessionLocal() as session:
        registry = SymbolRegistry(session)
        symbols = await registry.list_symbols(enabled_only=True)
        return [s.symbol for s in symbols if s.has_onchain]


async def get_plan_metrics(plan_level: int) -> list[str]:
    """获取指定套餐级别可访问的指标列表。"""
    if plan_level == 0:
        # 免费套餐：仅基础指标
        t1_metrics = await get_config_value("plan_t1_metrics", "price,market_cap")
        return [m.strip() for m in t1_metrics.split(",") if m.strip()]

    if plan_level == 1:
        # 专业套餐
        t2_metrics = await get_config_value(
            "plan_t2_metrics",
            "price,market_cap,nvt,mvrv,stock_to_flow,exchange_flow",
        )
        return [m.strip() for m in t2_metrics.split(",") if m.strip()]

    # 旗舰套餐：全部指标
    return list(METRIC_MAPPING.keys())


# ── 权限检查 ───────────────────────────────────────────────


async def check_symbol_access(
    symbol: str,
    user_level: int,
) -> bool:
    """检查用户是否有权访问指定币种的链上数据。"""
    allowed_symbols = await get_plan_symbols(user_level)
    return symbol.upper() in [s.upper() for s in allowed_symbols]


async def check_metric_access(
    metric: str,
    user_level: int,
) -> bool:
    """检查用户是否有权访问指定指标。"""
    allowed_metrics = await get_plan_metrics(user_level)
    return metric.lower() in [m.lower() for m in allowed_metrics]


# ── 路由 ───────────────────────────────────────────────────


@router.get("/capabilities", response_model=PlanCapabilitiesResponse)
async def get_capabilities(
    user: UserInfo = Depends(get_current_user),
) -> PlanCapabilitiesResponse:
    """获取当前套餐的数据能力。"""

    # 构建各套餐配置
    plans = {}
    for level, name in [(0, "免费套餐"), (1, "专业套餐"), (2, "旗舰套餐")]:
        plans[str(level)] = {
            "name": name,
            "symbols": await get_plan_symbols(level),
            "metrics": await get_plan_metrics(level),
        }

    # 用户当前能力
    user_level = user.membership_level
    if user.is_admin:
        user_level = 2

    user_capabilities = {
        "level": user_level,
        "symbols": await get_plan_symbols(user_level),
        "metrics": await get_plan_metrics(user_level),
    }

    return PlanCapabilitiesResponse(
        plans=plans,
        user_capabilities=user_capabilities,
    )


@router.get("/{symbol}", response_model=OnchainMetricResponse)
async def get_onchain_metric(
    symbol: str,
    metric: str = Query(default="price", description="指标: price, market_cap, nvt, mvrv..."),
    interval: str = Query(default="h24", description="时间间隔: h1, h24, h168, h720"),
    user: UserInfo = Depends(get_current_user),
) -> OnchainMetricResponse:
    """获取指定币种的链上指标数据。

    根据用户套餐级别自动过滤可访问的币种和指标。
    """
    symbol = symbol.upper()
    user_level = user.membership_level
    if user.is_admin:
        user_level = 2

    # 1. 检查币种权限
    if not await check_symbol_access(symbol, user_level):
        plan_names = {0: "免费套餐", 1: "专业套餐", 2: "旗舰套餐"}
        current_plan = plan_names.get(user_level, "免费套餐")
        required_plan = "专业套餐" if user_level == 0 else "旗舰套餐"

        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "error": "upgrade_required",
                "message": f"您的 {current_plan} 不支持查看 {symbol} 的链上数据",
                "current_plan": current_plan,
                "required_plan": required_plan,
                "upgrade_url": "/settings/membership",
            },
        )

    # 2. 检查指标权限
    if not await check_metric_access(metric, user_level):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "error": "metric_not_found",
                "message": f"指标 {metric} 不存在或当前套餐无权访问",
            },
        )

    # 3. 调用 GlassNode API
    try:
        # 转换币种符号
        gn_symbol = SYMBOL_MAPPING.get(symbol, symbol.replace("USDT", ""))
        data = await fetch_onchain_data(gn_symbol, metric, interval)

        if data is None:
            return OnchainMetricResponse(
                symbol=symbol,
                metric=metric,
                data=None,
                source="glassnode",
            )

        # 解析响应
        data_point = OnchainDataPoint(
            time=data.get("t", ""),
            value=data.get("v"),
        )

        return OnchainMetricResponse(
            symbol=symbol,
            metric=metric,
            data=data_point,
            source="glassnode",
        )

    except Exception as exc:
        logger.error(
            "onchain_fetch_error",
            symbol=symbol,
            metric=metric,
            error=str(exc),
        )
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="上游数据服务暂时不可用",
        )
