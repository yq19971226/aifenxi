"""邮件推送 Celery Worker — 消费 Redis Streams 'alerts' 消费组，向邮箱推送策略通知。

使用 consumer group 模式保证可靠消息处理：
1. XREADGROUP 读取待处理消息
2. 查询 push_settings 表获取启用邮件推送的用户
3. 构建策略 HTML 并通过 SendGrid 发送
4. XACK 确认已处理
"""

import asyncio
import json
import logging
from typing import Any

import sqlalchemy

from app.core.redis import init_redis, get_redis_pool
from app.services.notification.email import (
    StrategyEmailData,
    send_strategy_email,
)
from workers.celery_app import celery_app
from app.services.notification_log_service import record_notification_standalone
from workers.db import worker_session

logger = logging.getLogger(__name__)

_STREAM_NAME: str = "alerts"
_GROUP_NAME: str = "email_push_group"
_CONSUMER_NAME: str = "email_worker_1"
_BATCH_SIZE: int = 10


def _is_streams_unsupported(exc: Exception) -> bool:
    msg = str(exc).lower()
    return "unknown command" in msg or "not supported" in msg

# 只处理策略更新类型的邮件推送
_EMAIL_EVENT_TYPES: set[str] = {"strategy_update", "playbook_switch"}

_ALERT_TYPE_TO_EVENT: dict[str, str] = {
    "strategy_update": "strategy_update",
    "playbook_switch": "playbook_switch",
}


async def _ensure_consumer_group(redis: Any) -> None:
    """确保 consumer group 存在，不存在则创建。"""
    try:
        await redis.xgroup_create(_STREAM_NAME, _GROUP_NAME, id="0", mkstream=True)
        logger.info("Email consumer group created", extra={"group": _GROUP_NAME})
    except Exception as exc:
        if "BUSYGROUP" in str(exc):
            pass
        elif _is_streams_unsupported(exc):
            logger.warning(
                "Redis Streams not supported (requires Redis 5.0+), email worker disabled",
            )
        else:
            logger.error("Failed to create email consumer group", extra={"error": str(exc)})
            raise


async def _query_email_recipients(event_type: str) -> list[dict[str, str]]:
    """查询启用了邮件推送且订阅了该事件类型的用户。"""
    sql = sqlalchemy.text("""
        SELECT u.email
        FROM push_settings ps
        JOIN users u ON u.id = ps.user_id
        WHERE ps.email_enabled = TRUE
          AND u.email IS NOT NULL
          AND ps.events @> :event_json
    """)
    recipients: list[dict[str, str]] = []
    try:
        async with worker_session() as session:
            result = await session.execute(sql, {"event_json": json.dumps([event_type])})
            rows = result.fetchall()
            for row in rows:
                recipients.append({"email": row[0]})
    except Exception as exc:
        logger.error(
            "Failed to query email recipients",
            extra={"event_type": event_type, "error": str(exc)},
        )
    return recipients


def _parse_stream_data(raw: dict[str, str]) -> dict[str, Any]:
    """将 Redis Stream 中的字符串值反序列化为 Python 对象。"""
    parsed: dict[str, Any] = {}
    for k, v in raw.items():
        try:
            parsed[k] = json.loads(v)
        except (json.JSONDecodeError, TypeError):
            parsed[k] = v
    return parsed


def _build_strategy_data(data: dict[str, Any]) -> StrategyEmailData | None:
    """从告警数据构建 StrategyEmailData，校验失败返回 None。"""
    try:
        return StrategyEmailData(
            symbol=data.get("symbol", "BTCUSDT"),
            direction=data.get("direction", "neutral"),
            entry_low=float(data.get("entry_low", 0)),
            entry_high=float(data.get("entry_high", 0)),
            stop_loss=float(data.get("stop_loss", 0)),
            targets=[float(t) for t in data.get("targets", [])],
            confidence=float(data.get("confidence", 0)),
            reasoning=data.get("reasoning", ""),
        )
    except Exception as exc:
        logger.error("Failed to build StrategyEmailData", extra={"error": str(exc)})
        return None


async def _dispatch_email_alert(data: dict[str, Any]) -> int:
    """根据告警类型分发邮件，返回成功发送数。"""
    alert_type = data.get("alert_type", "")
    event_type = _ALERT_TYPE_TO_EVENT.get(alert_type)

    if event_type is None or event_type not in _EMAIL_EVENT_TYPES:
        logger.debug("Skipping non-email alert type", extra={"alert_type": alert_type})
        return 0

    recipients = await _query_email_recipients(event_type)
    if not recipients:
        logger.debug("No email recipients for event", extra={"event_type": event_type})
        return 0

    strategy_data = _build_strategy_data(data)
    if strategy_data is None:
        logger.warning("Invalid strategy data, skipping email dispatch")
        return 0

    sent_count = 0
    for recipient in recipients:
        email_addr = recipient["email"]
        try:
            ok = await send_strategy_email(email_addr, strategy_data)
            if ok:
                sent_count += 1
            await record_notification_standalone(
                user_id=None,
                recipient=email_addr,
                channel="email",
                event_type=event_type,
                subject=f"策略更新 - {data.get('symbol', 'BTCUSDT')}",
                status="sent" if ok else "failed",
                error_message=None if ok else "send_strategy_email returned False",
            )
        except Exception as exc:
            logger.error(
                "Failed to send email alert",
                extra={"email": email_addr, "alert_type": alert_type, "error": str(exc)},
            )
            await record_notification_standalone(
                user_id=None,
                recipient=email_addr,
                channel="email",
                event_type=event_type,
                subject=f"策略更新 - {data.get('symbol', 'BTCUSDT')}",
                status="failed",
                error_message=str(exc),
            )
    return sent_count


async def _process_email_stream_messages() -> int:
    """读取并处理一批 Redis Stream 消息，返回处理数。"""
    await init_redis()
    redis = get_redis_pool()
    await _ensure_consumer_group(redis)

    try:
        messages = await redis.xreadgroup(
            groupname=_GROUP_NAME,
            consumername=_CONSUMER_NAME,
            streams={_STREAM_NAME: ">"},
            count=_BATCH_SIZE,
            block=1000,
        )
    except Exception as exc:
        if _is_streams_unsupported(exc):
            logger.warning(
                "Redis Streams not supported (requires Redis 5.0+), email worker disabled",
            )
            return 0
        logger.error("Email XREADGROUP failed", extra={"error": str(exc)})
        return 0

    if not messages:
        return 0

    processed = 0
    for _stream_name, entries in messages:
        for msg_id, raw_data in entries:
            data = _parse_stream_data(raw_data)
            try:
                sent = await _dispatch_email_alert(data)
                logger.info(
                    "Email alert dispatched",
                    extra={
                        "msg_id": msg_id,
                        "alert_type": data.get("alert_type"),
                        "sent_count": sent,
                    },
                )
            except Exception as exc:
                logger.error(
                    "dispatch_email_alert failed",
                    extra={"msg_id": msg_id, "error": str(exc)},
                )
            # ACK 无论成功失败都确认，避免重复处理
            try:
                await redis.xack(_STREAM_NAME, _GROUP_NAME, msg_id)
            except Exception as exc:
                logger.error("Email XACK failed", extra={"msg_id": msg_id, "error": str(exc)})
            processed += 1

    return processed


@celery_app.task(
    name="workers.email_worker.process_email_alerts",
    bind=True,
    max_retries=3,
)
def process_email_alerts(self: Any) -> dict[str, int]:
    """Celery 任务入口：消费 Redis Streams 告警并推送邮件。"""
    try:
        processed = asyncio.run(_process_email_stream_messages())
        return {"processed": processed}
    except Exception as exc:
        logger.error("process_email_alerts failed", extra={"error": str(exc)})
        raise self.retry(exc=exc, countdown=60)
