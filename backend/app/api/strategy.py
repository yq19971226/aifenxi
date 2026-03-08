"""策略 API 路由 — 只做参数校验和响应格式化。

通过 StrategyService 获取数据，路由层不直接调用数据库。
"""

import logging

from fastapi import APIRouter, Depends, HTTPException, Query

from app.core.deps import UserInfo
from app.core.rate_limit import check_rate_limit
from app.services.strategy import StrategyResult, StrategyService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["strategy"])

_strategy_service = StrategyService()


@router.get("/strategy/latest", response_model=StrategyResult | None)
async def get_latest_strategy(
    symbol: str = Query(..., min_length=1, max_length=20, description="交易对，如 BTCUSDT"),
    _user: UserInfo = Depends(check_rate_limit),
) -> StrategyResult | None:
    """获取指定交易对的最新策略。"""
    try:
        result = await _strategy_service.get_latest(symbol)
        if result is None:
            raise HTTPException(status_code=404, detail=f"未找到 {symbol} 的策略")
        return result
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Failed to get latest strategy", extra={"symbol": symbol, "error": str(exc)})
        raise HTTPException(status_code=500, detail="查询策略失败")
