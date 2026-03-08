"""历史案例 API 路由 — 只做参数校验和响应格式化。

数据查询通过 CaseSearchService 完成，路由层不直接调用数据库。
"""

import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.services.case_search import CaseRecord, CaseSearchService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["cases"])

_case_service = CaseSearchService()


@router.get("/cases", response_model=list[CaseRecord])
async def get_cases(
    pattern_type: Optional[str] = Query(None, max_length=50, description="按剧本类型过滤"),
    limit: int = Query(50, ge=1, le=200, description="返回条数"),
    session: AsyncSession = Depends(get_db),
) -> list[CaseRecord]:
    """获取历史案例列表（按日期降序）。"""
    try:
        return await _case_service.get_all_cases(session, pattern_type, limit)
    except Exception as exc:
        logger.error("get_cases failed", extra={"error": str(exc)})
        raise HTTPException(status_code=500, detail="查询历史案例失败")


@router.get("/cases/search", response_model=list[CaseRecord])
async def search_cases(
    exchange_netflow: Optional[float] = Query(None, description="交易所净流入"),
    whale_change: Optional[float] = Query(None, description="巨鲸持仓变化%"),
    fear_greed: Optional[float] = Query(None, description="恐慌贪婪指数"),
    mvrv: Optional[float] = Query(None, description="MVRV比率"),
    rsi: Optional[float] = Query(None, description="RSI指标"),
    price_change_pct: Optional[float] = Query(None, description="价格变化%"),
    pattern_type: Optional[str] = Query(None, max_length=50, description="按剧本类型过滤"),
    top_k: int = Query(5, ge=1, le=20, description="返回Top K条"),
    session: AsyncSession = Depends(get_db),
) -> list[CaseRecord]:
    """根据特征向量检索相似历史案例（余弦相似度）。"""
    features: dict[str, float] = {}
    if exchange_netflow is not None:
        features["exchange_netflow"] = exchange_netflow
    if whale_change is not None:
        features["whale_change"] = whale_change
    if fear_greed is not None:
        features["fear_greed"] = fear_greed
    if mvrv is not None:
        features["mvrv"] = mvrv
    if rsi is not None:
        features["rsi"] = rsi
    if price_change_pct is not None:
        features["price_change_pct"] = price_change_pct

    if not features:
        raise HTTPException(status_code=400, detail="至少需要提供一个特征参数")

    try:
        return await _case_service.search_similar(
            session, features, pattern_type, top_k,
        )
    except Exception as exc:
        logger.error("search_cases failed", extra={"error": str(exc)})
        raise HTTPException(status_code=500, detail="检索相似案例失败")
