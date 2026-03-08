"""预警规则 API 路由 — CRUD + 触发历史查询。"""

import logging
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import UserInfo, get_current_user
from app.models.alert import (
    AlertRuleCreate,
    AlertRuleResponse,
    AlertRuleUpdate,
    AlertTriggerResponse,
)
from app.services.alert_engine import (
    AlertRuleEngine,
    QuotaExceededError,
    RuleNotFoundError,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/alerts", tags=["alerts"])


@router.post("/rules", response_model=AlertRuleResponse, status_code=status.HTTP_201_CREATED)
async def create_rule(
    rule: AlertRuleCreate,
    user: UserInfo = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> AlertRuleResponse:
    """创建预警规则。"""
    engine = AlertRuleEngine(session)
    try:
        return await engine.create_rule(user.id, user.membership_level, rule)
    except QuotaExceededError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc))


@router.get("/rules", response_model=list[AlertRuleResponse])
async def list_rules(
    user: UserInfo = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> list[AlertRuleResponse]:
    """获取当前用户的所有预警规则。"""
    engine = AlertRuleEngine(session)
    return await engine.list_rules(user.id)


@router.put("/rules/{rule_id}", response_model=AlertRuleResponse)
async def update_rule(
    rule_id: UUID,
    update: AlertRuleUpdate,
    user: UserInfo = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> AlertRuleResponse:
    """修改预警规则（仅限本人创建的规则）。"""
    engine = AlertRuleEngine(session)
    try:
        return await engine.update_rule(user.id, rule_id, update)
    except RuleNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))


@router.delete("/rules/{rule_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_rule(
    rule_id: UUID,
    user: UserInfo = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> None:
    """删除预警规则（仅限本人创建的规则）。"""
    engine = AlertRuleEngine(session)
    try:
        await engine.delete_rule(user.id, rule_id)
    except RuleNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))


@router.get("/triggers", response_model=list[AlertTriggerResponse])
async def list_triggers(
    limit: int = Query(default=100, le=100),
    user: UserInfo = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> list[AlertTriggerResponse]:
    """获取最近的触发历史（最多100条）。"""
    engine = AlertRuleEngine(session)
    return await engine.list_triggers(user.id, limit=limit)
