"""语言检测中间件 - 从 Accept-Language header 或用户配置读取语言偏好

本模块提供语言检测功能，支持以下优先级：
1. 用户数据库配置（已登录用户）
2. Accept-Language header
3. 默认语言（zh-CN）

验证需求: 1.8, 6.3, 6.4, 6.5, 6.6
"""

import logging
from typing import Optional

from fastapi import Request
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)

# 支持的语言列表
SUPPORTED_LOCALES = ["zh-CN", "zh-TW", "en"]
DEFAULT_LOCALE = "zh-CN"


async def detect_locale(
    request: Request,
    session: AsyncSession,
    user_id: Optional[str] = None
) -> str:
    """
    检测用户语言偏好，按优先级返回语言代码
    
    优先级：
    1. 用户数据库配置（已登录用户）
    2. Accept-Language header
    3. 默认语言（zh-CN）
    
    Args:
        request: FastAPI 请求对象
        session: 数据库会话
        user_id: 用户ID（可选，已登录用户）
    
    Returns:
        语言代码（zh-CN/zh-TW/en）
    
    验证需求: 1.8, 6.3, 6.4, 6.5, 6.6
    """
    # 优先级1: 已登录用户 - 从数据库读取
    if user_id:
        try:
            result = await session.execute(
                text("SELECT locale FROM user_preferences WHERE user_id = :user_id"),
                {"user_id": user_id}
            )
            row = result.first()
            if row and row[0] in SUPPORTED_LOCALES:
                logger.debug(f"Detected locale from database: {row[0]} for user {user_id}")
                return row[0]
        except Exception as exc:
            logger.warning(f"Failed to read user locale from database: {exc}")
            # 降级到下一优先级

    # 优先级2: Accept-Language header
    accept_language = request.headers.get("Accept-Language", "")
    if accept_language:
        try:
            locale = _parse_accept_language(accept_language)
            if locale:
                logger.debug(f"Detected locale from Accept-Language: {locale}")
                return locale
        except Exception as exc:
            logger.warning(f"Failed to parse Accept-Language header: {exc}")
            # 降级到默认语言

    # 优先级3: 默认语言
    logger.debug(f"Using default locale: {DEFAULT_LOCALE}")
    return DEFAULT_LOCALE


def get_locale_from_request(request: Request) -> str:
    """
    从请求中快速获取语言（不查询数据库）
    
    仅使用 Accept-Language header 和默认语言，适用于：
    - 未登录用户的请求
    - 不需要数据库查询的快速检测
    - 性能敏感的场景
    
    Args:
        request: FastAPI 请求对象
    
    Returns:
        语言代码（zh-CN/zh-TW/en）
    
    验证需求: 6.4, 6.5, 6.6
    """
    accept_language = request.headers.get("Accept-Language", "")
    if accept_language:
        try:
            locale = _parse_accept_language(accept_language)
            if locale:
                return locale
        except Exception as exc:
            logger.warning(f"Failed to parse Accept-Language header: {exc}")
    
    return DEFAULT_LOCALE


def _parse_accept_language(accept_language: str) -> Optional[str]:
    """
    解析 Accept-Language header
    
    支持的格式：
    - zh-CN,zh;q=0.9,en;q=0.8
    - zh-CN
    - zh
    - en-US,en;q=0.9
    
    Args:
        accept_language: Accept-Language header 值
    
    Returns:
        语言代码（zh-CN/zh-TW/en）或 None
    """
    if not accept_language:
        return None
    
    # 解析 Accept-Language: zh-CN,zh;q=0.9,en;q=0.8
    for lang_range in accept_language.split(","):
        # 移除权重参数（;q=0.9）
        lang = lang_range.split(";")[0].strip()
        
        # 精确匹配支持的语言
        if lang in SUPPORTED_LOCALES:
            return lang
        
        # 处理简化形式（如 "zh" -> "zh-CN"）
        if lang.startswith("zh"):
            # 检查是否为繁体中文的变体
            if any(variant in lang.lower() for variant in ["tw", "hk", "mo", "hant"]):
                return "zh-TW"
            return "zh-CN"
        
        if lang.startswith("en"):
            return "en"
    
    return None
