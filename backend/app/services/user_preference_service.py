"""用户偏好服务 - 管理用户语言偏好

本模块提供用户偏好的读取和更新功能，支持：
- 获取用户语言偏好
- 更新用户语言偏好
- 自动创建或更新偏好记录

验证需求: 6.2, 6.3, 6.7, 6.8
"""

import logging
from typing import Optional

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)

# 支持的语言列表
SUPPORTED_LOCALES = ["zh-CN", "zh-TW", "en"]


class UserPreferenceService:
    """用户偏好服务
    
    提供用户偏好的读取和更新功能，包括语言偏好管理。
    所有方法都是异步的，使用参数化查询防止SQL注入。
    """

    @staticmethod
    async def get_locale(session: AsyncSession, user_id: str) -> Optional[str]:
        """获取用户语言偏好
        
        从 user_preferences 表读取用户的语言偏好设置。
        如果用户没有偏好记录，返回 None。
        
        Args:
            session: 数据库会话
            user_id: 用户ID（UUID字符串）
        
        Returns:
            语言代码（zh-CN/zh-TW/en）或 None（用户无偏好记录）
        
        验证需求: 6.2, 6.3
        """
        try:
            result = await session.execute(
                text("SELECT locale FROM user_preferences WHERE user_id = :user_id"),
                {"user_id": user_id}
            )
            row = result.first()
            
            if row:
                locale = row[0]
                logger.debug(f"Retrieved locale for user {user_id}: {locale}")
                return locale
            
            logger.debug(f"No preference record found for user {user_id}")
            return None
            
        except Exception as exc:
            logger.error(f"Failed to get user locale for user {user_id}: {exc}")
            return None

    @staticmethod
    async def update_locale(session: AsyncSession, user_id: str, locale: str) -> bool:
        """更新用户语言偏好
        
        更新或创建用户的语言偏好记录。如果记录不存在，自动创建新记录。
        使用 INSERT ... ON CONFLICT 实现 upsert 操作。
        
        Args:
            session: 数据库会话
            user_id: 用户ID���UUID字符串）
            locale: 语言代码（必须在 SUPPORTED_LOCALES 中）
        
        Returns:
            True: 更新成功
            False: 更新失败
        
        Raises:
            ValueError: 如果 locale 不在支持的语言列表中
        
        验证需求: 6.2, 6.3, 6.7, 6.8
        """
        # 输入验证：确保语言代码有效
        if locale not in SUPPORTED_LOCALES:
            logger.warning(f"Invalid locale attempted: {locale}")
            raise ValueError(
                f"不支持的语言代码: {locale}。"
                f"支持的语言: {', '.join(SUPPORTED_LOCALES)}"
            )

        try:
            # 使用 INSERT ... ON CONFLICT 实现 upsert
            # 如果记录存在则更新，不存在则创建
            await session.execute(
                text("""
                    INSERT INTO user_preferences (user_id, locale)
                    VALUES (:user_id, :locale)
                    ON CONFLICT (user_id) 
                    DO UPDATE SET 
                        locale = :locale,
                        updated_at = CURRENT_TIMESTAMP
                """),
                {"user_id": user_id, "locale": locale}
            )
            
            # 刷新会话以确保更改被提交
            await session.flush()
            
            logger.info(f"Updated locale for user {user_id}: {locale}")
            return True
            
        except Exception as exc:
            logger.error(f"Failed to update user locale for user {user_id}: {exc}")
            return False

    @staticmethod
    async def get_all_preferences(session: AsyncSession, user_id: str) -> dict:
        """获取用户所有偏好设置
        
        从 user_preferences 表读取用户的所有偏好设置。
        如果用户没有偏好记录，返回默认值。
        
        Args:
            session: 数据库会话
            user_id: 用户ID（UUID字符串）
        
        Returns:
            包含所有偏好设置的字典，包括：
            - locale: 语言代码
            - theme: 主题（dark/light）
            - timezone: 时区
        
        验证需求: 6.2, 6.3
        """
        try:
            result = await session.execute(
                text("""
                    SELECT locale, theme, timezone 
                    FROM user_preferences 
                    WHERE user_id = :user_id
                """),
                {"user_id": user_id}
            )
            row = result.mappings().first()
            
            if row:
                logger.debug(f"Retrieved all preferences for user {user_id}")
                return {
                    "locale": row["locale"],
                    "theme": row["theme"],
                    "timezone": row["timezone"],
                }
            
            # 返回默认值
            logger.debug(f"No preference record found for user {user_id}, returning defaults")
            return {
                "locale": "zh-CN",
                "theme": "dark",
                "timezone": "UTC",
            }
            
        except Exception as exc:
            logger.error(f"Failed to get all preferences for user {user_id}: {exc}")
            # 降级处理：返回默认值
            return {
                "locale": "zh-CN",
                "theme": "dark",
                "timezone": "UTC",
            }
