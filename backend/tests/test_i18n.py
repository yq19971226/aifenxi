"""i18n 模块单元测试

覆盖：
- i18n_errors: 错误消息查找、语言降级、模板变量
- i18n_templates: 推送模板获取、方向/严重度标签本地化、变量本地化
- i18n_middleware: Accept-Language 解析
"""

import pytest

# ── i18n_errors ──────────────────────────────────────────────


class TestI18nErrors:
    """后端错误消息国际化测试。"""

    def test_get_known_key_zh_cn(self):
        from app.core.i18n_errors import get_error_message
        msg = get_error_message("auth.login_failed", "zh-CN")
        assert "登录失败" in msg

    def test_get_known_key_en(self):
        from app.core.i18n_errors import get_error_message
        msg = get_error_message("auth.login_failed", "en")
        assert "Login failed" in msg

    def test_get_known_key_zh_tw(self):
        from app.core.i18n_errors import get_error_message
        msg = get_error_message("auth.login_failed", "zh-TW")
        assert "登入失敗" in msg

    def test_unknown_key_returns_key(self):
        from app.core.i18n_errors import get_error_message
        msg = get_error_message("nonexistent.key", "en")
        assert msg == "nonexistent.key"

    def test_locale_fallback_zh_hk_to_zh_cn(self):
        from app.core.i18n_errors import get_error_message
        msg = get_error_message("auth.login_failed", "zh-HK")
        assert "登录失败" in msg

    def test_locale_fallback_unknown_to_en(self):
        from app.core.i18n_errors import get_error_message
        msg = get_error_message("auth.login_failed", "ja")
        assert "Login failed" in msg

    def test_localized_http_exception(self):
        from app.core.i18n_errors import localized_http_exception
        exc = localized_http_exception(401, "auth.unauthorized", "en")
        assert exc.status_code == 401
        assert "Unauthorized" in exc.detail

    def test_all_keys_have_three_locales(self):
        from app.core.i18n_errors import _ERROR_MESSAGES
        for key, translations in _ERROR_MESSAGES.items():
            assert "zh-CN" in translations, f"{key} missing zh-CN"
            assert "zh-TW" in translations, f"{key} missing zh-TW"
            assert "en" in translations, f"{key} missing en"


# ── i18n_templates ───────────────────────────────────────────


class TestI18nTemplates:
    """推送通知多语言模板测试。"""

    def test_get_telegram_template_en(self):
        from app.services.notification.i18n_templates import get_telegram_template
        tpl = get_telegram_template("strategy_update", "en")
        assert "{{symbol}}" in tpl
        assert len(tpl) > 50

    def test_get_telegram_template_zh_cn(self):
        from app.services.notification.i18n_templates import get_telegram_template
        tpl = get_telegram_template("strategy_update", "zh-CN")
        assert "{{symbol}}" in tpl

    def test_get_telegram_template_fallback(self):
        from app.services.notification.i18n_templates import get_telegram_template
        tpl = get_telegram_template("strategy_update", "ja")
        assert "{{symbol}}" in tpl  # fallback to en

    def test_get_title_template(self):
        from app.services.notification.i18n_templates import get_title_template
        tpl = get_title_template("risk_alert", "en")
        assert "{{symbol}}" in tpl

    def test_get_short_template(self):
        from app.services.notification.i18n_templates import get_short_template
        tpl = get_short_template("price_alert", "en")
        assert "{{symbol}}" in tpl

    def test_unknown_event_type_returns_fallback(self):
        from app.services.notification.i18n_templates import get_telegram_template
        tpl = get_telegram_template("nonexistent_event", "en")
        assert "{{symbol}}" in tpl or "nonexistent_event" in tpl

    def test_direction_label_en(self):
        from app.services.notification.i18n_templates import get_direction_label
        assert "Bullish" in get_direction_label("bullish", "en")
        assert "Bearish" in get_direction_label("bearish", "en")
        assert "Neutral" in get_direction_label("neutral", "en")

    def test_direction_label_zh_cn(self):
        from app.services.notification.i18n_templates import get_direction_label
        assert "多头" in get_direction_label("bullish", "zh-CN")

    def test_severity_label_en(self):
        from app.services.notification.i18n_templates import get_severity_label
        assert "high" in get_severity_label("high", "en").lower()
        assert "low" in get_severity_label("low", "en").lower()

    def test_localize_variables_direction(self):
        from app.services.notification.i18n_templates import localize_variables
        data = {"direction": "bullish", "symbol": "BTCUSDT"}
        result = localize_variables(data, "en")
        assert "Bullish" in result["direction_label"]
        assert result["symbol"] == "BTCUSDT"

    def test_localize_variables_severity(self):
        from app.services.notification.i18n_templates import localize_variables
        data = {"severity": "high"}
        result = localize_variables(data, "zh-CN")
        assert "高" in result["severity_label"]


# ── i18n_middleware ───────────────────────────────────────────


class TestI18nMiddleware:
    """Accept-Language 解析测试。"""

    def test_parse_exact_match(self):
        from app.core.i18n_middleware import _parse_accept_language
        assert _parse_accept_language("zh-CN") == "zh-CN"
        assert _parse_accept_language("zh-TW") == "zh-TW"
        assert _parse_accept_language("en") == "en"

    def test_parse_with_quality(self):
        from app.core.i18n_middleware import _parse_accept_language
        assert _parse_accept_language("zh-CN,zh;q=0.9,en;q=0.8") == "zh-CN"

    def test_parse_en_us_maps_to_en(self):
        from app.core.i18n_middleware import _parse_accept_language
        assert _parse_accept_language("en-US,en;q=0.9") == "en"

    def test_parse_zh_hk_maps_to_zh_tw(self):
        from app.core.i18n_middleware import _parse_accept_language
        assert _parse_accept_language("zh-HK") == "zh-TW"

    def test_parse_zh_hant_maps_to_zh_tw(self):
        from app.core.i18n_middleware import _parse_accept_language
        assert _parse_accept_language("zh-Hant") == "zh-TW"

    def test_parse_zh_maps_to_zh_cn(self):
        from app.core.i18n_middleware import _parse_accept_language
        assert _parse_accept_language("zh") == "zh-CN"

    def test_parse_empty_returns_none(self):
        from app.core.i18n_middleware import _parse_accept_language
        assert _parse_accept_language("") is None

    def test_parse_unsupported_returns_none(self):
        from app.core.i18n_middleware import _parse_accept_language
        assert _parse_accept_language("ja,ko") is None
