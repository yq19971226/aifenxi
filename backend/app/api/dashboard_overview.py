"""看板概览 API — 一次性返回所有币种的概览数据。

v4.0: 多币种概览表（方案C），前端 dashboard 一次请求获取全部数据。
"""

import asyncio
import logging
from typing import Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from app.core.deps import UserInfo, get_current_user
from app.core.redis import get_json, init_redis

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


class SymbolOverview(BaseModel):
    """单个币种的概览数据。"""

    symbol: str
    display_name: str = ""
    latest_price: Optional[float] = None
    direction: str = "neutral"  # long / short / neutral
    confidence: float = 0.0
    alert_level: str = "none"  # none / low / medium / high / critical
    dealer_intent: str = ""
    collusion_detected: bool = False
    entry_low: Optional[float] = None
    entry_high: Optional[float] = None
    stop_loss: Optional[float] = None
    reasoning: str = ""
    risk_reward_ratio: float = 0.0
    is_worth_taking: bool = False


class DashboardOverviewResponse(BaseModel):
    """看板概览响应。"""

    symbols: list[SymbolOverview] = Field(default_factory=list)
    total: int = 0


async def _get_symbol_overview(symbol: str) -> SymbolOverview:
    """从 Redis 聚合单个币种的概览数据。"""
    overview = SymbolOverview(symbol=symbol)

    # 并行读取 3 个 Redis key
    price_task = get_json(f"latest_price:{symbol}")
    strategy_task = get_json(f"strategy:latest:{symbol}")
    defense_task = get_json(f"defense:summary:{symbol}")

    price_raw, strategy, defense = await asyncio.gather(
        price_task, strategy_task, defense_task,
        return_exceptions=True,
    )

    # 最新价
    if isinstance(price_raw, (int, float)):
        overview.latest_price = float(price_raw)

    # 策略数据
    if isinstance(strategy, dict):
        overview.direction = strategy.get("direction", "neutral")
        overview.confidence = strategy.get("confidence", 0.0)
        overview.entry_low = strategy.get("entry_low")
        overview.entry_high = strategy.get("entry_high")
        overview.stop_loss = strategy.get("stop_loss")
        overview.reasoning = strategy.get("reasoning", "")
        overview.risk_reward_ratio = strategy.get("risk_reward_ratio", 0.0)
        overview.is_worth_taking = strategy.get("is_worth_taking", False)

    # 防御数据
    if isinstance(defense, dict):
        overview.alert_level = defense.get("alert_level", "none")
        overview.dealer_intent = (defense.get("adversarial") or {}).get("dealer_intent", "")
        overview.collusion_detected = (defense.get("collusion") or {}).get("collusion_detected", False)

    return overview


@router.get("/overview", response_model=DashboardOverviewResponse)
async def get_dashboard_overview(
    _user: UserInfo = Depends(get_current_user),
) -> DashboardOverviewResponse:
    """获取所有已启用币种的概览数据 — 供看板页面使用。"""
    await init_redis()

    # 从数据库读取已启用币种
    from app.core.database import AsyncSessionLocal
    from app.services.symbol_registry import DEFAULT_SYMBOLS, SymbolRegistry

    symbols_list: list[dict] = []
    try:
        async with AsyncSessionLocal() as session:
            registry = SymbolRegistry(session)
            configs = await registry.list_symbols(enabled_only=True)
            symbols_list = [{"symbol": c.symbol, "display_name": c.display_name} for c in configs]
    except Exception as exc:
        logger.warning("Failed to read symbols from DB, using defaults", extra={"error": str(exc)})
        symbols_list = [{"symbol": s, "display_name": s.replace("USDT", "")} for s in DEFAULT_SYMBOLS]

    if not symbols_list:
        symbols_list = [{"symbol": s, "display_name": s.replace("USDT", "")} for s in DEFAULT_SYMBOLS]

    # 并行获取所有币种概览
    tasks = [_get_symbol_overview(item["symbol"]) for item in symbols_list]
    overviews = await asyncio.gather(*tasks, return_exceptions=True)

    result = []
    for i, ov in enumerate(overviews):
        if isinstance(ov, SymbolOverview):
            ov.display_name = symbols_list[i]["display_name"]
            result.append(ov)
        else:
            logger.warning(f"Failed to get overview for {symbols_list[i]['symbol']}: {ov}")
            result.append(SymbolOverview(
                symbol=symbols_list[i]["symbol"],
                display_name=symbols_list[i]["display_name"],
            ))

    return DashboardOverviewResponse(symbols=result, total=len(result))
