"""Celery 任务：消费 Redis Streams 'alerts' 消费组，向 Telegram 推送通知。

使用 consumer group 模式保证可靠消息处理：
1. XREADGROUP 读取待处理消息
2. 查询 push_settings 表获取启用 TG 推送的用户
3. 逐用户发送 Telegram 消息
4. XACK 确认已处理
"""

import asyncio
import json
import logging
from typing import Any

import sqlalchemy

from app.core.redis import init_redis, get_redis_pool
from app.services.notification.telegram import TelegramNotifier
from workers.celery_app import celery_app
from workers.db import worker_session

logger = logging.getLogger(__name__)

_notifier = TelegramNotifier()

_STREAM_NAME: str = "alerts"
_GROUP_NAME: str = "tg_push_group"
_CONSUMER_NAME: str = "tg_worker_1"
_BATCH_SIZE: int = 10


def _is_streams_unsupported(exc: Exception) -> bool:
    msg = str(exc).lower()
    return "unknown command" in msg or "not supported" in msg


# ── 告警类型到推送事件的映射 ─────────────────────────────────

_ALERT_TYPE_TO_EVENT: dict[str, str] = {
    "exchange_large_inflow": "risk_alert",
    "whale_large_transfer": "risk_alert",
    "mvrv_extreme": "risk_alert",
    "fear_greed_extreme": "risk_alert",
    "kill_zone_warning": "kill_zone_warning",
    "strategy_update": "strategy_update",
    "playbook_switch": "playbook_switch",
}


async def _ensure_consumer_group(redis: Any) -> None:
    """确保 consumer group 存在，不存在则创建。"""
    try:
        await redis.xgroup_create(_STREAM_NAME, _GROUP_NAME, id="0", mkstream=True)
        logger.info("Consumer group created", extra={"group": _GROUP_NAME})
    except Exception as exc:
        # BUSYGROUP = group already exists, safe to ignore
        if "BUSYGROUP" in str(exc):
            pass
        elif _is_streams_unsupported(exc):
            logger.warning(
                "Redis Streams not supported (requires Redis 5.0+), telegram worker disabled",
            )
        else:
            logger.error("Failed to create consumer group", extra={"error": str(exc)})
            raise


async def _query_tg_recipients(event_type: str) -> list[dict[str, str]]:
    """查询启用了 TG 推送且订阅了该事件类型的用户。"""
    sql = sqlalchemy.text("""
        SELECT tg_chat_id
        FROM push_settings
        WHERE tg_enabled = TRUE
          AND tg_chat_id IS NOT NULL
          AND events @> :event_json
    """)
    recipients: list[dict[str, str]] = []
    try:
        async with worker_session() as session:
            result = await session.execute(sql, {"event_json": json.dumps([event_type])})
            rows = result.fetchall()
            for row in rows:
                recipients.append({"tg_chat_id": row[0]})
    except Exception as exc:
        logger.error("Failed to query TG recipients", extra={"event_type": event_type, "error": str(exc)})
    return recipients


async def _query_kill_zone_recipients(risk_score: float) -> list[dict[str, str]]:
    """查询点杀预警推送目标用户（按会员等级和风险评分过滤）。

    risk_score >= 70: 推送给专业版+旗舰版用户
    50 <= risk_score < 70: 仅推送给旗舰版用户
    risk_score < 50: 不推送
    """
    if risk_score < 50:
        return []

    if risk_score >= 70:
        min_level = 1  # pro(1) + flagship(2)
    else:
        min_level = 2  # flagship(2) only

    sql = sqlalchemy.text(f"""
        SELECT ps.tg_chat_id
        FROM push_settings ps
        JOIN memberships m ON m.user_id = ps.user_id
        WHERE ps.tg_enabled = TRUE
          AND ps.tg_chat_id IS NOT NULL
          AND ps.events @> :event_json
          AND m.level >= :min_level
    """)
    recipients: list[dict[str, str]] = []
    try:
        async with worker_session() as session:
            result = await session.execute(sql, {"event_json": json.dumps(["kill_zone_warning"]), "min_level": min_level})
            rows = result.fetchall()
            for row in rows:
                recipients.append({"tg_chat_id": row[0]})
    except Exception as exc:
        logger.error(
            "Failed to query kill zone TG recipients",
            extra={"risk_score": risk_score, "error": str(exc)},
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


async def _dispatch_alert(data: dict[str, Any]) -> int:
    """根据告警类型分发 Telegram 消息，返回成功发送数。"""
    alert_type = data.get("alert_type", "")
    event_type = _ALERT_TYPE_TO_EVENT.get(alert_type, "risk_alert")

    # 点杀预警使用专用推送路由（按会员等级过滤）
    if event_type == "kill_zone_warning":
        risk_score = float(data.get("risk_score", 0))
        recipients = await _query_kill_zone_recipients(risk_score)
    else:
        recipients = await _query_tg_recipients(event_type)

    if not recipients:
        logger.debug("No TG recipients for event", extra={"event_type": event_type})
        return 0

    sent_count = 0
    for recipient in recipients:
        chat_id = recipient["tg_chat_id"]
        try:
            if event_type == "kill_zone_warning":
                ok = await _notifier.send_kill_zone_alert(chat_id, data)
            elif event_type == "strategy_update":
                ok = await _notifier.send_strategy_alert(chat_id, data)
            elif event_type == "playbook_switch":
                ok = await _notifier.send_playbook_alert(chat_id, data)
            else:
                ok = await _notifier.send_risk_alert(chat_id, data)

            if ok:
                sent_count += 1
        except Exception as exc:
            logger.error(
                "Failed to send TG alert",
                extra={"chat_id": chat_id, "alert_type": alert_type, "error": str(exc)},
            )
    return sent_count


async def _process_stream_messages() -> int:
    """读取并处理一批 Redis Stream 消息，返回处理数。"""
    await init_redis()
    redis = get_redis_pool()
    await _ensure_consumer_group(redis)

    # XREADGROUP: 读取新消息
    try:
        messages = await redis.xreadgroup(
            groupname=_GROUP_NAME,
            consumername=_CONSUMER_NAME,
            streams={_STREAM_NAME: ">"},
            count=_BATCH_SIZE,
            block=1000,  # 阻塞 1s
        )
    except Exception as exc:
        if _is_streams_unsupported(exc):
            logger.warning(
                "Redis Streams not supported (requires Redis 5.0+), telegram worker disabled",
            )
            return 0
        logger.error("XREADGROUP failed", extra={"error": str(exc)})
        return 0

    if not messages:
        return 0

    processed = 0
    for stream_name, entries in messages:
        for msg_id, raw_data in entries:
            data = _parse_stream_data(raw_data)
            try:
                sent = await _dispatch_alert(data)
                logger.info(
                    "Alert dispatched via Telegram",
                    extra={"msg_id": msg_id, "alert_type": data.get("alert_type"), "sent_count": sent},
                )
            except Exception as exc:
                logger.error(
                    "dispatch_alert failed",
                    extra={"msg_id": msg_id, "error": str(exc)},
                )
            # ACK 无论成功失败都确认，避免重复处理
            try:
                await redis.xack(_STREAM_NAME, _GROUP_NAME, msg_id)
            except Exception as exc:
                logger.error("XACK failed", extra={"msg_id": msg_id, "error": str(exc)})
            processed += 1

    return processed


@celery_app.task(
    name="workers.telegram_worker.process_telegram_alerts",
    bind=True,
    max_retries=3,
)
def process_telegram_alerts(self) -> dict[str, int]:
    """Celery 任务入口：消费 Redis Streams 告警并推送到 Telegram。"""
    try:
        processed = asyncio.run(_process_stream_messages())
        return {"processed": processed}
    except Exception as exc:
        logger.error("process_telegram_alerts failed", extra={"error": str(exc)})
        raise self.retry(exc=exc, countdown=30)
