"""Binance 连接器 — 合约 + 现货 WebSocket 实时数据流。

source_id: binance_futures
与现有 BinanceWebSocket K线采集器（source_id=binance_kline）共存，互不干扰。
"""

from __future__ import annotations

import asyncio
import json
import logging
from datetime import datetime, timezone

import websockets
from websockets.exceptions import ConnectionClosed

from app.data.connectors.base import BaseConnector
from app.models.datasource import DataSourceStatus
from app.services.symbol_registry import get_active_symbols_sync

logger = logging.getLogger(__name__)

_FUTURES_WS_BASE = "wss://fstream.binance.com"
_SPOT_WS_BASE = "wss://stream.binance.com:9443"
_DEFAULT_FUTURES_STREAMS = ["aggTrade", "markPrice@1s", "forceOrder"]
_DEFAULT_SPOT_STREAMS = ["aggTrade"]


class BinanceConnector(BaseConnector):
    """Binance 合约 + 现货 WebSocket 连接器。

    使用 Combined Stream 方式（单连接多频道）。
    """

    source_id = "binance_futures"
    ws_url = _FUTURES_WS_BASE

    def __init__(
        self,
        symbols: list[str] | None = None,
        futures_streams: list[str] | None = None,
        spot_streams: list[str] | None = None,
    ) -> None:
        super().__init__()
        self._symbols = [s.lower() for s in (symbols or get_active_symbols_sync())]
        self._futures_streams = futures_streams or _DEFAULT_FUTURES_STREAMS
        self._spot_streams = spot_streams or _DEFAULT_SPOT_STREAMS
        self._futures_ws: websockets.WebSocketClientProtocol | None = None
        self._spot_ws: websockets.WebSocketClientProtocol | None = None

    def _build_combined_url(self, base: str, streams: list[str]) -> str:
        """构建 Combined Stream URL。"""
        stream_list = "/".join(
            f"{sym}@{stream}"
            for sym in self._symbols
            for stream in streams
        )
        return f"{base}/stream?streams={stream_list}"

    async def connect(self) -> bool:
        """建立合约 + 现货双 WebSocket 连接（自动检测代理）。"""
        futures_url = self._build_combined_url(_FUTURES_WS_BASE, self._futures_streams)
        spot_url = self._build_combined_url(_SPOT_WS_BASE, self._spot_streams)
        try:
            self._futures_ws = await self._proxy_connect(
                futures_url, ping_interval=20, ping_timeout=10
            )
            self._spot_ws = await self._proxy_connect(
                spot_url, ping_interval=20, ping_timeout=10
            )
            logger.info(
                "BinanceConnector connected",
                extra={"futures_url": futures_url, "spot_url": spot_url},
            )
            return True
        except Exception as exc:
            logger.error("BinanceConnector connect failed", extra={"error": str(exc)})
            return False

    async def subscribe(self, channels: list[str] | None = None) -> None:
        """Combined Stream 连接时已在 URL 中订阅，无需额外操作。"""
        pass

    async def _run_loop(self) -> None:
        """并发消费合约和现货两个 WebSocket。"""
        if self._futures_ws is None or self._spot_ws is None:
            return

        futures_task = asyncio.create_task(self._consume_ws(self._futures_ws, "futures"))
        spot_task = asyncio.create_task(self._consume_ws(self._spot_ws, "spot"))

        try:
            done, pending = await asyncio.wait(
                [futures_task, spot_task],
                return_when=asyncio.FIRST_EXCEPTION,
            )
            for task in pending:
                task.cancel()
            for task in done:
                if task.exception():
                    raise task.exception()  # type: ignore[misc]
        finally:
            await self._close_ws()

    async def _consume_ws(
        self, ws: websockets.WebSocketClientProtocol, label: str
    ) -> None:
        """消费单个 WebSocket 流。"""
        try:
            async for raw_msg in ws:
                if not self._running:
                    break
                self._check_stale()
                try:
                    data = json.loads(raw_msg)
                except json.JSONDecodeError as exc:
                    logger.warning(
                        "BinanceConnector invalid JSON",
                        extra={"label": label, "error": str(exc)},
                    )
                    continue

                # Combined Stream 消息格式: {"stream": "...", "data": {...}}
                payload = data.get("data", data)
                await self._handle_message(payload)
        except ConnectionClosed as exc:
            logger.warning(
                "BinanceConnector connection closed",
                extra={"label": label, "code": exc.code},
            )
            raise

    async def _handle_message(self, payload: dict) -> None:
        """根据事件类型路由处理。"""
        event = payload.get("e", "")

        if event == "aggTrade":
            await self._handle_agg_trade(payload)
        elif event == "markPriceUpdate":
            await self._handle_mark_price(payload)
        elif event == "forceOrder":
            await self._handle_force_order(payload)

    async def _handle_agg_trade(self, payload: dict) -> None:
        """解析 aggTrade → StandardTrade 并发布，同时更新 latest_price 缓存。"""
        try:
            symbol = payload["s"]
            price = float(payload["p"])
            ts = datetime.fromtimestamp(
                int(payload["T"]) / 1000, tz=timezone.utc
            ).isoformat()
            msg = {
                "symbol": symbol,
                "price": price,
                "quantity": float(payload["q"]),
                "side": "sell" if payload.get("m") else "buy",
                "timestamp": ts,
                "trade_id": str(payload.get("a", "")),
            }
            await self._publish("trade", msg)

            # 更新 latest_price 缓存（TTL=600s，与 KlineScheduler 一致，避免 WS 短 TTL 覆盖调度器写入）
            from app.core.redis import set_with_ttl
            await set_with_ttl(f"latest_price:{symbol}", price, ttl_seconds=600)
        except (KeyError, ValueError, TypeError) as exc:
            logger.warning(
                "BinanceConnector aggTrade parse failed",
                extra={"error": str(exc), "payload": str(payload)[:200]},
            )
        except Exception as exc:
            logger.warning(
                "BinanceConnector aggTrade handler error",
                extra={"error": str(exc)},
            )

    async def _handle_mark_price(self, payload: dict) -> None:
        """解析 markPriceUpdate → StandardTicker 并发布。"""
        try:
            msg = {
                "symbol": payload["s"],
                "last_price": float(payload.get("p", 0)),
                "mark_price": float(payload.get("p", 0)),
                "index_price": float(payload.get("i", 0)) if payload.get("i") else None,
                "volume_24h": 0.0,
                "funding_rate": float(payload.get("r", 0)) if payload.get("r") else None,
                "timestamp": datetime.fromtimestamp(
                    int(payload["T"]) / 1000, tz=timezone.utc
                ).isoformat(),
            }
            await self._publish("ticker", msg)
        except (KeyError, ValueError, TypeError) as exc:
            logger.warning(
                "BinanceConnector markPrice parse failed",
                extra={"error": str(exc)},
            )

    async def _handle_force_order(self, payload: dict) -> None:
        """解析 forceOrder → StandardLiquidation 并发布。"""
        try:
            order = payload.get("o", {})
            qty = float(order.get("q", 0))
            price = float(order.get("ap", order.get("p", 0)))
            msg = {
                "symbol": order.get("s", ""),
                "side": "short" if order.get("S") == "BUY" else "long",
                "price": price,
                "quantity": qty,
                "usd_value": qty * price,
                "timestamp": datetime.fromtimestamp(
                    int(order.get("T", 0)) / 1000, tz=timezone.utc
                ).isoformat(),
            }
            await self._publish("liquidation", msg)
        except (KeyError, ValueError, TypeError) as exc:
            logger.warning(
                "BinanceConnector forceOrder parse failed",
                extra={"error": str(exc)},
            )

    async def close(self) -> None:
        """关闭双 WebSocket 连接。"""
        self._running = False
        self._status = DataSourceStatus.DISABLED
        await self._close_ws()

    async def _close_ws(self) -> None:
        for ws, label in [(self._futures_ws, "futures"), (self._spot_ws, "spot")]:
            if ws is not None:
                try:
                    await ws.close()
                except Exception as exc:
                    logger.warning(
                        "BinanceConnector close error",
                        extra={"label": label, "error": str(exc)},
                    )
        self._futures_ws = None
        self._spot_ws = None

    async def _parse_message(self, raw: dict) -> list:
        """实现抽象方法（实际解析在 _handle_message 中完成）。"""
        return []
