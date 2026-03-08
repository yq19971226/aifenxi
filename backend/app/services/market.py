"""市场数据查询服务 — Service 层，封装 TimescaleDB 查询。

路由层通过本服务查询 K 线和指标数据，不直接调用数据库。
"""

import logging
from datetime import datetime

from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)


class KlineRecord(BaseModel):
    """K线查询结果。"""

    time: datetime
    open: float
    high: float
    low: float
    close: float
    volume: float


class IndicatorRecord(BaseModel):
    """指标查询结果。"""

    time: datetime
    symbol: str
    interval: str
    ema7: float | None = None
    ema25: float | None = None
    ema99: float | None = None
    rsi: float | None = None
    macd: float | None = None
    macd_signal: float | None = None
    macd_histogram: float | None = None
    bb_upper: float | None = None
    bb_middle: float | None = None
    bb_lower: float | None = None


class MarketService:
    """市场数据查询服务。"""

    async def get_klines(
        self,
        session: AsyncSession,
        symbol: str,
        interval: str,
        limit: int,
    ) -> list[KlineRecord]:
        """查询 TimescaleDB K 线数据，返回时间升序。"""
        try:
            sql = text("""
                SELECT time, open, high, low, close, volume
                FROM klines
                WHERE symbol = :symbol AND interval = :interval
                ORDER BY time DESC
                LIMIT :limit
            """)
            result = await session.execute(sql, {
                "symbol": symbol.upper(),
                "interval": interval,
                "limit": limit,
            })
            rows = result.mappings().all()

            return [
                KlineRecord(
                    time=row["time"],
                    open=float(row["open"]),
                    high=float(row["high"]),
                    low=float(row["low"]),
                    close=float(row["close"]),
                    volume=float(row["volume"]),
                )
                for row in reversed(rows)
            ]
        except Exception as exc:
            logger.error("Failed to query klines", extra={"symbol": symbol, "error": str(exc)})
            raise

    async def get_latest_indicators(
        self,
        session: AsyncSession,
        symbol: str,
        interval: str,
    ) -> IndicatorRecord | None:
        """查询 TimescaleDB 最新技术指标。"""
        try:
            sql = text("""
                SELECT time, symbol, interval,
                       ema7, ema25, ema99, rsi,
                       macd, macd_signal, macd_histogram,
                       bb_upper, bb_middle, bb_lower
                FROM indicators
                WHERE symbol = :symbol AND interval = :interval
                ORDER BY time DESC
                LIMIT 1
            """)
            result = await session.execute(sql, {
                "symbol": symbol.upper(),
                "interval": interval,
            })
            row = result.mappings().first()

            if row is None:
                return None

            def _to_float(v: object) -> float | None:
                return float(v) if v is not None else None

            return IndicatorRecord(
                time=row["time"],
                symbol=row["symbol"],
                interval=row["interval"],
                ema7=_to_float(row["ema7"]),
                ema25=_to_float(row["ema25"]),
                ema99=_to_float(row["ema99"]),
                rsi=_to_float(row["rsi"]),
                macd=_to_float(row["macd"]),
                macd_signal=_to_float(row["macd_signal"]),
                macd_histogram=_to_float(row["macd_histogram"]),
                bb_upper=_to_float(row["bb_upper"]),
                bb_middle=_to_float(row["bb_middle"]),
                bb_lower=_to_float(row["bb_lower"]),
            )
        except Exception as exc:
            logger.error("Failed to query indicators", extra={"symbol": symbol, "error": str(exc)})
            raise

    async def get_indicators_list(
        self,
        session: AsyncSession,
        symbol: str,
        interval: str,
        limit: int,
    ) -> list[IndicatorRecord]:
        """查询 TimescaleDB 指标时间序列，返回时间升序。"""
        try:
            sql = text("""
                SELECT time, symbol, interval,
                       ema7, ema25, ema99, rsi,
                       macd, macd_signal, macd_histogram,
                       bb_upper, bb_middle, bb_lower
                FROM indicators
                WHERE symbol = :symbol AND interval = :interval
                ORDER BY time DESC
                LIMIT :limit
            """)
            result = await session.execute(sql, {
                "symbol": symbol.upper(),
                "interval": interval,
                "limit": limit,
            })
            rows = result.mappings().all()

            def _to_float(v: object) -> float | None:
                return float(v) if v is not None else None

            return [
                IndicatorRecord(
                    time=row["time"],
                    symbol=row["symbol"],
                    interval=row["interval"],
                    ema7=_to_float(row["ema7"]),
                    ema25=_to_float(row["ema25"]),
                    ema99=_to_float(row["ema99"]),
                    rsi=_to_float(row["rsi"]),
                    macd=_to_float(row["macd"]),
                    macd_signal=_to_float(row["macd_signal"]),
                    macd_histogram=_to_float(row["macd_histogram"]),
                    bb_upper=_to_float(row["bb_upper"]),
                    bb_middle=_to_float(row["bb_middle"]),
                    bb_lower=_to_float(row["bb_lower"]),
                )
                for row in reversed(rows)
            ]
        except Exception as exc:
            logger.error("Failed to query indicators list", extra={"symbol": symbol, "error": str(exc)})
            raise
