"""期权数据采集 — Max Pain、期权概览、交易所 OI 历史。

数据层模块，负责通过 CoinGlassClient 采集期权相关数据，
缓存到 Redis。Standard+ 套餐可用。
"""

from __future__ import annotations

from datetime import datetime, timezone

import structlog

from app.core.redis import set_with_ttl
from app.data.coinglass_client import CoinGlassClient, normalize_coin_symbol
from app.data.coinglass_tier import TierManager
from app.models.coinglass import OptionInfo, OptionMaxPain

logger = structlog.get_logger(__name__)

_OPTIONS_CACHE_TTL = 600  # seconds


class OptionsCollector:
    """期权数据采集器。"""

    def __init__(
        self,
        client: CoinGlassClient,
        tier_manager: TierManager,
    ) -> None:
        self._client = client
        self._tier_manager = tier_manager

    # ----------------------------------------------------------
    # Option Max Pain (Standard+ 套餐)
    # ----------------------------------------------------------

    async def collect_max_pain(
        self, symbol: str,
    ) -> OptionMaxPain | None:
        """调用 /api/option/max-pain 采集期权最大痛点。"""
        tier = await self._tier_manager.get_current_tier()
        if not self._tier_manager.is_endpoint_available(tier, "option-max-pain"):
            logger.info(
                "option_max_pain_skipped",
                symbol=symbol,
                tier=tier.value,
                reason="endpoint not available for current tier",
            )
            return None
        try:
            data = await self._client.get(
                path="/api/option/max-pain",
                endpoint="option-max-pain",
                params={"symbol": normalize_coin_symbol(symbol), "exchange": "Deribit"},
            )
            if data is None:
                return None
            return self._parse_max_pain(data, symbol)
        except Exception as exc:
            logger.error(
                "collect_max_pain_failed", symbol=symbol, error=str(exc),
            )
            return None

    # ----------------------------------------------------------
    # Options Info (Standard+ 套餐)
    # ----------------------------------------------------------

    async def collect_options_info(
        self, symbol: str,
    ) -> OptionInfo | None:
        """调用 /api/option/info 采集期权概览。"""
        tier = await self._tier_manager.get_current_tier()
        if not self._tier_manager.is_endpoint_available(tier, "option-info"):
            logger.info(
                "option_info_skipped",
                symbol=symbol,
                tier=tier.value,
                reason="endpoint not available for current tier",
            )
            return None
        try:
            data = await self._client.get(
                path="/api/option/info",
                endpoint="option-info",
                params={"symbol": normalize_coin_symbol(symbol)},
            )
            if data is None:
                return None
            return self._parse_options_info(data, symbol)
        except Exception as exc:
            logger.error(
                "collect_options_info_failed", symbol=symbol, error=str(exc),
            )
            return None

    # ----------------------------------------------------------
    # Exchange OI History (Standard+ 套餐)
    # ----------------------------------------------------------

    async def collect_exchange_oi_history(
        self, symbol: str, interval: str = "1h",
    ) -> list[dict] | None:
        """调用 /api/option/exchange-open-interest-history。

        返回原始字典列表。
        """
        tier = await self._tier_manager.get_current_tier()
        if not self._tier_manager.is_endpoint_available(
            tier, "option-exchange-open-interest-history",
        ):
            logger.info(
                "option_exchange_oi_skipped",
                symbol=symbol,
                tier=tier.value,
                reason="endpoint not available for current tier",
            )
            return None
        try:
            data = await self._client.get(
                path="/api/option/exchange-open-interest-history",
                endpoint="option-exchange-open-interest-history",
                params={"symbol": normalize_coin_symbol(symbol), "interval": interval},
            )
            if data is None:
                return None
            items = data if isinstance(data, list) else data.get("data", [])
            return items if isinstance(items, list) else []
        except Exception as exc:
            logger.error(
                "collect_option_exchange_oi_failed",
                symbol=symbol, error=str(exc),
            )
            return None

    # ----------------------------------------------------------
    # Redis 缓存
    # ----------------------------------------------------------

    async def cache_max_pain(
        self, symbol: str, mp: OptionMaxPain,
    ) -> None:
        """缓存期权 Max Pain 到 Redis。"""
        try:
            await set_with_ttl(
                f"cg_option_maxpain:{symbol}",
                mp.model_dump(mode="json"),
                ttl_seconds=_OPTIONS_CACHE_TTL,
            )
        except Exception as exc:
            logger.error("cache_max_pain_failed", symbol=symbol, error=str(exc))

    async def cache_options_info(
        self, symbol: str, info: OptionInfo,
    ) -> None:
        """缓存期权概览到 Redis。"""
        try:
            await set_with_ttl(
                f"cg_option_info:{symbol}",
                info.model_dump(mode="json"),
                ttl_seconds=_OPTIONS_CACHE_TTL,
            )
        except Exception as exc:
            logger.error("cache_options_info_failed", symbol=symbol, error=str(exc))

    # ----------------------------------------------------------
    # 解析辅助方法
    # ----------------------------------------------------------

    def _parse_max_pain(
        self, data: dict | list, symbol: str,
    ) -> OptionMaxPain | None:
        """防御性解析期权 Max Pain API 响应。"""
        try:
            item = data
            if isinstance(data, list):
                if not data:
                    return None
                item = data[0]
            elif isinstance(data, dict) and "data" in data:
                inner = data["data"]
                if isinstance(inner, list):
                    if not inner:
                        return None
                    item = inner[0]
                else:
                    item = inner

            if not isinstance(item, dict):
                return None

            ts_raw = item.get("t") or item.get("time") or item.get("createTime")
            ts = self._to_datetime(ts_raw) if ts_raw else datetime.now(tz=timezone.utc)

            max_pain = self._safe_float(
                item.get("maxPain") or item.get("max_pain") or item.get("maxPainPrice"),
            )
            if max_pain is None:
                return None

            return OptionMaxPain(
                symbol=symbol,
                ts=ts,
                max_pain_price=max_pain,
                call_oi=self._safe_float(item.get("callOI") or item.get("callOpenInterest")),
                put_oi=self._safe_float(item.get("putOI") or item.get("putOpenInterest")),
            )
        except Exception as exc:
            logger.error("parse_max_pain_failed", error=str(exc))
            return None

    def _parse_options_info(
        self, data: dict | list, symbol: str,
    ) -> OptionInfo | None:
        """防御性解析期权概览 API 响应。"""
        try:
            item = data
            if isinstance(data, list):
                if not data:
                    return None
                item = data[0]
            elif isinstance(data, dict) and "data" in data:
                inner = data["data"]
                if isinstance(inner, list):
                    if not inner:
                        return None
                    item = inner[0]
                else:
                    item = inner

            if not isinstance(item, dict):
                return None

            ts_raw = item.get("t") or item.get("time") or item.get("createTime")
            ts = self._to_datetime(ts_raw) if ts_raw else datetime.now(tz=timezone.utc)

            return OptionInfo(
                symbol=symbol,
                ts=ts,
                total_oi=self._safe_float(
                    item.get("totalOI") or item.get("openInterest"),
                ),
                total_volume=self._safe_float(
                    item.get("totalVolume") or item.get("volume"),
                ),
                put_call_ratio=self._safe_float(
                    item.get("putCallRatio") or item.get("pcRatio"),
                ),
            )
        except Exception as exc:
            logger.error("parse_options_info_failed", error=str(exc))
            return None

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
