"""FRED 宏观数据采集器 — 将 API observations 映射为 MacroSnapshot 并缓存。

Redis 缓存键：
- fred_macro:{capability_key}  — 单个 series 最新值
- fred_snapshot                — 聚合宏观快照
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any

from app.core.redis import set_with_ttl
from app.data.fred_client import FredClient, SERIES_WHITELIST

logger = logging.getLogger(__name__)

_CACHE_TTL = 43200  # 12小时（2x 采集间隔，容忍一次完整周期失败）


class FredCollector:
    """FRED 宏观数据采集器。"""

    def __init__(self, client: FredClient | None = None) -> None:
        self._client = client or FredClient()

    async def collect_all_series(self) -> dict[str, dict[str, Any]]:
        """采集所有白名单 series，返回 capability_key → {date, value, series_id} 映射。"""
        results: dict[str, dict[str, Any]] = {}

        for cap_key, meta in SERIES_WHITELIST.items():
            try:
                obs = await self._client.fetch_latest_observation(meta["series_id"])
                if obs and obs.get("value") and obs["value"] != ".":
                    results[cap_key] = {
                        "series_id": meta["series_id"],
                        "label": meta["label"],
                        "frequency": meta["frequency"],
                        "date": obs["date"],
                        "value": float(obs["value"]),
                        "collected_at": datetime.now(timezone.utc).isoformat(),
                    }
                else:
                    results[cap_key] = None
            except Exception as exc:
                logger.warning("fred_collect_error", extra={"cap_key": cap_key, "error": str(exc)})
                results[cap_key] = None

        return results

    async def collect_and_cache(self) -> dict[str, Any]:
        """采集所有 series + 写入 Redis 缓存。"""
        all_data = await self.collect_all_series()

        # 逐个 series 缓存
        for cap_key, data in all_data.items():
            if data is not None:
                await set_with_ttl(f"fred_macro:{cap_key}", data, _CACHE_TTL)

        # 聚合快照
        ok_count = sum(1 for v in all_data.values() if v is not None)
        snapshot = {
            "source_id": "fred",
            "collected_at": datetime.now(timezone.utc).isoformat(),
            "capabilities": {k: v for k, v in all_data.items() if v is not None},
            "missing_capabilities": [k for k, v in all_data.items() if v is None],
            "ok_count": ok_count,
            "total_count": len(all_data),
        }
        await set_with_ttl("fred_snapshot", snapshot, _CACHE_TTL)

        logger.info("fred_snapshot_cached", extra={"ok": ok_count, "total": len(all_data)})
        return snapshot

    async def close(self) -> None:
        await self._client.close()
