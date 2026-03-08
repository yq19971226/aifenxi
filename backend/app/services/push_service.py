"""推送设置业务逻辑 — 查询、更新用户推送偏好，测试推送。

Service 层包含业务逻辑，使用 sqlalchemy text() 参数化查询。
前端 channels/events 对象格式与数据库字段之间做转换。
"""

import json
import logging
from typing import Any

from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.sql_compat import jsonb_cast

logger = logging.getLogger(__name__)


# ── 前端期望的数据结构 ────────────────────────────────────────

class ChannelConfig(BaseModel):
    enabled: bool = False


class EventConfig(BaseModel):
    strategy_update: bool = True
    price_alert: bool = True
    playbook_switch: bool = False
    risk_warning: bool = True
    defense_alert: bool = True


class PushSettings(BaseModel):
    channels: dict[str, ChannelConfig]
    events: EventConfig


class TestPushResult(BaseModel):
    success: bool
    message: str


# ── 事件名映射（前端 key → 数据库 events 数组值）─────────────

_EVENT_KEY_MAP: dict[str, str] = {
    "strategy_update": "strategy_update",
    "price_alert": "price_alert",
    "playbook_switch": "playbook_switch",
    "risk_warning": "risk_alert",
    "defense_alert": "defense_alert",
}

_EVENT_DB_TO_KEY: dict[str, str] = {v: k for k, v in _EVENT_KEY_MAP.items()}


# ── 服务函数 ──────────────────────────────────────────────────


def _row_to_settings(row: Any) -> PushSettings:
    """将数据库行转换为前端期望的 PushSettings 格式。"""
    email_enabled = row["email_enabled"] if row else True
    tg_enabled = row["tg_enabled"] if row else False

    # events: 数据库是 JSON 数组 → 前端是 object
    db_events: list[str] = row["events"] if row and row["events"] else []
    events = EventConfig(
        strategy_update="strategy_update" in db_events,
        price_alert="price_alert" in db_events,
        playbook_switch="playbook_switch" in db_events,
        risk_warning="risk_alert" in db_events,
        defense_alert="defense_alert" in db_events,
    )

    return PushSettings(
        channels={
            "email": ChannelConfig(enabled=email_enabled),
            "telegram": ChannelConfig(enabled=tg_enabled),
            "websocket": ChannelConfig(enabled=True),  # WebSocket 始终可用
        },
        events=events,
    )


def _settings_to_db(settings: PushSettings) -> dict[str, Any]:
    """将前端 PushSettings 转换为数据库字段值。"""
    email_enabled = settings.channels.get("email", ChannelConfig()).enabled
    tg_enabled = settings.channels.get("telegram", ChannelConfig()).enabled

    # events: 前端 object → 数据库 JSON 数组
    db_events: list[str] = []
    events = settings.events
    if events.strategy_update:
        db_events.append("strategy_update")
    if events.price_alert:
        db_events.append("price_alert")
    if events.playbook_switch:
        db_events.append("playbook_switch")
    if events.risk_warning:
        db_events.append("risk_alert")
    if events.defense_alert:
        db_events.append("defense_alert")

    return {
        "email_enabled": email_enabled,
        "tg_enabled": tg_enabled,
        "events": json.dumps(db_events),
    }


async def get_push_settings(
    session: AsyncSession, user_id: str
) -> PushSettings:
    """查询用户推送设置。无记录时返回默认值。"""
    try:
        result = await session.execute(
            text(
                """
                SELECT email_enabled, tg_enabled, tg_chat_id, events
                FROM push_settings
                WHERE user_id = :user_id
                """
            ),
            {"user_id": user_id},
        )
        row = result.mappings().first()
    except Exception as exc:
        logger.error("get_push_settings DB error: %s", exc)
        raise

    if row is None:
        return _row_to_settings(None)

    return _row_to_settings(row)


async def update_push_settings(
    session: AsyncSession, user_id: str, settings: PushSettings
) -> PushSettings:
    """更新用户推送设置。无记录时自动创建（UPSERT）。"""
    db_vals = _settings_to_db(settings)

    try:
        await session.execute(
            text(
                f"""
                INSERT INTO push_settings (user_id, email_enabled, tg_enabled, events)
                VALUES (:user_id, :email_enabled, :tg_enabled, {jsonb_cast(':events')})
                ON CONFLICT (user_id)
                DO UPDATE SET
                    email_enabled = :email_enabled,
                    tg_enabled = :tg_enabled,
                    events = {jsonb_cast(':events')}
                """
            ),
            {
                "user_id": user_id,
                "email_enabled": db_vals["email_enabled"],
                "tg_enabled": db_vals["tg_enabled"],
                "events": db_vals["events"],
            },
        )
        await session.flush()
    except Exception as exc:
        logger.error("update_push_settings DB error: %s", exc)
        raise

    return await get_push_settings(session, user_id)


async def test_push_channel(
    session: AsyncSession, user_id: str, channel: str
) -> TestPushResult:
    """测试指定推送渠道。"""
    if channel == "websocket":
        return TestPushResult(success=True, message="WebSocket 推送测试成功")

    if channel == "email":
        # 查询用户邮箱
        try:
            result = await session.execute(
                text("SELECT email FROM users WHERE id = :user_id"),
                {"user_id": user_id},
            )
            row = result.mappings().first()
        except Exception as exc:
            logger.error("test_push email query error: %s", exc)
            return TestPushResult(success=False, message="查询用户信息失败")

        if row is None or not row["email"]:
            return TestPushResult(success=False, message="未找到用户邮箱")

        try:
            from app.services.notification.email import (
                send_raw_email,
            )

            ok = await send_raw_email(
                row["email"],
                "[Axiom] 推送测试",
                "<p>这是一封测试邮件，确认邮件推送功能正常。</p>",
            )
            if ok:
                return TestPushResult(success=True, message="测试邮件已发送")
            return TestPushResult(success=False, message="邮件发送失败，请检查 SendGrid 配置")
        except Exception as exc:
            logger.error("test_push email send error: %s", exc)
            return TestPushResult(success=False, message="邮件发送异常")

    if channel == "telegram":
        # 查询用户 TG chat_id
        try:
            result = await session.execute(
                text(
                    "SELECT tg_chat_id, tg_enabled FROM push_settings WHERE user_id = :user_id"
                ),
                {"user_id": user_id},
            )
            row = result.mappings().first()
        except Exception as exc:
            logger.error("test_push tg query error: %s", exc)
            return TestPushResult(success=False, message="查询推送设置失败")

        if row is None or not row["tg_chat_id"]:
            return TestPushResult(success=False, message="未绑定 Telegram，请先完成绑定")

        try:
            from app.services.notification.telegram import TelegramNotifier

            notifier = TelegramNotifier()
            ok = await notifier.send_message(
                row["tg_chat_id"],
                "✅ <b>Axiom 推送测试</b>\n\n这是一条测试消息，确认 Telegram 推送功能正常。",
            )
            if ok:
                return TestPushResult(success=True, message="测试消息已发送到 Telegram")
            return TestPushResult(success=False, message="Telegram 发送失败，请检查 Bot 配置")
        except Exception as exc:
            logger.error("test_push tg send error: %s", exc)
            return TestPushResult(success=False, message="Telegram 发送异常")

    return TestPushResult(success=False, message=f"不支持的推送渠道: {channel}")
