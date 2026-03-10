"""FastAPI 依赖注入 — 认证 & 权限校验。

路由层通过 Depends 使用，不在业务逻辑里手动判断等级。
"""

import logging
from datetime import datetime, timezone
from typing import Callable

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import decode_token

logger = logging.getLogger(__name__)

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")


class UserInfo(BaseModel):
    """当前登录用户信息，由 get_current_user 返回。"""

    id: str
    email: str
    membership_level: int
    is_active: bool
    is_admin: bool = False
    role: str = "user"
    membership_expires_at: str | None = None

    @property
    def user_id(self) -> str:
        """Alias for id, used by partner/task routes."""
        return self.id




async def get_current_user(
    token: str = Depends(oauth2_scheme),
    session: AsyncSession = Depends(get_db),
) -> UserInfo:
    """从 JWT 提取用户信息，查询数据库验证。

    - 401: token 无效/过期
    - 403: 用户已停用
    """
    credentials_exc = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="无效的认证凭据",
        headers={"WWW-Authenticate": "Bearer"},
    )

    try:
        payload = decode_token(token)
        user_id: str | None = payload.get("sub")
        token_type: str | None = payload.get("type")
        if user_id is None or token_type != "access":
            raise credentials_exc
    except JWTError:
        raise credentials_exc

    try:
        result = await session.execute(
            text(
                """
                SELECT u.id, u.email, u.is_active, u.is_admin,
                       CASE
                           WHEN COALESCE(u.is_admin, FALSE) THEN 'admin'
                           ELSE COALESCE(u.role, 'user')
                       END AS role,
                       COALESCE(m.level, 0) AS membership_level,
                       m.expires_at AS membership_expires_at
                FROM users u
                LEFT JOIN memberships m ON m.user_id = u.id
                WHERE u.id = :user_id
                """
            ),
            {"user_id": user_id},
        )
        row = result.mappings().first()
    except Exception as exc:
        logger.error("get_current_user DB query failed: %s", exc)
        raise credentials_exc

    if row is None:
        raise credentials_exc

    if not row["is_active"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="用户已停用",
        )

    # 会员过期检查：如果 expires_at 已过期，降级为免费用户
    membership_level = row["membership_level"]
    if membership_level > 0 and row["membership_expires_at"]:
        try:
            expires_at = row["membership_expires_at"]
            if isinstance(expires_at, str):
                expires_at = datetime.fromisoformat(expires_at)
            if expires_at.tzinfo is None:
                expires_at = expires_at.replace(tzinfo=timezone.utc)
            if expires_at < datetime.now(timezone.utc):
                membership_level = 0
        except Exception:
            pass  # 解析失败时保持原等级

    # 将 expires_at 转为 ISO 字符串传给前端
    raw_expires = row["membership_expires_at"]
    expires_iso: str | None = None
    if membership_level > 0 and raw_expires is not None:
        try:
            ea = raw_expires
            if isinstance(ea, str):
                ea = datetime.fromisoformat(ea)
            expires_iso = ea.isoformat()
        except Exception:
            pass

    return UserInfo(
        id=str(row["id"]),
        email=row["email"],
        membership_level=membership_level,
        is_active=row["is_active"],
        is_admin=row["is_admin"],
        role=row["role"],
        membership_expires_at=expires_iso,
    )


def require_level(level: int) -> Callable:
    """返回一个依赖，校验用户会员等级 >= level。

    用法: Depends(require_level(2))  # 旗舰=2
    """

    async def _check(user: UserInfo = Depends(get_current_user)) -> UserInfo:
        if not user.is_admin and user.membership_level < level:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="订阅等级不足",
            )
        return user

    return _check


def require_role(allowed_roles: list[str]) -> Callable:
    """通用角色校验依赖。

    用法: Depends(require_role(["admin", "operator"]))
    角色不在允许列表中时返回 HTTP 403 "权限不足"。
    """

    async def _check(user: UserInfo = Depends(get_current_user)) -> UserInfo:
        effective_role = "admin" if user.is_admin else user.role
        if effective_role not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="权限不足",
            )
        return user

    return _check


async def require_admin(user: UserInfo = Depends(get_current_user)) -> UserInfo:
    """管理员校验 — 向后兼容，内部委托 require_role。"""
    checker = require_role(["admin"])
    return await checker(user)


async def require_operator_or_admin(
    user: UserInfo = Depends(get_current_user),
) -> UserInfo:
    """运营员或管理员校验。"""
    checker = require_role(["admin", "operator"])
    return await checker(user)
