"""Telegram 推送服务 — 通过 Telegram Bot API HTTP 接口发送消息。

使用 httpx.AsyncClient 直接调用 Bot API，保持轻量，不依赖 python-telegram-bot。
"""

import logging
import secrets
from typing import Any

import httpx

from app.core.config import settings
from app.core.redis import get_redis_pool, set_with_ttl, get_json

logger = logging.getLogger(__name__)

_BIND_TOKEN_PREFIX: str = "tg_bind:"
_BIND_TOKEN_TTL: int = 600
_SEND_TIMEOUT_SECONDS: float = 10.0
_TG_API_BASE: str = "https://api.telegram.org/bot"


class TelegramNotifier:
    """Telegram Bot 消息推送器。"""

    def __init__(self) -> None:
        pass

    async def _get_token(self) -> str:
        """从动态配置获取 Telegram Bot Token。"""
        from app.services.config_service import get_config_value
        return await get_config_value("telegram_bot_token")

    async def send_message(
        self, chat_id: str, text: str, parse_mode: str = "HTML"
    ) -> bool:
        """通过 Telegram Bot API 发送文本消息。"""
        token = await self._get_token()
        if not token:
            logger.warning("Telegram bot token not configured, skipping send")
            return False
        url = f"{_TG_API_BASE}{token}/sendMessage"
        payload: dict[str, str] = {
            "chat_id": chat_id,
            "text": text,
            "parse_mode": parse_mode,
        }
        try:
            async with httpx.AsyncClient(timeout=_SEND_TIMEOUT_SECONDS) as client:
                resp = await client.post(url, json=payload)
                if resp.status_code == 200 and resp.json().get("ok"):
                    return True
                logger.warning(
                    "Telegram sendMessage non-ok",
                    extra={"chat_id": chat_id, "status": resp.status_code, "body": resp.text},
                )
                return False
        except Exception as exc:
            logger.error(
                "Telegram sendMessage failed",
                extra={"chat_id": chat_id, "error": str(exc)},
            )
            return False

    async def send_risk_alert(self, chat_id: str, data: dict[str, Any]) -> bool:
        """格式化风险预警消息并发送。"""
        severity = data.get("severity", "medium")
        emoji = {"high": "\U0001f534", "medium": "\U0001f7e1", "low": "\U0001f7e2"}.get(severity, "\u26a0\ufe0f")
        symbol = data.get("symbol", "N/A")
        message = data.get("message", "未知告警")
        alert_type = data.get("alert_type", "")
        text = (
            f"{emoji} <b>风险预警</b>\n"
            f"━━━━━━━━━━━━━━━\n"
            f"\U0001f4cc 类型: {alert_type}\n"
            f"\U0001f48e 标的: {symbol}\n"
            f"\u26a1 严重度: {severity.upper()}\n"
            f"\U0001f4dd {message}\n"
            f"━━━━━━━━━━━━━━━"
        )
        return await self.send_message(chat_id, text)

    async def send_strategy_alert(self, chat_id: str, data: dict[str, Any]) -> bool:
        """格式化策略更新消息并发送。"""
        direction = data.get("direction", "neutral")
        dir_emoji = {"bullish": "\U0001f7e2 多头", "bearish": "\U0001f534 空头"}.get(direction, "\u26aa 观望")
        symbol = data.get("symbol", "N/A")
        confidence = data.get("confidence", 0)
        entry_low = data.get("entry_low", "\u2014")
        entry_high = data.get("entry_high", "\u2014")
        stop_loss = data.get("stop_loss", "\u2014")
        targets = data.get("targets", [])
        targets_str = " \u2192 ".join(str(t) for t in targets) if targets else "\u2014"
        text = (
            f"\U0001f4ca <b>策略更新</b> {dir_emoji}\n"
            f"━━━━━━━━━━━━━━━\n"
            f"\U0001f48e 标的: {symbol}\n"
            f"\U0001f3af 入场区间: {entry_low} ~ {entry_high}\n"
            f"\U0001f6d1 止损: {stop_loss}\n"
            f"\U0001f3c1 目标: {targets_str}\n"
            f"\U0001f4c8 置信度: {confidence:.0%}\n"
            f"━━━━━━━━━━━━━━━"
        )
        return await self.send_message(chat_id, text)

    async def send_playbook_alert(self, chat_id: str, data: dict[str, Any]) -> bool:
        """格式化剧本切换通知并发送。"""
        playbook = data.get("matched_playbook", "未知剧本")
        probability = data.get("probability", 0)
        stage = data.get("stage_description", "")
        next_move = data.get("next_move", "")
        symbol = data.get("symbol", "N/A")
        text = (
            f"\U0001f3ad <b>剧本切换</b>\n"
            f"━━━━━━━━━━━━━━━\n"
            f"\U0001f48e 标的: {symbol}\n"
            f"\U0001f4d6 当前剧本: {playbook}\n"
            f"\U0001f4ca 概率: {probability:.0%}\n"
            f"\U0001f4cd 阶段: {stage}\n"
            f"\u27a1\ufe0f 预判下一步: {next_move}\n"
            f"━━━━━━━━━━━━━━━"
        )
        return await self.send_message(chat_id, text)

    async def send_anti_ai_alert(self, chat_id: str, data: dict[str, Any]) -> bool:
        """格式化反AI操盘预警消息并发送。"""
        symbol = data.get("symbol", "N/A")
        ai_prob = data.get("ai_probability", 0)
        mode = data.get("operation_mode", "未知")
        tactics = data.get("tactics_detected", [])
        counter_advice = data.get("counter_advice", [])

        tactics_str = "\n".join(f"  • {t}" for t in tactics[:5]) if tactics else "  无"
        advice_str = "\n".join(f"  • {a}" for a in counter_advice[:5]) if counter_advice else "  无"

        text = (
            f"\U0001f916 <b>AI操盘预警</b>\n"
            f"━━━━━━━━━━━━━━━\n"
            f"\U0001f48e 标的: {symbol}\n"
            f"\U0001f4ca AI概率: {ai_prob}%\n"
            f"\U0001f3ad 操盘模式: {mode}\n\n"
            f"\u26a1 <b>检测到的AI战术:</b>\n{tactics_str}\n\n"
            f"\U0001f6e1 <b>反制建议:</b>\n{advice_str}\n"
            f"━━━━━━━━━━━━━━━"
        )
        return await self.send_message(chat_id, text)

    async def generate_bind_token(self, user_id: str) -> str:
        """生成唯一绑定 token，存入 Redis，TTL=600s。"""
        token: str = secrets.token_urlsafe(32)
        redis_key = f"{_BIND_TOKEN_PREFIX}{token}"
        try:
            await set_with_ttl(redis_key, user_id, _BIND_TOKEN_TTL)
            logger.info("Bind token generated", extra={"user_id": user_id})
            return token
        except Exception as exc:
            logger.error(
                "Failed to generate bind token",
                extra={"user_id": user_id, "error": str(exc)},
            )
            raise

    async def bind_account(self, token: str, chat_id: str) -> bool:
        """验证绑定 token 并将 chat_id 写入 push_settings 表。"""
        redis_key = f"{_BIND_TOKEN_PREFIX}{token}"
        try:
            user_id = await get_json(redis_key)
            if user_id is None:
                logger.warning("Bind token invalid or expired", extra={"token": token[:8]})
                return False
            from sqlalchemy import text as sa_text
            from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
            engine = create_async_engine(settings.database_url, pool_size=2)
            session_factory = async_sessionmaker(engine, expire_on_commit=False)
            async with session_factory() as session:
                await session.execute(
                    sa_text(
                        "UPDATE push_settings "
                        "SET tg_chat_id = :chat_id, tg_enabled = TRUE "
                        "WHERE user_id = :user_id"
                    ),
                    {"chat_id": chat_id, "user_id": user_id},
                )
                await session.commit()
            await engine.dispose()
            redis = get_redis_pool()
            await redis.delete(redis_key)
            logger.info(
                "Account bound to Telegram",
                extra={"user_id": user_id, "chat_id": chat_id},
            )
            return True
        except Exception as exc:
            logger.error(
                "bind_account failed",
                extra={"token": token[:8], "error": str(exc)},
            )
            return False
