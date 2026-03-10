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
from app.core.sql_compat import insert_returning, is_sqlite, update_returning

logger = logging.getLogger(__name__)

USER_ROLE_COLUMN_DEFS = {
    "role": ("VARCHAR(20) DEFAULT 'user'", "TEXT DEFAULT 'user'"),
    "is_admin": ("BOOLEAN DEFAULT false", "INTEGER DEFAULT 0"),
}


# ── Pydantic 模型 ─────────────────────────────────────────────


class OperatorInfo(BaseModel):
    """运营员信息响应模型。"""

    id: str
    email: str
    is_active: bool
    created_at: datetime


async def ensure_operator_user_columns(session: AsyncSession) -> None:
    if is_sqlite:
        result = await session.execute(text("PRAGMA table_info(users)"))
        existing_columns = {row[1] for row in result.fetchall()}
        missing_columns = [
            column_name
            for column_name in USER_ROLE_COLUMN_DEFS
            if column_name not in existing_columns
        ]
        if missing_columns:
            logger.warning(
                "ensure_operator_user_columns adding sqlite columns=%s",
                ",".join(missing_columns),
            )
        for column_name, (_, sqlite_type) in USER_ROLE_COLUMN_DEFS.items():
            if column_name not in existing_columns:
                await session.execute(
                    text(f"ALTER TABLE users ADD COLUMN {column_name} {sqlite_type}")
                )
    else:
        result = await session.execute(
            text(
                """
                SELECT column_name
                FROM information_schema.columns
                WHERE table_schema = current_schema()
                  AND table_name = 'users'
                """
            )
        )
        existing_columns = {row[0] for row in result.fetchall()}
        missing_columns = [
            column_name
            for column_name in USER_ROLE_COLUMN_DEFS
            if column_name not in existing_columns
        ]
        if missing_columns:
            logger.warning(
                "ensure_operator_user_columns adding postgres columns=%s",
                ",".join(missing_columns),
            )
        for column_name, (pg_type, _) in USER_ROLE_COLUMN_DEFS.items():
            if column_name not in existing_columns:
                await session.execute(
                    text(
                        f"ALTER TABLE users ADD COLUMN IF NOT EXISTS {column_name} {pg_type}"
                    )
                )

    await session.execute(
        text(
            """
            UPDATE users
            SET role = CASE
                    WHEN COALESCE(role, '') = '' AND COALESCE(is_admin, FALSE) THEN 'admin'
                    WHEN COALESCE(role, '') = '' THEN 'user'
                    ELSE role
                END,
                is_admin = COALESCE(is_admin, FALSE)
            WHERE COALESCE(role, '') = '' OR is_admin IS NULL
            """
        )
    )
    await session.flush()


# ── 服务函数 ──────────────────────────────────────────────────


async def create_operator(
    session: AsyncSession,
    email: str,
    password: str,
) -> OperatorInfo:
    """创建运营员账户（role=operator）。

    密码使用 bcrypt 哈希存储。邮箱已存在时抛出 ValueError。
    """
    await ensure_operator_user_columns(session)

    email = email.lower().strip()

    # 检查邮箱是否已存在（LOWER 兼容存量混合大小写数据）
    try:
        result = await session.execute(
            text("SELECT id FROM users WHERE LOWER(email) = :email"),
            {"email": email},
        )
        if result.first() is not None:
            raise ValueError("该邮箱已注册")
    except ValueError:
        raise
    except Exception as exc:
        logger.exception("create_operator check email failed target_email=%s", email)
        raise

    # 创建用户（email 存储归一化后的小写形式）
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
        logger.exception("create_operator insert failed target_email=%s", email)
        raise

    logger.info("create_operator succeeded target_email=%s operator_id=%s", row["email"], row["id"])

    return OperatorInfo(
        id=str(row["id"]),
        email=row["email"],
        is_active=row["is_active"],
        created_at=row["created_at"],
    )


async def list_operators(session: AsyncSession) -> list[OperatorInfo]:
    """查询所有运营员账户列表。"""
    await ensure_operator_user_columns(session)

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
        logger.exception("list_operators query failed")
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
    await ensure_operator_user_columns(session)

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
        logger.exception(
            "set_operator_active failed operator_id=%s is_active=%s",
            operator_id,
            is_active,
        )
        raise

    if row is None:
        raise ValueError("运营员不存在")

    return OperatorInfo(
        id=str(row["id"]),
        email=row["email"],
        is_active=row["is_active"],
        created_at=row["created_at"],
    )
