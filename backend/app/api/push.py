"""推送设置 API 路由 — 查询/更新推送偏好、测试推送。

路由层只做参数校验和响应格式化，业务逻辑在 push_service。
"""

import logging

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import UserInfo, get_current_user
from app.services.push_service import (
    PushSettings,
    TestPushResult,
    get_push_settings,
    test_push_channel,
    update_push_settings,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/push", tags=["push"])


class TestPushRequest(BaseModel):
    channel: str


@router.get("/settings", response_model=PushSettings)
async def get_settings(
    user: UserInfo = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> PushSettings:
    """获取当前用户的推送设置。"""
    try:
        return await get_push_settings(session, user.id)
    except Exception as exc:
        logger.error("get_settings error: %s", exc)
        raise HTTPException(status_code=500, detail="获取推送设置失败")


@router.put("/settings", response_model=PushSettings)
async def put_settings(
    body: PushSettings,
    user: UserInfo = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> PushSettings:
    """更新当前用户的推送设置。"""
    try:
        return await update_push_settings(session, user.id, body)
    except Exception as exc:
        logger.error("put_settings error: %s", exc)
        raise HTTPException(status_code=500, detail="更新推送设置失败")


@router.post("/test", response_model=TestPushResult)
async def test_push(
    body: TestPushRequest,
    user: UserInfo = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> TestPushResult:
    """测试指定推送渠道。"""
    try:
        return await test_push_channel(session, user.id, body.channel)
    except Exception as exc:
        logger.error("test_push error: %s", exc)
        raise HTTPException(status_code=500, detail="测试推送失败")
