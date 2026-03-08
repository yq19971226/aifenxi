"""CryptoQuant 链上数据采集器 — 将 API 原始数据映射为系统 OnchainSnapshot 并缓存。

采集策略：
- 按币种逐个采集（BTC、ETH 首阶段）
- 每个币种按优先级采集各指标
- 结果写入 Redis 缓存
- 20 req/min 节流由 CryptoQuantClient 内部管理

Redis 缓存键：
- cq_onchain:{symbol}   — CryptoQuant 主源快照
- onchain:{symbol}      — 兼容旧键（过渡期同步写入）
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any

from app.core.redis import set_with_ttl
from app.data.cryptoquant_client import (
    CryptoQuantClient,
    METRIC_REGISTRY,
    SYMBOL_TO_ASSET,
)
from app.models.market_data import OnchainSnapshot

logger = logging.getLogger(__name__)

_CACHE_TTL = 3600  # 1小时（日线数据，TTL 可以长一些）


def _extract_value(response: dict[str, Any] | None, value_key: str) -> float | None:
    """从 CryptoQuant API 响应中提取最新数值。

    官方响应格式：
    {"status": {"code": 200}, "result": {"window": "day", "data": [{"date": "...", "<value_key>": 123.45}]}}
    """
    if response is None:
        return None
    try:
        data_list = response.get("result", {}).get("data", [])
        if not data_list:
            return None
        latest = data_list[0]  # limit=1 时只有一条，最新在前
        value = latest.get(value_key)
        if value is not None:
            return float(value)
    except (KeyError, IndexError, TypeError, ValueError) as exc:
        logger.warning("cq_extract_value_failed", extra={"key": value_key, "error": str(exc)})
    return None


class CryptoQuantCollector:
    """CryptoQuant 链上数据采集器。"""

    def __init__(self, client: CryptoQuantClient | None = None) -> None:
        self._client = client or CryptoQuantClient()

    async def collect_for_symbol(self, symbol: str) -> dict[str, float | None]:
        """为单个币种采集所有适用指标，返回 capability_key → value 映射。"""
        asset = SYMBOL_TO_ASSET.get(symbol.upper())
        if asset is None:
            logger.info("cq_symbol_not_supported", extra={"symbol": symbol})
            return {}

        results: dict[str, float | None] = {}
        sorted_metrics = sorted(METRIC_REGISTRY.items(), key=lambda x: x[1]["priority"])

        for metric_key, meta in sorted_metrics:
            if asset not in meta["assets"]:
                continue
            try:
                raw = await self._client.fetch_metric(asset, metric_key)
                value = _extract_value(raw, meta["value_key"])
                results[metric_key] = value
            except Exception as exc:
                logger.warning("cq_metric_error", extra={"symbol": symbol, "metric": metric_key, "error": str(exc)})
                results[metric_key] = None

        return results

    async def collect_and_cache(self, symbol: str) -> OnchainSnapshot:
        """采集 + 映射到 OnchainSnapshot + 写入 Redis 缓存。"""
        metrics = await self.collect_for_symbol(symbol)

        snapshot = OnchainSnapshot(
            time=datetime.now(timezone.utc),
            symbol=symbol.upper(),
            exchange_netflow=metrics.get("exchange_netflow"),
            exchange_balance=metrics.get("exchange_reserve"),
            mvrv=metrics.get("mvrv"),
            active_addresses=int(metrics["active_addresses"]) if metrics.get("active_addresses") is not None else None,
            miner_reserve_change=metrics.get("miner_reserve"),
        )

        # 写入 CryptoQuant 主源缓存
        cache_key = f"cq_onchain:{symbol.upper()}"
        cache_data = snapshot.model_dump(mode="json")
        cache_data["_source"] = "cryptoquant"
        cache_data["_metrics_count"] = sum(1 for v in metrics.values() if v is not None)
        await set_with_ttl(cache_key, cache_data, _CACHE_TTL)

        # 同时写入旧兼容键（过渡期）
        legacy_key = f"onchain:{symbol.upper()}"
        await set_with_ttl(legacy_key, snapshot.model_dump(mode="json"), _CACHE_TTL)

        ok_count = sum(1 for v in metrics.values() if v is not None)
        logger.info(
            "cq_snapshot_cached",
            extra={"symbol": symbol, "ok": ok_count, "total": len(metrics)},
        )
        return snapshot

    async def close(self) -> None:
        await self._client.close()
