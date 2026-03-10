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
        import asyncio as _aio
        last_exc = None
        for attempt in range(3):
            try:
                async with httpx.AsyncClient(timeout=_SEND_TIMEOUT_SECONDS) as client:
                    resp = await client.post(url, json=payload)
                    if resp.status_code == 200 and resp.json().get("ok"):
                        return True
                    logger.warning(
                        "Telegram sendMessage non-ok (attempt %d/3)",
                        attempt + 1,
                        extra={"chat_id": chat_id, "status": resp.status_code, "body": resp.text},
                    )
                    return False
            except Exception as exc:
                last_exc = exc
                if attempt < 2:
                    await _aio.sleep(1 * (attempt + 1))
        logger.error(
            "Telegram sendMessage failed after 3 attempts",
            extra={"chat_id": chat_id, "error": str(last_exc)},
        )
        return False

    async def send_risk_alert(self, chat_id: str, data: dict[str, Any], locale: str = "zh-CN") -> bool:
        """使用 i18n 模板格式化风险预警消息并发送。"""
        return await self._send_via_template(chat_id, "risk_alert", data, locale)

    async def send_strategy_alert(self, chat_id: str, data: dict[str, Any], locale: str = "zh-CN") -> bool:
        """使用 i18n 模板格式化策略更新消息并发送。"""
        return await self._send_via_template(chat_id, "strategy_update", data, locale)

    async def send_playbook_alert(self, chat_id: str, data: dict[str, Any], locale: str = "zh-CN") -> bool:
        """使用 i18n 模板格式化剧本切换通知并发送。"""
        return await self._send_via_template(chat_id, "playbook_switch", data, locale)

    async def _send_via_template(self, chat_id: str, event_type: str, data: dict[str, Any], locale: str = "zh-CN") -> bool:
        """通用 i18n 模板渲染 + 发送。"""
        from app.services.notification.i18n_templates import get_telegram_template, localize_variables
        tpl = get_telegram_template(event_type, locale)
        variables = dict(data)
        variables = localize_variables(variables, locale)
        confidence = data.get("confidence", 0)
        if isinstance(confidence, (int, float)):
            variables["confidence_pct"] = f"{confidence:.0%}" if confidence <= 1 else f"{confidence}%"
        probability = data.get("probability", 0)
        if isinstance(probability, (int, float)):
            variables["probability_pct"] = f"{probability:.0%}" if probability <= 1 else f"{probability}%"
        targets = data.get("targets", [])
        variables["targets_str"] = " → ".join(str(t) for t in targets) if targets else "—"
        severity = data.get("severity", "medium")
        variables["severity_emoji"] = {"high": "🔴", "medium": "🟡", "low": "🟢"}.get(severity, "⚠️")
        import re
        def replacer(m: re.Match) -> str:
            key = m.group(1).strip()
            val = variables.get(key, "")
            return str(val) if val is not None else ""
        msg = re.sub(r"\{\{(\w+)\}\}", replacer, tpl)
        return await self.send_message(chat_id, msg)

    async def send_kill_zone_alert(self, chat_id: str, data: dict[str, Any]) -> bool:
        """格式化点杀预警消息并发送。"""
        risk_score = data.get("risk_score", 0)
        if isinstance(risk_score, str):
            risk_score = float(risk_score)
        emoji = "\U0001f534" if risk_score >= 70 else "\U0001f7e0"
        symbol = data.get("symbol", "N/A")
        direction = data.get("direction", "unknown")
        dir_label = "多头点杀" if direction == "long_kill" else "空头点杀"
        version = data.get("detection_version", "basic")
        version_label = {"basic": "基础版", "enhanced": "增强版", "full": "完整版"}.get(version, version)
        oi_change = data.get("oi_change_percent", 0)
        taker_ratio = data.get("taker_ratio")
        ls_ratio = data.get("ls_ratio")
        nearest_liq = data.get("nearest_liq_usd")

        lines = [
            f"{emoji} <b>点杀预警 — {dir_label}</b>",
            "━━━━━━━━━━━━━━━",
            f"\U0001f48e 标的: {symbol}",
            f"\u26a1 风险评分: {risk_score:.0f}/100",
            f"\U0001f4ca OI变化: {oi_change:+.2f}%",
        ]
        if taker_ratio is not None:
            lines.append(f"\U0001f4c8 Taker比: {float(taker_ratio):.4f}")
        if ls_ratio is not None:
            lines.append(f"\U0001f4ca 多空比: {float(ls_ratio):.4f}")
        if nearest_liq is not None:
            lines.append(f"\U0001f4b0 最近爆仓量: ${float(nearest_liq):,.0f}")
        lines.extend([
            f"\U0001f50d 检测版本: {version_label}",
            "━━━━━━━━━━━━━━━",
        ])
        text = "\n".join(lines)
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
