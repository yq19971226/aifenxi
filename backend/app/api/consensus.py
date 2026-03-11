"""共识引擎 API 路由 — 只做参数校验和响应格式化。

数据查询通过 Redis 缓存完成，路由层不直接调用数据库。
"""

import logging

from fastapi import APIRouter, Depends, HTTPException, Query

from app.consensus.engine import ConsensusReport
from app.consensus.weights import get_current_weights
from app.core.deps import UserInfo, require_level
from app.core.redis import get_json

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["consensus"])


def _normalize_symbol(s: str) -> str:
    """去掉 :杠杆 等后缀，与缓存键一致。"""
    base = (s or "").strip().split(":")[0].strip()
    return base or "BTCUSDT"


@router.get("/consensus/latest", response_model=ConsensusReport)
async def get_latest_consensus(
    symbol: str = Query(
        "BTCUSDT",
        min_length=1,
        max_length=20,
        description="交易对，如 BTCUSDT",
    ),
) -> ConsensusReport:
    """获取最新共识报告（Redis 缓存）— 公开端点，支持 SEO/GEO。"""
    symbol = _normalize_symbol(symbol)
    try:
        cache_key = f"consensus:latest:{symbol}"
        cached = await get_json(cache_key)
        if cached is None:
            raise HTTPException(status_code=404, detail="暂无共识报告")
        return ConsensusReport.model_validate(cached)
    except HTTPException:
        raise
    except Exception as exc:
        logger.error(
            "get_latest_consensus failed",
            extra={"symbol": symbol, "error": str(exc)},
        )
        raise HTTPException(status_code=500, detail="查询共识报告失败")


@router.get("/consensus/weights", response_model=dict[str, float])
async def get_weights() -> dict[str, float]:
    """获取当前各模型权重分布。"""
    try:
        return await get_current_weights()
    except Exception as exc:
        logger.error("get_weights failed", extra={"error": str(exc)})
        raise HTTPException(status_code=500, detail="查询模型权重失败")
