"""剧本预测表维护工具。"""

from __future__ import annotations

import logging

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.agents.playbook_patterns import PLAYBOOK_PATTERNS

logger = logging.getLogger(__name__)

PLAYBOOK_MARKET_STRUCTURE_BY_NAME: dict[str, str] = {
    pattern.name: pattern.market_structure_type
    for pattern in PLAYBOOK_PATTERNS
    if pattern.market_structure_type
}


def get_market_structure_type_for_playbook(playbook_name: str | None) -> str | None:
    """按剧本名称返回对应市场结构类型。"""
    if not playbook_name:
        return None
    return PLAYBOOK_MARKET_STRUCTURE_BY_NAME.get(playbook_name)


async def backfill_playbook_prediction_market_structures(
    session: AsyncSession,
) -> int:
    """为历史 playbook_predictions 记录回填 market_structure_type。

    只执行 flush()，不 commit()，事务由外层请求会话统一管理。
    """
    if not PLAYBOOK_MARKET_STRUCTURE_BY_NAME:
        return 0

    updated = 0
    try:
        for playbook_name, market_structure_type in PLAYBOOK_MARKET_STRUCTURE_BY_NAME.items():
            result = await session.execute(
                text(
                    """
                    UPDATE playbook_predictions
                    SET market_structure_type = :market_structure_type
                    WHERE playbook_name = :playbook_name
                      AND (
                        market_structure_type IS NULL
                        OR market_structure_type = ''
                        OR market_structure_type = 'unknown'
                      )
                    """
                ),
                {
                    "playbook_name": playbook_name,
                    "market_structure_type": market_structure_type,
                },
            )
            updated += int(result.rowcount or 0)
        if updated > 0:
            await session.flush()
    except Exception as exc:
        logger.warning("回填剧本市场结构失败: %s", exc)
        return 0
    return updated
