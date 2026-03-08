"""CoinGlass 适配器 — 包装现有 CoinGlassWSClient，纳入统一连接器体系。

source_id: coinglass
保留 TierManager 套餐分层逻辑，向后兼容。

Hobbyist/Startup 套餐不支持 WebSocket，但 REST 轮询采集正常工作。
此时适配器标记为 ENABLED（REST-only 模式），不进入重连循环。
"""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime

from app.data.connectors.base import BaseConnector
from app.data.coinglass_ws import CoinGlassWSClient
from app.data.coinglass_tier import TierManager
from app.models.datasource import DataSourceStatus, HealthStatus

logger = logging.getLogger(__name__)


class CoinGlassAdapter(BaseConnector):
    """CoinGlass 连接器适配器 — 包装现有 CoinGlassWSClient。"""

    source_id = "coinglass"
    ws_url = "wss://open-api-v4.coinglass.com/ws"

    def __init__(self) -> None:
        super().__init__()
        self._tier_manager = TierManager()
        self._client = CoinGlassWSClient(self._tier_manager)
        self._rest_only: bool = False

    async def connect(self) -> bool:
        """委托给 CoinGlassWSClient.connect()。"""
        connected = await self._client.connect()
        if connected:
            logger.info("CoinGlassAdapter connected via WebSocket")
        return connected

    async def subscribe(self, channels: list[str] | None = None) -> None:
        """委托给 CoinGlassWSClient.subscribe()。"""
        await self._client.subscribe(channels)

    async def run_with_reconnect(self) -> None:
        """覆盖基类：Hobbyist/Startup 套餐跳过 WS，标记为 REST-only 模式。"""
        tier = await self._tier_manager.get_current_tier()
        ws_supported = self._tier_manager.is_feature_enabled(tier, "websocket")

        if not ws_supported:
            self._rest_only = True
            self._running = True
            self._status = DataSourceStatus.ENABLED
            logger.info(
                "CoinGlassAdapter running in REST-only mode",
                extra={"tier": tier.value},
            )
            # 保持存活，定期刷新状态（不占 CPU）
            while self._running:
                await asyncio.sleep(30)
            return

        # Standard/Professional 套餐：走正常 WS 重连逻辑
        await super().run_with_reconnect()

    def health_check(self) -> HealthStatus:
        """REST-only 模式下报告为健康（REST worker 独立采集数据）。"""
        if self._rest_only:
            return HealthStatus(
                source_id=self.source_id,
                connected=True,
                status=DataSourceStatus.ENABLED,
                last_message_at=self._last_message_at,
                message_rate=0.0,
                reconnect_count=0,
                error_count=0,
                circuit_breaker_state="closed",
                checked_at=datetime.utcnow(),
            )
        return super().health_check()

    async def _run_loop(self) -> None:
        """委托给 CoinGlassWSClient 的消息消费循环。"""
        async for msg in self._client.consume():
            if not self._running:
                break
            self._check_stale()
            self._record_message()

            # 发布到统一 Stream（ds:coinglass:liquidation）
            if isinstance(msg, dict) and msg.get("channel") == "liquidation":
                try:
                    await self._publish("liquidation", msg)
                except Exception as exc:
                    logger.error(
                        "CoinGlassAdapter publish failed", extra={"error": str(exc)}
                    )
            elif isinstance(msg, dict) and msg.get("channel") in (
                "oi_change", "funding_rate", "taker_volume"
            ):
                channel = msg.get("channel", "unknown")
                try:
                    await self._publish(channel, msg)
                except Exception as exc:
                    logger.error(
                        "CoinGlassAdapter publish failed",
                        extra={"channel": channel, "error": str(exc)},
                    )

    async def close(self) -> None:
        """关闭连接。"""
        self._running = False
        self._rest_only = False
        self._status = DataSourceStatus.DISABLED
        await self._client.close()

    async def _parse_message(self, raw: dict) -> list:
        return []
