"""自主学习模块 API 路由 — 绩效回顾、权重迭代、信号校准、数据维护。"""

import logging

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import UserInfo, require_admin
from app.services.learning_service import LearningService


logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/admin/learning", tags=["learning"])


# ── 请求/响应模型 ─────────────────────────────────────────────


class ApplyWeightsRequest(BaseModel):
    """应用权重请求。"""
    weights: dict[str, float]
    note: str = ""


class CalibrationParamsUpdate(BaseModel):
    """校准参数更新请求。"""
    signal_threshold: float | None = Field(None, ge=0.1, le=0.8)
    min_agreement: int | None = Field(None, ge=1, le=4)
    min_confidence: float | None = Field(None, ge=0.0, le=0.9)


class CleanupRequest(BaseModel):
    """清理请求。"""
    retain_days: int = Field(90, ge=30, le=365)


# ── B1: 绩效回顾 ─────────────────────────────────────────────


@router.get("/performance-review")
async def performance_review(
    days: int = Query(30, ge=1, le=365),
    symbol: str | None = Query(None),
    user: UserInfo = Depends(require_admin),
    session: AsyncSession = Depends(get_db),
) -> dict:
    """绩效回顾 — 统计 + 趋势 + 智能体准确率 + 信号分布 + 按模式胜率。"""
    svc = LearningService(session)
    try:
        return await svc.get_performance_review(days=days, symbol=symbol)
    except Exception as exc:
        logger.error("绩效回顾查询失败: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="绩效回顾查询失败",
        )


# ── B2: 权重迭代 ─────────────────────────────────────────────


@router.post("/recalculate-weights")
async def recalculate_weights(
    lookback_days: int = Query(30, ge=7, le=180),
    user: UserInfo = Depends(require_admin),
    session: AsyncSession = Depends(get_db),
) -> dict:
    """预览新权重（不写入 Redis）。"""
    svc = LearningService(session)
    try:
        return await svc.recalculate_weights(lookback_days=lookback_days)
    except Exception as exc:
        logger.error("权重计算失败: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="权重计算失败",
        )


@router.post("/apply-weights")
async def apply_weights(
    body: ApplyWeightsRequest,
    user: UserInfo = Depends(require_admin),
    session: AsyncSession = Depends(get_db),
) -> dict:
    """应用权重到 Redis。"""
    svc = LearningService(session)
    try:
        return await svc.apply_weights(
            weights=body.weights,
            changed_by=user.email,
            note=body.note,
        )
    except Exception as exc:
        logger.error("应用权重失败: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="应用权重失败",
        )


@router.get("/current-weights")
async def current_weights(
    user: UserInfo = Depends(require_admin),
    session: AsyncSession = Depends(get_db),
) -> dict:
    """获取当前 Redis 中的权重。"""
    svc = LearningService(session)
    try:
        return await svc.get_current_weights()
    except Exception as exc:
        logger.error("获取权重失败: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="获取权重失败",
        )


# ── B3: 信号校准 ─────────────────────────────────────────────


@router.get("/calibration-params")
async def get_calibration_params(
    user: UserInfo = Depends(require_admin),
    session: AsyncSession = Depends(get_db),
) -> dict:
    """获取共识引擎校准参数。"""
    svc = LearningService(session)
    try:
        return await svc.get_calibration_params()
    except Exception as exc:
        logger.error("获取校准参数失败: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="获取校准参数失败",
        )


@router.put("/calibration-params")
async def update_calibration_params(
    body: CalibrationParamsUpdate,
    user: UserInfo = Depends(require_admin),
    session: AsyncSession = Depends(get_db),
) -> dict:
    """更新共识引擎校准参数。"""
    if body.signal_threshold is None and body.min_agreement is None and body.min_confidence is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="至少提供一个参数",
        )
    svc = LearningService(session)
    try:
        return await svc.update_calibration_params(
            signal_threshold=body.signal_threshold,
            min_agreement=body.min_agreement,
            min_confidence=body.min_confidence,
            changed_by=user.email,
        )
    except Exception as exc:
        logger.error("更新校准参数失败: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="更新校准参数失败",
        )


# ── B4: 数据库维护 ───────────────────────────────────────────


@router.get("/db-stats")
async def db_stats(
    user: UserInfo = Depends(require_admin),
    session: AsyncSession = Depends(get_db),
) -> list[dict]:
    """获取各主要表的行数统计。"""
    svc = LearningService(session)
    try:
        return await svc.get_db_stats()
    except Exception as exc:
        logger.error("获取DB统计失败: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="获取数据库统计失败",
        )


@router.post("/cleanup")
async def cleanup_old_data(
    body: CleanupRequest,
    user: UserInfo = Depends(require_admin),
    session: AsyncSession = Depends(get_db),
) -> dict:
    """清理过期数据（最少保留 30 天）。"""
    svc = LearningService(session)
    try:
        return await svc.cleanup_old_data(
            retain_days=body.retain_days,
            changed_by=user.email,
        )
    except Exception as exc:
        logger.error("清理数据失败: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="清理数据失败",
        )
