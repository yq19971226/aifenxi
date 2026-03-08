"""运营员管理业务逻辑 — 创建、查询、启停用运营员账户。

Service 层包含业务逻辑，使用 sqlalchemy text() 参数化查询。
密码使用 bcrypt 哈希存储，返回 pydantic 模型。
"""

import logging
from datetime import datetime

from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import hash_password
from app.core.sql_compat import insert_returning, update_returning

logger = logging.getLogger(__name__)


# ── Pydantic 模型 ─────────────────────────────────────────────


class OperatorInfo(BaseModel):
    """运营员信息响应模型。"""

    id: str
    email: str
    is_active: bool
    created_at: datetime


# ── 服务函数 ──────────────────────────────────────────────────


async def create_operator(
    session: AsyncSession,
    email: str,
    password: str,
) -> OperatorInfo:
    """创建运营员账户（role=operator）。

    密码使用 bcrypt 哈希存储。邮箱已存在时抛出 ValueError。
    """
    # 检查邮箱是否已存在
    try:
        result = await session.execute(
            text("SELECT id FROM users WHERE email = :email"),
            {"email": email},
        )
        if result.first() is not None:
            raise ValueError("该邮箱已注册")
    except ValueError:
        raise
    except Exception as exc:
        logger.error("create_operator check email error: %s", exc)
        raise

    # 创建用户
    password_hash = hash_password(password)
    try:
        result = await insert_returning(
            session,
            """
            INSERT INTO users (email, password_hash, role, is_active, is_admin)
            VALUES (:email, :password_hash, 'operator', TRUE, FALSE)
            RETURNING id, email, is_active, created_at
            """,
            {"email": email, "password_hash": password_hash},
            table="users",
        )
        row = result.mappings().first()
        await session.flush()
    except Exception as exc:
        logger.error("create_operator DB insert error: %s", exc)
        raise

    return OperatorInfo(
        id=str(row["id"]),
        email=row["email"],
        is_active=row["is_active"],
        created_at=row["created_at"],
    )


async def list_operators(session: AsyncSession) -> list[OperatorInfo]:
    """查询所有运营员账户列表。"""
    try:
        result = await session.execute(
            text(
                """
                SELECT id, email, is_active, created_at
                FROM users
                WHERE role = 'operator'
                ORDER BY created_at DESC
                """
            ),
        )
        rows = result.mappings().all()
    except Exception as exc:
        logger.error("list_operators DB error: %s", exc)
        raise

    return [
        OperatorInfo(
            id=str(row["id"]),
            email=row["email"],
            is_active=row["is_active"],
            created_at=row["created_at"],
        )
        for row in rows
    ]


async def activate_operator(
    session: AsyncSession,
    operator_id: str,
) -> OperatorInfo:
    """启用运营员账户（is_active=True）。"""
    return await _set_operator_active(session, operator_id, is_active=True)


async def deactivate_operator(
    session: AsyncSession,
    operator_id: str,
) -> OperatorInfo:
    """停用运营员账户（is_active=False）。"""
    return await _set_operator_active(session, operator_id, is_active=False)


# ── 内部辅助函数 ──────────────────────────────────────────────


async def _set_operator_active(
    session: AsyncSession,
    operator_id: str,
    *,
    is_active: bool,
) -> OperatorInfo:
    """设置运营员 is_active 状态，返回更新后的信息。

    运营员不存在或角色不是 operator 时抛出 ValueError。
    """
    try:
        result = await update_returning(
            session,
            """
            UPDATE users
            SET is_active = :is_active
            WHERE id = :operator_id AND role = 'operator'
            RETURNING id, email, is_active, created_at
            """,
            {"operator_id": operator_id, "is_active": is_active},
            table="users", where="id = :operator_id AND role = 'operator'",
        )
        row = result.mappings().first()
        await session.flush()
    except Exception as exc:
        logger.error("_set_operator_active DB error: %s", exc)
        raise

    if row is None:
        raise ValueError("运营员不存在")

    return OperatorInfo(
        id=str(row["id"]),
        email=row["email"],
        is_active=row["is_active"],
        created_at=row["created_at"],
    )
