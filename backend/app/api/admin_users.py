"""用户管理 API 路由 — 列表/启停用/调整会员等级。

路由层只做参数校验和响应格式化，业务逻辑委托 user_service。
所有端点需要 admin 角色权限。
"""

import logging

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import UserInfo, require_admin, require_operator_or_admin
from app.services.user_service import (
    AdminUserInfo,
    AdminUserListResponse,
    query_users,
    toggle_user_active,
    update_membership,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/admin/users", tags=["admin-users"])


# ── 请求模型 ──────────────────────────────────────────────────


class ToggleActiveRequest(BaseModel):
    """启停用请求体。"""

    is_active: bool


class UpdateMembershipBody(BaseModel):
    """调整会员等级请求体。"""

    level: int
    expires_at: str | None = None


# ── 路由 ──────────────────────────────────────────────────────


@router.get("", response_model=AdminUserListResponse)
async def list_users_route(
    search: str | None = Query(None, description="邮箱模糊搜索"),
    role: str | None = Query(None, description="角色: admin/operator/user"),
    membership_level: int | None = Query(None, description="会员等级: 0/1/2"),
    is_active: bool | None = Query(None, description="启用状态"),
    page: int = Query(1, ge=1, description="页码"),
    page_size: int = Query(20, ge=10, le=50, description="每页条数"),
    user: UserInfo = Depends(require_operator_or_admin),
    session: AsyncSession = Depends(get_db),
) -> AdminUserListResponse:
    """分页查询全平台用户。运营员可只读访问。"""
    try:
        return await query_users(
            session,
            search=search,
            role=role,
            membership_level=membership_level,
            is_active=is_active,
            page=page,
            page_size=page_size,
        )
    except Exception as exc:
        logger.error("list_users_route error: %s", exc)
        raise HTTPException(status_code=500, detail="查询用户列表失败")


@router.put("/{user_id}/active", response_model=AdminUserInfo)
async def toggle_active_route(
    user_id: str,
    body: ToggleActiveRequest,
    admin: UserInfo = Depends(require_admin),
    session: AsyncSession = Depends(get_db),
) -> AdminUserInfo:
    """启用/停用用户账户。"""
    if user_id == admin.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="不能停用自己的账户",
        )
    try:
        return await toggle_user_active(session, user_id, body.is_active)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    except Exception as exc:
        logger.error("toggle_active_route error: %s", exc)
        raise HTTPException(status_code=500, detail="操作失败")


@router.put("/{user_id}/membership", response_model=AdminUserInfo)
async def update_membership_route(
    user_id: str,
    body: UpdateMembershipBody,
    admin: UserInfo = Depends(require_admin),
    session: AsyncSession = Depends(get_db),
) -> AdminUserInfo:
    """管理员手动调整用户会员等级。"""
    from datetime import datetime

    expires_at = None
    if body.expires_at:
        try:
            expires_at = datetime.fromisoformat(body.expires_at)
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="expires_at 格式无效，请使用 ISO 格式",
            )

    try:
        return await update_membership(session, user_id, body.level, expires_at)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
    except Exception as exc:
        logger.error("update_membership_route error: %s", exc)
        raise HTTPException(status_code=500, detail="调整会员等级失败")
