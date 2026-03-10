"""运营员管理 API 路由 — 列表/创建/启停用运营员。

路由层只做参数校验和响应格式化，业务逻辑委托 operator_service。
所有端点需要 admin 角色权限。
"""

import logging

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import UserInfo, require_admin
from app.services.operator_service import (
    OperatorInfo,
    activate_operator,
    create_operator,
    deactivate_operator,
    list_operators,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/operators", tags=["operators"])


# ── 请求模型 ──────────────────────────────────────────────────


class CreateOperatorRequest(BaseModel):
    """创建运营员请求体。"""

    email: EmailStr
    password: str = Field(..., min_length=8, description="密码至少8位")


# ── 路由 ──────────────────────────────────────────────────────


@router.get("", response_model=list[OperatorInfo])
async def list_operators_route(
    user: UserInfo = Depends(require_admin),
    session: AsyncSession = Depends(get_db),
) -> list[OperatorInfo]:
    """获取所有运营员列表。"""
    try:
        return await list_operators(session)
    except Exception as exc:
        logger.exception(
            "list_operators_route failed admin_user_id=%s admin_email=%s",
            user.id,
            user.email,
        )
        raise HTTPException(status_code=500, detail="获取运营员列表失败")


@router.post("", response_model=OperatorInfo, status_code=status.HTTP_201_CREATED)
async def create_operator_route(
    body: CreateOperatorRequest,
    user: UserInfo = Depends(require_admin),
    session: AsyncSession = Depends(get_db),
) -> OperatorInfo:
    """创建运营员账户。"""
    try:
        operator = await create_operator(session, body.email, body.password)
        logger.info(
            "create_operator_route succeeded admin_user_id=%s admin_email=%s target_email=%s operator_id=%s",
            user.id,
            user.email,
            body.email,
            operator.id,
        )
        return operator
    except ValueError as exc:
        logger.warning(
            "create_operator_route rejected admin_user_id=%s admin_email=%s target_email=%s detail=%s",
            user.id,
            user.email,
            body.email,
            str(exc),
        )
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc))
    except Exception as exc:
        logger.exception(
            "create_operator_route failed admin_user_id=%s admin_email=%s target_email=%s",
            user.id,
            user.email,
            body.email,
        )
        raise HTTPException(status_code=500, detail="创建运营员失败")


@router.put("/{operator_id}/activate", response_model=OperatorInfo)
async def activate_operator_route(
    operator_id: str,
    user: UserInfo = Depends(require_admin),
    session: AsyncSession = Depends(get_db),
) -> OperatorInfo:
    """启用运营员账户。"""
    try:
        operator = await activate_operator(session, operator_id)
        logger.info(
            "activate_operator_route succeeded admin_user_id=%s admin_email=%s operator_id=%s target_email=%s",
            user.id,
            user.email,
            operator_id,
            operator.email,
        )
        return operator
    except ValueError as exc:
        logger.warning(
            "activate_operator_route rejected admin_user_id=%s admin_email=%s operator_id=%s detail=%s",
            user.id,
            user.email,
            operator_id,
            str(exc),
        )
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc))
    except Exception as exc:
        logger.exception(
            "activate_operator_route failed admin_user_id=%s admin_email=%s operator_id=%s",
            user.id,
            user.email,
            operator_id,
        )
        raise HTTPException(status_code=500, detail="启用运营员失败")


@router.put("/{operator_id}/deactivate", response_model=OperatorInfo)
async def deactivate_operator_route(
    operator_id: str,
    user: UserInfo = Depends(require_admin),
    session: AsyncSession = Depends(get_db),
) -> OperatorInfo:
    """停用运营员账户。"""
    try:
        operator = await deactivate_operator(session, operator_id)
        logger.info(
            "deactivate_operator_route succeeded admin_user_id=%s admin_email=%s operator_id=%s target_email=%s",
            user.id,
            user.email,
            operator_id,
            operator.email,
        )
        return operator
    except ValueError as exc:
        logger.warning(
            "deactivate_operator_route rejected admin_user_id=%s admin_email=%s operator_id=%s detail=%s",
            user.id,
            user.email,
            operator_id,
            str(exc),
        )
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc))
    except Exception as exc:
        logger.exception(
            "deactivate_operator_route failed admin_user_id=%s admin_email=%s operator_id=%s",
            user.id,
            user.email,
            operator_id,
        )
        raise HTTPException(status_code=500, detail="停用运营员失败")
