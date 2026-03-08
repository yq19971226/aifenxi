"""爆仓热力图采集 — 采集、解析、存储、缓存。

数据层模块，负责通过 CoinGlassClient 采集爆仓热力图数据，
写入 TimescaleDB、缓存到 Redis。按套餐等级门控端点访问。
"""

from __future__ import annotations

from datetime import datetime, timezone

import sqlalchemy
import structlog
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.redis import set_with_ttl
from app.data.coinglass_client import CoinGlassClient
from app.data.coinglass_tier import TierManager
from app.models.coinglass import (
    BasicLiquidationData,
    LiquidationCoinData,
    LiquidationExchangeData,
    LiquidationRecord,
    LiquidationZone,
)

logger = structlog.get_logger(__name__)

_HEATMAP_CACHE_TTL = 600  # seconds


class HeatmapCollector:
    """爆仓热力图采集 — 采集、解析、存储、缓存。"""

    def __init__(
        self,
        client: CoinGlassClient,
        tier_manager: TierManager,
        session: AsyncSession,
    ) -> None:
        self._client = client
        self._tier_manager = tier_manager
        self._session = session

    # ----------------------------------------------------------
    # Heatmap Model1 (Startup+ 套餐)
    # ----------------------------------------------------------

    async def collect_heatmap_model1(
        self, symbol: str,
    ) -> list[LiquidationZone] | None:
        """调用 /api/futures/liquidation/heatmap (model1)（Startup+ 套餐）。"""
        tier = await self._tier_manager.get_current_tier()
        if not self._tier_manager.is_endpoint_available(tier, "liquidation-heatmap"):
            logger.info(
                "heatmap_model1_skipped",
                symbol=symbol,
                tier=tier.value,
                reason="endpoint not available for current tier",
            )
            return None
        try:
            data = await self._client.get(
                path="/api/futures/liquidation/heatmap",
                endpoint="liquidation-heatmap",
                params={"symbol": symbol},
            )
            if data is None:
                return None
            return self._parse_heatmap_zones(data, symbol, model="model1")
        except Exception as exc:
            logger.error("collect_heatmap_model1_failed", symbol=symbol, error=str(exc))
            return None

    # ----------------------------------------------------------
    # Heatmap Model2 (Standard+ 套餐)
    # ----------------------------------------------------------

    async def collect_heatmap_model2(
        self, symbol: str,
    ) -> list[LiquidationZone] | None:
        """调用 /api/futures/liquidation/heatmap-model2（Standard+ 套餐）。"""
        tier = await self._tier_manager.get_current_tier()
        if not self._tier_manager.is_endpoint_available(tier, "liquidation-heatmap-model2"):
            logger.info(
                "heatmap_model2_skipped",
                symbol=symbol,
                tier=tier.value,
                reason="endpoint not available for current tier",
            )
            return None
        try:
            data = await self._client.get(
                path="/api/futures/liquidation/heatmap-model2",
                endpoint="liquidation-heatmap-model2",
                params={"symbol": symbol},
            )
            if data is None:
                return None
            return self._parse_heatmap_zones(data, symbol, model="model2")
        except Exception as exc:
            logger.error("collect_heatmap_model2_failed", symbol=symbol, error=str(exc))
            return None

    # ----------------------------------------------------------
    # Heatmap Model3 (Standard+ 套餐)
    # ----------------------------------------------------------

    async def collect_heatmap_model3(
        self, symbol: str,
    ) -> list[LiquidationZone] | None:
        """调用 /api/futures/liquidation/heatmap-model3（Standard+ 套餐）。"""
        tier = await self._tier_manager.get_current_tier()
        if not self._tier_manager.is_endpoint_available(tier, "liquidation-heatmap-model3"):
            logger.info(
                "heatmap_model3_skipped",
                symbol=symbol,
                tier=tier.value,
                reason="endpoint not available for current tier",
            )
            return None
        try:
            data = await self._client.get(
                path="/api/futures/liquidation/heatmap-model3",
                endpoint="liquidation-heatmap-model3",
                params={"symbol": symbol},
            )
            if data is None:
                return None
            return self._parse_heatmap_zones(data, symbol, model="model3")
        except Exception as exc:
            logger.error("collect_heatmap_model3_failed", symbol=symbol, error=str(exc))
            return None

    # ----------------------------------------------------------
    # Liquidation History (所有套餐)
    # ----------------------------------------------------------

    async def collect_liquidation_history(
        self, symbol: str,
    ) -> list[BasicLiquidationData] | None:
        """调用 /api/futures/liquidation/history 采集历史爆仓数据。"""
        try:
            data = await self._client.get(
                path="/api/futures/liquidation/history",
                endpoint="liquidation-history",
                params={"symbol": symbol},
            )
            if data is None:
                return None
            return self._parse_basic_liquidation_list(data, symbol)
        except Exception as exc:
            logger.error(
                "collect_liquidation_history_failed", symbol=symbol, error=str(exc),
            )
            return None

    # ----------------------------------------------------------
    # Liquidation Order (Standard+ 套餐)
    # ----------------------------------------------------------

    async def collect_liquidation_order(
        self, symbol: str,
    ) -> list[LiquidationRecord] | None:
        """调用 /api/futures/liquidation/order（Standard+ 套餐）— 爆仓订单明细。"""
        tier = await self._tier_manager.get_current_tier()
        if not self._tier_manager.is_endpoint_available(tier, "liquidation-order"):
            logger.info(
                "liquidation_order_skipped",
                symbol=symbol,
                tier=tier.value,
                reason="endpoint not available for current tier",
            )
            return None
        try:
            data = await self._client.get(
                path="/api/futures/liquidation/order",
                endpoint="liquidation-order",
                params={"symbol": symbol},
            )
            if data is None:
                return None
            return self._parse_liquidation_records(data, symbol)
        except Exception as exc:
            logger.error(
                "collect_liquidation_order_failed", symbol=symbol, error=str(exc),
            )
            return None

    # ----------------------------------------------------------
    # Liquidation Max Pain (Standard+ 套餐)
    # ----------------------------------------------------------

    async def collect_liquidation_max_pain(
        self, symbol: str,
    ) -> dict | None:
        """调用 /api/futures/liquidation/max-pain（Standard+ 套餐）— 清算最大痛点。

        返回原始 dict（结构因 API 版本而异）。
        """
        tier = await self._tier_manager.get_current_tier()
        if not self._tier_manager.is_endpoint_available(tier, "liquidation-max-pain"):
            logger.info(
                "liquidation_max_pain_skipped",
                symbol=symbol,
                tier=tier.value,
                reason="endpoint not available for current tier",
            )
            return None
        try:
            data = await self._client.get(
                path="/api/futures/liquidation/max-pain",
                endpoint="liquidation-max-pain",
                params={"symbol": symbol},
            )
            if data is None:
                return None
            # 返回原始 dict
            if isinstance(data, dict):
                return data
            return {"data": data}
        except Exception as exc:
            logger.error(
                "collect_liquidation_max_pain_failed", symbol=symbol, error=str(exc),
            )
            return None

    # ----------------------------------------------------------
    # Basic Liquidation (Hobbyist: 爆仓总量/分多空/分交易所)
    # ----------------------------------------------------------

    async def collect_basic_liquidation(
        self, symbol: str,
    ) -> BasicLiquidationData | None:
        """Hobbyist 套餐：采集爆仓总量(24h)、分多空基础数据。

        使用 V4 可用的 liquidation/coin-list 端点。
        """
        tier = await self._tier_manager.get_current_tier()
        if not self._tier_manager.is_endpoint_available(tier, "liquidation-coin-list"):
            logger.debug("basic_liquidation_skipped", symbol=symbol, tier=tier.value)
            return None
        try:
            data = await self._client.get(
                path="/api/futures/liquidation/coin-list",
                endpoint="liquidation-coin-list",
                params={},
            )
            if data is None:
                return None
            return self._parse_basic_liquidation(data, symbol)
        except Exception as exc:
            logger.error(
                "collect_basic_liquidation_failed", symbol=symbol, error=str(exc),
            )
            return None

    # ----------------------------------------------------------
    # Liquidation Coin List (所有套餐)
    # ----------------------------------------------------------

    async def collect_liquidation_coin_list(
        self,
    ) -> list[LiquidationCoinData] | None:
        """调用 /api/futures/liquidation/coin-list 采集爆仓分币种列表。"""
        try:
            data = await self._client.get(
                path="/api/futures/liquidation/coin-list",
                endpoint="liquidation-coin-list",
                params={},
            )
            if data is None:
                return None
            return self._parse_liquidation_coin_list(data)
        except Exception as exc:
            logger.error("collect_liquidation_coin_list_failed", error=str(exc))
            return None

    # ----------------------------------------------------------
    # Liquidation Exchange List (所有套餐)
    # ----------------------------------------------------------

    async def collect_liquidation_exchange_list(
        self, symbol: str,
    ) -> list[LiquidationExchangeData] | None:
        """调用 /api/futures/liquidation/exchange-list 采集爆仓分交易所列表。"""
        try:
            data = await self._client.get(
                path="/api/futures/liquidation/exchange-list",
                endpoint="liquidation-exchange-list",
                params={"symbol": symbol, "range": "12h"},
            )
            if data is None:
                return None
            return self._parse_liquidation_exchange_list(data)
        except Exception as exc:
            logger.error(
                "collect_liquidation_exchange_list_failed",
                symbol=symbol, error=str(exc),
            )
            return None

    # ----------------------------------------------------------
    # DB 写入
    # ----------------------------------------------------------

    async def write_heatmap(self, zones: list[LiquidationZone]) -> None:
        """将爆仓密集区数据批量写入 TimescaleDB liquidation_heatmap 表。"""
        if not zones:
            return
        sql = """
            INSERT INTO liquidation_heatmap (
                ts, symbol, price_low, price_high,
                estimated_liq_usd, model, side
            ) VALUES (
                :ts, :symbol, :price_low, :price_high,
                :liq_usd, :model, :side
            )
        """
        try:
            for zone in zones:
                await self._session.execute(
                    sqlalchemy.text(sql),
                    {
                        "ts": zone.ts,
                        "symbol": zone.symbol,
                        "price_low": zone.price_low,
                        "price_high": zone.price_high,
                        "liq_usd": zone.estimated_liq_usd,
                        "model": zone.model,
                        "side": zone.side,
                    },
                )
            await self._session.commit()
        except Exception as exc:
            logger.error(
                "write_heatmap_failed",
                count=len(zones),
                error=str(exc),
            )
            raise

    # ----------------------------------------------------------
    # Redis 缓存
    # ----------------------------------------------------------

    async def cache_latest(
        self, symbol: str, zones: list[LiquidationZone],
    ) -> None:
        """缓存最新爆仓密集区到 Redis，TTL=600s。"""
        if not zones:
            return
        try:
            await set_with_ttl(
                f"liq_heatmap:{symbol}",
                [z.model_dump(mode="json") for z in zones],
                ttl_seconds=_HEATMAP_CACHE_TTL,
            )
        except Exception as exc:
            logger.error(
                "cache_heatmap_latest_failed", symbol=symbol, error=str(exc),
            )

    async def cache_basic_liquidation(
        self, symbol: str, data: BasicLiquidationData,
    ) -> None:
        """缓存爆仓基础数据到 Redis，TTL=600s。"""
        if not data:
            return
        try:
            await set_with_ttl(
                f"cg_liquidation:{symbol}",
                data.model_dump(mode="json"),
                ttl_seconds=_HEATMAP_CACHE_TTL,
            )
        except Exception as exc:
            logger.error(
                "cache_basic_liquidation_failed", symbol=symbol, error=str(exc),
            )

    # ----------------------------------------------------------
    # 解析辅助方法
    # ----------------------------------------------------------

    def _parse_heatmap_zones(
        self,
        data: dict | list,
        symbol: str,
        model: str,
    ) -> list[LiquidationZone]:
        """防御性解析 CoinGlass 热力图 API 响应为 LiquidationZone 列表。

        CoinGlass 热力图响应通常包含 data 数组，每项含：
        - priceLow / priceHigh 或 price（单价时取 price±delta）
        - liqUsd / estimatedLiqUsd：预估爆仓量
        - side: "long" 或 "short"
        """
        results: list[LiquidationZone] = []
        try:
            items = data if isinstance(data, list) else data.get("data", [])
            if not isinstance(items, list):
                items = [items] if items else []
            for item in items:
                if not isinstance(item, dict):
                    continue
                try:
                    ts_raw = item.get("t") or item.get("time") or item.get("createTime")
                    ts = self._to_datetime(ts_raw) if ts_raw else datetime.now(tz=timezone.utc)

                    price_low = self._safe_float(
                        item.get("priceLow") or item.get("price_low"),
                    )
                    price_high = self._safe_float(
                        item.get("priceHigh") or item.get("price_high"),
                    )

                    # 如果只有单个 price，构造一个小区间
                    if price_low is None and price_high is None:
                        single_price = self._safe_float(item.get("price"))
                        if single_price is not None and single_price > 0:
                            delta = single_price * 0.001  # 0.1% 区间
                            price_low = single_price - delta
                            price_high = single_price + delta

                    if price_low is None or price_high is None:
                        continue

                    # 确保 price_low < price_high
                    if price_low >= price_high:
                        price_low, price_high = price_high, price_low
                        if price_low == price_high:
                            continue

                    liq_usd = self._safe_float(
                        item.get("liqUsd")
                        or item.get("estimatedLiqUsd")
                        or item.get("estimated_liq_usd")
                        or item.get("vol"),
                    )
                    if liq_usd is None or liq_usd < 0:
                        continue

                    side = item.get("side") or item.get("direction")
                    if isinstance(side, str):
                        side = side.lower()
                    if side not in ("long", "short"):
                        side = None

                    results.append(LiquidationZone(
                        ts=ts,
                        symbol=symbol,
                        price_low=price_low,
                        price_high=price_high,
                        estimated_liq_usd=liq_usd,
                        model=model,
                        side=side,
                    ))
                except Exception:
                    # 跳过无法解析的单条记录
                    continue
        except Exception as exc:
            logger.error("parse_heatmap_zones_failed", error=str(exc))
        return results

    def _parse_basic_liquidation_list(
        self,
        data: dict | list,
        symbol: str,
    ) -> list[BasicLiquidationData]:
        """防御性解析历史爆仓数据为 BasicLiquidationData 列表。"""
        results: list[BasicLiquidationData] = []
        try:
            items = data if isinstance(data, list) else data.get("data", [])
            if not isinstance(items, list):
                items = [items] if items else []
            for item in items:
                if not isinstance(item, dict):
                    continue
                try:
                    ts_raw = item.get("t") or item.get("time") or item.get("createTime")
                    ts = self._to_datetime(ts_raw) if ts_raw else datetime.now(tz=timezone.utc)

                    total = self._safe_float(
                        item.get("totalLiqUsd")
                        or item.get("total_liq_usd")
                        or item.get("volUsd"),
                    )
                    long_liq = self._safe_float(
                        item.get("longLiqUsd")
                        or item.get("long_liq_usd")
                        or item.get("buyVolUsd"),
                    )
                    short_liq = self._safe_float(
                        item.get("shortLiqUsd")
                        or item.get("short_liq_usd")
                        or item.get("sellVolUsd"),
                    )

                    if total is None:
                        # 尝试从 long + short 计算
                        if long_liq is not None and short_liq is not None:
                            total = long_liq + short_liq
                        else:
                            continue

                    results.append(BasicLiquidationData(
                        symbol=symbol,
                        ts=ts,
                        total_liq_usd=total,
                        long_liq_usd=long_liq or 0.0,
                        short_liq_usd=short_liq or 0.0,
                    ))
                except Exception:
                    continue
        except Exception as exc:
            logger.error("parse_basic_liquidation_list_failed", error=str(exc))
        return results

    def _parse_basic_liquidation(
        self,
        data: dict | list,
        symbol: str,
    ) -> BasicLiquidationData | None:
        """防御性解析 coin-list / 聚合爆仓数据为 BasicLiquidationData。

        V4 coin-list 返回列表，每项包含 symbol + liquidation_usd_24h 等字段。
        """
        try:
            # 提取 data 内层
            items = data
            if isinstance(data, dict) and "data" in data:
                items = data["data"]

            # 从列表中按 symbol 筛选
            if isinstance(items, list):
                if not items:
                    return None
                # symbol 可能是 "ETHUSDT" → 匹配 "ETH"
                base = symbol.replace("USDT", "").replace("USD", "")
                item = None
                for entry in items:
                    if isinstance(entry, dict) and entry.get("symbol", "").upper() == base:
                        item = entry
                        break
                if item is None:
                    logger.debug("basic_liq_symbol_not_found", symbol=symbol, base=base)
                    return None
            elif isinstance(items, dict):
                item = items
            else:
                return None

            ts = datetime.now(tz=timezone.utc)

            # V4 字段: liquidation_usd_24h / long_liquidation_usd_24h / short_liquidation_usd_24h
            total = self._safe_float(
                item.get("liquidation_usd_24h")
                or item.get("totalLiqUsd")
                or item.get("total_liq_usd")
                or item.get("volUsd"),
            )
            long_liq = self._safe_float(
                item.get("long_liquidation_usd_24h")
                or item.get("longLiqUsd")
                or item.get("long_liq_usd")
                or item.get("buyVolUsd"),
            )
            short_liq = self._safe_float(
                item.get("short_liquidation_usd_24h")
                or item.get("shortLiqUsd")
                or item.get("short_liq_usd")
                or item.get("sellVolUsd"),
            )

            if total is None:
                if long_liq is not None and short_liq is not None:
                    total = long_liq + short_liq
                else:
                    return None

            return BasicLiquidationData(
                symbol=symbol,
                ts=ts,
                total_liq_usd=total,
                long_liq_usd=long_liq or 0.0,
                short_liq_usd=short_liq or 0.0,
            )
        except Exception as exc:
            logger.error("parse_basic_liquidation_failed", error=str(exc))
            return None

    def _parse_liquidation_records(
        self,
        data: dict | list,
        symbol: str,
    ) -> list[LiquidationRecord]:
        """防御性解析爆仓订单明细为 LiquidationRecord 列表。"""
        results: list[LiquidationRecord] = []
        try:
            items = data if isinstance(data, list) else data.get("data", [])
            if not isinstance(items, list):
                items = [items] if items else []
            for item in items:
                if not isinstance(item, dict):
                    continue
                try:
                    ts_raw = item.get("t") or item.get("time") or item.get("createTime")
                    ts = self._to_datetime(ts_raw) if ts_raw else datetime.now(tz=timezone.utc)

                    exchange = item.get("exchangeName") or item.get("exchange") or "unknown"
                    side = item.get("side") or item.get("direction") or "unknown"
                    if isinstance(side, str):
                        side = side.lower()

                    price = self._safe_float(item.get("price"))
                    quantity = self._safe_float(
                        item.get("quantity") or item.get("qty") or item.get("amount"),
                    )
                    usd_value = self._safe_float(
                        item.get("usdValue")
                        or item.get("usd_value")
                        or item.get("volUsd"),
                    )

                    if price is None or quantity is None:
                        continue

                    # 如果没有 usd_value，用 price * quantity 估算
                    if usd_value is None:
                        usd_value = price * quantity

                    results.append(LiquidationRecord(
                        symbol=symbol,
                        ts=ts,
                        exchange=exchange,
                        side=side,
                        price=price,
                        quantity=quantity,
                        usd_value=usd_value,
                    ))
                except Exception:
                    continue
        except Exception as exc:
            logger.error("parse_liquidation_records_failed", error=str(exc))
        return results

    def _parse_liquidation_coin_list(
        self, data: dict | list,
    ) -> list[LiquidationCoinData]:
        """防御性解析爆仓分币种列表 API 响应。"""
        results: list[LiquidationCoinData] = []
        try:
            items = data if isinstance(data, list) else data.get("data", [])
            if not isinstance(items, list):
                items = [items] if items else []
            for item in items:
                if not isinstance(item, dict):
                    continue
                symbol = item.get("symbol") or item.get("coin")
                total = self._safe_float(
                    item.get("totalLiqUsd") or item.get("total_liq_usd") or item.get("volUsd"),
                )
                if not symbol or total is None:
                    continue
                results.append(LiquidationCoinData(
                    symbol=symbol,
                    total_liq_usd=total,
                    long_liq_usd=self._safe_float(
                        item.get("longLiqUsd") or item.get("buyVolUsd"),
                    ),
                    short_liq_usd=self._safe_float(
                        item.get("shortLiqUsd") or item.get("sellVolUsd"),
                    ),
                ))
        except Exception as exc:
            logger.error("parse_liquidation_coin_list_failed", error=str(exc))
        return results

    def _parse_liquidation_exchange_list(
        self, data: dict | list,
    ) -> list[LiquidationExchangeData]:
        """防御性解析爆仓分交易所列表 API 响应。"""
        results: list[LiquidationExchangeData] = []
        try:
            items = data if isinstance(data, list) else data.get("data", [])
            if not isinstance(items, list):
                items = [items] if items else []
            for item in items:
                if not isinstance(item, dict):
                    continue
                exchange = item.get("exchangeName") or item.get("exchange")
                total = self._safe_float(
                    item.get("totalLiqUsd") or item.get("total_liq_usd") or item.get("volUsd"),
                )
                if not exchange or total is None:
                    continue
                results.append(LiquidationExchangeData(
                    exchange=exchange,
                    total_liq_usd=total,
                    long_liq_usd=self._safe_float(
                        item.get("longLiqUsd") or item.get("buyVolUsd"),
                    ),
                    short_liq_usd=self._safe_float(
                        item.get("shortLiqUsd") or item.get("sellVolUsd"),
                    ),
                ))
        except Exception as exc:
            logger.error("parse_liquidation_exchange_list_failed", error=str(exc))
        return results

    # ----------------------------------------------------------
    # 工具方法
    # ----------------------------------------------------------

    @staticmethod
    def _safe_float(value: object) -> float | None:
        """安全转换为 float，失败返回 None。"""
        if value is None:
            return None
        try:
            return float(value)
        except (ValueError, TypeError):
            return None

    @staticmethod
    def _to_datetime(value: object) -> datetime:
        """将时间戳（秒或毫秒）或 ISO 字符串转为 datetime。"""
        if isinstance(value, (int, float)):
            ts = value / 1000 if value > 1e12 else value
            return datetime.fromtimestamp(ts, tz=timezone.utc)
        if isinstance(value, str):
            return datetime.fromisoformat(value.replace("Z", "+00:00"))
        return datetime.now(tz=timezone.utc)
