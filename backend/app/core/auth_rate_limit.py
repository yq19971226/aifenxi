"""IP-based rate limiting for auth endpoints (login / register / reset-password).

Uses Redis sliding-window counters. Falls back to no-op if Redis unavailable.
"""

import logging

from fastapi import HTTPException, Request, status

from app.core.redis import get_redis_pool

logger = logging.getLogger(__name__)

# ── 配置 ──────────────────────────────────────────────────────

_LOGIN_LIMIT = 10          # 每窗口最大登录尝试
_LOGIN_WINDOW = 300        # 5 分钟窗口

_REGISTER_CODE_LIMIT = 5   # 每窗口最大注册验证码发送次数
_REGISTER_CODE_WINDOW = 600  # 10 分钟窗口

_REGISTER_LIMIT = 1        # 每窗口最大注册次数（同 IP 仅允许 1 次）
_REGISTER_WINDOW = 86400   # 24 小时窗口（禁止多账号注册）

_RESET_LIMIT = 5           # 每窗口最大重置密码请求
_RESET_WINDOW = 600        # 10 分钟窗口

_REFRESH_LIMIT = 30        # 每窗口最大 token 刷新次数
_REFRESH_WINDOW = 300      # 5 分钟窗口


async def _check_rate(key: str, limit: int, window: int) -> None:
    """通用滑动窗口计数检查，超限抛 429。"""
    try:
        redis = get_redis_pool()
        current = await redis.incr(key)
        if current == 1:
            await redis.expire(key, window)
        if current > limit:
            ttl = await redis.ttl(key)
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"请求过于频繁，请 {ttl} 秒后重试",
            )
    except HTTPException:
        raise
    except Exception as exc:
        # Redis 不可用时放行（不阻塞业务）
        logger.debug("auth rate limit check skipped: %s", exc)


def _client_ip(request: Request) -> str:
    """提取客户端真实 IP（支持反向代理 X-Forwarded-For）。"""
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


async def check_login_rate(request: Request) -> None:
    """登录速率限制：10 次 / 5 分钟 / IP。"""
    ip = _client_ip(request)
    await _check_rate(f"rl:login:{ip}", _LOGIN_LIMIT, _LOGIN_WINDOW)


async def check_register_code_rate(request: Request) -> None:
    """注册验证码发送速率限制：5 次 / 10 分钟 / IP。"""
    ip = _client_ip(request)
    await _check_rate(f"rl:register_code:{ip}", _REGISTER_CODE_LIMIT, _REGISTER_CODE_WINDOW)


async def check_register_rate(request: Request) -> None:
    """注册完成速率限制：1 次 / 24 小时 / IP（防多账号）。"""
    ip = _client_ip(request)
    await _check_rate(f"rl:register:{ip}", _REGISTER_LIMIT, _REGISTER_WINDOW)


async def check_reset_rate(request: Request) -> None:
    """密码重置速率限制：5 次 / 10 分钟 / IP。"""
    ip = _client_ip(request)
    await _check_rate(f"rl:reset:{ip}", _RESET_LIMIT, _RESET_WINDOW)


async def check_refresh_rate(request: Request) -> None:
    """Token 刷新速率限制：30 次 / 5 分钟 / IP。"""
    ip = _client_ip(request)
    await _check_rate(f"rl:refresh:{ip}", _REFRESH_LIMIT, _REFRESH_WINDOW)
