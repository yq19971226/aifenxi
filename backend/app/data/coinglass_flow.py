"""CVD（累计成交量差）与期货净流入/流出采集 — 采集、解析、缓存。

数据层模块，负责通过 CoinGlassClient 采集 CVD 和 NetFlow 数据，
缓存到 Redis。按套餐等级门控端点访问。
"""

from __future__ import annotations

from datetime import datetime, timezone

import structlog

from app.core.redis import set_with_ttl
from app.data.coinglass_client import (
    CoinGlassClient,
    normalize_coin_symbol,
    normalize_compact_interval,
    normalize_pair_symbol,
)
from app.data.coinglass_tier import TierManager
from app.models.coinglass import CVDSnapshot, NetFlowSnapshot

logger = structlog.get_logger(__name__)

_FLOW_CACHE_TTL = 600  # seconds (3.3x collection interval)


class FlowCollector:
    """CVD 与期货净流入/流出采集器。"""

    def __init__(
        self,
        client: CoinGlassClient,
        tier_manager: TierManager,
    ) -> None:
        self._client = client
        self._tier_manager = tier_manager

    # ----------------------------------------------------------
    # CVD 历史 (Standard+ 套餐)
    # ----------------------------------------------------------

    async def collect_cvd_history(
        self, symbol: str, interval: str = "1h",
    ) -> list[CVDSnapshot] | None:
        """调用 /api/futures/cvd/history 采集 CVD 历史。"""
        tier = await self._tier_manager.get_current_tier()
        if not self._tier_manager.is_endpoint_available(tier, "futures-cvd-history"):
            logger.info(
                "cvd_history_skipped",
                symbol=symbol,
                tier=tier.value,
                reason="endpoint not available for current tier",
            )
            return None
        try:
            data = await self._client.get(
                path="/api/futures/cvd/history",
                endpoint="futures-cvd-history",
                params={
                    "exchange": "Binance",
                    "symbol": normalize_pair_symbol(symbol),
                    "interval": interval,
                },
            )
            if data is None:
                return None
            return self._parse_cvd_snapshots(data, symbol, source="coinglass")
        except Exception as exc:
            logger.error("collect_cvd_history_failed", symbol=symbol, error=str(exc))
            return None

    # ----------------------------------------------------------
    # 聚合 CVD 历史 (Standard+ 套餐)
    # ----------------------------------------------------------

    async def collect_aggregated_cvd_history(
        self, symbol: str, interval: str = "1h",
    ) -> list[CVDSnapshot] | None:
        """调用 /api/futures/aggregated-cvd/history 采集聚合 CVD。"""
        tier = await self._tier_manager.get_current_tier()
        if not self._tier_manager.is_endpoint_available(
            tier, "futures-aggregated-cvd-history",
        ):
            logger.info(
                "aggregated_cvd_history_skipped",
                symbol=symbol,
                tier=tier.value,
                reason="endpoint not available for current tier",
            )
            return None
        try:
            data = await self._client.get(
                path="/api/futures/aggregated-cvd/history",
                endpoint="futures-aggregated-cvd-history",
                params={
                    "exchange_list": "Binance",
                    "symbol": normalize_coin_symbol(symbol),
                    "interval": interval,
                },
            )
            if data is None:
                return None
            return self._parse_cvd_snapshots(data, symbol, source="coinglass-aggregated")
        except Exception as exc:
            logger.error(
                "collect_aggregated_cvd_history_failed",
                symbol=symbol, error=str(exc),
            )
            return None

    # ----------------------------------------------------------
    # Footprint 历史 (Standard+ 套餐, 90天)
    # ----------------------------------------------------------

    async def collect_footprint_history(
        self, symbol: str, interval: str = "1h",
    ) -> list[CVDSnapshot] | None:
        """调用 /api/futures/footprint/history（90天 Footprint 图表数据）。"""
        tier = await self._tier_manager.get_current_tier()
        if not self._tier_manager.is_endpoint_available(
            tier, "futures-footprint",
        ):
            logger.info(
                "footprint_history_skipped",
                symbol=symbol,
                tier=tier.value,
                reason="endpoint not available for current tier",
            )
            return None
        try:
            data = await self._client.get(
                path="/api/futures/footprint/history",
                endpoint="futures-footprint",
                params={
                    "symbol": normalize_coin_symbol(symbol),
                    "interval": normalize_compact_interval(interval),
                },
            )
            if data is None:
                return None
            return self._parse_cvd_snapshots(data, symbol, source="coinglass-footprint")
        except Exception as exc:
            logger.error(
                "collect_footprint_history_failed",
                symbol=symbol, error=str(exc),
            )
            return None

    # ----------------------------------------------------------
    # 期货净流入/流出 (Standard+ 套餐)
    # ----------------------------------------------------------

    async def collect_netflow(
        self, symbol: str,
    ) -> list[NetFlowSnapshot] | None:
        """调用 /api/futures/netflow/list 采集期货资金净流入/流出。"""
        tier = await self._tier_manager.get_current_tier()
        if not self._tier_manager.is_endpoint_available(tier, "futures-netflow-list"):
            logger.info(
                "netflow_skipped",
                symbol=symbol,
                tier=tier.value,
                reason="endpoint not available for current tier",
            )
            return None
        try:
            data = await self._client.get(
                path="/api/futures/netflow-list",
                endpoint="futures-netflow-list",
                params={"per_page": 200},
            )
            if data is None:
                return None
            return self._parse_netflow_snapshots(data, symbol)
        except Exception as exc:
            logger.error("collect_netflow_failed", symbol=symbol, error=str(exc))
            return None

    # ----------------------------------------------------------
    # Redis 缓存
    # ----------------------------------------------------------

    async def cache_cvd(
        self, symbol: str, snapshots: list[CVDSnapshot],
    ) -> None:
        """缓存最新 CVD 快照到 Redis。"""
        if not snapshots:
            return
        try:
            await set_with_ttl(
                f"cg_cvd:{symbol}",
                [s.model_dump(mode="json") for s in snapshots[-20:]],
                ttl_seconds=_FLOW_CACHE_TTL,
            )
        except Exception as exc:
            logger.error("cache_cvd_failed", symbol=symbol, error=str(exc))

    async def cache_netflow(
        self, symbol: str, snapshots: list[NetFlowSnapshot],
    ) -> None:
        """缓存最新 NetFlow 快照到 Redis。"""
        if not snapshots:
            return
        try:
            await set_with_ttl(
                f"cg_netflow:{symbol}",
                [s.model_dump(mode="json") for s in snapshots[-20:]],
                ttl_seconds=_FLOW_CACHE_TTL,
            )
        except Exception as exc:
            logger.error("cache_netflow_failed", symbol=symbol, error=str(exc))

    # ----------------------------------------------------------
    # 解析辅助方法
    # ----------------------------------------------------------

    def _parse_cvd_snapshots(
        self,
        data: dict | list,
        symbol: str,
        source: str = "coinglass",
    ) -> list[CVDSnapshot]:
        """防御性解析 CVD API 响应。"""
        results: list[CVDSnapshot] = []
        try:
            items = data if isinstance(data, list) else data.get("data", [])
            if not isinstance(items, list):
                items = [items] if items else []
            for item in items:
                if not isinstance(item, dict):
                    continue
                ts_raw = item.get("t") or item.get("time") or item.get("createTime")
                if ts_raw is None:
                    continue
                ts = self._to_datetime(ts_raw)
                cvd = self._safe_float(
                    item.get("cvd")
                    or item.get("cumulativeDelta")
                    or item.get("delta")
                    or item.get("cum_vol_delta"),
                )
                if cvd is None:
                    continue
                results.append(CVDSnapshot(
                    ts=ts,
                    symbol=symbol,
                    cvd=cvd,
                    buy_volume=self._safe_float(
                        item.get("buyVolume")
                        or item.get("buy")
                        or item.get("agg_taker_buy_vol")
                        or item.get("taker_buy_volume_usd"),
                    ),
                    sell_volume=self._safe_float(
                        item.get("sellVolume")
                        or item.get("sell")
                        or item.get("agg_taker_sell_vol")
                        or item.get("taker_sell_volume_usd"),
                    ),
                    source=source,
                ))
        except Exception as exc:
            logger.error("parse_cvd_snapshots_failed", error=str(exc))
        return results

    def _parse_netflow_snapshots(
        self,
        data: dict | list,
        symbol: str,
    ) -> list[NetFlowSnapshot]:
        """防御性解析期货净流入/流出 API 响应。"""
        results: list[NetFlowSnapshot] = []
        try:
            items = data if isinstance(data, list) else data.get("data", [])
            if not isinstance(items, list):
                items = [items] if items else []
            target_symbol = normalize_coin_symbol(symbol)
            for item in items:
                if not isinstance(item, dict):
                    continue
                item_symbol = item.get("symbol") or item.get("coin") or item.get("baseCoin") or item.get("asset")
                if item_symbol and normalize_coin_symbol(str(item_symbol)) != target_symbol:
                    continue
                ts_raw = item.get("t") or item.get("time") or item.get("createTime")
                ts = self._to_datetime(ts_raw) if ts_raw is not None else datetime.now(tz=timezone.utc)
                timeframe_fields = [
                    ("5m", "net_flow_usd_5m"),
                    ("15m", "net_flow_usd_15m"),
                    ("30m", "net_flow_usd_30m"),
                    ("1h", "net_flow_usd_1h"),
                    ("2h", "net_flow_usd_2h"),
                    ("4h", "net_flow_usd_4h"),
                    ("6h", "net_flow_usd_6h"),
                    ("8h", "net_flow_usd_8h"),
                    ("12h", "net_flow_usd_12h"),
                    ("24h", "net_flow_usd_24h"),
                ]
                matched_timeframes = False
                for timeframe, field_name in timeframe_fields:
                    if field_name not in item:
                        continue
                    matched_timeframes = True
                    net = self._safe_float(item.get(field_name))
                    inflow = self._safe_float(item.get(f"taker_buy_volume_usd_{timeframe}"))
                    outflow = self._safe_float(item.get(f"taker_sell_volume_usd_{timeframe}"))
                    if net is None:
                        continue
                    results.append(NetFlowSnapshot(
                        ts=ts,
                        symbol=symbol,
                        net_flow=net,
                        inflow=inflow,
                        outflow=outflow,
                        source=f"coinglass-{timeframe}",
                    ))
                if matched_timeframes:
                    continue
                net = self._safe_float(
                    item.get("netFlow") or item.get("net_flow") or item.get("netflow"),
                )
                if net is None:
                    # 尝试从 inflow - outflow 计算
                    inflow = self._safe_float(item.get("inflow") or item.get("inflowUsd"))
                    outflow = self._safe_float(item.get("outflow") or item.get("outflowUsd"))
                    if inflow is not None and outflow is not None:
                        net = inflow - outflow
                    else:
                        continue
                else:
                    inflow = self._safe_float(item.get("inflow") or item.get("inflowUsd"))
                    outflow = self._safe_float(item.get("outflow") or item.get("outflowUsd"))
                results.append(NetFlowSnapshot(
                    ts=ts,
                    symbol=symbol,
                    net_flow=net,
                    inflow=inflow,
                    outflow=outflow,
                    source="coinglass",
                ))
        except Exception as exc:
            logger.error("parse_netflow_snapshots_failed", error=str(exc))
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
