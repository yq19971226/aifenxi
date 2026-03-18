"""分析 API 路由 — 一键综合分析（SSE 流式）和配额查询。

端点：
- POST /api/analysis/run               — 执行分析，SSE 流式返回
- GET  /api/analysis/quota              — 获取各模式配额信息
- GET  /api/analysis/ai-detect/{symbol} — 获取最新 AI 操盘检测结果
"""

import logging
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from starlette.responses import StreamingResponse

from app.core.deps import UserInfo, get_current_user
from app.core.redis import get_json
from app.models.analysis import AnalysisRequest, AnalysisQuotaResponse
from app.services.analysis_orchestrator import AnalysisOrchestrator
from app.services.analysis_quota import AnalysisQuotaService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/analysis", tags=["analysis"])


@router.post("/run")
async def run_analysis(
    body: AnalysisRequest,
    user: UserInfo = Depends(get_current_user),
) -> StreamingResponse:
    """执行一键综合分析，SSE 流式返回进度和结果。

    - 422: 参数校验失败（pydantic 自动处理）
    - 403: 会员等级不足（由编排器通过 SSE ErrorEvent 返回）
    - 429: 配额耗尽（由编排器通过 SSE ErrorEvent 返回）
    - maintenance: 维护模式（直接返回 SSE error，不消耗配额）
    """
    # ── 维护模式检查 ──────────────────────────────────────────
    try:
        from app.core.redis import get_redis_pool
        _redis = get_redis_pool()
        _maint = await _redis.get("analysis:maintenance_enabled")
        if _maint is None:
            # Redis 无缓存，从 DB 读取并缓存
            from app.core.database import AsyncSessionLocal
            from app.services.config_service import ConfigService
            async with AsyncSessionLocal() as session:
                svc = ConfigService(session)
                _maint = await svc.get_config("analysis_maintenance_enabled", "false")
            await _redis.setex("analysis:maintenance_enabled", 300, _maint)  # 5min 缓存
        if _maint.lower() == "true":
            import json
            async def _maintenance_sse():
                yield f"data: {json.dumps({'type': 'error', 'code': 'maintenance', 'message': '综合分析模块正在维护升级中，请稍后再试', 'reset_time': None})}\n\n"
            return StreamingResponse(_maintenance_sse(), media_type="text/event-stream")
    except Exception:
        logger.debug("maintenance check failed, proceeding normally")

    orchestrator = AnalysisOrchestrator()
    return StreamingResponse(
        orchestrator.run_analysis(
            user_id=UUID(user.id),
            level=2 if user.is_admin else user.membership_level,
            symbol=body.symbol.upper(),
            mode=body.mode,
            force_refresh=body.force_refresh,
            locale=body.locale,
            user_email=user.email,
        ),
        media_type="text/event-stream",
    )


@router.get("/quota", response_model=AnalysisQuotaResponse)
async def get_analysis_quota(
    user: UserInfo = Depends(get_current_user),
) -> AnalysisQuotaResponse:
    """获取各分析模式的配额信息。"""
    quota_svc = AnalysisQuotaService()
    level = 2 if user.is_admin else user.membership_level
    try:
        quotas = await quota_svc.get_all_quotas(UUID(user.id), level)
        return AnalysisQuotaResponse(quotas=quotas, level=level)
    except Exception:
        logger.exception("获取分析配额失败 user_id=%s", user.id)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="获取配额信息失败",
        )


@router.get("/ai-detect/{symbol}")
async def get_ai_detection(
    symbol: str,
    _user: UserInfo = Depends(get_current_user),
) -> dict:
    """获取最新 AI 操盘检测结果（从 Redis 缓存读取）。"""
    try:
        data = await get_json(f"ai_detect:{symbol.upper()}")
        if data is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="暂无该交易对的AI检测数据",
            )
        return data
    except HTTPException:
        raise
    except Exception:
        logger.exception("获取AI检测结果失败 symbol=%s", symbol)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="获取AI检测结果失败",
        )


@router.get("/signal-stability/{symbol}/{mode}")
async def get_signal_stability_endpoint(
    symbol: str,
    mode: str,
    _user: UserInfo = Depends(get_current_user),
) -> dict:
    """获取信号稳定度指标 — 供前端展示信号连续性和可信度。

    返回最近信号的一致性、连续次数、持续时间和稳定度等级。
    """
    valid_modes = {"scalping", "intraday", "trend"}
    if mode not in valid_modes:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"无效模式: {mode}，有效值: {', '.join(valid_modes)}",
        )

    try:
        from app.services.signal_history import get_signal_stability
        return await get_signal_stability(symbol.upper(), mode)
    except Exception:
        logger.exception("获取信号稳定度失败 symbol=%s mode=%s", symbol, mode)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="获取信号稳定度失败",
        )
