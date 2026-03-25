"""事件合约实时数据管道 — WebSocket 流聚合器。

连接币安 3 个 WebSocket 流（aggTrade / depth / kline_1m），
实时计算多窗口滚动指标供规则引擎消费。

优化 v2:
- 多窗口 (30s/60s/120s) 买卖比
- 多窗口订单簿失衡 (EMA 平滑)
- 订单流加速度 (BSR delta)
- 波动率计算 (用于动态阈值)
- 增量买卖总额追踪
"""

from __future__ import annotations

import asyncio
import json
import logging
import math
import time
from collections import deque
from datetime import datetime, timezone
from typing import Any

import websockets
from websockets.exceptions import ConnectionClosed

logger = logging.getLogger(__name__)

# ── WebSocket 端点 ─────────────────────────────────────────────

_FUTURES_WS_BASE = "wss://fstream.binance.com"
_SPOT_WS_BASE = "wss://stream.binance.com:9443"
_RECONNECT_DELAY = 3  # 秒
_LARGE_ORDER_THRESHOLD = 100_000  # 大单阈值（USDT）

# ── 多窗口配置 ─────────────────────────────────────────────────
_WINDOWS = [30, 60, 120]  # 滚动窗口（秒）
_MAX_WINDOW = max(_WINDOWS)  # 最大窗口用于数据保留


class EventStreamAggregator:
    """实时聚合器 — 每秒更新多窗口滚动指标，供规则引擎消费。"""

    def __init__(self, symbol: str = "ETHUSDT") -> None:
        self.symbol = symbol
        self._symbol_lower = symbol.lower()
        self._running = False

        # ── 滚动窗口缓存 ──
        self._trades: deque[dict] = deque(maxlen=100000)      # {ts, price, qty, side, usd}
        self._large_orders: deque[dict] = deque(maxlen=10000)  # {ts, usd, side}

        # ── 订单簿最新快照 ──
        self._bids_total: float = 0.0
        self._asks_total: float = 0.0
        # EMA 平滑订单簿失衡（避免瞬时抖动）
        self._obi_ema: float = 0.0
        self._obi_ema_alpha: float = 0.3  # EMA 权重

        # ── 1 分钟 K 线 ──
        self._kline_closes: deque[float] = deque(maxlen=50)
        self._kline_volumes: deque[float] = deque(maxlen=50)
        self._current_kline_volume: float = 0.0
        self._current_price: float = 0.0

        # ── 订单流加速度追踪 ──
        self._bsr_history: deque[dict] = deque(maxlen=30)  # {ts, bsr} 最近 30 秒

        # ── 最新聚合指标 ──
        self._metrics: dict[str, Any] = {}

    @property
    def metrics(self) -> dict[str, Any]:
        return dict(self._metrics)

    @property
    def running(self) -> bool:
        return self._running

    # ── 启动 / 停止 ─────────────────────────────────────────

    async def start(self) -> None:
        """启动 WebSocket 流聚合。"""
        self._running = True
        logger.info("EventStreamAggregator starting", extra={"symbol": self.symbol})
        while self._running:
            try:
                await self._connect_and_consume()
            except Exception as exc:
                logger.warning(
                    "EventStreamAggregator connection error, reconnecting...",
                    extra={"error": str(exc)},
                )
                if self._running:
                    await asyncio.sleep(_RECONNECT_DELAY)

    async def stop(self) -> None:
        self._running = False
        logger.info("EventStreamAggregator stopped", extra={"symbol": self.symbol})

    # ── WebSocket 连接 ─────────────────────────────────────

    async def _connect_and_consume(self) -> None:
        """连接 3 个流并并发消费。"""
        streams = [
            f"{self._symbol_lower}@aggTrade",
            f"{self._symbol_lower}@depth20@100ms",
            f"{self._symbol_lower}@kline_1m",
        ]
        url = f"{_FUTURES_WS_BASE}/stream?streams={'/'.join(streams)}"

        # 检测代理
        import os
        proxy = os.environ.get("HTTPS_PROXY") or os.environ.get("https_proxy")

        connect_kwargs: dict[str, Any] = {
            "ping_interval": 20,
            "ping_timeout": 10,
        }

        if proxy:
            import socks  # type: ignore[import-untyped]
            from urllib.parse import urlparse
            parsed = urlparse(proxy)
            import socket
            sock = socks.socksocket()
            proxy_type = socks.SOCKS5 if "socks5" in parsed.scheme else socks.HTTP
            sock.set_proxy(proxy_type, parsed.hostname, parsed.port)
            from urllib.parse import urlparse as _up
            ws_parsed = _up(url)
            # 使用 run_in_executor 避免阻塞事件循环
            loop = asyncio.get_event_loop()
            await loop.run_in_executor(None, sock.connect, (ws_parsed.hostname, ws_parsed.port or 443))
            sock.settimeout(None)
            import ssl as _ssl
            ssl_ctx = _ssl.create_default_context()
            connect_kwargs["sock"] = sock
            connect_kwargs["ssl"] = ssl_ctx

        async with websockets.connect(url, **connect_kwargs) as ws:
            logger.info("EventStreamAggregator connected", extra={"url": url[:80]})
            # 启动指标刷新循环
            refresh_task = asyncio.create_task(self._metrics_refresh_loop())
            try:
                async for raw_msg in ws:
                    if not self._running:
                        break
                    try:
                        data = json.loads(raw_msg)
                    except json.JSONDecodeError:
                        continue
                    payload = data.get("data", data)
                    event = payload.get("e", "")
                    if event == "aggTrade":
                        self._on_agg_trade(payload)
                    elif event == "depthUpdate" or "lastUpdateId" in payload:
                        self._on_depth(payload)
                    elif event == "kline":
                        self._on_kline(payload)
            finally:
                refresh_task.cancel()

    # ── 消息处理 ──────────────────────────────────────────

    def _on_agg_trade(self, payload: dict) -> None:
        """处理逐笔成交。"""
        try:
            price = float(payload["p"])
            qty = float(payload["q"])
            side = "sell" if payload.get("m") else "buy"
            ts = time.time()
            usd = price * qty

            self._current_price = price
            self._trades.append({"ts": ts, "price": price, "qty": qty, "side": side, "usd": usd})

            if usd >= _LARGE_ORDER_THRESHOLD:
                self._large_orders.append({"ts": ts, "usd": usd, "side": side})
        except (KeyError, ValueError, TypeError):
            pass

    def _on_depth(self, payload: dict) -> None:
        """处理深度快照 — 取 top 20 档。"""
        try:
            bids = payload.get("b") or payload.get("bids") or []
            asks = payload.get("a") or payload.get("asks") or []
            self._bids_total = sum(float(b[1]) * float(b[0]) for b in bids[:20])
            self._asks_total = sum(float(a[1]) * float(a[0]) for a in asks[:20])
        except (KeyError, ValueError, TypeError, IndexError):
            pass

    def _on_kline(self, payload: dict) -> None:
        """处理 1 分钟 K 线更新。"""
        try:
            k = payload.get("k", {})
            self._current_kline_volume = float(k.get("v", 0))
            # K 线完结
            if k.get("x"):
                self._kline_closes.append(float(k["c"]))
                self._kline_volumes.append(float(k["v"]))
        except (KeyError, ValueError, TypeError):
            pass

    # ── 指标计算循环 ────────────────────────────────────────

    async def _metrics_refresh_loop(self) -> None:
        """每秒刷新聚合指标。"""
        while self._running:
            try:
                self._compute_metrics()
            except Exception as exc:
                logger.warning("metrics_compute_error", extra={"error": str(exc)})
            await asyncio.sleep(1)

    def _compute_metrics(self) -> None:
        """计算多窗口滚动聚合指标。"""
        now = time.time()
        max_cutoff = now - _MAX_WINDOW

        # 清理过期交易（保留最大窗口范围内的数据）
        while self._trades and self._trades[0]["ts"] < max_cutoff:
            self._trades.popleft()
        while self._large_orders and self._large_orders[0]["ts"] < max_cutoff:
            self._large_orders.popleft()

        # ── 多窗口买卖比 ──
        bsr_by_window: dict[int, float] = {}
        for window in _WINDOWS:
            cutoff = now - window
            buy_vol = 0.0
            sell_vol = 0.0
            for t in self._trades:
                if t["ts"] >= cutoff:
                    if t["side"] == "buy":
                        buy_vol += t["usd"]
                    else:
                        sell_vol += t["usd"]
            bsr = buy_vol / sell_vol if sell_vol > 0 else (2.0 if buy_vol > 0 else 1.0)
            bsr_by_window[window] = round(bsr, 4)

        # ── 多窗口大单净方向 ──
        lof_by_window: dict[int, float] = {}
        for window in _WINDOWS:
            cutoff = now - window
            large_buy = 0.0
            large_sell = 0.0
            for o in self._large_orders:
                if o["ts"] >= cutoff:
                    if o["side"] == "buy":
                        large_buy += o["usd"]
                    else:
                        large_sell += o["usd"]
            lof_by_window[window] = round(large_buy - large_sell, 2)

        # ── 订单簿失衡（EMA 平滑） ──
        total_depth = self._bids_total + self._asks_total
        raw_obi = (self._bids_total - self._asks_total) / total_depth if total_depth > 0 else 0.0
        self._obi_ema = self._obi_ema_alpha * raw_obi + (1 - self._obi_ema_alpha) * self._obi_ema

        # ── 订单流加速度 ──
        current_bsr = bsr_by_window.get(30, 1.0)
        self._bsr_history.append({"ts": now, "bsr": current_bsr})

        bsr_acceleration = 0.0
        bsr_momentum = "neutral"
        if len(self._bsr_history) >= 6:
            history = list(self._bsr_history)
            # 最近 5 秒的 BSR 变化率
            recent_bsr = history[-1]["bsr"]
            past_bsr = history[-6]["bsr"]
            bsr_acceleration = (recent_bsr - past_bsr) / 5.0  # 每秒变化率
            if bsr_acceleration > 0.08:
                bsr_momentum = "bullish_accelerating"
            elif bsr_acceleration < -0.08:
                bsr_momentum = "bearish_accelerating"

        # ── 波动率（基于最近 K 线收盘价） ──
        volatility = self._calc_volatility(list(self._kline_closes), 10)

        # ── 辅助信号: RSI(14) ──
        rsi_1m = self._calc_rsi(list(self._kline_closes), 14)

        # ── 辅助信号: EMA5 vs EMA10 ──
        closes = list(self._kline_closes)
        ema5 = self._calc_ema(closes, 5)
        ema10 = self._calc_ema(closes, 10)
        ema5_vs_ema10 = ema5 - ema10 if ema5 is not None and ema10 is not None else 0.0

        # ── 辅助信号: 成交量比率 ──
        volumes = list(self._kline_volumes)
        if len(volumes) >= 3 and self._current_kline_volume > 0:
            avg_vol = sum(volumes[-3:]) / 3
            volume_ratio = self._current_kline_volume / avg_vol if avg_vol > 0 else 1.0
        else:
            volume_ratio = 1.0

        # ── 多窗口方向一致性 ──
        window_directions: list[str] = []
        for w in _WINDOWS:
            bsr = bsr_by_window.get(w, 1.0)
            if bsr > 1.2:
                window_directions.append("bullish")
            elif bsr < 0.83:
                window_directions.append("bearish")
            else:
                window_directions.append("neutral")

        # 统计方向一致性
        bullish_count = window_directions.count("bullish")
        bearish_count = window_directions.count("bearish")
        if bullish_count >= 2:
            trend_alignment = "bullish"
            trend_strength = bullish_count / len(_WINDOWS)
        elif bearish_count >= 2:
            trend_alignment = "bearish"
            trend_strength = bearish_count / len(_WINDOWS)
        else:
            trend_alignment = "neutral"
            trend_strength = 0.0

        self._metrics = {
            "symbol": self.symbol,
            "current_price": self._current_price,
            # 主窗口（30s）— 向后兼容
            "buy_sell_ratio_30s": bsr_by_window.get(30, 1.0),
            "orderbook_imbalance": round(self._obi_ema, 4),
            "large_order_flow": lof_by_window.get(30, 0.0),
            # 多窗口买卖比
            "bsr_30s": bsr_by_window.get(30, 1.0),
            "bsr_60s": bsr_by_window.get(60, 1.0),
            "bsr_120s": bsr_by_window.get(120, 1.0),
            # 多窗口大单流
            "lof_30s": lof_by_window.get(30, 0.0),
            "lof_60s": lof_by_window.get(60, 0.0),
            "lof_120s": lof_by_window.get(120, 0.0),
            # 订单流加速度
            "bsr_acceleration": round(bsr_acceleration, 6),
            "bsr_momentum": bsr_momentum,
            # 波动率
            "volatility": round(volatility, 6) if volatility is not None else None,
            # 多窗口趋势一致性
            "trend_alignment": trend_alignment,
            "trend_strength": round(trend_strength, 2),
            "window_directions": window_directions,
            # 辅助指标
            "rsi_1m": round(rsi_1m, 2) if rsi_1m is not None else None,
            "ema5_vs_ema10": round(ema5_vs_ema10, 6),
            "volume_ratio": round(volume_ratio, 4),
            "trade_count_30s": sum(1 for t in self._trades if t["ts"] >= now - 30),
            "bids_total_usd": round(self._bids_total, 2),
            "asks_total_usd": round(self._asks_total, 2),
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }

    # ── 技术指标辅助 ──────────────────────────────────────

    @staticmethod
    def _calc_rsi(closes: list[float], period: int = 14) -> float | None:
        if len(closes) < period + 1:
            return None
        gains, losses = 0.0, 0.0
        for i in range(-period, 0):
            change = closes[i] - closes[i - 1]
            if change > 0:
                gains += change
            else:
                losses -= change
        avg_gain = gains / period
        avg_loss = losses / period
        if avg_loss == 0:
            return 100.0
        rs = avg_gain / avg_loss
        return 100.0 - (100.0 / (1.0 + rs))

    @staticmethod
    def _calc_ema(closes: list[float], period: int) -> float | None:
        if len(closes) < period:
            return None
        k = 2 / (period + 1)
        ema = closes[0]
        for c in closes[1:]:
            ema = c * k + ema * (1 - k)
        return ema

    @staticmethod
    def _calc_volatility(closes: list[float], window: int = 10) -> float | None:
        """计算价格波动率（标准差/均值）。"""
        if len(closes) < window:
            return None
        recent = closes[-window:]
        mean = sum(recent) / len(recent)
        if mean == 0:
            return 0.0
        variance = sum((c - mean) ** 2 for c in recent) / len(recent)
        return math.sqrt(variance) / mean
