"""CoinGlass WebSocket 客户端 — 实时数据流采集。

数据层模块，通过 WebSocket 连接 CoinGlass 实时数据流，
将爆仓事件发布到 Redis Streams。Standard+ 套餐可用。
"""

from __future__ import annotations

import asyncio
import json
from collections.abc import AsyncIterator
from typing import Any

import structlog
import websockets
from websockets.exceptions import ConnectionClosed

from app.core.redis import publish_stream
from app.data.coinglass_tier import TierManager
from app.models.coinglass import CoinGlassTier
from app.services.config_service import get_config_value

logger = structlog.get_logger(__name__)

_WS_URL = "wss://open-api-v4.coinglass.com/ws"
_INITIAL_BACKOFF = 5  # seconds
_MAX_BACKOFF = 60  # seconds
_MAX_RECONNECT_ATTEMPTS = 10

# Standard 套餐可订阅的频道
_STANDARD_CHANNELS: list[str] = [
    "liquidation",
]

# Professional 套餐额外可订阅的频道
_PROFESSIONAL_CHANNELS: list[str] = [
    "liquidation",
    "oi_change",
    "funding_rate",
    "taker_volume",
]


class CoinGlassWSClient:
    """CoinGlass WebSocket 客户端 — 实时数据流采集。"""

    def __init__(self, tier_manager: TierManager) -> None:
        self._tier_manager = tier_manager
        self._ws: Any = None
        self._running: bool = False
        self._reconnect_count: int = 0

    async def connect(self) -> bool:
        """建立 WebSocket 连接。

        Hobbyist/Startup 套餐不建立连接，返回 False。
        Standard/Professional 建立连接，返回 True。
        """
        tier = await self._tier_manager.get_current_tier()
        if not self._tier_manager.is_feature_enabled(tier, "websocket"):
            logger.info(
                "ws_connect_skipped",
                tier=tier.value,
                reason="WebSocket not available for current tier",
            )
            return False

        api_key = await get_config_value("coinglass_api_key", "")
        if not api_key:
            logger.warning("coinglass_api_key_not_configured_for_ws")
            return False

        try:
            extra_headers = {"CG-API-KEY": api_key}
            self._ws = await websockets.connect(
                _WS_URL,
                additional_headers=extra_headers,
                ping_interval=30,
                ping_timeout=10,
            )
            self._running = True
            self._reconnect_count = 0
            logger.info("ws_connected", url=_WS_URL, tier=tier.value)
            return True
        except Exception as exc:
            logger.error("ws_connect_failed", error=str(exc))
            return False

    async def subscribe(self, channels: list[str] | None = None) -> None:
        """订阅指定频道（按套餐等级过滤可用频道）。"""
        if self._ws is None:
            logger.warning("ws_subscribe_no_connection")
            return

        tier = await self._tier_manager.get_current_tier()
        if channels is None:
            if tier == CoinGlassTier.PROFESSIONAL:
                channels = _PROFESSIONAL_CHANNELS
            else:
                channels = _STANDARD_CHANNELS

        for channel in channels:
            try:
                msg = json.dumps({"action": "subscribe", "channel": channel})
                await self._ws.send(msg)
                logger.info("ws_subscribed", channel=channel)
            except Exception as exc:
                logger.error("ws_subscribe_failed", channel=channel, error=str(exc))

    async def consume(self) -> AsyncIterator[dict]:
        """持续消费消息，解析后 yield。"""
        if self._ws is None:
            return

        while self._running:
            try:
                raw = await self._ws.recv()
                try:
                    data = json.loads(raw)
                    yield data
                except json.JSONDecodeError:
                    logger.warning("ws_invalid_json", raw=str(raw)[:200])
            except ConnectionClosed as exc:
                logger.warning("ws_connection_closed", code=exc.code, reason=str(exc.reason))
                self._running = False
                break
            except Exception as exc:
                logger.error("ws_consume_error", error=str(exc))
                self._running = False
                break

    async def publish_to_stream(self, event: dict) -> None:
        """将实时爆仓事件发布到 Redis Streams realtime_liquidations。"""
        try:
            await publish_stream("realtime_liquidations", event)
        except Exception as exc:
            logger.error("ws_publish_failed", error=str(exc))

    async def run_with_reconnect(self) -> None:
        """带指数退避重连的主循环。"""
        while self._reconnect_count < _MAX_RECONNECT_ATTEMPTS:
            connected = await self.connect()
            if not connected:
                return  # tier not supported or no API key

            await self.subscribe()

            async for msg in self.consume():
                # 处理实时爆仓事件
                if isinstance(msg, dict) and msg.get("channel") == "liquidation":
                    await self.publish_to_stream(msg)

            # 连接断开，尝试重连
            self._reconnect_count += 1
            backoff = min(
                _INITIAL_BACKOFF * (2 ** (self._reconnect_count - 1)),
                _MAX_BACKOFF,
            )
            logger.info(
                "ws_reconnecting",
                attempt=self._reconnect_count,
                backoff_seconds=backoff,
            )
            await asyncio.sleep(backoff)

        logger.error(
            "ws_max_reconnects_exceeded",
            max_attempts=_MAX_RECONNECT_ATTEMPTS,
        )

    async def close(self) -> None:
        """关闭 WebSocket 连接。"""
        self._running = False
        if self._ws is not None:
            try:
                await self._ws.close()
            except Exception as exc:
                logger.error("ws_close_failed", error=str(exc))
            self._ws = None

    @staticmethod
    def compute_backoff(attempt: int) -> float:
        """计算第 n 次重连的等待时间（秒）。

        公式: min(5 * 2^(n-1), 60)
        """
        return min(_INITIAL_BACKOFF * (2 ** (attempt - 1)), _MAX_BACKOFF)
