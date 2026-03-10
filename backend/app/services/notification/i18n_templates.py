"""多语言推送模板 — 为 Telegram / Email / WebSocket 提供三语言通知模板。

支持语言：zh-CN（简体中文）、zh-TW（繁体中文）、en（英文）。
技术术语（BTC、MACD 等）在所有语言中保持不变。
"""

from typing import Any, Literal

Language = Literal["zh-CN", "zh-TW", "en"]

# ── 方向标签 ──────────────────────────────────────────────────

DIRECTION_LABELS: dict[Language, dict[str, str]] = {
    "zh-CN": {
        "bullish": "🟢 多头",
        "bearish": "🔴 空头",
        "neutral": "⚪ 观望",
    },
    "zh-TW": {
        "bullish": "🟢 多頭",
        "bearish": "🔴 空頭",
        "neutral": "⚪ 觀望",
    },
    "en": {
        "bullish": "🟢 Bullish",
        "bearish": "🔴 Bearish",
        "neutral": "⚪ Neutral",
    },
}

SEVERITY_LABELS: dict[Language, dict[str, str]] = {
    "zh-CN": {"high": "高", "medium": "中", "low": "低"},
    "zh-TW": {"high": "高", "medium": "中", "low": "低"},
    "en": {"high": "HIGH", "medium": "MEDIUM", "low": "LOW"},
}

MARKET_STRUCTURE_LABELS: dict[Language, dict[str, str]] = {
    "zh-CN": {
        "false_breakout_bull_trap": "假突破诱多陷阱",
        "panic_washout_reversal": "恐慌洗盘反转",
        "short_squeeze_reversal": "诱空杀空反转",
        "double_bottom_absorption": "二次探底承接",
        "stair_step_markup": "阶梯式拉升",
        "parabolic_distribution": "拉高出货",
        "liquidity_vacuum_trap": "流动性真空陷阱",
        "wash_trading_distortion": "对倒洗售失真",
        "liquidation_wick_hunt": "插针收割",
        "twap_accumulation": "TWAP拆单吸筹",
        "iceberg_absorption": "冰山订单吸筹",
        "front_run_information_leak": "抢跑交易",
        "etf_flow_led": "ETF资金驱动",
        "etf_redemption_supply": "ETF赎回供给",
        "options_gamma_pinning": "期权Gamma钉住",
        "protective_put_pressure": "保护性买沽压力",
        "perp_basis_manipulation": "永续/基差操纵",
        "basis_compression_deleveraging": "基差压缩去杠杆",
        "stablecoin_liquidity_rotation": "稳定币流动性迁移",
        "cross_venue_liquidity_fragmentation": "跨所流动性分层",
        "spot_absorption": "现货承接吸收",
        "distribution_with_derivatives_warning": "派发并伴随衍生品预警",
    },
    "zh-TW": {
        "false_breakout_bull_trap": "假突破誘多陷阱",
        "panic_washout_reversal": "恐慌洗盤反轉",
        "short_squeeze_reversal": "誘空殺空反轉",
        "double_bottom_absorption": "二次探底承接",
        "stair_step_markup": "階梯式拉升",
        "parabolic_distribution": "拉高出貨",
        "liquidity_vacuum_trap": "流動性真空陷阱",
        "wash_trading_distortion": "對倒洗售失真",
        "liquidation_wick_hunt": "插針收割",
        "twap_accumulation": "TWAP拆單吸籌",
        "iceberg_absorption": "冰山訂單吸籌",
        "front_run_information_leak": "搶跑交易",
        "etf_flow_led": "ETF資金驅動",
        "etf_redemption_supply": "ETF贖回供給",
        "options_gamma_pinning": "期權Gamma釘住",
        "protective_put_pressure": "保護性買沽壓力",
        "perp_basis_manipulation": "永續/基差操縱",
        "basis_compression_deleveraging": "基差壓縮去槓桿",
        "stablecoin_liquidity_rotation": "穩定幣流動性遷移",
        "cross_venue_liquidity_fragmentation": "跨所流動性分層",
        "spot_absorption": "現貨承接吸收",
        "distribution_with_derivatives_warning": "派發並伴隨衍生品預警",
    },
    "en": {
        "false_breakout_bull_trap": "False Breakout Bull Trap",
        "panic_washout_reversal": "Panic Washout Reversal",
        "short_squeeze_reversal": "Short Squeeze Reversal",
        "double_bottom_absorption": "Double Bottom Absorption",
        "stair_step_markup": "Stair-Step Markup",
        "parabolic_distribution": "Parabolic Distribution",
        "liquidity_vacuum_trap": "Liquidity Vacuum Trap",
        "wash_trading_distortion": "Wash Trading Distortion",
        "liquidation_wick_hunt": "Liquidation Wick Hunt",
        "twap_accumulation": "TWAP Accumulation",
        "iceberg_absorption": "Iceberg Absorption",
        "front_run_information_leak": "Front-Run Information Leak",
        "etf_flow_led": "ETF Flow-Led",
        "etf_redemption_supply": "ETF Redemption Supply",
        "options_gamma_pinning": "Options Gamma Pinning",
        "protective_put_pressure": "Protective Put Pressure",
        "perp_basis_manipulation": "Perp/Basis Manipulation",
        "basis_compression_deleveraging": "Basis Compression Deleveraging",
        "stablecoin_liquidity_rotation": "Stablecoin Liquidity Rotation",
        "cross_venue_liquidity_fragmentation": "Cross-Venue Liquidity Fragmentation",
        "spot_absorption": "Spot Absorption",
        "distribution_with_derivatives_warning": "Distribution With Derivatives Warning",
    },
}

# ── Telegram 模板（三语言）────────────────────────────────────

_TELEGRAM_TEMPLATES: dict[str, dict[Language, str]] = {
    "strategy_update": {
        "zh-CN": (
            "📊 <b>策略更新</b> {{direction_label}}\n"
            "━━━━━━━━━━━━━━━\n"
            "💎 标的: {{symbol}}\n"
            "🎯 入场区间: {{entry_low}} ~ {{entry_high}}\n"
            "🛑 止损: {{stop_loss}}\n"
            "🏁 目标: {{targets_str}}\n"
            "📈 置信度: {{confidence_pct}}\n"
            "━━━━━━━━━━━━━━━"
        ),
        "zh-TW": (
            "📊 <b>策略更新</b> {{direction_label}}\n"
            "━━━━━━━━━━━━━━━\n"
            "💎 標的: {{symbol}}\n"
            "🎯 入場區間: {{entry_low}} ~ {{entry_high}}\n"
            "🛑 止損: {{stop_loss}}\n"
            "🏁 目標: {{targets_str}}\n"
            "📈 置信度: {{confidence_pct}}\n"
            "━━━━━━━━━━━━━━━"
        ),
        "en": (
            "📊 <b>Strategy Update</b> {{direction_label}}\n"
            "━━━━━━━━━━━━━━━\n"
            "💎 Symbol: {{symbol}}\n"
            "🎯 Entry Range: {{entry_low}} ~ {{entry_high}}\n"
            "🛑 Stop Loss: {{stop_loss}}\n"
            "🏁 Targets: {{targets_str}}\n"
            "📈 Confidence: {{confidence_pct}}\n"
            "━━━━━━━━━━━━━━━"
        ),
    },
    "price_alert": {
        "zh-CN": (
            "⚡ <b>价格预警</b>\n"
            "━━━━━━━━━━━━━━━\n"
            "💎 {{symbol}}\n"
            "💰 当前价格: {{current_price}}\n"
            "📌 触发条件: {{trigger}}\n"
            "━━━━━━━━━━━━━━━"
        ),
        "zh-TW": (
            "⚡ <b>價格預警</b>\n"
            "━━━━━━━━━━━━━━━\n"
            "💎 {{symbol}}\n"
            "💰 當前價格: {{current_price}}\n"
            "📌 觸發條件: {{trigger}}\n"
            "━━━━━━━━━━━━━━━"
        ),
        "en": (
            "⚡ <b>Price Alert</b>\n"
            "━━━━━━━━━━━━━━━\n"
            "💎 {{symbol}}\n"
            "💰 Current Price: {{current_price}}\n"
            "📌 Trigger: {{trigger}}\n"
            "━━━━━━━━━━━━━━━"
        ),
    },
    "playbook_switch": {
        "zh-CN": (
            "🎭 <b>剧本切换</b>\n"
            "━━━━━━━━━━━━━━━\n"
            "💎 标的: {{symbol}}\n"
            "📖 当前剧本: {{matched_playbook}}\n"
            "🏗 市场结构: {{market_structure_label}}\n"
            "📊 概率: {{probability_pct}}\n"
            "📍 阶段: {{stage_description}}\n"
            "➡️ 预判: {{next_move}}\n"
            "━━━━━━━━━━━━━━━"
        ),
        "zh-TW": (
            "🎭 <b>劇本切換</b>\n"
            "━━━━━━━━━━━━━━━\n"
            "💎 標的: {{symbol}}\n"
            "📖 當前劇本: {{matched_playbook}}\n"
            "🏗 市場結構: {{market_structure_label}}\n"
            "📊 概率: {{probability_pct}}\n"
            "📍 階段: {{stage_description}}\n"
            "➡️ 預判: {{next_move}}\n"
            "━━━━━━━━━━━━━━━"
        ),
        "en": (
            "🎭 <b>Playbook Switch</b>\n"
            "━━━━━━━━━━━━━━━\n"
            "💎 Symbol: {{symbol}}\n"
            "📖 Playbook: {{matched_playbook}}\n"
            "🏗 Structure: {{market_structure_label}}\n"
            "📊 Probability: {{probability_pct}}\n"
            "📍 Stage: {{stage_description}}\n"
            "➡️ Next Move: {{next_move}}\n"
            "━━━━━━━━━━━━━━━"
        ),
    },
    "playbook_completed": {
        "zh-CN": (
            "✅ <b>剧本验证完成</b>\n"
            "━━━━━━━━━━━━━━━\n"
            "💎 标的: {{symbol}}\n"
            "📖 剧本: {{matched_playbook}}\n"
            "🏗 市场结构: {{market_structure_label}}\n"
            "📊 阶段验证: {{stage_match_ratio}}\n"
            "━━━━━━━━━━━━━━━"
        ),
        "zh-TW": (
            "✅ <b>劇本驗證完成</b>\n"
            "━━━━━━━━━━━━━━━\n"
            "💎 標的: {{symbol}}\n"
            "📖 劇本: {{matched_playbook}}\n"
            "🏗 市場結構: {{market_structure_label}}\n"
            "📊 階段驗證: {{stage_match_ratio}}\n"
            "━━━━━━━━━━━━━━━"
        ),
        "en": (
            "✅ <b>Playbook Verified</b>\n"
            "━━━━━━━━━━━━━━━\n"
            "💎 Symbol: {{symbol}}\n"
            "📖 Playbook: {{matched_playbook}}\n"
            "🏗 Structure: {{market_structure_label}}\n"
            "📊 Stage Match: {{stage_match_ratio}}\n"
            "━━━━━━━━━━━━━━━"
        ),
    },
    "playbook_failed": {
        "zh-CN": (
            "❌ <b>剧本预测失效</b>\n"
            "━━━━━━━━━━━━━━━\n"
            "💎 标的: {{symbol}}\n"
            "📖 剧本: {{matched_playbook}}\n"
            "🏗 市场结构: {{market_structure_label}}\n"
            "⚠️ 失效原因: {{failure_reason}}\n"
            "━━━━━━━━━━━━━━━"
        ),
        "zh-TW": (
            "❌ <b>劇本預測失效</b>\n"
            "━━━━━━━━━━━━━━━\n"
            "💎 標的: {{symbol}}\n"
            "📖 劇本: {{matched_playbook}}\n"
            "🏗 市場結構: {{market_structure_label}}\n"
            "⚠️ 失效原因: {{failure_reason}}\n"
            "━━━━━━━━━━━━━━━"
        ),
        "en": (
            "❌ <b>Playbook Prediction Failed</b>\n"
            "━━━━━━━━━━━━━━━\n"
            "💎 Symbol: {{symbol}}\n"
            "📖 Playbook: {{matched_playbook}}\n"
            "🏗 Structure: {{market_structure_label}}\n"
            "⚠️ Reason: {{failure_reason}}\n"
            "━━━━━━━━━━━━━━━"
        ),
    },
    "risk_alert": {
        "zh-CN": (
            "{{severity_emoji}} <b>风险预警</b>\n"
            "━━━━━━━━━━━━━━━\n"
            "📌 类型: {{alert_type}}\n"
            "💎 标的: {{symbol}}\n"
            "⚡ 严重度: {{severity_label}}\n"
            "📝 {{message}}\n"
            "━━━━━━━━━━━━━━━"
        ),
        "zh-TW": (
            "{{severity_emoji}} <b>風險預警</b>\n"
            "━━━━━━━━━━━━━━━\n"
            "📌 類型: {{alert_type}}\n"
            "💎 標的: {{symbol}}\n"
            "⚡ 嚴重度: {{severity_label}}\n"
            "📝 {{message}}\n"
            "━━━━━━━━━━━━━━━"
        ),
        "en": (
            "{{severity_emoji}} <b>Risk Alert</b>\n"
            "━━━━━━━━━━━━━━━\n"
            "📌 Type: {{alert_type}}\n"
            "💎 Symbol: {{symbol}}\n"
            "⚡ Severity: {{severity_label}}\n"
            "📝 {{message}}\n"
            "━━━━━━━━━━━━━━━"
        ),
    },
    "defense_alert": {
        "zh-CN": (
            "🛡 <b>防御预警</b>\n"
            "━━━━━━━━━━━━━━━\n"
            "💎 标的: {{symbol}}\n"
            "⚠️ 等级: {{alert_level}}\n"
            "📝 {{message}}\n"
            "━━━━━━━━━━━━━━━"
        ),
        "zh-TW": (
            "🛡 <b>防禦預警</b>\n"
            "━━━━━━━━━━━━━━━\n"
            "💎 標的: {{symbol}}\n"
            "⚠️ 等級: {{alert_level}}\n"
            "📝 {{message}}\n"
            "━━━━━━━━━━━━━━━"
        ),
        "en": (
            "🛡 <b>Defense Alert</b>\n"
            "━━━━━━━━━━━━━━━\n"
            "💎 Symbol: {{symbol}}\n"
            "⚠️ Level: {{alert_level}}\n"
            "📝 {{message}}\n"
            "━━━━━━━━━━━━━━━"
        ),
    },
    "high_confidence_signal": {
        "zh-CN": (
            "🔥 <b>高置信信号</b>\n"
            "━━━━━━━━━━━━━━━\n"
            "💎 标的: {{symbol}}\n"
            "📊 方向: {{signal_label}}\n"
            "📈 置信度: {{confidence_pct}}\n"
            "🔍 模式: {{mode}}\n"
            "━━━━━━━━━━━━━━━"
        ),
        "zh-TW": (
            "🔥 <b>高置信信號</b>\n"
            "━━━━━━━━━━━━━━━\n"
            "💎 標的: {{symbol}}\n"
            "📊 方向: {{signal_label}}\n"
            "📈 置信度: {{confidence_pct}}\n"
            "🔍 模式: {{mode}}\n"
            "━━━━━━━━━━━━━━━"
        ),
        "en": (
            "🔥 <b>High Confidence Signal</b>\n"
            "━━━━━━━━━━━━━━━\n"
            "💎 Symbol: {{symbol}}\n"
            "📊 Direction: {{signal_label}}\n"
            "📈 Confidence: {{confidence_pct}}\n"
            "🔍 Mode: {{mode}}\n"
            "━━━━━━━━━━━━━━━"
        ),
    },
    "strategy_settlement": {
        "zh-CN": (
            "{{result_emoji}} <b>策略结算</b>\n"
            "━━━━━━━━━━━━━━━\n"
            "💎 标的: {{symbol}}\n"
            "📌 结算类型: {{settlement_type}}\n"
            "💰 结算价: {{settlement_price}}\n"
            "📊 盈亏: {{pnl_pct}}%\n"
            "━━━━━━━━━━━━━━━"
        ),
        "zh-TW": (
            "{{result_emoji}} <b>策略結算</b>\n"
            "━━━━━━━━━━━━━━━\n"
            "💎 標的: {{symbol}}\n"
            "📌 結算類型: {{settlement_type}}\n"
            "💰 結算價: {{settlement_price}}\n"
            "📊 盈虧: {{pnl_pct}}%\n"
            "━━━━━━━━━━━━━━━"
        ),
        "en": (
            "{{result_emoji}} <b>Strategy Settlement</b>\n"
            "━━━━━━━━━━━━━━━\n"
            "💎 Symbol: {{symbol}}\n"
            "📌 Type: {{settlement_type}}\n"
            "💰 Settlement Price: {{settlement_price}}\n"
            "📊 P&L: {{pnl_pct}}%\n"
            "━━━━━━━━━━━━━━━"
        ),
    },
}

# ── 标题模板（三语言）────────────────────────────────────────

_TITLE_TEMPLATES: dict[str, dict[Language, str]] = {
    "strategy_update": {
        "zh-CN": "[Axiom] {{symbol}} 策略更新",
        "zh-TW": "[Axiom] {{symbol}} 策略更新",
        "en": "[Axiom] {{symbol}} Strategy Update",
    },
    "price_alert": {
        "zh-CN": "[Axiom] {{symbol}} 价格预警",
        "zh-TW": "[Axiom] {{symbol}} 價格預警",
        "en": "[Axiom] {{symbol}} Price Alert",
    },
    "playbook_switch": {
        "zh-CN": "[Axiom] {{symbol}} 剧本切换",
        "zh-TW": "[Axiom] {{symbol}} 劇本切換",
        "en": "[Axiom] {{symbol}} Playbook Switch",
    },
    "playbook_completed": {
        "zh-CN": "[Axiom] {{symbol}} 剧本验证完成",
        "zh-TW": "[Axiom] {{symbol}} 劇本驗證完成",
        "en": "[Axiom] {{symbol}} Playbook Verified",
    },
    "playbook_failed": {
        "zh-CN": "[Axiom] {{symbol}} 剧本预测失效",
        "zh-TW": "[Axiom] {{symbol}} 劇本預測失效",
        "en": "[Axiom] {{symbol}} Playbook Failed",
    },
    "risk_alert": {
        "zh-CN": "[Axiom] {{symbol}} 风险预警",
        "zh-TW": "[Axiom] {{symbol}} 風險預警",
        "en": "[Axiom] {{symbol}} Risk Alert",
    },
    "defense_alert": {
        "zh-CN": "[Axiom] {{symbol}} 防御预警",
        "zh-TW": "[Axiom] {{symbol}} 防禦預警",
        "en": "[Axiom] {{symbol}} Defense Alert",
    },
    "high_confidence_signal": {
        "zh-CN": "[Axiom] {{symbol}} 高置信信号",
        "zh-TW": "[Axiom] {{symbol}} 高置信信號",
        "en": "[Axiom] {{symbol}} High Confidence Signal",
    },
    "strategy_settlement": {
        "zh-CN": "[Axiom] {{symbol}} 策略结算",
        "zh-TW": "[Axiom] {{symbol}} 策略結算",
        "en": "[Axiom] {{symbol}} Strategy Settlement",
    },
}

# ── 短消息模板（三语言）──────────────────────────────────────

_SHORT_TEMPLATES: dict[str, dict[Language, str]] = {
    "strategy_update": {
        "zh-CN": "{{symbol}} {{direction_label}} 置信度{{confidence_pct}}",
        "zh-TW": "{{symbol}} {{direction_label}} 置信度{{confidence_pct}}",
        "en": "{{symbol}} {{direction_label}} Confidence {{confidence_pct}}",
    },
    "price_alert": {
        "zh-CN": "{{symbol}} 价格 {{current_price}} {{trigger}}",
        "zh-TW": "{{symbol}} 價格 {{current_price}} {{trigger}}",
        "en": "{{symbol}} Price {{current_price}} {{trigger}}",
    },
    "playbook_switch": {
        "zh-CN": "{{symbol}} 剧本: {{matched_playbook}} · {{market_structure_label}} ({{probability_pct}})",
        "zh-TW": "{{symbol}} 劇本: {{matched_playbook}} · {{market_structure_label}} ({{probability_pct}})",
        "en": "{{symbol}} Playbook: {{matched_playbook}} · {{market_structure_label}} ({{probability_pct}})",
    },
    "playbook_completed": {
        "zh-CN": "{{symbol}} 剧本{{matched_playbook}}/{{market_structure_label}}验证完成 ({{stage_match_ratio}})",
        "zh-TW": "{{symbol}} 劇本{{matched_playbook}}/{{market_structure_label}}驗證完成 ({{stage_match_ratio}})",
        "en": "{{symbol}} Playbook {{matched_playbook}}/{{market_structure_label}} Verified ({{stage_match_ratio}})",
    },
    "playbook_failed": {
        "zh-CN": "{{symbol}} 剧本{{matched_playbook}}/{{market_structure_label}}失效: {{failure_reason}}",
        "zh-TW": "{{symbol}} 劇本{{matched_playbook}}/{{market_structure_label}}失效: {{failure_reason}}",
        "en": "{{symbol}} Playbook {{matched_playbook}}/{{market_structure_label}} Failed: {{failure_reason}}",
    },
    "risk_alert": {
        "zh-CN": "{{symbol}} {{severity_label}} {{alert_type}}",
        "zh-TW": "{{symbol}} {{severity_label}} {{alert_type}}",
        "en": "{{symbol}} {{severity_label}} {{alert_type}}",
    },
    "defense_alert": {
        "zh-CN": "{{symbol}} 防御等级 {{alert_level}}",
        "zh-TW": "{{symbol}} 防禦等級 {{alert_level}}",
        "en": "{{symbol}} Defense Level {{alert_level}}",
    },
    "high_confidence_signal": {
        "zh-CN": "{{symbol}} {{signal_label}} 置信度{{confidence_pct}}",
        "zh-TW": "{{symbol}} {{signal_label}} 置信度{{confidence_pct}}",
        "en": "{{symbol}} {{signal_label}} Confidence {{confidence_pct}}",
    },
    "strategy_settlement": {
        "zh-CN": "{{symbol}} {{settlement_type}} 盈亏{{pnl_pct}}%",
        "zh-TW": "{{symbol}} {{settlement_type}} 盈虧{{pnl_pct}}%",
        "en": "{{symbol}} {{settlement_type}} P&L {{pnl_pct}}%",
    },
}


# ── Public API ────────────────────────────────────────────────


def _normalize_locale(locale: str) -> Language:
    """规范化 locale，不支持的语言降级为 en。"""
    if locale in ("zh-CN", "zh-TW", "en"):
        return locale  # type: ignore[return-value]
    if locale.startswith("zh"):
        return "zh-CN"
    return "en"


def get_telegram_template(event_type: str, locale: str = "zh-CN") -> str:
    """获取指定事件和语言的 Telegram 消息模板。

    降级：不支持的语言 → en，不支持的事件 → 通用短消息。
    """
    lang = _normalize_locale(locale)
    templates = _TELEGRAM_TEMPLATES.get(event_type)
    if templates:
        return templates.get(lang, templates.get("en", ""))
    return "{{symbol}} — {{event_type}}"


def get_title_template(event_type: str, locale: str = "zh-CN") -> str:
    """获取指定事件和语言的标题模板。"""
    lang = _normalize_locale(locale)
    templates = _TITLE_TEMPLATES.get(event_type)
    if templates:
        return templates.get(lang, templates.get("en", ""))
    return "[Axiom] {{symbol}}"


def get_short_template(event_type: str, locale: str = "zh-CN") -> str:
    """获取指定事件和语言的短消息模板。"""
    lang = _normalize_locale(locale)
    templates = _SHORT_TEMPLATES.get(event_type)
    if templates:
        return templates.get(lang, templates.get("en", ""))
    return "{{symbol}} — {{event_type}}"


def get_direction_label(direction: str, locale: str = "zh-CN") -> str:
    """获取方向标签的本地化文本。"""
    lang = _normalize_locale(locale)
    labels = DIRECTION_LABELS.get(lang, DIRECTION_LABELS["en"])
    return labels.get(direction, labels.get("neutral", "⚪"))


def get_severity_label(severity: str, locale: str = "zh-CN") -> str:
    """获取严重度标签的本地化文本。"""
    lang = _normalize_locale(locale)
    labels = SEVERITY_LABELS.get(lang, SEVERITY_LABELS["en"])
    return labels.get(severity, severity)


def get_market_structure_label(market_structure_type: str, locale: str = "zh-CN") -> str:
    """获取市场结构标签的本地化文本。"""
    lang = _normalize_locale(locale)
    labels = MARKET_STRUCTURE_LABELS.get(lang, MARKET_STRUCTURE_LABELS["en"])
    return labels.get(market_structure_type, market_structure_type)


def localize_variables(
    variables: dict[str, Any],
    locale: str = "zh-CN",
) -> dict[str, Any]:
    """为模板变量添加本地化标签。"""
    result = dict(variables)

    direction = variables.get("direction", "neutral")
    result["direction_label"] = get_direction_label(direction, locale)

    signal = variables.get("signal", variables.get("signal_label", ""))
    if signal in ("bullish", "bearish", "neutral"):
        result["signal_label"] = get_direction_label(signal, locale)

    severity = variables.get("severity", "medium")
    result["severity_label"] = get_severity_label(severity, locale)

    market_structure_type = variables.get("market_structure_type")
    if market_structure_type:
        result["market_structure_label"] = get_market_structure_label(
            str(market_structure_type), locale
        )
    else:
        result["market_structure_label"] = "—"

    return result
