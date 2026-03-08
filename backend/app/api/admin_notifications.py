"""通知历史 API 路由 — 分页查询通知推送记录。

路由层只做参数校验和响应格式化，业务逻辑委托 notification_log_service。
所有端点需要 admin 角色权限。
"""

import logging

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import UserInfo, require_admin
from app.services.notification_log_service import (
    NotificationLogListResponse,
    query_notifications,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/admin/notifications", tags=["admin-notifications"])


@router.get("", response_model=NotificationLogListResponse)
async def list_notifications_route(
    search: str | None = Query(None, description="收件人或主题模糊搜索"),
    channel: str | None = Query(None, description="渠道: email/telegram"),
    status: str | None = Query(None, description="状态: sent/failed"),
    page: int = Query(1, ge=1, description="页码"),
    page_size: int = Query(20, ge=10, le=50, description="每页条数"),
    user: UserInfo = Depends(require_admin),
    session: AsyncSession = Depends(get_db),
) -> NotificationLogListResponse:
    """分页查询通知推送历史。"""
    try:
        return await query_notifications(
            session,
            search=search,
            channel=channel,
            status=status,
            page=page,
            page_size=page_size,
        )
    except Exception as exc:
        logger.error("list_notifications_route error: %s", exc)
        raise HTTPException(status_code=500, detail="查询通知历史失败")
