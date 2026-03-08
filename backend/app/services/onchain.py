"""链上数据查询服务 — Service 层，封装 Redis 缓存 + TimescaleDB 查询。

路由层通过本服务查询链上快照数据，不直接调用数据库。
"""

import logging
from datetime import datetime
from typing import Optional

from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.redis import get_json

logger = logging.getLogger(__name__)


class OnchainRecord(BaseModel):
    """链上快照查询结果。"""

    time: datetime
    symbol: str
    exchange_netflow: Optional[float] = None
    whale_change_24h: Optional[float] = None
    fear_greed_index: Optional[int] = None
    mvrv: Optional[float] = None


class OnchainService:
    """链上数据查询服务。"""

    async def get_latest_snapshot(
        self,
        session: AsyncSession,
        symbol: str,
    ) -> OnchainRecord | None:
        """获取最新链上快照 — Redis 缓存优先，DB 兜底。"""
        upper_symbol = symbol.upper()

        # 1. 尝试 Redis 缓存
        try:
            cached = await get_json(f"onchain:{upper_symbol}")
            if cached is not None:
                return OnchainRecord(**cached)
        except Exception as exc:
            logger.warning("Redis cache read failed, falling back to DB", extra={"error": str(exc)})

        # 2. DB 兜底
        try:
            sql = text("""
                SELECT time, symbol, exchange_netflow, whale_change_24h,
                       fear_greed_index, mvrv
                FROM onchain_snapshots
                WHERE symbol = :symbol
                ORDER BY time DESC
                LIMIT 1
            """)
            result = await session.execute(sql, {"symbol": upper_symbol})
            row = result.mappings().first()

            if row is None:
                return None

            return OnchainRecord(
                time=row["time"],
                symbol=row["symbol"],
                exchange_netflow=_to_float(row["exchange_netflow"]),
                whale_change_24h=_to_float(row["whale_change_24h"]),
                fear_greed_index=_to_int(row["fear_greed_index"]),
                mvrv=_to_float(row["mvrv"]),
            )
        except Exception as exc:
            logger.error("Failed to query latest onchain snapshot", extra={
                "symbol": upper_symbol, "error": str(exc),
            })
            raise

    async def get_snapshot_history(
        self,
        session: AsyncSession,
        symbol: str,
        limit: int,
    ) -> list[OnchainRecord]:
        """查询历史链上快照（时间升序），用于趋势图。"""
        try:
            sql = text("""
                SELECT time, symbol, exchange_netflow, whale_change_24h,
                       fear_greed_index, mvrv
                FROM onchain_snapshots
                WHERE symbol = :symbol
                ORDER BY time DESC
                LIMIT :limit
            """)
            result = await session.execute(sql, {
                "symbol": symbol.upper(),
                "limit": limit,
            })
            rows = result.mappings().all()

            return [
                OnchainRecord(
                    time=row["time"],
                    symbol=row["symbol"],
                    exchange_netflow=_to_float(row["exchange_netflow"]),
                    whale_change_24h=_to_float(row["whale_change_24h"]),
                    fear_greed_index=_to_int(row["fear_greed_index"]),
                    mvrv=_to_float(row["mvrv"]),
                )
                for row in reversed(rows)  # 返回时间升序
            ]
        except Exception as exc:
            logger.error("Failed to query onchain history", extra={
                "symbol": symbol.upper(), "error": str(exc),
            })
            raise


def _to_float(v: object) -> float | None:
    return float(v) if v is not None else None


def _to_int(v: object) -> int | None:
    return int(v) if v is not None else None
