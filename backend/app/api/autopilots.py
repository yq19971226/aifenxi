"""自动驾驶仪 API 路由 — 封装为高级预警规则以映射到现有 NSED 引擎。"""

import logging
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import UserInfo, get_current_user
from app.models.alert import (
    AlertRuleCreate,
    AlertRuleResponse,
    Condition,
    ConditionExpression,
    LogicGroup,
    MetricType,
    Operator,
)
from app.services.alert_engine import AlertRuleEngine, QuotaExceededError

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/autopilots", tags=["autopilots"])


class AutopilotDeployRequest(BaseModel):
    """前端一键部署自动驾驶仪的请求模型。"""
    symbol: str = Field(..., max_length=20, description="交易对，如 BTCUSDT")
    engine: str = Field(..., description="引擎配置: nsed_full (AI_CONSENSUS) 或 scalping_fast (SCALPING_SIGNAL)")
    channels: list[str] = Field(default_factory=list, description="通知渠道：discord, webhook 等")
    webhook_url: str | None = Field(default=None, description="自定义 Webhook 分发地址")


@router.post("/deploy", response_model=AlertRuleResponse, status_code=status.HTTP_201_CREATED)
async def deploy_autopilot(
    req: AutopilotDeployRequest,
    user: UserInfo = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> AlertRuleResponse:
    """部署自动驾驶仪 (映射到 AlertRule 以订阅底层 AI 引擎输出)。"""
    
    # 映射 Frontend 引擎配置到 Backend 指标类型
    # nsed_full -> 订阅 AI_CONSENSUS (多智能体共识)
    # scalping_fast -> 订阅 SCALPING_SIGNAL (纯规则超短线)
    if req.engine == "scalping_fast":
        metric_type = MetricType.SCALPING_SIGNAL
        rule_name = f"Autopilot: {req.symbol} (Sniper Scalping)"
        # 触发阈值：置信度 > 0.6
        threshold = 0.6
    else:
        metric_type = MetricType.AI_CONSENSUS
        rule_name = f"Autopilot: {req.symbol} (Omni NSED Full)"
        # 触发阈值：置信度 > 0.8
        threshold = 0.8
        
    # 构建高置信度的预警表达式
    expression = ConditionExpression(
        logic=LogicGroup.AND,
        conditions=[
            Condition(
                metric=metric_type,
                operator=Operator.GT,
                threshold=threshold
            )
        ]
    )
    
    # 整合通知通道
    notify_channels = ["websocket"] # 默认都有 websocket 推送给前端 Dashboard
    notify_channels.extend(req.channels)
    
    # 构建 AlertRule
    rule = AlertRuleCreate(
        name=rule_name,
        symbol=req.symbol.upper(),
        expression=expression,
        notify_channels=list(set(notify_channels)) # 去重
    )
    
    engine = AlertRuleEngine(session)
    try:
        # TODO: Webhook 专属 URL 配置目前未在 alert 模型实现，这里简化处理只订阅
        return await engine.create_rule(user.id, user.membership_level, rule)
    except QuotaExceededError as exc:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, 
            detail=f"部署失败: 您的活跃探测器/自动驾驶仪数量已达上限 ({exc})"
        )
    except Exception as exc:
        logger.error("Failed to deploy autopilot: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, 
            detail="系统内部错误：无法初始化 NSED 分区"
        )

@router.get("", response_model=list[AlertRuleResponse])
async def list_autopilots(
    user: UserInfo = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> list[AlertRuleResponse]:
    """获取用户所有激活的自动驾驶仪配置 (过滤以 'Autopilot:' 开头的预警规则)。"""
    engine = AlertRuleEngine(session)
    try:
        all_rules = await engine.list_rules(user.id)
        # 仅返回由部署自动驾驶仪时创建的专用规则
        return [r for r in all_rules if r.name.startswith("Autopilot:")]
    except Exception as exc:
        logger.error("Failed to list autopilots: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, 
            detail="系统内部错误：无法获取 Autopilot 列表"
        )
