"""ReflectionAgent API — 手动触发复盘 + 查看反思报告。

端点：
- POST /api/reflection/trigger  手动触发复盘分析
- GET  /api/reflection/latest    获取最新反思报告
"""

import logging
from typing import Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from app.agents.reflection import ReflectionAgent, ReflectionReport, get_reflection_context
from app.core.redis import get_json

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/reflection", tags=["reflection"])

# ── 请求模型 ─────────────────────────────────────────────────


class TriggerRequest(BaseModel):
    """复盘触发请求。"""

    symbol: str = "BTCUSDT"
    period: str = "daily"  # daily / weekly
    lookback_count: int = 10


# ── 端点 ─────────────────────────────────────────────────────


@router.post("/trigger", response_model=ReflectionReport)
async def trigger_reflection(req: TriggerRequest):
    """手动触发一次复盘分析。

    调用 ReflectionAgent 对指定交易对进行复盘，
    结果自动缓存到 Redis 供其他智能体读取。
    """
    try:
        agent = ReflectionAgent()
        report = await agent.reflect(
            symbol=req.symbol,
            period=req.period,
            lookback_count=req.lookback_count,
        )
        return report
    except Exception as exc:
        logger.error("Reflection trigger failed", extra={"error": str(exc)})
        raise HTTPException(status_code=500, detail=f"复盘分析失败: {exc}")


@router.get("/latest", response_model=Optional[ReflectionReport])
async def get_latest_reflection(
    symbol: str = Query(default="BTCUSDT", description="交易对"),
):
    """获取指定交易对的最新反思报告。

    从 Redis 读取缓存的反思洞察，如果没有缓存则返回 null。
    """
    try:
        data = await get_json(f"reflection:insights:{symbol.upper()}")
        if not data:
            return None
        return ReflectionReport(**data)
    except Exception as exc:
        logger.error("Get reflection failed", extra={"error": str(exc)})
        raise HTTPException(status_code=500, detail=f"获取反思报告失败: {exc}")


@router.get("/context")
async def get_context_preview(
    symbol: str = Query(default="BTCUSDT", description="交易对"),
):
    """预览当前注入到其他智能体的反思上下文文本。"""
    ctx = await get_reflection_context(symbol)
    return {"symbol": symbol.upper(), "context": ctx, "has_context": bool(ctx)}
