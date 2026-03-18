"""策略发布规则引擎 — 判断快照是否应发布到排行榜。

发布条件（全部满足）：
1. analysis_mode in (intraday, trend) — scalping 排除
2. is_fallback == False
3. direction != neutral
4. 去重窗口：intraday 同用户+同币种 24h 内无已发布记录
                trend    同用户+同币种 7d  内无已发布记录

is_worth_taking 不作为过滤条件，仅作为排行榜标签展示。
mark_published 使用 savepoint 隔离事务，失败不影响外层 snapshot 保存。
"""

import logging
from uuid import UUID

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.sql_compat import now_minus_interval_literal

logger = logging.getLogger(__name__)

# 默认去重窗口（后台可配置：publish_dedup_scalping_hours / publish_dedup_intraday_hours / publish_dedup_trend_days）
_DEDUP_DEFAULTS: dict[str, tuple[int, str]] = {
    "scalping": (4, "hours"),
    "intraday": (12, "hours"),
    "trend": (3, "days"),
}


async def _get_dedup_window(mode: str) -> tuple[int, str]:
    """动态读取去重窗口配置，后台可通过 ConfigService 调整。"""
    default = _DEDUP_DEFAULTS.get(mode)
    if default is None:
        return (0, "hours")
    try:
        from app.services.config_service import get_config_value
        if mode == "trend":
            val = int(await get_config_value("publish_dedup_trend_days", str(default[0])))
            return (val, "days")
        else:
            key = f"publish_dedup_{mode}_hours"
            val = int(await get_config_value(key, str(default[0])))
            return (val, "hours")
    except Exception:
        return default


class PublishRuleEngine:
    """策略发布规则引擎。"""

    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def try_publish(
        self,
        snapshot_id: UUID,
        user_id: UUID,
        symbol: str,
        analysis_mode: str,
        direction: str,
        is_fallback: bool,
        is_worth_taking: bool,
    ) -> bool:
        """判断并标记发布。返回 True 表示已发布。"""
        if not self._passes_basic_rules(analysis_mode, direction, is_fallback):
            return False

        if await self._is_duplicate(user_id, symbol, analysis_mode):
            logger.info(
                "发布去重：user=%s symbol=%s mode=%s 窗口内已有发布",
                user_id, symbol, analysis_mode,
            )
            return False

        await self._mark_published(snapshot_id)
        logger.info(
            "策略已发布: snapshot=%s user=%s symbol=%s mode=%s worth=%s",
            snapshot_id, user_id, symbol, analysis_mode, is_worth_taking,
        )
        return True

    @staticmethod
    def _passes_basic_rules(
        analysis_mode: str, direction: str, is_fallback: bool
    ) -> bool:
        # scalping 不上排行榜（波动大、影响胜率美观度）
        if analysis_mode not in ("intraday", "trend"):
            return False
        if is_fallback:
            return False
        if direction == "neutral":
            return False
        return True

    async def _is_duplicate(
        self, user_id: UUID, symbol: str, analysis_mode: str
    ) -> bool:
        window = await _get_dedup_window(analysis_mode)
        if window[0] == 0:
            return False

        cutoff = now_minus_interval_literal(window[0], window[1])
        try:
            result = await self._session.execute(
                text(f"""
                    SELECT 1 FROM strategy_snapshots
                    WHERE user_id = :user_id
                      AND symbol = :symbol
                      AND analysis_mode = :mode
                      AND published = TRUE
                      AND created_at > {cutoff}
                    LIMIT 1
                """),
                {
                    "user_id": str(user_id),
                    "symbol": symbol,
                    "mode": analysis_mode,
                },
            )
            return result.first() is not None
        except Exception as exc:
            logger.error("去重查询失败: %s", exc)
            return False

    async def _mark_published(self, snapshot_id: UUID) -> None:
        """标记为已发布。使用 savepoint 隔离事务。"""
        try:
            async with self._session.begin_nested():
                await self._session.execute(
                    text("""
                        UPDATE strategy_snapshots
                        SET published = TRUE
                        WHERE id = :snapshot_id
                    """),
                    {"snapshot_id": str(snapshot_id)},
                )
        except Exception as exc:
            logger.error("标记发布失败（savepoint 已回滚）: %s", exc)
