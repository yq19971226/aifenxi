"""用户管理业务逻辑 — 查询、创建、启停用、调整会员等级。

Service 层包含业务逻辑，使用 sqlalchemy text() 参数化查询。
返回 pydantic 模型，支持分页搜索和筛选。
"""

import logging
import secrets
import uuid
from datetime import datetime

from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import hash_password
from app.core.sql_compat import update_returning

logger = logging.getLogger(__name__)


# ── Pydantic 模型 ─────────────────────────────────────────────


class AdminUserInfo(BaseModel):
    """用户信息响应模型（管理员视角）。"""

    id: str
    email: str
    role: str
    is_active: bool
    membership_level: int
    expires_at: datetime | None
    created_at: datetime


class AdminUserListResponse(BaseModel):
    """用户列表分页响应模型。"""

    items: list[AdminUserInfo]
    total: int
    page: int
    page_size: int


class UpdateMembershipRequest(BaseModel):
    """调整会员等级请求模型。"""

    level: int
    expires_at: datetime | None = None


# ── 服务函数 ──────────────────────────────────────────────────


async def _generate_unique_referral_code(session: AsyncSession, length: int = 8) -> str:
    alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    for _ in range(10):
        code = "".join(secrets.choice(alphabet) for _ in range(length))
        existing = await session.execute(
            text("SELECT 1 FROM users WHERE referral_code = :code"),
            {"code": code},
        )
        if existing.first() is None:
            return code
    raise RuntimeError("无法生成唯一邀请码，请重试")


async def create_user(
    session: AsyncSession,
    email: str,
    password: str,
    role: str = "user",
    membership_level: int = 0,
    expires_at: datetime | None = None,
) -> AdminUserInfo:
    """管理员创建新用户。"""
    if role not in ("user", "operator", "admin"):
        raise ValueError("角色必须为 user / operator / admin")
    if membership_level not in (0, 1, 2):
        raise ValueError("会员等级必须为 0(免费)、1(专业) 或 2(旗舰)")

    normalized_email = email.strip().lower()
    existing = await session.execute(
        text("SELECT 1 FROM users WHERE LOWER(email) = :email"),
        {"email": normalized_email},
    )
    if existing.first() is not None:
        raise ValueError("该邮箱已注册")

    hashed = hash_password(password)
    user_id = str(uuid.uuid4())
    referral_code = await _generate_unique_referral_code(session)
    is_admin = role == "admin"

    await session.execute(
        text(
            "INSERT INTO users (id, email, password_hash, role, is_admin, referral_code) "
            "VALUES (:id, :email, :password_hash, :role, :is_admin, :referral_code)"
        ),
        {
            "id": user_id,
            "email": normalized_email,
            "password_hash": hashed,
            "role": role,
            "is_admin": is_admin,
            "referral_code": referral_code,
        },
    )

    await session.execute(
        text(
            "INSERT INTO memberships (id, user_id, level, expires_at) "
            "VALUES (:id, :user_id, :level, :expires_at)"
        ),
        {
            "id": str(uuid.uuid4()),
            "user_id": user_id,
            "level": membership_level,
            "expires_at": expires_at,
        },
    )

    await session.execute(
        text("INSERT INTO push_settings (id, user_id) VALUES (:id, :user_id)"),
        {"id": str(uuid.uuid4()), "user_id": user_id},
    )

    await session.flush()

    return AdminUserInfo(
        id=user_id,
        email=normalized_email,
        role=role,
        is_active=True,
        membership_level=membership_level,
        expires_at=expires_at,
        created_at=datetime.utcnow(),
    )


async def query_users(
    session: AsyncSession,
    search: str | None = None,
    role: str | None = None,
    membership_level: int | None = None,
    is_active: bool | None = None,
    page: int = 1,
    page_size: int = 20,
) -> AdminUserListResponse:
    """分页查询全平台用户。

    - search: ILIKE 模糊匹配 email
    - role: 精确匹配角色 (admin/operator/user)
    - membership_level: 精确匹配会员等级 (0/1/2)
    - is_active: 精确匹配启用状态
    """
    where_clauses: list[str] = []
    params: dict = {}

    if search:
        where_clauses.append("u.email ILIKE :search")
        params["search"] = f"%{search}%"

    if role:
        where_clauses.append("u.role = :role")
        params["role"] = role

    if membership_level is not None:
        where_clauses.append("COALESCE(m.level, 0) = :membership_level")
        params["membership_level"] = membership_level

    if is_active is not None:
        where_clauses.append("u.is_active = :is_active")
        params["is_active"] = is_active

    where_sql = ""
    if where_clauses:
        where_sql = "WHERE " + " AND ".join(where_clauses)

    # ── 查询总数 ──
    count_sql = f"""
        SELECT COUNT(*) AS total
        FROM users u
        LEFT JOIN memberships m ON m.user_id = u.id
        {where_sql}
    """
    try:
        result = await session.execute(text(count_sql), params)
        total = result.scalar() or 0
    except Exception as exc:
        logger.error("query_users count error: %s", exc)
        raise

    # ── 查询分页数据 ──
    offset = (page - 1) * page_size
    params["page_size"] = page_size
    params["offset"] = offset

    data_sql = f"""
        SELECT u.id, u.email, COALESCE(u.role, 'user') AS role,
               u.is_active, COALESCE(m.level, 0) AS membership_level,
               m.expires_at, u.created_at
        FROM users u
        LEFT JOIN memberships m ON m.user_id = u.id
        {where_sql}
        ORDER BY u.created_at DESC
        LIMIT :page_size OFFSET :offset
    """
    try:
        result = await session.execute(text(data_sql), params)
        rows = result.mappings().all()
    except Exception as exc:
        logger.error("query_users data error: %s", exc)
        raise

    items = [
        AdminUserInfo(
            id=str(row["id"]),
            email=row["email"],
            role=row["role"],
            is_active=row["is_active"],
            membership_level=row["membership_level"],
            expires_at=row["expires_at"],
            created_at=row["created_at"],
        )
        for row in rows
    ]

    return AdminUserListResponse(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
    )


async def toggle_user_active(
    session: AsyncSession,
    user_id: str,
    is_active: bool,
) -> AdminUserInfo:
    """启用/停用用户账户。"""
    try:
        result = await update_returning(
            session,
            """
            UPDATE users SET is_active = :is_active
            WHERE id = :user_id
            RETURNING id, email, COALESCE(role, 'user') AS role,
                      is_active, created_at
            """,
            {"user_id": user_id, "is_active": is_active},
            table="users", where="id = :user_id",
        )
        row = result.mappings().first()
        await session.flush()
    except Exception as exc:
        logger.error("toggle_user_active DB error: %s", exc)
        raise

    if row is None:
        raise ValueError("用户不存在")

    # 查询会员信息
    try:
        m_result = await session.execute(
            text(
                "SELECT COALESCE(level, 0) AS level, expires_at "
                "FROM memberships WHERE user_id = :user_id"
            ),
            {"user_id": user_id},
        )
        m_row = m_result.mappings().first()
    except Exception as exc:
        logger.error("toggle_user_active membership query error: %s", exc)
        raise

    return AdminUserInfo(
        id=str(row["id"]),
        email=row["email"],
        role=row["role"],
        is_active=row["is_active"],
        membership_level=m_row["level"] if m_row else 0,
        expires_at=m_row["expires_at"] if m_row else None,
        created_at=row["created_at"],
    )


async def update_membership(
    session: AsyncSession,
    user_id: str,
    level: int,
    expires_at: datetime | None,
) -> AdminUserInfo:
    """管理员手动调整用户会员等级和到期时间。"""
    if level not in (0, 1, 2):
        raise ValueError("会员等级必须为 0(免费)、1(专业) 或 2(旗舰)")

    # 检查用户是否存在
    try:
        u_result = await session.execute(
            text(
                "SELECT id, email, COALESCE(role, 'user') AS role, "
                "is_active, created_at FROM users WHERE id = :user_id"
            ),
            {"user_id": user_id},
        )
        u_row = u_result.mappings().first()
    except Exception as exc:
        logger.error("update_membership user query error: %s", exc)
        raise

    if u_row is None:
        raise ValueError("用户不存在")

    # 更新或插入会员记录
    try:
        await session.execute(
            text(
                """
                INSERT INTO memberships (user_id, level, expires_at)
                VALUES (:user_id, :level, :expires_at)
                ON CONFLICT (user_id) DO UPDATE
                SET level = :level, expires_at = :expires_at
                """
            ),
            {"user_id": user_id, "level": level, "expires_at": expires_at},
        )
        await session.flush()
    except Exception as exc:
        logger.error("update_membership DB error: %s", exc)
        raise

    return AdminUserInfo(
        id=str(u_row["id"]),
        email=u_row["email"],
        role=u_row["role"],
        is_active=u_row["is_active"],
        membership_level=level,
        expires_at=expires_at,
        created_at=u_row["created_at"],
    )
