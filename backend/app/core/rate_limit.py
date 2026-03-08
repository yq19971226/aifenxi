"""免费用户每日查询限流中间件。

Redis 计数器实现，TTL 到次日 0 点自动过期。
付费用户（专业/旗舰）直接放行。
"""

import logging

from fastapi import Depends, HTTPException, status

from app.core.deps import UserInfo, get_current_user
from app.services.subscription import check_query_limit

logger = logging.getLogger(__name__)


async def check_rate_limit(
    user: UserInfo = Depends(get_current_user),
) -> UserInfo:
    """限流依赖：免费用户每日 3 次查询。

    - 付费用户直接放行
    - 免费用户检查 Redis 计数器
    - 超限抛出 429
    """
    # 付费用户不限流
    if user.membership_level > 0:
        return user

    within_limit = await check_query_limit(user.id)
    if not within_limit:
        logger.info("Rate limit exceeded: user_id=%s", user.id)
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="今日查询次数已用完，请升级会员",
        )

    return user
