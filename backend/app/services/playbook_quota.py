"""剧本推演配额服务 — 免费用户每日限额 3 次，付费用户不限。

基于 Redis 计数器实现，TTL 到次日 UTC 00:00 自动过期。
"""

import logging
from datetime import datetime, timedelta, timezone

from app.core.redis import get_redis_pool

logger = logging.getLogger(__name__)

# 免费用户每日剧本推演次数上限（可通过动态配置覆盖）
_FREE_DAILY_LIMIT_DEFAULT = 3
_CONFIG_KEY = "playbook_sim_daily_limit_free"


def _quota_key(user_id: str) -> str:
    """生成当日限流计数器的 Redis key。

    格式: playbook_sim_quota:{user_id}:{date}
    """
    today = datetime.now(timezone.utc).date().isoformat()
    return f"playbook_sim_quota:{user_id}:{today}"


def _seconds_until_utc_midnight() -> int:
    """计算从当前时刻到次日 UTC 00:00 的秒数。"""
    now = datetime.now(timezone.utc)
    tomorrow = datetime(
        now.year, now.month, now.day, tzinfo=timezone.utc,
    ).replace(hour=0, minute=0, second=0, microsecond=0) + timedelta(days=1)
    return max(int((tomorrow - now).total_seconds()), 1)


async def _get_daily_limit() -> int:
    """从动态配置读取免费用户的每日剧本推演限额，失败时回退到默认值。"""
    try:
        from app.services.config_service import get_config_value
        raw = await get_config_value(_CONFIG_KEY, str(_FREE_DAILY_LIMIT_DEFAULT))
        return int(raw)
    except Exception:
        return _FREE_DAILY_LIMIT_DEFAULT


async def check_playbook_sim_quota(user_id: str, user_level: int) -> tuple[bool, int]:
    """检查用户是否可以执行剧本推演。

    返回 (是否允许, 剩余次数)。
    - 付费用户 (level >= 1) 始终放行，返回 remaining=-1 表示无限。
    - 免费用户使用 Redis 计数器检查每日限额。
    """
    # 付费用户不限流
    if user_level >= 1:
        return True, -1

    redis = get_redis_pool()
    limit = await _get_daily_limit()
    key = _quota_key(user_id)

    try:
        current = await redis.incr(key)

        if current == 1:
            # 首次使用，设置 TTL 到次日 00:00
            ttl = _seconds_until_utc_midnight()
            await redis.expire(key, ttl)

        if current > limit:
            # 超限，回滚计数
            await redis.decr(key)
            logger.info(
                "剧本推演限流: 用户 %s (免费) 已达上限 %d 次/日",
                user_id, limit,
            )
            return False, 0

        remaining = limit - current
        return True, remaining

    except Exception as exc:
        logger.warning("剧本推演配额检查失败，放行: %s", exc)
        # Redis 异常时放行，避免阻塞用户
        return True, -1


async def get_playbook_sim_remaining(user_id: str, user_level: int) -> dict:
    """查询剧本推演的配额信息。

    返回:
        {
            "limit": 3,       # 每日上限 (付费用户为 -1)
            "remaining": 2,   # 剩余次数 (付费用户为 -1)
            "unlimited": True  # 是否无限
        }
    """
    if user_level >= 1:
        return {"limit": -1, "remaining": -1, "unlimited": True}

    redis = get_redis_pool()
    limit = await _get_daily_limit()
    key = _quota_key(user_id)

    try:
        raw = await redis.get(key)
        current = int(raw) if raw is not None else 0
        remaining = max(limit - current, 0)
        return {"limit": limit, "remaining": remaining, "unlimited": False}
    except Exception:
        return {"limit": limit, "remaining": limit, "unlimited": False}
