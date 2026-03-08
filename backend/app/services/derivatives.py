"""合约数据查询服务 — 为 API 路由层提供数据读取接口。

职责：从 Redis 缓存或 TimescaleDB 读取合约快照、资金费率历史、爆仓流水。
不含采集逻辑（采集在 app/data/derivatives.py）。
"""

import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.redis import get_json
logger = logging.getLogger(__name__)

# Redis 缓存键模式（与 DerivativesCollector 保持一致）
_SNAPSHOT_CACHE_KEY = "derivatives:{symbol}"
_LIQUIDATION_CACHE_KEY = "deriv_liquidations:{symbol}"


class DerivativesService:
    """合约数据查询服务。

    Args:
        session: SQLAlchemy AsyncSession，用于查询 TimescaleDB。
    """

    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def get_latest_snapshot(self, symbol: str) -> dict | None:
        """获取最新合约快照。优先 Redis 缓存，未命中查 DB。"""
        cached = await get_json(_SNAPSHOT_CACHE_KEY.format(symbol=symbol))
        if cached is not None:
            return cached

        return await self._query_latest_snapshot(symbol)

    async def get_funding_history(
        self, symbol: str, days: int = 7
    ) -> list[dict]:
        """查询资金费率历史，按时间正序返回。

        Args:
            symbol: 交易对，如 "BTCUSDT"
            days: 查询天数，最大30

        Returns:
            [{time, funding_rate, predicted_funding_rate}, ...]
        """
        since = datetime.now(timezone.utc) - timedelta(days=days)

        result = await self._session.execute(
            text(
                """
                SELECT time, funding_rate, predicted_funding_rate
                FROM derivatives_snapshots
                WHERE symbol = :symbol AND time >= :since
                ORDER BY time ASC
                """
            ),
            {"symbol": symbol, "since": since},
        )
        rows = result.mappings().all()

        return [
            {
                "time": str(row["time"]),
                "funding_rate": (
                    float(row["funding_rate"])
                    if row["funding_rate"] is not None
                    else None
                ),
                "predicted_funding_rate": (
                    float(row["predicted_funding_rate"])
                    if row["predicted_funding_rate"] is not None
                    else None
                ),
            }
            for row in rows
        ]

    async def get_liquidations(self, symbol: str, limit: int = 50) -> list[dict]:
        """获取最近爆仓流水。优先 Redis 缓存，未命中查 DB。

        Args:
            symbol: 交易对
            limit: 最大条数（<=50）

        Returns:
            [{time, symbol, side, quantity, price, usd_value}, ...] 按时间倒序
        """
        cached = await get_json(_LIQUIDATION_CACHE_KEY.format(symbol=symbol))
        if cached is not None:
            return cached[:limit]

        result = await self._session.execute(
            text(
                """
                SELECT time, symbol, side, quantity, price, usd_value
                FROM liquidation_events
                WHERE symbol = :symbol
                ORDER BY time DESC
                LIMIT :limit
                """
            ),
            {"symbol": symbol, "limit": limit},
        )
        rows = result.mappings().all()

        return [
            {
                "time": str(row["time"]),
                "symbol": row["symbol"],
                "side": row["side"],
                "quantity": float(row["quantity"]),
                "price": float(row["price"]),
                "usd_value": float(row["usd_value"]),
            }
            for row in rows
        ]

    # ── 内部方法 ─────────────────────────────────────────────

    async def _query_latest_snapshot(self, symbol: str) -> dict | None:
        """从 TimescaleDB 查询指定交易对的最新合约快照。"""
        result = await self._session.execute(
            text(
                """
                SELECT time, symbol, funding_rate, predicted_funding_rate,
                       long_short_account_ratio, long_short_position_ratio,
                       top_long_short_account_ratio, top_long_short_position_ratio
                FROM derivatives_snapshots
                WHERE symbol = :symbol
                ORDER BY time DESC
                LIMIT 1
                """
            ),
            {"symbol": symbol},
        )
        row = result.mappings().first()

        if row is None:
            return None

        return {
            "time": str(row["time"]),
            "symbol": row["symbol"],
            "funding_rate": (
                float(row["funding_rate"])
                if row["funding_rate"] is not None
                else None
            ),
            "predicted_funding_rate": (
                float(row["predicted_funding_rate"])
                if row["predicted_funding_rate"] is not None
                else None
            ),
            "long_short_account_ratio": (
                float(row["long_short_account_ratio"])
                if row["long_short_account_ratio"] is not None
                else None
            ),
            "long_short_position_ratio": (
                float(row["long_short_position_ratio"])
                if row["long_short_position_ratio"] is not None
                else None
            ),
            "top_long_short_account_ratio": (
                float(row["top_long_short_account_ratio"])
                if row["top_long_short_account_ratio"] is not None
                else None
            ),
            "top_long_short_position_ratio": (
                float(row["top_long_short_position_ratio"])
                if row["top_long_short_position_ratio"] is not None
                else None
            ),
        }
