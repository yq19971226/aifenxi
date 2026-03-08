import json
import logging
from collections.abc import AsyncGenerator
from typing import Any

import redis.asyncio as aioredis
from redis.asyncio import Redis

from app.core.config import settings

logger = logging.getLogger(__name__)

# 全局连接池（应用启动时初始化）
_redis_pool: Redis | None = None


async def init_redis() -> None:
    """初始化 Redis 连接池，在 FastAPI lifespan 中调用。"""
    global _redis_pool
    _redis_pool = aioredis.from_url(
        settings.redis_url,
        encoding="utf-8",
        decode_responses=True,
        max_connections=50,
    )
    try:
        await _redis_pool.ping()
        logger.info("Redis connection pool initialized")
    except Exception as exc:
        logger.warning("Redis 连接失败，回退到 fakeredis: %s", exc)
        try:
            import fakeredis.aioredis as fakeasync
            _redis_pool = fakeasync.FakeRedis(decode_responses=True)
            await _redis_pool.ping()
            logger.info("fakeredis 初始化成功（仅开发环境）")
        except ImportError:
            logger.error("Redis 不可用且 fakeredis 未安装，无法启动")
            raise


async def close_redis() -> None:
    """关闭 Redis 连接池。"""
    global _redis_pool
    if _redis_pool:
        await _redis_pool.aclose()
        _redis_pool = None
        logger.info("Redis connection pool closed")


def get_redis_pool() -> Redis:
    if _redis_pool is None:
        raise RuntimeError("Redis pool not initialized. Call init_redis() first.")
    return _redis_pool


async def get_redis() -> AsyncGenerator[Redis, None]:
    """FastAPI dependency – yields the shared Redis client."""
    yield get_redis_pool()


# ── 工具函数 ──────────────────────────────────────────────────

async def set_with_ttl(key: str, value: Any, ttl_seconds: int) -> None:
    """序列化为 JSON 并写入 Redis，必须指定 TTL。"""
    redis = get_redis_pool()
    try:
        serialized = json.dumps(value, ensure_ascii=False, default=str)
        await redis.setex(key, ttl_seconds, serialized)
    except Exception as exc:
        logger.error("Redis set_with_ttl failed", extra={"key": key, "error": str(exc)})
        raise


async def get_json(key: str) -> Any | None:
    """从 Redis 读取并反序列化 JSON，键不存在返回 None。"""
    redis = get_redis_pool()
    try:
        raw = await redis.get(key)
        if raw is None:
            return None
        return json.loads(raw)
    except Exception as exc:
        logger.error("Redis get_json failed", extra={"key": key, "error": str(exc)})
        return None


# 标记 Redis 是否支持 Streams（XADD/XREAD，需 Redis 5.0+）
_streams_supported: bool | None = None


async def publish_stream(stream: str, data: dict[str, Any], maxlen: int = 10_000) -> str | None:
    """向 Redis Stream 发布消息，返回消息 ID。

    当 Redis 版本不支持 Streams 时静默降级，返回 None。
    """
    global _streams_supported
    if _streams_supported is False:
        return None

    redis = get_redis_pool()
    try:
        # Redis Streams 要求所有值为字符串
        flat: dict[str, str] = {k: json.dumps(v, default=str) for k, v in data.items()}
        msg_id: str = await redis.xadd(stream, flat, maxlen=maxlen, approximate=True)
        _streams_supported = True
        return msg_id
    except Exception as exc:
        err_msg = str(exc).lower()
        if "unknown command" in err_msg or "not supported" in err_msg:
            if _streams_supported is None:
                logger.warning(
                    "Redis Streams not supported (requires Redis 5.0+), "
                    "stream publishing disabled",
                )
            _streams_supported = False
            return None
        logger.error(
            "Redis publish_stream failed",
            extra={"stream": stream, "error": str(exc)},
        )
        raise


def streams_supported() -> bool:
    """返回 Redis 是否支持 Streams 命令。"""
    return _streams_supported is True
