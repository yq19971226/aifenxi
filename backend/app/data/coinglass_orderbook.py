"""订单簿采集 — Bid/Ask 分布、热力图、大单挂单。

数据层模块，负责通过 CoinGlassClient 采集订单簿相关数据，
缓存到 Redis。按套餐等级门控端点访问。
"""

from __future__ import annotations

from datetime import datetime, timezone

import structlog

from app.core.redis import set_with_ttl
from app.data.coinglass_client import CoinGlassClient, normalize_pair_symbol
from app.data.coinglass_tier import TierManager
from app.models.coinglass import LargeOrder, OrderBookLevel

logger = structlog.get_logger(__name__)

_OB_CACHE_TTL = 600  # seconds (3.3x collection interval)


class OrderBookCollector:
    """订单簿数据采集器。"""

    def __init__(
        self,
        client: CoinGlassClient,
        tier_manager: TierManager,
    ) -> None:
        self._client = client
        self._tier_manager = tier_manager

    # ----------------------------------------------------------
    # Pair Orderbook Bid&Ask(±range) (Standard+ 套餐)
    # ----------------------------------------------------------

    async def collect_orderbook_history(
        self, symbol: str, range_pct: str = "1",
    ) -> list[OrderBookLevel] | None:
        """调用 /api/futures/orderbook/history 采集 Bid/Ask 分布。"""
        tier = await self._tier_manager.get_current_tier()
        if not self._tier_manager.is_endpoint_available(
            tier, "futures-orderbook-history",
        ):
            logger.info(
                "orderbook_history_skipped",
                symbol=symbol,
                tier=tier.value,
                reason="endpoint not available for current tier",
            )
            return None
        try:
            data = await self._client.get(
                path="/api/futures/orderbook/history",
                endpoint="futures-orderbook-history",
                params={
                    "exchange": "Binance",
                    "symbol": normalize_pair_symbol(symbol),
                    "interval": "1h",
                    "limit": 1,
                },
            )
            if data is None:
                return None
            return self._parse_orderbook_levels(
                data, symbol, range_pct=float(range_pct),
            )
        except Exception as exc:
            logger.error(
                "collect_orderbook_history_failed",
                symbol=symbol, error=str(exc),
            )
            return None

    # ----------------------------------------------------------
    # Coin Aggregated Orderbook Bid&Ask(±range) (Standard+ 套餐)
    # ----------------------------------------------------------

    async def collect_aggregated_orderbook_history(
        self, symbol: str, range_pct: str = "1",
    ) -> list[OrderBookLevel] | None:
        """调用 /api/futures/aggregated-orderbook/history 采集聚合订单簿。"""
        tier = await self._tier_manager.get_current_tier()
        if not self._tier_manager.is_endpoint_available(
            tier, "futures-aggregated-orderbook-history",
        ):
            logger.info(
                "aggregated_orderbook_history_skipped",
                symbol=symbol,
                tier=tier.value,
                reason="endpoint not available for current tier",
            )
            return None
        try:
            data = await self._client.get(
                path="/api/futures/aggregated-orderbook/history",
                endpoint="futures-aggregated-orderbook-history",
                params={"symbol": symbol, "range": range_pct},
            )
            if data is None:
                return None
            return self._parse_orderbook_levels(
                data, symbol, range_pct=float(range_pct),
                source="coinglass-aggregated",
            )
        except Exception as exc:
            logger.error(
                "collect_aggregated_orderbook_history_failed",
                symbol=symbol, error=str(exc),
            )
            return None

    # ----------------------------------------------------------
    # Orderbook Heatmap (Standard+ 套餐)
    # ----------------------------------------------------------

    async def collect_orderbook_heatmap(
        self, symbol: str,
    ) -> list[dict] | None:
        """调用 /api/futures/orderbook/heatmap 采集订单簿热力图。

        返回原始字典列表（结构因 API 版本而异）。
        """
        tier = await self._tier_manager.get_current_tier()
        if not self._tier_manager.is_endpoint_available(
            tier, "orderbook-heatmap",
        ):
            logger.info(
                "orderbook_heatmap_skipped",
                symbol=symbol,
                tier=tier.value,
                reason="endpoint not available for current tier",
            )
            return None
        try:
            data = await self._client.get(
                path="/api/futures/orderbook/heatmap",
                endpoint="orderbook-heatmap",
                params={"symbol": symbol},
            )
            if data is None:
                return None
            items = data if isinstance(data, list) else data.get("data", [])
            return items if isinstance(items, list) else []
        except Exception as exc:
            logger.error(
                "collect_orderbook_heatmap_failed",
                symbol=symbol, error=str(exc),
            )
            return None

    # ----------------------------------------------------------
    # Large Open Orders (Standard+ 套餐)
    # ----------------------------------------------------------

    async def collect_large_orders(
        self, symbol: str,
    ) -> list[LargeOrder] | None:
        """调用 /api/futures/orderbook/large 采集大单挂单。"""
        tier = await self._tier_manager.get_current_tier()
        if not self._tier_manager.is_endpoint_available(tier, "large-orderbook"):
            logger.info(
                "large_orders_skipped",
                symbol=symbol,
                tier=tier.value,
                reason="endpoint not available for current tier",
            )
            return None
        try:
            data = await self._client.get(
                path="/api/futures/orderbook/large-limit-order",
                endpoint="large-orderbook",
                params={"exchange": "Binance", "symbol": normalize_pair_symbol(symbol)},
            )
            if data is None:
                return None
            return self._parse_large_orders(data, symbol)
        except Exception as exc:
            logger.error(
                "collect_large_orders_failed",
                symbol=symbol, error=str(exc),
            )
            return None

    # ----------------------------------------------------------
    # Large Open Orders History (Standard+ 套餐)
    # ----------------------------------------------------------

    async def collect_large_orders_history(
        self, symbol: str,
    ) -> list[LargeOrder] | None:
        """调用 /api/futures/orderbook/large-history 采集大单挂单历史。"""
        tier = await self._tier_manager.get_current_tier()
        if not self._tier_manager.is_endpoint_available(
            tier, "large-orderbook-history",
        ):
            logger.info(
                "large_orders_history_skipped",
                symbol=symbol,
                tier=tier.value,
                reason="endpoint not available for current tier",
            )
            return None
        try:
            now_ms = int(datetime.now(tz=timezone.utc).timestamp() * 1000)
            data = await self._client.get(
                path="/api/futures/orderbook/large-limit-order-history",
                endpoint="large-orderbook-history",
                params={
                    "exchange": "Binance",
                    "symbol": normalize_pair_symbol(symbol),
                    "start_time": now_ms - 3600 * 1000,
                    "end_time": now_ms,
                    "state": 2,
                },
            )
            if data is None:
                return None
            return self._parse_large_orders(data, symbol)
        except Exception as exc:
            logger.error(
                "collect_large_orders_history_failed",
                symbol=symbol, error=str(exc),
            )
            return None

    # ----------------------------------------------------------
    # Redis 缓存
    # ----------------------------------------------------------

    async def cache_orderbook(
        self, symbol: str, levels: list[OrderBookLevel],
    ) -> None:
        """缓存最新订单簿数据到 Redis。"""
        if not levels:
            return
        try:
            await set_with_ttl(
                f"cg_orderbook:{symbol}",
                [l.model_dump(mode="json") for l in levels[-50:]],
                ttl_seconds=_OB_CACHE_TTL,
            )
        except Exception as exc:
            logger.error("cache_orderbook_failed", symbol=symbol, error=str(exc))

    async def cache_large_orders(
        self, symbol: str, orders: list[LargeOrder],
    ) -> None:
        """缓存大单挂单到 Redis。"""
        if not orders:
            return
        try:
            await set_with_ttl(
                f"cg_large_orders:{symbol}",
                [o.model_dump(mode="json") for o in orders[:50]],
                ttl_seconds=_OB_CACHE_TTL,
            )
        except Exception as exc:
            logger.error("cache_large_orders_failed", symbol=symbol, error=str(exc))

    # ----------------------------------------------------------
    # 解析辅助方法
    # ----------------------------------------------------------

    def _parse_orderbook_levels(
        self,
        data: dict | list,
        symbol: str,
        range_pct: float = 1.0,
        source: str = "coinglass",
    ) -> list[OrderBookLevel]:
        """防御性解析订单簿 Bid/Ask 分布 API 响应。"""
        results: list[OrderBookLevel] = []
        try:
            items = data if isinstance(data, list) else data.get("data", [])
            if not isinstance(items, list):
                items = [items] if items else []
            for item in items:
                if isinstance(item, list) and len(item) >= 3:
                    ts = self._to_datetime(item[0])
                    bid_levels = item[1] if isinstance(item[1], list) else []
                    ask_levels = item[2] if isinstance(item[2], list) else []
                    bid = sum(
                        self._safe_float(level[1]) or 0.0
                        for level in bid_levels
                        if isinstance(level, list) and len(level) >= 2
                    )
                    ask = sum(
                        self._safe_float(level[1]) or 0.0
                        for level in ask_levels
                        if isinstance(level, list) and len(level) >= 2
                    )
                    if bid <= 0 and ask <= 0:
                        continue
                    ratio: float | None = None
                    if ask > 0:
                        ratio = round(bid / ask, 4)
                    results.append(OrderBookLevel(
                        ts=ts,
                        symbol=symbol,
                        exchange="Binance",
                        bid_amount=bid,
                        ask_amount=ask,
                        bid_ask_ratio=ratio,
                        range_pct=range_pct,
                        source=source,
                    ))
                    continue
                if not isinstance(item, dict):
                    continue
                ts_raw = item.get("t") or item.get("time") or item.get("createTime")
                if ts_raw is None:
                    continue
                ts = self._to_datetime(ts_raw)
                bid = self._safe_float(
                    item.get("bidAmount") or item.get("bid") or item.get("bidUsd"),
                )
                ask = self._safe_float(
                    item.get("askAmount") or item.get("ask") or item.get("askUsd"),
                )
                if bid is None or ask is None:
                    continue
                ratio: float | None = None
                if ask > 0:
                    ratio = round(bid / ask, 4)
                results.append(OrderBookLevel(
                    ts=ts,
                    symbol=symbol,
                    exchange=item.get("exchangeName") or item.get("exchange"),
                    bid_amount=bid,
                    ask_amount=ask,
                    bid_ask_ratio=ratio,
                    range_pct=range_pct,
                    source=source,
                ))
        except Exception as exc:
            logger.error("parse_orderbook_levels_failed", error=str(exc))
        return results

    def _parse_large_orders(
        self,
        data: dict | list,
        symbol: str,
    ) -> list[LargeOrder]:
        """防御性解析大单挂单 API 响应。"""
        results: list[LargeOrder] = []
        try:
            items = data if isinstance(data, list) else data.get("data", [])
            if not isinstance(items, list):
                items = [items] if items else []
            for item in items:
                if not isinstance(item, dict):
                    continue
                ts_raw = (
                    item.get("t")
                    or item.get("time")
                    or item.get("createTime")
                    or item.get("current_time")
                    or item.get("order_end_time")
                    or item.get("start_time")
                )
                ts = self._to_datetime(ts_raw) if ts_raw else datetime.now(tz=timezone.utc)
                exchange = item.get("exchangeName") or item.get("exchange") or item.get("exchange_name") or "unknown"
                side = item.get("side") or item.get("direction") or item.get("order_side") or "unknown"
                if isinstance(side, (int, float)):
                    side = {1: "buy", 2: "sell"}.get(int(side), "unknown")
                elif isinstance(side, str):
                    side = side.lower()
                    if side.isdigit():
                        side = {"1": "buy", "2": "sell"}.get(side, side)
                price = self._safe_float(item.get("price") or item.get("limit_price"))
                amount = self._safe_float(
                    item.get("amount")
                    or item.get("qty")
                    or item.get("quantity")
                    or item.get("current_quantity")
                    or item.get("start_quantity")
                    or item.get("executed_volume"),
                )
                if price is None or amount is None:
                    continue
                usd_val = self._safe_float(
                    item.get("usdValue")
                    or item.get("usd_value")
                    or item.get("volUsd")
                    or item.get("current_usd_value")
                    or item.get("start_usd_value")
                    or item.get("executed_usd_value"),
                )
                if usd_val is None:
                    usd_val = price * amount
                results.append(LargeOrder(
                    ts=ts,
                    symbol=symbol,
                    exchange=exchange,
                    side=side,
                    price=price,
                    amount=amount,
                    usd_value=usd_val,
                ))
        except Exception as exc:
            logger.error("parse_large_orders_failed", error=str(exc))
        return results

    # ----------------------------------------------------------
    # 工具方法
    # ----------------------------------------------------------

    @staticmethod
    def _safe_float(value: object) -> float | None:
        if value is None:
            return None
        try:
            return float(value)
        except (ValueError, TypeError):
            return None

    @staticmethod
    def _to_datetime(value: object) -> datetime:
        if isinstance(value, (int, float)):
            ts = value / 1000 if value > 1e12 else value
            return datetime.fromtimestamp(ts, tz=timezone.utc)
        if isinstance(value, str):
            return datetime.fromisoformat(value.replace("Z", "+00:00"))
        return datetime.now(tz=timezone.utc)
