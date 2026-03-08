"""Binance WebSocket 实时 K 线采集器。

连接 wss://stream.binance.com:9443/ws/{symbol}@kline_{interval}
- 自动重连（指数退避，最大 5 次）
- 解析为 KlineData pydantic 模型
- 写入 Redis Streams(kline_updates) 和 TimescaleDB klines 表
"""

import asyncio
import json
import logging
from datetime import datetime, timezone

import websockets
from websockets.exceptions import ConnectionClosed
import sqlalchemy
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.redis import publish_stream, set_with_ttl
from app.models.market_data import KlineData

logger = logging.getLogger(__name__)

_WS_BASE = "wss://stream.binance.com:9443/ws"
_MAX_RETRIES = 5
_RETRY_BASE_DELAY = 2.0  # seconds


def _parse_kline_message(raw: dict) -> KlineData | None:
    """解析 Binance WS kline 消息为 KlineData，失败返回 None。"""
    try:
        k = raw["k"]
        return KlineData(
            symbol=k["s"],
            interval=k["i"],
            open_time=datetime.fromtimestamp(k["t"] / 1000, tz=timezone.utc),
            open=k["o"],
            high=k["h"],
            low=k["l"],
            close=k["c"],
            volume=k["v"],
            close_time=datetime.fromtimestamp(k["T"] / 1000, tz=timezone.utc),
            is_closed=k["x"],
        )
    except (KeyError, ValueError, TypeError) as exc:
        logger.error("Failed to parse kline message", extra={"error": str(exc), "raw": raw})
        return None


async def _write_kline_to_db(session: AsyncSession, kline: KlineData) -> None:
    """将已关闭的 K 线写入 TimescaleDB（upsert）。"""
    sql = """
        INSERT INTO klines (time, symbol, interval, open, high, low, close, volume)
        VALUES (:time, :symbol, :interval, :open, :high, :low, :close, :volume)
        ON CONFLICT (time, symbol, interval) DO UPDATE
            SET open   = EXCLUDED.open,
                high   = EXCLUDED.high,
                low    = EXCLUDED.low,
                close  = EXCLUDED.close,
                volume = EXCLUDED.volume
    """
    await session.execute(
        sqlalchemy.text(sql),
        {
            "time": kline.open_time,
            "symbol": kline.symbol,
            "interval": kline.interval,
            "open": kline.open,
            "high": kline.high,
            "low": kline.low,
            "close": kline.close,
            "volume": kline.volume,
        },
    )
    await session.commit()


class BinanceWebSocket:
    """单交易对单周期 WebSocket 采集器。"""

    def __init__(
        self,
        symbol: str,
        interval: str,
        session_factory: "async_sessionmaker",  # type: ignore[name-defined]
    ) -> None:
        self.symbol = symbol.lower()
        self.interval = interval
        self._session_factory = session_factory
        self._running = False
        self._url = f"{_WS_BASE}/{self.symbol}@kline_{self.interval}"

    async def start(self) -> None:
        """启动采集循环，带指数退避重连。"""
        self._running = True
        retry = 0
        while self._running and retry <= _MAX_RETRIES:
            try:
                await self._connect_and_consume()
                retry = 0  # 成功连接后重置计数
            except ConnectionClosed as exc:
                retry += 1
                delay = _RETRY_BASE_DELAY * (2 ** (retry - 1))
                logger.warning(
                    "WebSocket disconnected, retrying",
                    extra={
                        "symbol": self.symbol,
                        "interval": self.interval,
                        "retry": retry,
                        "delay": delay,
                        "reason": str(exc),
                    },
                )
                if retry > _MAX_RETRIES:
                    logger.error(
                        "Max WebSocket retries reached, giving up",
                        extra={"symbol": self.symbol, "interval": self.interval},
                    )
                    break
                await asyncio.sleep(delay)
            except Exception as exc:
                logger.error(
                    "Unexpected WebSocket error",
                    extra={"symbol": self.symbol, "interval": self.interval, "error": str(exc)},
                )
                retry += 1
                await asyncio.sleep(_RETRY_BASE_DELAY * (2 ** (retry - 1)))

    async def stop(self) -> None:
        self._running = False

    async def _connect_and_consume(self) -> None:
        logger.info(
            "Connecting to Binance WebSocket",
            extra={"url": self._url},
        )
        async with websockets.connect(self._url, ping_interval=20, ping_timeout=10) as ws:
            async for raw_msg in ws:
                if not self._running:
                    break
                try:
                    data = json.loads(raw_msg)
                except json.JSONDecodeError as exc:
                    logger.error("Invalid JSON from WebSocket", extra={"error": str(exc)})
                    continue

                kline = _parse_kline_message(data)
                if kline is None:
                    continue

                # 缓存最新价格（TTL=600s，与 KlineScheduler 一致）
                cache_key = f"latest_price:{kline.symbol}"
                await set_with_ttl(cache_key, kline.close, ttl_seconds=600)

                # 发布到 Redis Streams
                await publish_stream(
                    "kline_updates",
                    {
                        "symbol": kline.symbol,
                        "interval": kline.interval,
                        "close": kline.close,
                        "is_closed": kline.is_closed,
                        "open_time": kline.open_time.isoformat(),
                    },
                )

                # 仅已关闭的 K 线写入 DB
                if kline.is_closed:
                    async with self._session_factory() as session:
                        await _write_kline_to_db(session, kline)
                    logger.debug(
                        "Kline saved",
                        extra={"symbol": kline.symbol, "interval": kline.interval, "time": kline.open_time},
                    )
