"""会员订阅服务 — 等级查询、升级、到期检查、查询限流。

所有数据库操作使用 sqlalchemy text()，Redis 用于限流计数。
"""

import logging
from datetime import date, datetime, timedelta, timezone

from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.redis import get_redis_pool
from app.core.sql_compat import update_returning

logger = logging.getLogger(__name__)

# ── 常量（硬编码回退默认值） ──────────────────────────────────

LEVEL_NAMES: dict[int, str] = {0: "免费", 1: "专业", 2: "旗舰"}
QUERY_LIMITS: dict[int, int] = {0: 3, 1: -1, 2: -1}  # -1 = 无限


# ── 动态配置辅助 ──────────────────────────────────────────────

async def _get_query_limit(level: int) -> int:
    """从动态配置读取查询限额，失败时回退到硬编码默认值。

    仅免费用户有限额配置（query_limit_free），专业和旗舰为无限（-1）。
    """
    fallback = QUERY_LIMITS.get(level, 3)

    # 只有免费用户需要从配置读取
    if level != 0:
        return fallback

    try:
        from app.services.config_service import get_config_value

        raw = await get_config_value("query_limit_free", str(fallback))
        return int(raw)
    except Exception:
        logger.warning(
            "读取动态配置失败，使用默认值: key=query_limit_free, default=%d",
            fallback,
        )
        return fallback


# ── Pydantic 模型 ─────────────────────────────────────────────

class MembershipInfo(BaseModel):
    """会员信息响应模型。"""

    user_id: str
    level: int
    level_name: str
    expires_at: datetime | None
    query_count_today: int
    query_limit: int
    is_expired: bool


# ── 服务函数 ──────────────────────────────────────────────────

async def get_membership(session: AsyncSession, user_id: str) -> MembershipInfo:
    """查询用户会员信息。无记录时返回免费等级默认值。"""
    try:
        result = await session.execute(
            text(
                """
                SELECT user_id, level, expires_at, query_count_today, query_reset_at
                FROM memberships
                WHERE user_id = :user_id
                """
            ),
            {"user_id": user_id},
        )
        row = result.mappings().first()
    except Exception as exc:
        logger.error("get_membership DB error: %s", exc)
        raise

    if row is None:
        query_limit = await _get_query_limit(0)
        return MembershipInfo(
            user_id=user_id,
            level=0,
            level_name=LEVEL_NAMES[0],
            expires_at=None,
            query_count_today=0,
            query_limit=query_limit,
            is_expired=False,
        )

    level: int = row["level"]
    expires_at: datetime | None = row["expires_at"]
    now = datetime.now(timezone.utc)
    is_expired = expires_at is not None and expires_at < now and level > 0

    query_limit = await _get_query_limit(level)

    return MembershipInfo(
        user_id=str(row["user_id"]),
        level=level,
        level_name=LEVEL_NAMES.get(level, "未知"),
        expires_at=expires_at,
        query_count_today=row["query_count_today"],
        query_limit=query_limit,
        is_expired=is_expired,
    )


async def upgrade_membership(
    session: AsyncSession,
    user_id: str,
    new_level: int,
    duration_days: int = 30,
) -> MembershipInfo:
    """升级会员等级，设置到期时间。

    使用 UPSERT 确保幂等：无记录则插入，有记录则更新。
    """
    if new_level not in LEVEL_NAMES:
        raise ValueError(f"无效的会员等级: {new_level}")

    expires_at = datetime.now(timezone.utc) + timedelta(days=duration_days)

    try:
        await session.execute(
            text(
                """
                INSERT INTO memberships (user_id, level, expires_at, query_count_today, query_reset_at)
                VALUES (:user_id, :level, :expires_at, 0, CURRENT_DATE)
                ON CONFLICT (user_id)
                DO UPDATE SET level = :level, expires_at = :expires_at
                """
            ),
            {"user_id": user_id, "level": new_level, "expires_at": expires_at},
        )
        await session.flush()
    except Exception as exc:
        logger.error("upgrade_membership DB error: %s", exc)
        raise

    return await get_membership(session, user_id)


async def check_expiration(session: AsyncSession, user_id: str) -> bool:
    """检查会员是否过期。过期则降级为免费，返回 True。"""
    membership = await get_membership(session, user_id)

    if not membership.is_expired:
        return False

    try:
        await session.execute(
            text(
                """
                UPDATE memberships
                SET level = 0, expires_at = NULL
                WHERE user_id = :user_id
                """
            ),
            {"user_id": user_id},
        )
        await session.flush()
        logger.info("Membership expired, downgraded to free: user_id=%s", user_id)
    except Exception as exc:
        logger.error("check_expiration DB error: %s", exc)
        raise

    return True


async def increment_query_count(session: AsyncSession, user_id: str) -> int:
    """递增每日查询计数。跨日自动重置。返回新计数值。"""
    today = date.today()

    try:
        # 先重置跨日计数
        await session.execute(
            text(
                """
                UPDATE memberships
                SET query_count_today = 0, query_reset_at = :today
                WHERE user_id = :user_id AND query_reset_at < :today
                """
            ),
            {"user_id": user_id, "today": today},
        )

        # 递增并返回新值
        result = await update_returning(
            session,
            """
            UPDATE memberships
            SET query_count_today = query_count_today + 1
            WHERE user_id = :user_id
            RETURNING query_count_today
            """,
            {"user_id": user_id},
            table="memberships", where="user_id = :user_id",
        )
        await session.flush()
        row = result.scalar_one_or_none()
        return row if row is not None else 0
    except Exception as exc:
        logger.error("increment_query_count DB error: %s", exc)
        raise


async def check_query_limit(user_id: str) -> bool:
    """Redis 限流检查（免费用户每日限额）。

    返回 True 表示在限额内，False 表示已超限。
    付费用户始终返回 True。

    Key: rate_limit:{user_id}:{YYYY-MM-DD}
    TTL: 到次日 0 点的秒数
    """
    redis = get_redis_pool()
    today_str = date.today().isoformat()
    key = f"rate_limit:{user_id}:{today_str}"

    # 从动态配置读取免费用户限额
    free_limit = await _get_query_limit(0)

    try:
        current = await redis.get(key)

        if current is not None and int(current) >= free_limit:
            return False

        # 递增计数
        new_count = await redis.incr(key)

        # 首次设置 TTL（到次日 0 点）
        if new_count == 1:
            ttl = _seconds_until_midnight()
            await redis.expire(key, ttl)

        return new_count <= free_limit
    except Exception as exc:
        logger.error("check_query_limit Redis error: %s", exc)
        # Redis 故障时放行，避免阻断服务
        return True


def _seconds_until_midnight() -> int:
    """计算距离次日 0 点的秒数。"""
    now = datetime.now(timezone.utc)
    tomorrow = (now + timedelta(days=1)).replace(hour=0, minute=0, second=0, microsecond=0)
    delta = int((tomorrow - now).total_seconds())
    return max(delta, 1)  # 至少 1 秒
