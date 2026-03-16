"""用户操作日志服务 — 记录分析操作。

使用 analysis_logs 表记录每次分析操作：
- 哪个用户
- 什么时间
- 分析了哪个币种
- 使用了什么模式（scalping/intraday/trend）
- 分析结果（成功/失败）
"""

import logging
from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import text

logger = logging.getLogger(__name__)


async def log_analysis_action(
    user_id: UUID,
    email: str,
    symbol: str,
    mode: str,
    level: int,
    result: str = "started",
    detail: str = "",
) -> None:
    """写入一条分析操作日志。

    Args:
        user_id:  用户 ID
        email:    用户邮箱
        symbol:   交易对
        mode:     分析模式 (scalping/intraday/trend)
        level:    用户等级 (0/1/2)
        result:   操作结果 (started/completed/failed/quota_exceeded/permission_denied)
        detail:   详细信息
    """
    try:
        from app.core.database import AsyncSessionLocal

        async with AsyncSessionLocal() as session:
            await session.execute(
                text("""
                    INSERT INTO analysis_logs
                        (user_id, email, symbol, mode, membership_level, result, detail, created_at)
                    VALUES
                        (:user_id, :email, :symbol, :mode, :level, :result, :detail, :created_at)
                """),
                {
                    "user_id": str(user_id),
                    "email": email,
                    "symbol": symbol,
                    "mode": mode,
                    "level": level,
                    "result": result,
                    "detail": detail,
                    "created_at": datetime.now(timezone.utc),
                },
            )
            await session.commit()
    except Exception as exc:
        # 日志写入失败不应阻断主流程
        logger.warning(
            "分析操作日志写入失败 (非致命): user=%s symbol=%s mode=%s error=%s",
            user_id, symbol, mode, exc,
        )
