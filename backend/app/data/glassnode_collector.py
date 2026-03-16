"""Glassnode 数据采集器 — 将 T3 指标映射为 OnchainSnapshot 并缓存到 Redis。

Redis 缓存键：
- gn_onchain:{symbol}       — 主快照（高频+中频指标聚合）
- gn_tier:{tier}:{symbol}   — 分层原始数据
- gn_snapshot                — 全局采集状态快照
- onchain:{symbol}          — 兼容键（供 OnchainAgent 读取）

采集频率:
- high  (15min): SOPR, aSOPR, 交易所净流量/余额, 活跃地址, MVRV
- mid   (1h):    NUPL, EA-MVRV, LTH/STH-SOPR, 积累评分, 净已实现盈亏, 新地址, 交易所流入
- low   (6h):    LTH/STH-NUPL, SSR, HODLer变化, Reserve Risk, Puell, Liveliness, NVT Signal
- daily (24h):   Hash Ribbon, Difficulty Ribbon, S2F, Pi Cycle, RHODL, 盈利地址%, Velocity, F&G
"""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone
from typing import Any

from app.core.redis import set_with_ttl, get_json
from app.services.glassnode import (
    GlassNodeClient,
    METRIC_REGISTRY,
    SYMBOL_TO_ASSET,
)
from app.models.market_data import OnchainSnapshot

logger = logging.getLogger(__name__)

# 缓存 TTL（秒）
_TTL_HIGH = 900       # 15 分钟
_TTL_MID = 3600       # 1 小时
_TTL_LOW = 21600      # 6 小时
_TTL_DAILY = 86400    # 24 小时
_TTL_SNAPSHOT = 600   # 10 分钟 (全局状态)

_TIER_TTL: dict[str, int] = {
    "high": _TTL_HIGH,
    "mid": _TTL_MID,
    "low": _TTL_LOW,
    "daily": _TTL_DAILY,
}


async def _get_enabled_symbols() -> list[str]:
    """从后台币种管理获取已启用的币种列表。"""
    try:
        from app.services.config_service import get_config_value
        symbols_raw = await get_config_value("monitor_symbols", "BTCUSDT,ETHUSDT")
        symbols = [s.strip().upper() for s in symbols_raw.split(",") if s.strip()]
        return symbols if symbols else ["BTCUSDT", "ETHUSDT"]
    except Exception:
        return ["BTCUSDT", "ETHUSDT"]


class GlassnodeCollector:
    """Glassnode T3 数据采集器。"""

    def __init__(self, client: GlassNodeClient | None = None) -> None:
        self._client = client or GlassNodeClient()

    async def collect_tier(
        self,
        tier: str,
        symbol: str,
    ) -> dict[str, float | None]:
        """采集指定频率层的所有指标。

        Args:
            tier: "high", "mid", "low", "daily"
            symbol: Binance 交易对 (如 "BTCUSDT")

        Returns:
            {metric_key: value, ...}
        """
        asset = GlassNodeClient.resolve_asset(symbol)
        if not asset:
            logger.warning("gn_unsupported_symbol", extra={"symbol": symbol})
            return {}

        results = await self._client.fetch_tier_metrics(tier, asset)
        ok_count = sum(1 for v in results.values() if v is not None)

        logger.info("gn_tier_collected", extra={
            "tier": tier,
            "symbol": symbol,
            "asset": asset,
            "ok": ok_count,
            "total": len(results),
        })

        # 写入分层缓存
        cache_data = {
            "symbol": symbol,
            "asset": asset,
            "tier": tier,
            "metrics": results,
            "collected_at": datetime.now(timezone.utc).isoformat(),
        }
        ttl = _TIER_TTL.get(tier, _TTL_MID)
        await set_with_ttl(f"gn_tier:{tier}:{symbol.upper()}", cache_data, ttl)

        return results

    async def collect_high_for_all(self) -> dict[str, dict[str, float | None]]:
        """为所有启用币种采集高频指标。"""
        symbols = await _get_enabled_symbols()
        all_results: dict[str, dict] = {}
        for symbol in symbols:
            results = await self.collect_tier("high", symbol)
            all_results[symbol] = results
        return all_results

    async def collect_mid_for_all(self) -> dict[str, dict[str, float | None]]:
        """为所有启用币种采集中频指标。"""
        symbols = await _get_enabled_symbols()
        all_results: dict[str, dict] = {}
        for symbol in symbols:
            results = await self.collect_tier("mid", symbol)
            all_results[symbol] = results
        return all_results

    async def collect_low_for_all(self) -> dict[str, dict[str, float | None]]:
        """为所有启用币种采集低频指标。"""
        symbols = await _get_enabled_symbols()
        all_results: dict[str, dict] = {}
        for symbol in symbols:
            results = await self.collect_tier("low", symbol)
            all_results[symbol] = results
        return all_results

    async def collect_daily_for_all(self) -> dict[str, dict[str, float | None]]:
        """为所有启用币种采集日频指标。"""
        symbols = await _get_enabled_symbols()
        all_results: dict[str, dict] = {}
        for symbol in symbols:
            results = await self.collect_tier("daily", symbol)
            all_results[symbol] = results
        return all_results

    async def build_onchain_snapshot(self, symbol: str) -> OnchainSnapshot | None:
        """聚合所有缓存的分层数据，构建 OnchainSnapshot。

        从 Redis 读取各层缓存数据合并，不触发新的 API 调用。
        """
        merged: dict[str, float | None] = {}

        # 从各层缓存读取
        for tier in ("high", "mid", "low", "daily"):
            tier_data = await get_json(f"gn_tier:{tier}:{symbol.upper()}")
            if tier_data and isinstance(tier_data, dict):
                metrics = tier_data.get("metrics", {})
                merged.update(metrics)

        # 补充 Alternative.me 恐慌贪婪指数（legacy_onchain 由旧 onchain_collector 写入）
        legacy = await get_json(f"legacy_onchain:{symbol.upper()}")
        if legacy and isinstance(legacy, dict):
            fg = legacy.get("fear_greed_index")
            if fg is not None and merged.get("fear_greed") is None:
                merged["fear_greed"] = fg

        # 补充 CryptoQuant 的矿工储备（GlassNode 不提供）
        cq = await get_json(f"cq_onchain:{symbol.upper()}")
        if cq and isinstance(cq, dict):
            mr = cq.get("miner_reserve_change")
            if mr is not None:
                merged["miner_reserve_change"] = mr

        if not merged:
            return None

        def _safe_float(val) -> float | None:
            """安全转换为 float — 处理 dict / list / None。"""
            if val is None:
                return None
            if isinstance(val, (int, float)):
                return float(val)
            if isinstance(val, dict):
                # 某些 GlassNode 指标返回 {"o": {...}} 结构，取第一个数值
                for v in val.values():
                    if isinstance(v, (int, float)):
                        return float(v)
                return None
            try:
                return float(val)
            except (ValueError, TypeError):
                return None

        def _safe_int(val) -> int | None:
            if val is None:
                return None
            try:
                return int(float(val))
            except (ValueError, TypeError):
                return None

        try:
            snapshot = OnchainSnapshot(
                time=datetime.now(timezone.utc),
                symbol=symbol.upper(),
                exchange_netflow=_safe_float(merged.get("exchange_netflow")),
                exchange_balance=_safe_float(merged.get("exchange_balance")),
                mvrv=_safe_float(merged.get("mvrv")),
                active_addresses=_safe_int(merged.get("active_addresses")),
                new_addresses=_safe_int(merged.get("new_addresses")),
                fear_greed_index=_safe_int(merged.get("fear_greed")),
                miner_reserve_change=_safe_float(merged.get("miner_reserve_change")),
                # ── T3 新增字段 ──
                nupl=_safe_float(merged.get("nupl")),
                sopr=_safe_float(merged.get("sopr")),
                asopr=_safe_float(merged.get("asopr")),
                lth_sopr=_safe_float(merged.get("lth_sopr")),
                sth_sopr=_safe_float(merged.get("sth_sopr")),
                lth_nupl=_safe_float(merged.get("lth_nupl")),
                sth_nupl=_safe_float(merged.get("sth_nupl")),
                puell_multiple=_safe_float(merged.get("puell_multiple")),
                reserve_risk=_safe_float(merged.get("reserve_risk")),
                accumulation_score=_safe_float(merged.get("accumulation_score")),
                hodler_net_change=_safe_float(merged.get("hodler_net_change")),
                net_realized_pl=_safe_float(merged.get("net_realized_pl")),
                ssr=_safe_float(merged.get("ssr")),
                addresses_in_profit_pct=_safe_float(merged.get("addresses_in_profit_pct")),
                hash_ribbon=_safe_float(merged.get("hash_ribbon")),
                mvrv_entity_adj=_safe_float(merged.get("mvrv_entity_adj")),
                nvt_signal=_safe_float(merged.get("nvt_signal")),
                liveliness=_safe_float(merged.get("liveliness")),
                rhodl_ratio=_safe_float(merged.get("rhodl_ratio")),
                exchange_inflow=_safe_float(merged.get("exchange_inflow")),
            )
        except Exception as exc:
            logger.error("gn_snapshot_build_failed", extra={
                "symbol": symbol,
                "error": str(exc),
                "merged_keys": list(merged.keys()),
                "sample_values": {k: type(v).__name__ for k, v in list(merged.items())[:5]},
            })
            return None

        # 写入兼容缓存键（供 OnchainAgent 读取）
        cache_data = snapshot.model_dump(mode="json")
        cache_data["_source"] = "glassnode"
        cache_data["_metrics_count"] = sum(1 for v in merged.values() if v is not None)
        await set_with_ttl(f"gn_onchain:{symbol.upper()}", cache_data, _TTL_HIGH * 2)
        await set_with_ttl(f"onchain:{symbol.upper()}", cache_data, _TTL_HIGH * 2)

        logger.info("gn_snapshot_built", extra={
            "symbol": symbol,
            "metrics_ok": cache_data["_metrics_count"],
        })
        return snapshot

    async def build_all_snapshots(self) -> dict[str, OnchainSnapshot | None]:
        """为所有启用币种构建快照（不触发 API 调用，仅聚合缓存）。"""
        symbols = await _get_enabled_symbols()
        results: dict[str, OnchainSnapshot | None] = {}
        for symbol in symbols:
            results[symbol] = await self.build_onchain_snapshot(symbol)
        return results

    async def close(self) -> None:
        await self._client.close()
