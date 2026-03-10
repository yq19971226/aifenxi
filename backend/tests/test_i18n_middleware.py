"""测试语言检测中间件

验证需求: 1.8, 6.3, 6.4, 6.5, 6.6
"""

import pytest
from unittest.mock import AsyncMock, MagicMock
from fastapi import Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.i18n_middleware import (
    detect_locale,
    get_locale_from_request,
    _parse_accept_language,
    SUPPORTED_LOCALES,
    DEFAULT_LOCALE,
)


class TestParseAcceptLanguage:
    """测试 Accept-Language header 解析"""

    def test_exact_match_zh_cn(self):
        """测试精确匹配中文简体"""
        result = _parse_accept_language("zh-CN")
        assert result == "zh-CN"

    def test_exact_match_zh_tw(self):
        """测试精确匹配中文繁体"""
        result = _parse_accept_language("zh-TW")
        assert result == "zh-TW"

    def test_exact_match_en(self):
        """测试精确匹配英文"""
        result = _parse_accept_language("en")
        assert result == "en"

    def test_with_quality_values(self):
        """测试带权重的 Accept-Language"""
        result = _parse_accept_language("zh-CN,zh;q=0.9,en;q=0.8")
        assert result == "zh-CN"

    def test_simplified_zh_to_zh_cn(self):
        """测试简化形式 zh 转换为 zh-CN"""
        result = _parse_accept_language("zh")
        assert result == "zh-CN"

    def test_zh_tw_variants(self):
        """测试繁体中文变体"""
        assert _parse_accept_language("zh-TW") == "zh-TW"
        assert _parse_accept_language("zh-HK") == "zh-TW"
        assert _parse_accept_language("zh-Hant") == "zh-TW"

    def test_en_variants(self):
        """测试英文变体"""
        assert _parse_accept_language("en-US") == "en"
        assert _parse_accept_language("en-GB") == "en"

    def test_unsupported_language(self):
        """测试不支持的语言返回 None"""
        result = _parse_accept_language("fr-FR")
        assert result is None

    def test_empty_string(self):
        """测试空字符串"""
        result = _parse_accept_language("")
        assert result is None

    def test_multiple_languages_first_supported(self):
        """测试多语言列表，返回第一个支持的"""
        result = _parse_accept_language("fr,zh-CN,en")
        assert result == "zh-CN"


class TestGetLocaleFromRequest:
    """测试快速语言检测（不查询数据库）"""

    def test_with_accept_language_header(self):
        """测试从 Accept-Language header 获取语言"""
        request = MagicMock(spec=Request)
        request.headers.get.return_value = "zh-CN"
        
        result = get_locale_from_request(request)
        assert result == "zh-CN"

    def test_without_accept_language_header(self):
        """测试没有 Accept-Language header 时使用默认语言"""
        request = MagicMock(spec=Request)
        request.headers.get.return_value = ""
        
        result = get_locale_from_request(request)
        assert result == DEFAULT_LOCALE

    def test_with_invalid_accept_language(self):
        """测试无效的 Accept-Language header 时使用默认语言"""
        request = MagicMock(spec=Request)
        request.headers.get.return_value = "invalid-locale"
        
        result = get_locale_from_request(request)
        assert result == DEFAULT_LOCALE


@pytest.mark.asyncio
class TestDetectLocale:
    """测试完整的语言检测（包含数据库查询）"""

    async def test_priority_1_database_config(self):
        """测试优先级1：从数据库读取用户配置"""
        request = MagicMock(spec=Request)
        request.headers.get.return_value = "en"
        
        session = AsyncMock(spec=AsyncSession)
        mock_result = MagicMock()
        mock_result.first.return_value = ("zh-TW",)
        session.execute.return_value = mock_result
        
        result = await detect_locale(request, session, user_id="test-user-id")
        assert result == "zh-TW"

    async def test_priority_2_accept_language(self):
        """测试优先级2：从 Accept-Language header 读取"""
        request = MagicMock(spec=Request)
        request.headers.get.return_value = "en"
        
        session = AsyncMock(spec=AsyncSession)
        mock_result = MagicMock()
        mock_result.first.return_value = None
        session.execute.return_value = mock_result
        
        result = await detect_locale(request, session, user_id="test-user-id")
        assert result == "en"

    async def test_priority_3_default_locale(self):
        """测试优先级3：使用默认语言"""
        request = MagicMock(spec=Request)
        request.headers.get.return_value = ""
        
        session = AsyncMock(spec=AsyncSession)
        
        result = await detect_locale(request, session, user_id=None)
        assert result == DEFAULT_LOCALE

    async def test_database_error_fallback(self):
        """测试数据库查询失败时降级到 Accept-Language"""
        request = MagicMock(spec=Request)
        request.headers.get.return_value = "zh-CN"
        
        session = AsyncMock(spec=AsyncSession)
        session.execute.side_effect = Exception("Database error")
        
        result = await detect_locale(request, session, user_id="test-user-id")
        assert result == "zh-CN"

    async def test_invalid_database_locale_fallback(self):
        """测试数据库返回无效语言时降级"""
        request = MagicMock(spec=Request)
        request.headers.get.return_value = "en"
        
        session = AsyncMock(spec=AsyncSession)
        mock_result = MagicMock()
        mock_result.first.return_value = ("invalid-locale",)
        session.execute.return_value = mock_result
        
        result = await detect_locale(request, session, user_id="test-user-id")
        assert result == "en"

    async def test_no_user_id_skips_database(self):
        """测试没有 user_id 时跳过数据库查询"""
        request = MagicMock(spec=Request)
        request.headers.get.return_value = "zh-TW"
        
        session = AsyncMock(spec=AsyncSession)
        
        result = await detect_locale(request, session, user_id=None)
        assert result == "zh-TW"
        # 验证没有调用数据库
        session.execute.assert_not_called()
