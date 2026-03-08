"""Stream Router — 按数据源和数据类型路由到独立 Redis Stream。"""

from __future__ import annotations

import json
import logging
from datetime import datetime

from app.core.redis import get_redis_pool, publish_stream

logger = logging.getLogger(__name__)

_STREAM_MAXLEN = 50_000


class StreamRouter:
    """数据流路由器 — 按数据源和数据类型路由到独立 Redis Stream。

    Stream 命名规范: ds:{source_id}:{data_type}
    每条消息自动附加 source_id 和 received_at 字段。
    """

    async def publish(
        self, source_id: str, data_type: str, message: dict
    ) -> str:
        """发布消息到 ds:{source_id}:{data_type}，附加 source_id 和 received_at。

        Returns:
            Redis Stream 消息 ID
        """
        stream_name = f"ds:{source_id}:{data_type}"
        enriched = {
            **message,
            "source_id": source_id,
            "received_at": datetime.utcnow().isoformat(),
        }
        try:
            msg_id = await publish_stream(stream_name, enriched, maxlen=_STREAM_MAXLEN)
            return msg_id or ""
        except Exception as exc:
            logger.error(
                "StreamRouter publish failed",
                extra={"stream": stream_name, "error": str(exc)},
            )
            return ""

    async def cleanup_source(self, source_id: str) -> int:
        """清理指定数据源的所有 Redis Stream key（模式匹配 ds:{source_id}:*）。

        Returns:
            删除的 key 数量
        """
        pattern = f"ds:{source_id}:*"
        redis = get_redis_pool()

        try:
            keys: list[str] = []
            async for key in redis.scan_iter(pattern):
                keys.append(key)

            if not keys:
                logger.info(
                    "StreamRouter cleanup: no keys found",
                    extra={"source_id": source_id, "pattern": pattern},
                )
                return 0

            logger.info(
                "StreamRouter cleanup: deleting keys",
                extra={"source_id": source_id, "count": len(keys), "keys": keys},
            )
            deleted: int = await redis.delete(*keys)
            return deleted
        except Exception as exc:
            logger.error(
                "StreamRouter cleanup failed",
                extra={"source_id": source_id, "error": str(exc)},
            )
            raise
