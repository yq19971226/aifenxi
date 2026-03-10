"""统一推送分发器 — 模板渲染 + 多渠道路由 + 频率控制。

F1: 推送模板管理 — 内置模板 + 变量替换渲染引擎
F2: 多渠道分发 — WebSocket / Telegram / Email 统一入口
F3: 频率控制 — Redis 冷却期 + 去重
"""

import json
import logging
import re
from datetime import datetime, timezone
from typing import Any, Literal

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.redis import get_redis_pool, set_with_ttl, get_json, publish_stream
from app.core.sql_compat import jsonb_contains
from app.services.notification.i18n_templates import (
    get_telegram_template,
    get_title_template,
    get_short_template,
    localize_variables,
)

logger = logging.getLogger(__name__)

# ── F1: 推送模板 ─────────────────────────────────────────────

EventType = Literal[
    "strategy_update",
    "price_alert",
    "playbook_switch",
    "playbook_completed",
    "playbook_failed",
    "risk_alert",
    "defense_alert",
    "high_confidence_signal",
    "strategy_settlement",
]


# 注：内置模板已迁移至 app/services/notification/i18n_templates.py（三语言版本）
# get_template() 优先查 DB 自定义模板，回退到 i18n_templates 模块


def render_template(template: str, variables: dict[str, Any]) -> str:
    """渲染模板 — 替换 {{var}} 占位符。"""
    def replacer(m: re.Match) -> str:
        key = m.group(1).strip()
        val = variables.get(key, "")
        return str(val) if val is not None else ""
    return re.sub(r"\{\{(\w+)\}\}", replacer, template)


async def get_template(
    session: AsyncSession,
    event_type: EventType,
    channel: str,
    locale: str = "zh-CN",
) -> str:
    """获取模板 — 优先从数据库读取自定义模板，否则返回 i18n 内置模板。"""
    try:
        result = await session.execute(
            text("""
                SELECT template_content FROM push_templates
                WHERE event_type = :event_type AND channel = :channel AND enabled = TRUE
                LIMIT 1
            """),
            {"event_type": event_type, "channel": channel},
        )
        row = result.scalar()
        if row:
            return str(row)
    except Exception:
        pass  # 表可能不存在，回退到内置模板

    if channel == "telegram":
        return get_telegram_template(event_type, locale)
    if channel == "title":
        return get_title_template(event_type, locale)
    return get_short_template(event_type, locale)


# ── F3: 频率控制 ─────────────────────────────────────────────

_DEFAULT_COOLDOWN_SECONDS = 300  # 5分钟冷却
_COOLDOWN_KEY_PREFIX = "push_cooldown:"

_EVENT_COOLDOWNS: dict[str, int] = {
    "strategy_update": 600,    # 10分钟
    "price_alert": 300,        # 5分钟
    "playbook_switch": 1800,   # 30分钟
    "playbook_completed": 600,
    "playbook_failed": 600,
    "risk_alert": 120,         # 2分钟（紧急）
    "defense_alert": 120,      # 2分钟（紧急）
    "high_confidence_signal": 900,  # 15分钟
    "strategy_settlement": 60,      # 1分钟（重要通知）
}


async def _check_cooldown(user_id: str, event_type: str, symbol: str) -> bool:
    """检查是否在冷却期内。返回 True = 允许推送，False = 冷却中。"""
    redis = get_redis_pool()
    key = f"{_COOLDOWN_KEY_PREFIX}{user_id}:{event_type}:{symbol}"
    try:
        exists = await redis.exists(key)
        return not exists
    except Exception:
        return True  # Redis 异常时允许推送


async def _set_cooldown(user_id: str, event_type: str, symbol: str) -> None:
    """设置冷却期。"""
    key = f"{_COOLDOWN_KEY_PREFIX}{user_id}:{event_type}:{symbol}"
    ttl = _EVENT_COOLDOWNS.get(event_type, _DEFAULT_COOLDOWN_SECONDS)
    try:
        await set_with_ttl(key, "1", ttl)
    except Exception as exc:
        logger.warning("设置推送冷却期失败: %s", exc)


async def _check_dedup(event_type: str, symbol: str, data_hash: str) -> bool:
    """去重检查 — 同一事件+币种+数据 hash 30分钟内不重复。返回 True = 新消息。"""
    redis = get_redis_pool()
    key = f"push_dedup:{event_type}:{symbol}:{data_hash}"
    try:
        existed = await redis.set(key, "1", ex=1800, nx=True)
        return existed is not None  # None = key已存在
    except Exception:
        return True


def _compute_data_hash(data: dict) -> str:
    """计算数据简单 hash（用于去重）。"""
    import hashlib
    raw = json.dumps(data, sort_keys=True, default=str)
    return hashlib.md5(raw.encode()).hexdigest()[:12]


# ── F2: 统一分发器 ───────────────────────────────────────────


async def _get_user_locale(session: AsyncSession, user_id: str) -> str:
    """从 user_preferences 读取用户语言偏好，默认 zh-CN。"""
    try:
        result = await session.execute(
            text("SELECT locale FROM user_preferences WHERE user_id = :uid LIMIT 1"),
            {"uid": user_id},
        )
        row = result.scalar()
        if row:
            return str(row)
    except Exception:
        pass
    return "zh-CN"


async def dispatch(
    session: AsyncSession,
    user_id: str,
    event_type: EventType,
    data: dict[str, Any],
) -> dict[str, bool]:
    """统一推送分发 — 检查权限、渲染模板、路由渠道、频率控制。

    Args:
        session: 数据库会话
        user_id: 目标用户 ID
        event_type: 事件类型
        data: 事件数据（用于模板渲染）

    Returns:
        各渠道推送结果 {"websocket": True, "telegram": False, "email": True}
    """
    symbol = data.get("symbol", "UNKNOWN")
    results: dict[str, bool] = {}

    # 频率控制
    allowed = await _check_cooldown(user_id, event_type, symbol)
    if not allowed:
        logger.info("推送冷却中，跳过", extra={"user_id": user_id, "event": event_type, "symbol": symbol})
        return {"skipped": True, "reason": "cooldown"}

    # 去重
    data_hash = _compute_data_hash(data)
    is_new = await _check_dedup(event_type, symbol, data_hash)
    if not is_new:
        logger.info("推送去重，跳过", extra={"event": event_type, "symbol": symbol})
        return {"skipped": True, "reason": "duplicate"}

    # 查询用户推送设置
    try:
        result = await session.execute(
            text("""
                SELECT email_enabled, tg_enabled, tg_chat_id, events
                FROM push_settings
                WHERE user_id = :user_id
            """),
            {"user_id": user_id},
        )
        settings_row = result.mappings().first()
    except Exception as exc:
        logger.error("查询推送设置失败: %s", exc)
        return {"error": True}

    if not settings_row:
        # 无推送设置记录，仅 WebSocket
        results["websocket"] = await _push_websocket(event_type, data)
        await _set_cooldown(user_id, event_type, symbol)
        return results

    # 检查事件是否启用
    db_events: list = settings_row["events"] or []
    event_db_key = {"risk_warning": "risk_alert"}.get(event_type, event_type)
    if event_db_key not in db_events:
        logger.info("用户未启用该事件推送", extra={"user_id": user_id, "event": event_type})
        return {"skipped": True, "reason": "event_disabled"}

    # 读取用户语言偏好
    locale = await _get_user_locale(session, user_id)

    # 预处理变量（本地化标签）
    variables = _prepare_variables(event_type, data, locale)

    # WebSocket（始终推送）
    results["websocket"] = await _push_websocket(event_type, data)

    # Telegram
    if settings_row["tg_enabled"] and settings_row["tg_chat_id"]:
        tpl = await get_template(session, event_type, "telegram", locale)
        msg = render_template(tpl, variables)
        results["telegram"] = await _push_telegram(settings_row["tg_chat_id"], msg)

    # Email
    if settings_row["email_enabled"]:
        try:
            user_result = await session.execute(
                text("SELECT email FROM users WHERE id = :uid"),
                {"uid": user_id},
            )
            email_row = user_result.mappings().first()
            if email_row and email_row["email"]:
                title_tpl = await get_template(session, event_type, "title", locale)
                subject = render_template(title_tpl, variables)
                tpl = await get_template(session, event_type, "telegram", locale)
                body_text = render_template(tpl, variables)
                results["email"] = await _push_email(email_row["email"], subject, body_text)
        except Exception as exc:
            logger.error("邮件推送查询失败: %s", exc)
            results["email"] = False

    # 设置冷却
    await _set_cooldown(user_id, event_type, symbol)

    logger.info(
        "推送分发完成",
        extra={"user_id": user_id, "event": event_type, "symbol": symbol, "results": results},
    )
    return results


def _prepare_variables(event_type: str, data: dict, locale: str = "zh-CN") -> dict[str, Any]:
    """预处理模板变量（含本地化标签）。"""
    variables = dict(data)
    variables["event_type"] = event_type

    # 本地化方向 / 严重度标签
    variables = localize_variables(variables, locale)

    # 置信度百分比
    confidence = data.get("confidence", 0)
    if isinstance(confidence, (int, float)):
        variables["confidence_pct"] = f"{confidence:.0%}" if confidence <= 1 else f"{confidence}%"

    # 概率百分比
    probability = data.get("probability", 0)
    if isinstance(probability, (int, float)):
        variables["probability_pct"] = f"{probability:.0%}" if probability <= 1 else f"{probability}%"

    # 目标价字符串
    targets = data.get("targets", [])
    variables["targets_str"] = " → ".join(str(t) for t in targets) if targets else "—"

    # 严重度 emoji
    severity = data.get("severity", "medium")
    variables["severity_emoji"] = {
        "high": "🔴", "medium": "🟡", "low": "🟢"
    }.get(severity, "⚠️")

    market_structure_label = data.get("market_structure_label")
    if not market_structure_label:
        market_structure_type = data.get("market_structure_type")
        if market_structure_type:
            market_structure_label = localize_variables(
                {"market_structure_type": market_structure_type},
                locale,
            ).get("market_structure_label")
    if market_structure_label:
        variables["market_structure_label"] = market_structure_label

    return variables


async def _push_websocket(event_type: str, data: dict) -> bool:
    """通过 Redis Stream 推送到 WebSocket。"""
    try:
        msg_id = await publish_stream("alerts", {
            "type": event_type,
            "data": data,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        })
        return msg_id is not None
    except Exception as exc:
        logger.error("WebSocket 推送失败: %s", exc)
        return False


async def _push_telegram(chat_id: str, message: str) -> bool:
    """通过 Telegram Bot API 推送。"""
    try:
        from app.services.notification.telegram import TelegramNotifier
        notifier = TelegramNotifier()
        return await notifier.send_message(chat_id, message)
    except Exception as exc:
        logger.error("Telegram 推送失败: %s", exc)
        return False


async def _push_email(to_email: str, subject: str, body: str) -> bool:
    """通过邮件服务（Resend/SendGrid）发送邮件。"""
    try:
        from app.services.notification.email import send_raw_email
        # 将纯文本包装为简单 HTML
        html = body.replace("\n", "<br>").replace("━", "─")
        return await send_raw_email(to_email, subject, html)
    except Exception as exc:
        logger.error("邮件推送失败: %s", exc)
        return False


async def _dispatch_per_user(
    session: AsyncSession,
    user_id: str,
    event_type: EventType,
    data: dict[str, Any],
) -> dict[str, bool]:
    """单用户分发（仅 Telegram + Email），不发布 WebSocket stream。

    由 broadcast() 调用，避免 N 个用户产生 N 条重复 stream 消息。
    """
    symbol = data.get("symbol", "UNKNOWN")
    results: dict[str, bool] = {}

    allowed = await _check_cooldown(user_id, event_type, symbol)
    if not allowed:
        return {"skipped": True, "reason": "cooldown"}

    try:
        result = await session.execute(
            text("""
                SELECT email_enabled, tg_enabled, tg_chat_id, events
                FROM push_settings
                WHERE user_id = :user_id
            """),
            {"user_id": user_id},
        )
        settings_row = result.mappings().first()
    except Exception as exc:
        logger.error("查询推送设置失败: %s", exc)
        return {"error": True}

    if not settings_row:
        await _set_cooldown(user_id, event_type, symbol)
        return {"skipped": True, "reason": "no_settings"}

    db_events: list = settings_row["events"] or []
    event_db_key = {"risk_warning": "risk_alert"}.get(event_type, event_type)
    if event_db_key not in db_events:
        return {"skipped": True, "reason": "event_disabled"}

    locale = await _get_user_locale(session, user_id)
    variables = _prepare_variables(event_type, data, locale)

    if settings_row["tg_enabled"] and settings_row["tg_chat_id"]:
        tpl = await get_template(session, event_type, "telegram", locale)
        msg = render_template(tpl, variables)
        results["telegram"] = await _push_telegram(settings_row["tg_chat_id"], msg)

    if settings_row["email_enabled"]:
        try:
            user_result = await session.execute(
                text("SELECT email FROM users WHERE id = :uid"),
                {"uid": user_id},
            )
            email_row = user_result.mappings().first()
            if email_row and email_row["email"]:
                title_tpl = await get_template(session, event_type, "title", locale)
                subject = render_template(title_tpl, variables)
                tpl = await get_template(session, event_type, "telegram", locale)
                body_text = render_template(tpl, variables)
                results["email"] = await _push_email(email_row["email"], subject, body_text)
        except Exception as exc:
            logger.error("邮件推送查询失败: %s", exc)
            results["email"] = False

    await _set_cooldown(user_id, event_type, symbol)
    return results


# ── 批量分发（给所有启用用户） ────────────────────────────────


async def broadcast(
    session: AsyncSession,
    event_type: EventType,
    data: dict[str, Any],
) -> dict[str, int]:
    """广播推送 — 给所有启用了该事件的用户推送。

    Returns:
        {"total": N, "sent": M, "skipped": K}
    """
    event_db_key = {"risk_warning": "risk_alert"}.get(event_type, event_type)

    try:
        result = await session.execute(
            text(f"""
                SELECT ps.user_id
                FROM push_settings ps
                WHERE {jsonb_contains('ps.events', ':event_json')}
            """),
            {"event_json": json.dumps([event_db_key])},
        )
        user_ids = [str(row["user_id"]) for row in result.mappings().all()]
    except Exception as exc:
        logger.error("广播查询用户失败: %s", exc)
        return {"total": 0, "sent": 0, "skipped": 0, "error": 1}

    ws_published = await _push_websocket(event_type, data)

    sent = 0
    skipped = 0
    for uid in user_ids:
        try:
            res = await _dispatch_per_user(session, uid, event_type, data)
            if res.get("skipped"):
                skipped += 1
            else:
                sent += 1
        except Exception:
            skipped += 1

    return {"total": len(user_ids), "sent": sent, "skipped": skipped, "ws": ws_published}


async def dispatch_fire_and_forget(
    user_id: str,
    event_type: EventType,
    data: dict[str, Any],
) -> None:
    """Fire-and-forget 推送 — 自动创建 DB session，适用于非请求上下文（编排器/worker）。"""
    try:
        from app.core.database import AsyncSessionLocal
        async with AsyncSessionLocal() as session:
            await dispatch(session, user_id, event_type, data)
    except Exception as exc:
        logger.warning("fire-and-forget 推送失败: %s", exc)
