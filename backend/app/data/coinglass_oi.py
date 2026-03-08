"""OI 采集与监控 — 采集、存储、缓存、突增检测、多空比与资金费率。

数据层模块，负责通过 CoinGlassClient 采集持仓量数据，
写入 TimescaleDB、缓存到 Redis、检测 OI 突增并发布事件。
同时支持全网/大户多空比、持仓加权/成交量加权资金费率、资金费率套利采集。
"""

from __future__ import annotations

from datetime import datetime, timezone

import sqlalchemy
import structlog
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.redis import get_json, publish_stream, set_with_ttl
from app.data.coinglass_client import (
    CoinGlassClient,
    normalize_coin_symbol,
    normalize_compact_interval,
    normalize_pair_symbol,
)
from app.data.coinglass_tier import TierManager
from app.models.coinglass import (
    FundingRateExchangeData,
    FundingRateSnapshot,
    NetPositionSnapshot,
    OIExchangeData,
    OISnapshot,
    OISurgeEvent,
    TopLongShortRatio,
    WeightedFundingRate,
)

logger = structlog.get_logger(__name__)

_OI_CACHE_TTL = 600  # seconds (3.3x collection interval)


class OIMonitor:
    """OI 采集与监控 — 采集、存储、缓存、突增检测。"""

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
    # OI OHLC 历史 (所有套餐)
    # ----------------------------------------------------------

    async def collect_oi_ohlc(
        self, symbol: str, interval: str = "1h",
    ) -> list[OISnapshot] | None:
        """采集 OI OHLC 历史。注：V4 API 已移除此端点。"""
        tier = await self._tier_manager.get_current_tier()
        if not self._tier_manager.is_endpoint_available(tier, "oi-ohlc-history"):
            logger.debug("oi_ohlc_skipped", symbol=symbol, tier=tier.value,
                         reason="endpoint not available for current tier")
            return None
        try:
            params = {
                "exchange": "Binance",
                "symbol": normalize_pair_symbol(symbol),
                "interval": interval,
            }
            data = await self._client.get(
                path="/api/futures/open-interest/history",
                endpoint="oi-ohlc-history",
                params=params,
            )
            if data is None:
                return None
            return self._parse_oi_snapshots(data, symbol)
        except Exception as exc:
            logger.error("collect_oi_ohlc_failed", symbol=symbol, error=str(exc))
            return None

    # ----------------------------------------------------------
    # OI 聚合历史 (所有套餐)
    # ----------------------------------------------------------

    async def collect_oi_aggregated(
        self, symbol: str,
    ) -> list[OISnapshot] | None:
        """采集聚合 OI。注：V4 API 已移除此端点。"""
        tier = await self._tier_manager.get_current_tier()
        if not self._tier_manager.is_endpoint_available(tier, "oi-ohlc-aggregated-history"):
            logger.debug("oi_aggregated_skipped", symbol=symbol, tier=tier.value,
                         reason="endpoint not available for current tier")
            return None
        try:
            data = await self._client.get(
                path="/api/futures/open-interest/aggregated-history",
                endpoint="oi-ohlc-aggregated-history",
                params={
                    "symbol": normalize_coin_symbol(symbol),
                    "interval": "1d",
                },
            )
            if data is None:
                return None
            return self._parse_oi_snapshots(data, symbol)
        except Exception as exc:
            logger.error("collect_oi_aggregated_failed", symbol=symbol, error=str(exc))
            return None

    # ----------------------------------------------------------
    # OI 分交易所 (所有套餐)
    # ----------------------------------------------------------

    async def collect_oi_exchange_list(
        self, symbol: str,
    ) -> list[OIExchangeData] | None:
        """采集分交易所 OI。注：V4 API 已移除此端点。"""
        tier = await self._tier_manager.get_current_tier()
        if not self._tier_manager.is_endpoint_available(tier, "oi-exchange-list"):
            logger.debug("oi_exchange_list_skipped", symbol=symbol, tier=tier.value,
                         reason="endpoint not available for current tier")
            return None
        try:
            data = await self._client.get(
                path="/api/futures/open-interest/exchange-list",
                endpoint="oi-exchange-list",
                params={"symbol": normalize_coin_symbol(symbol)},
            )
            if data is None:
                return None
            return self._parse_exchange_list(data)
        except Exception as exc:
            logger.error(
                "collect_oi_exchange_list_failed", symbol=symbol, error=str(exc),
            )
            return None

    # ----------------------------------------------------------
    # 净持仓 (Startup+ 套餐)
    # ----------------------------------------------------------

    async def collect_net_position(
        self, symbol: str,
    ) -> list[NetPositionSnapshot] | None:
        """调用 /api/futures/openInterest/net-position（Startup+ 套餐）。"""
        tier = await self._tier_manager.get_current_tier()
        if not self._tier_manager.is_endpoint_available(tier, "net-position"):
            logger.info(
                "net_position_skipped",
                symbol=symbol,
                tier=tier.value,
                reason="endpoint not available for current tier",
            )
            return None
        try:
            data = await self._client.get(
                path="/api/futures/net-position/history",
                endpoint="net-position",
                params={
                    "exchange": "Binance",
                    "symbol": normalize_pair_symbol(symbol),
                    "interval": "1h",
                },
            )
            if data is None:
                return None
            return self._parse_net_position(data, symbol)
        except Exception as exc:
            logger.error("collect_net_position_failed", symbol=symbol, error=str(exc))
            return None

    async def collect_net_position_v2(
        self, symbol: str,
    ) -> list[NetPositionSnapshot] | None:
        """调用 /api/futures/openInterest/net-position-v2（Startup+ 套餐）。"""
        tier = await self._tier_manager.get_current_tier()
        if not self._tier_manager.is_endpoint_available(tier, "net-position-v2"):
            logger.info(
                "net_position_v2_skipped",
                symbol=symbol,
                tier=tier.value,
                reason="endpoint not available for current tier",
            )
            return None
        try:
            data = await self._client.get(
                path="/api/futures/v2/net-position/history",
                endpoint="net-position-v2",
                params={
                    "exchange": "Binance",
                    "symbol": normalize_pair_symbol(symbol),
                    "interval": normalize_compact_interval("1h"),
                },
            )
            if data is None:
                return None
            return self._parse_net_position(data, symbol)
        except Exception as exc:
            logger.error(
                "collect_net_position_v2_failed", symbol=symbol, error=str(exc),
            )
            return None

    # ----------------------------------------------------------
    # 稳定币/币本位保证金 OI (Standard+ 套餐)
    # ----------------------------------------------------------

    async def collect_oi_stablecoin_margin(
        self, symbol: str,
    ) -> list[OISnapshot] | None:
        """调用聚合稳定币保证金 OI 历史（Standard+ 套餐）。"""
        tier = await self._tier_manager.get_current_tier()
        if not self._tier_manager.is_endpoint_available(
            tier, "oi-ohlc-aggregated-stablecoin-margin-history",
        ):
            logger.info(
                "oi_stablecoin_margin_skipped",
                symbol=symbol,
                tier=tier.value,
                reason="endpoint not available for current tier",
            )
            return None
        try:
            data = await self._client.get(
                path="/api/futures/open-interest/aggregated-stablecoin-history",
                endpoint="oi-ohlc-aggregated-stablecoin-margin-history",
                params={
                    "exchange_list": "Binance",
                    "symbol": normalize_coin_symbol(symbol),
                    "interval": "1d",
                },
            )
            if data is None:
                return None
            return self._parse_oi_snapshots(data, symbol, source="coinglass-stablecoin")
        except Exception as exc:
            logger.error(
                "collect_oi_stablecoin_margin_failed", symbol=symbol, error=str(exc),
            )
            return None

    async def collect_oi_coin_margin(
        self, symbol: str,
    ) -> list[OISnapshot] | None:
        """调用聚合币本位保证金 OI 历史（Standard+ 套餐）。"""
        tier = await self._tier_manager.get_current_tier()
        if not self._tier_manager.is_endpoint_available(
            tier, "oi-ohlc-aggregated-coin-margin-history",
        ):
            logger.info(
                "oi_coin_margin_skipped",
                symbol=symbol,
                tier=tier.value,
                reason="endpoint not available for current tier",
            )
            return None
        try:
            data = await self._client.get(
                path="/api/futures/open-interest/aggregated-coin-margin-history",
                endpoint="oi-ohlc-aggregated-coin-margin-history",
                params={
                    "exchange_list": "Binance",
                    "symbol": normalize_coin_symbol(symbol),
                    "interval": "1d",
                },
            )
            if data is None:
                return None
            return self._parse_oi_snapshots(data, symbol, source="coinglass-coin")
        except Exception as exc:
            logger.error(
                "collect_oi_coin_margin_failed", symbol=symbol, error=str(exc),
            )
            return None

    # ----------------------------------------------------------
    # OI 突增检测
    # ----------------------------------------------------------

    async def detect_oi_surge(
        self, symbol: str, threshold_pct: float = 5.0,
    ) -> OISurgeEvent | None:
        """5 分钟窗口 OI 增幅检测，超阈值发布 oi_surge 事件到 Redis Streams。

        读取最近 2 条缓存快照，计算变化百分比。
        Hobbyist 套餐不支持 OI 变化率趋势分析，跳过检测。
        """
        tier = await self._tier_manager.get_current_tier()
        if not self._tier_manager.is_feature_enabled(tier, "basic_oi"):
            logger.info("detect_oi_surge_skipped", symbol=symbol, tier=tier.value)
            return None

        # Hobbyist 不支持 OI 变化率趋势分析
        if not self._tier_manager.is_feature_enabled(tier, "net_position"):
            logger.info(
                "detect_oi_surge_hobbyist_skip",
                symbol=symbol,
                tier=tier.value,
                reason="Hobbyist tier does not support OI surge detection",
            )
            return None

        try:
            cached = await get_json(f"cg_oi:{symbol}")
            snapshots: list[dict] | None = None

            if cached and isinstance(cached, list) and len(cached) >= 2:
                snapshots = cached
            else:
                # 从 DB 读取最近 2 条
                sql = """
                    SELECT ts, symbol, exchange, open_interest,
                           oi_change_1h, oi_change_4h, oi_change_24h, source
                    FROM oi_snapshots
                    WHERE symbol = :symbol
                    ORDER BY ts DESC
                    LIMIT 2
                """
                result = await self._session.execute(
                    sqlalchemy.text(sql), {"symbol": symbol},
                )
                rows = result.fetchall()
                if len(rows) >= 2:
                    snapshots = [
                        {
                            "ts": str(r[0]),
                            "symbol": r[1],
                            "exchange": r[2],
                            "open_interest": float(r[3]),
                            "oi_change_1h": float(r[4]) if r[4] is not None else None,
                            "oi_change_4h": float(r[5]) if r[5] is not None else None,
                            "oi_change_24h": float(r[6]) if r[6] is not None else None,
                            "source": r[7],
                        }
                        for r in rows
                    ]

            if not snapshots or len(snapshots) < 2:
                logger.info("detect_oi_surge_insufficient_data", symbol=symbol)
                return None

            # snapshots[0] = latest, snapshots[-1] = previous (from cache or DB)
            latest_oi = float(snapshots[0]["open_interest"])
            previous_oi = float(snapshots[-1]["open_interest"])

            if previous_oi <= 0:
                return None

            change_pct = abs(latest_oi - previous_oi) / previous_oi * 100

            if change_pct <= threshold_pct:
                return None

            now = datetime.now(tz=timezone.utc)
            event = OISurgeEvent(
                symbol=symbol,
                ts=now,
                oi_before=previous_oi,
                oi_after=latest_oi,
                change_pct=round(change_pct, 4),
                window_minutes=5,
            )

            # 发布到 Redis Streams
            try:
                await publish_stream("oi_surge", {
                    "symbol": event.symbol,
                    "change_pct": event.change_pct,
                    "oi_before": event.oi_before,
                    "oi_after": event.oi_after,
                })
            except Exception as pub_exc:
                logger.error(
                    "oi_surge_publish_failed",
                    symbol=symbol,
                    error=str(pub_exc),
                )

            return event

        except Exception as exc:
            logger.error("detect_oi_surge_failed", symbol=symbol, error=str(exc))
            return None

    # ----------------------------------------------------------
    # DB 写入
    # ----------------------------------------------------------

    async def write_snapshots(self, snapshots: list[OISnapshot]) -> None:
        """将 OI 快照批量写入 TimescaleDB oi_snapshots 表。"""
        if not snapshots:
            return
        sql = """
            INSERT INTO oi_snapshots (
                ts, symbol, exchange, open_interest,
                oi_change_1h, oi_change_4h, oi_change_24h, source
            ) VALUES (
                :ts, :symbol, :exchange, :oi,
                :change_1h, :change_4h, :change_24h, :source
            )
            ON CONFLICT(ts, symbol) DO UPDATE SET
                exchange = excluded.exchange,
                open_interest = excluded.open_interest,
                oi_change_1h = excluded.oi_change_1h,
                oi_change_4h = excluded.oi_change_4h,
                oi_change_24h = excluded.oi_change_24h,
                source = excluded.source
        """
        try:
            for snap in snapshots:
                await self._session.execute(
                    sqlalchemy.text(sql),
                    {
                        "ts": snap.ts,
                        "symbol": snap.symbol,
                        "exchange": snap.exchange,
                        "oi": snap.open_interest,
                        "change_1h": snap.oi_change_1h,
                        "change_4h": snap.oi_change_4h,
                        "change_24h": snap.oi_change_24h,
                        "source": snap.source,
                    },
                )
            await self._session.commit()
        except Exception as exc:
            logger.error(
                "write_snapshots_failed",
                count=len(snapshots),
                error=str(exc),
            )
            raise

    # ----------------------------------------------------------
    # Redis 缓存
    # ----------------------------------------------------------

    async def cache_latest(
        self, symbol: str, snapshots: list[OISnapshot],
    ) -> None:
        """缓存最新 OI 快照到 Redis，TTL=300s。"""
        if not snapshots:
            return
        try:
            await set_with_ttl(
                f"cg_oi:{symbol}",
                [s.model_dump(mode="json") for s in snapshots],
                ttl_seconds=_OI_CACHE_TTL,
            )
        except Exception as exc:
            logger.error(
                "cache_latest_failed", symbol=symbol, error=str(exc),
            )

    # ----------------------------------------------------------
    # 全网多空比 (所有套餐)
    # ----------------------------------------------------------

    async def collect_global_long_short_ratio(
        self, symbol: str, interval: str = "1h",
    ) -> list[TopLongShortRatio] | None:
        """采集全网多空比（Standard+ 套餐）。"""
        tier = await self._tier_manager.get_current_tier()
        if not self._tier_manager.is_endpoint_available(tier, "global-longshort-account-ratio"):
            logger.info("global_ls_ratio_skipped", symbol=symbol, tier=tier.value,
                        reason="endpoint not available for current tier")
            return None
        try:
            data = await self._client.get(
                path="/api/futures/global-long-short-account-ratio/history",
                endpoint="global-longshort-account-ratio",
                params={
                    "exchange": "Binance",
                    "symbol": normalize_pair_symbol(symbol),
                    "interval": normalize_compact_interval(interval),
                },
            )
            if data is None:
                return None
            return self._parse_long_short_ratio(
                data, symbol, data_type="account", default_exchange="global",
            )
        except Exception as exc:
            logger.error(
                "collect_global_long_short_ratio_failed",
                symbol=symbol,
                error=str(exc),
            )
            return None

    # ----------------------------------------------------------
    # 大户账户多空比 (Startup+ 套餐)
    # ----------------------------------------------------------

    async def collect_top_long_short_account_ratio(
        self, symbol: str, interval: str = "1h",
    ) -> list[TopLongShortRatio] | None:
        """调用 /api/futures/top-long-short-account-ratio（Startup+ 套餐）。"""
        tier = await self._tier_manager.get_current_tier()
        if not self._tier_manager.is_endpoint_available(
            tier, "top-longshort-account-ratio",
        ):
            logger.info(
                "top_ls_account_ratio_skipped",
                symbol=symbol,
                tier=tier.value,
                reason="endpoint not available for current tier",
            )
            return None
        try:
            data = await self._client.get(
                path="/api/futures/top-long-short-account-ratio/history",
                endpoint="top-longshort-account-ratio",
                params={
                    "exchange": "Binance",
                    "symbol": normalize_pair_symbol(symbol),
                    "interval": normalize_compact_interval(interval),
                },
            )
            if data is None:
                return None
            return self._parse_long_short_ratio(
                data, symbol, data_type="account", default_exchange="Binance",
            )
        except Exception as exc:
            logger.error(
                "collect_top_ls_account_ratio_failed",
                symbol=symbol,
                error=str(exc),
            )
            return None

    # ----------------------------------------------------------
    # 大户持仓多空比 (Startup+ 套餐)
    # ----------------------------------------------------------

    async def collect_top_long_short_position_ratio(
        self, symbol: str, interval: str = "1h",
    ) -> list[TopLongShortRatio] | None:
        """调用 /api/futures/top-long-short-position-ratio（Startup+ 套餐）。"""
        tier = await self._tier_manager.get_current_tier()
        if not self._tier_manager.is_endpoint_available(
            tier, "top-longshort-position-ratio",
        ):
            logger.info(
                "top_ls_position_ratio_skipped",
                symbol=symbol,
                tier=tier.value,
                reason="endpoint not available for current tier",
            )
            return None
        try:
            data = await self._client.get(
                path="/api/futures/top-long-short-position-ratio/history",
                endpoint="top-longshort-position-ratio",
                params={
                    "exchange": "Binance",
                    "symbol": normalize_pair_symbol(symbol),
                    "interval": normalize_compact_interval(interval),
                },
            )
            if data is None:
                return None
            return self._parse_long_short_ratio(
                data, symbol, data_type="position", default_exchange="Binance",
            )
        except Exception as exc:
            logger.error(
                "collect_top_ls_position_ratio_failed",
                symbol=symbol,
                error=str(exc),
            )
            return None

    # ----------------------------------------------------------
    # 持仓加权资金费率 (Startup+ 套餐)
    # ----------------------------------------------------------

    async def collect_oi_weighted_funding_rate(
        self, symbol: str, interval: str = "1h",
    ) -> list[WeightedFundingRate] | None:
        """调用 /api/futures/fundingRate/oi-weight-ohlc-history（Startup+ 套餐）。"""
        tier = await self._tier_manager.get_current_tier()
        if not self._tier_manager.is_endpoint_available(
            tier, "oi-weight-ohlc-history",
        ):
            logger.info(
                "oi_weighted_fr_skipped",
                symbol=symbol,
                tier=tier.value,
                reason="endpoint not available for current tier",
            )
            return None
        try:
            data = await self._client.get(
                path="/api/futures/funding-rate/oi-weight-history",
                endpoint="oi-weight-ohlc-history",
                params={
                    "symbol": normalize_coin_symbol(symbol),
                    "interval": interval,
                },
            )
            if data is None:
                return None
            return self._parse_weighted_funding_rate(
                data, symbol, rate_field="oi_weighted_rate",
            )
        except Exception as exc:
            logger.error(
                "collect_oi_weighted_fr_failed",
                symbol=symbol,
                error=str(exc),
            )
            return None

    # ----------------------------------------------------------
    # 成交量加权资金费率 (Startup+ 套餐)
    # ----------------------------------------------------------

    async def collect_vol_weighted_funding_rate(
        self, symbol: str, interval: str = "1h",
    ) -> list[WeightedFundingRate] | None:
        """调用 /api/futures/fundingRate/vol-weight-ohlc-history（Startup+ 套餐）。"""
        tier = await self._tier_manager.get_current_tier()
        if not self._tier_manager.is_endpoint_available(
            tier, "vol-weight-ohlc-history",
        ):
            logger.info(
                "vol_weighted_fr_skipped",
                symbol=symbol,
                tier=tier.value,
                reason="endpoint not available for current tier",
            )
            return None
        try:
            data = await self._client.get(
                path="/api/futures/funding-rate/vol-weight-history",
                endpoint="vol-weight-ohlc-history",
                params={
                    "symbol": normalize_coin_symbol(symbol),
                    "interval": interval,
                },
            )
            if data is None:
                return None
            return self._parse_weighted_funding_rate(
                data, symbol, rate_field="vol_weighted_rate",
            )
        except Exception as exc:
            logger.error(
                "collect_vol_weighted_fr_failed",
                symbol=symbol,
                error=str(exc),
            )
            return None

    # ----------------------------------------------------------
    # 资金费率 OHLC 历史 (所有套餐)
    # ----------------------------------------------------------

    async def collect_funding_rate_history(
        self, symbol: str, interval: str = "1h",
    ) -> list[FundingRateSnapshot] | None:
        """采集资金费率 OHLC 历史。注：V4 API 已移除此端点。"""
        tier = await self._tier_manager.get_current_tier()
        if not self._tier_manager.is_endpoint_available(tier, "fr-ohlc-history"):
            logger.debug("fr_ohlc_history_skipped", symbol=symbol, tier=tier.value,
                         reason="endpoint not available for current tier")
            return None
        try:
            params = {
                "exchange": "Binance",
                "symbol": normalize_pair_symbol(symbol),
                "interval": interval,
            }
            data = await self._client.get(
                path="/api/futures/funding-rate/history",
                endpoint="fr-ohlc-history",
                params=params,
            )
            if data is None:
                return None
            return self._parse_funding_rate_snapshots(data, symbol)
        except Exception as exc:
            logger.error(
                "collect_funding_rate_history_failed",
                symbol=symbol, error=str(exc),
            )
            return None

    # ----------------------------------------------------------
    # 资金费率分交易所 (所有套餐)
    # ----------------------------------------------------------

    async def collect_funding_rate_exchange_list(
        self, symbol: str,
    ) -> list[FundingRateExchangeData] | None:
        """采集分交易所资金费率。注：V4 API 已移除此端点。"""
        tier = await self._tier_manager.get_current_tier()
        if not self._tier_manager.is_endpoint_available(tier, "fr-exchange-list"):
            logger.debug("fr_exchange_list_skipped", symbol=symbol, tier=tier.value,
                         reason="endpoint not available for current tier")
            return None
        try:
            data = await self._client.get(
                path="/api/futures/funding-rate/exchange-list",
                endpoint="fr-exchange-list",
                params={"symbol": normalize_coin_symbol(symbol)},
            )
            if data is None:
                return None
            return self._parse_fr_exchange_list(data, symbol)
        except Exception as exc:
            logger.error(
                "collect_fr_exchange_list_failed",
                symbol=symbol, error=str(exc),
            )
            return None

    # ----------------------------------------------------------
    # 资金费率累计分交易所 (所有套餐)
    # ----------------------------------------------------------

    async def collect_cumulative_exchange_list(
        self, symbol: str,
    ) -> list[FundingRateExchangeData] | None:
        """采集累计分交易所资金费率。注：V4 API 已移除此端点。"""
        tier = await self._tier_manager.get_current_tier()
        if not self._tier_manager.is_endpoint_available(tier, "cumulative-exchange-list"):
            logger.debug("cumulative_exchange_list_skipped", symbol=symbol, tier=tier.value,
                         reason="endpoint not available for current tier")
            return None
        try:
            data = await self._client.get(
                path="/api/futures/funding-rate/accumulated-exchange-list",
                endpoint="cumulative-exchange-list",
                params={"range": "1d"},
            )
            if data is None:
                return None
            return self._parse_fr_exchange_list(data, symbol)
        except Exception as exc:
            logger.error(
                "collect_cumulative_exchange_list_failed",
                symbol=symbol, error=str(exc),
            )
            return None

    # ----------------------------------------------------------
    # OI 分交易所历史图表 (所有套餐)
    # ----------------------------------------------------------

    async def collect_oi_exchange_history_chart(
        self, symbol: str, interval: str = "1h",
    ) -> list[OISnapshot] | None:
        """采集分交易所 OI 历史图表。注：V4 API 已移除此端点。"""
        tier = await self._tier_manager.get_current_tier()
        if not self._tier_manager.is_endpoint_available(tier, "oi-exchange-history-chart"):
            logger.debug("oi_exchange_history_chart_skipped", symbol=symbol, tier=tier.value,
                         reason="endpoint not available for current tier")
            return None
        try:
            data = await self._client.get(
                path="/api/futures/open-interest/exchange-history-chart",
                endpoint="oi-exchange-history-chart",
                params={"symbol": normalize_coin_symbol(symbol), "range": interval},
            )
            if data is None:
                return None
            return self._parse_oi_snapshots(data, symbol, source="coinglass-exchange-chart")
        except Exception as exc:
            logger.error(
                "collect_oi_exchange_history_chart_failed",
                symbol=symbol, error=str(exc),
            )
            return None

    # ----------------------------------------------------------
    # 资金费率套利 (Standard+ 套餐)
    # ----------------------------------------------------------

    async def collect_funding_rate_arbitrage(
        self, symbol: str,
    ) -> list[dict] | None:
        """调用 /api/futures/fundingRate/fr-arbitrage（Standard+ 套餐）。

        返回原始字典列表，供 KillDetector 分析套利异常。
        """
        tier = await self._tier_manager.get_current_tier()
        if not self._tier_manager.is_endpoint_available(tier, "fr-arbitrage"):
            logger.info(
                "fr_arbitrage_skipped",
                symbol=symbol,
                tier=tier.value,
                reason="endpoint not available for current tier",
            )
            return None
        try:
            data = await self._client.get(
                path="/api/futures/funding-rate/arbitrage",
                endpoint="fr-arbitrage",
                params={"usd": 10000},
            )
            if data is None:
                return None
            items = data if isinstance(data, list) else data.get("data", [])
            if not isinstance(items, list):
                return []
            return items
        except Exception as exc:
            logger.error(
                "collect_fr_arbitrage_failed",
                symbol=symbol,
                error=str(exc),
            )
            return None

    # ----------------------------------------------------------
    # 多空比写入 derivatives_snapshots
    # ----------------------------------------------------------

    async def write_derivatives_snapshots(
        self,
        symbol: str,
        ratios: list[TopLongShortRatio],
    ) -> None:
        """将 CoinGlass 多空比数据写入 derivatives_snapshots 表，source='coinglass'。"""
        if not ratios:
            return
        rows = self._merge_derivatives_ratio_rows(symbol, ratios)
        if not rows:
            return
        select_sql = """
            SELECT funding_rate, predicted_funding_rate,
                   long_short_account_ratio, long_short_position_ratio,
                   top_long_short_account_ratio, top_long_short_position_ratio
            FROM derivatives_snapshots
            WHERE time = :time AND symbol = :symbol AND source = 'coinglass'
            ORDER BY time DESC
            LIMIT 1
        """
        delete_sql = """
            DELETE FROM derivatives_snapshots
            WHERE time = :time AND symbol = :symbol AND source = 'coinglass'
        """
        insert_sql = """
            INSERT INTO derivatives_snapshots (
                time, symbol, funding_rate, predicted_funding_rate,
                long_short_account_ratio, long_short_position_ratio,
                top_long_short_account_ratio, top_long_short_position_ratio,
                source
            ) VALUES (
                :time, :symbol, :funding_rate, :predicted_funding_rate,
                :ls_account, :ls_position,
                :top_account, :top_position,
                'coinglass'
            )
        """
        try:
            for row in rows:
                existing = await self._session.execute(
                    sqlalchemy.text(select_sql),
                    {"time": row["time"], "symbol": row["symbol"]},
                )
                existing_row = existing.mappings().first()
                await self._session.execute(
                    sqlalchemy.text(delete_sql),
                    {"time": row["time"], "symbol": row["symbol"]},
                )
                await self._session.execute(
                    sqlalchemy.text(insert_sql),
                    {
                        "time": row["time"],
                        "symbol": row["symbol"],
                        "funding_rate": existing_row["funding_rate"] if existing_row else None,
                        "predicted_funding_rate": (
                            existing_row["predicted_funding_rate"] if existing_row else None
                        ),
                        "ls_account": (
                            row["ls_account"]
                            if row["ls_account"] is not None
                            else (existing_row["long_short_account_ratio"] if existing_row else None)
                        ),
                        "ls_position": (
                            row["ls_position"]
                            if row["ls_position"] is not None
                            else (existing_row["long_short_position_ratio"] if existing_row else None)
                        ),
                        "top_account": (
                            row["top_account"]
                            if row["top_account"] is not None
                            else (existing_row["top_long_short_account_ratio"] if existing_row else None)
                        ),
                        "top_position": (
                            row["top_position"]
                            if row["top_position"] is not None
                            else (existing_row["top_long_short_position_ratio"] if existing_row else None)
                        ),
                    },
                )
            await self._session.commit()
        except Exception as exc:
            logger.error(
                "write_derivatives_snapshots_failed",
                symbol=symbol,
                count=len(rows),
                error=str(exc),
            )
            raise

    def _merge_derivatives_ratio_rows(
        self,
        symbol: str,
        ratios: list[TopLongShortRatio],
    ) -> list[dict[str, object]]:
        merged: dict[datetime, dict[str, object]] = {}
        for ratio in ratios:
            if ratio.long_short_ratio is None:
                continue
            row = merged.setdefault(
                ratio.ts,
                {
                    "time": ratio.ts,
                    "symbol": symbol,
                    "ls_account": None,
                    "ls_position": None,
                    "top_account": None,
                    "top_position": None,
                },
            )
            is_global_account = (
                ratio.data_type == "account"
                and str(ratio.exchange or "").lower() == "global"
            )
            if ratio.data_type == "account":
                if is_global_account:
                    row["ls_account"] = ratio.long_short_ratio
                else:
                    row["top_account"] = ratio.long_short_ratio
            elif ratio.data_type == "position":
                row["ls_position"] = ratio.long_short_ratio
                row["top_position"] = ratio.long_short_ratio
        return [merged[ts] for ts in sorted(merged)]

    # ----------------------------------------------------------
    # 解析辅助方法
    # ----------------------------------------------------------

    def _parse_oi_snapshots(
        self,
        data: dict | list,
        symbol: str,
        source: str = "coinglass",
    ) -> list[OISnapshot]:
        """防御性解析 CoinGlass OI API 响应为 OISnapshot 列表。"""
        results: list[OISnapshot] = []
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
                oi = self._safe_float(
                    item.get("c")
                    or item.get("close")
                    or item.get("openInterest")
                    or item.get("oi")
                    or item.get("o")
                    or item.get("open"),
                )
                if oi is None:
                    continue
                results.append(OISnapshot(
                    ts=ts,
                    symbol=symbol,
                    exchange=item.get("exchangeName") or item.get("exchange"),
                    open_interest=oi,
                    oi_change_1h=self._safe_float(item.get("h1OiChangePercent")),
                    oi_change_4h=self._safe_float(item.get("h4OiChangePercent")),
                    oi_change_24h=self._safe_float(item.get("h24OiChangePercent")),
                    source=source,
                ))
        except Exception as exc:
            logger.error("parse_oi_snapshots_failed", error=str(exc))
        return results

    def _parse_exchange_list(self, data: dict | list) -> list[OIExchangeData]:
        """防御性解析分交易所 OI 数据。"""
        results: list[OIExchangeData] = []
        try:
            items = data if isinstance(data, list) else data.get("data", [])
            if not isinstance(items, list):
                items = [items] if items else []
            for item in items:
                if not isinstance(item, dict):
                    continue
                exchange = item.get("exchangeName") or item.get("exchange")
                oi = self._safe_float(item.get("openInterest") or item.get("oi"))
                if not exchange or oi is None:
                    continue
                results.append(OIExchangeData(
                    exchange=exchange,
                    open_interest=oi,
                    oi_change_pct=self._safe_float(
                        item.get("oiChangePercent") or item.get("h24OiChangePercent"),
                    ),
                ))
        except Exception as exc:
            logger.error("parse_exchange_list_failed", error=str(exc))
        return results

    def _parse_net_position(
        self, data: dict | list, symbol: str,
    ) -> list[NetPositionSnapshot]:
        """防御性解析净持仓 API 响应。"""
        results: list[NetPositionSnapshot] = []
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
                long_pos = self._safe_float(
                    item.get("longPosition")
                    or item.get("long")
                    or item.get("net_long_change_cum")
                    or item.get("net_long_change"),
                )
                short_pos = self._safe_float(
                    item.get("shortPosition")
                    or item.get("short")
                    or item.get("net_short_change_cum")
                    or item.get("net_short_change"),
                )
                net = self._safe_float(
                    item.get("netPosition")
                    or item.get("net_position")
                    or item.get("net_position_change_cum"),
                )
                if net is None and long_pos is not None and short_pos is not None:
                    net = long_pos - short_pos
                if net is None:
                    continue
                results.append(NetPositionSnapshot(
                    symbol=symbol,
                    ts=ts,
                    net_position=net,
                    long_position=long_pos or 0.0,
                    short_position=short_pos or 0.0,
                ))
        except Exception as exc:
            logger.error("parse_net_position_failed", error=str(exc))
        return results

    def _parse_long_short_ratio(
        self,
        data: dict | list,
        symbol: str,
        data_type: str = "account",
        default_exchange: str = "global",
    ) -> list[TopLongShortRatio]:
        """防御性解析多空比 API 响应。"""
        results: list[TopLongShortRatio] = []
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
                long_val = self._safe_float(
                    item.get("longAccount")
                    or item.get("longRatio")
                    or item.get("long")
                    or item.get("global_account_long_percent")
                    or item.get("top_account_long_percent")
                    or item.get("top_position_long_percent"),
                )
                short_val = self._safe_float(
                    item.get("shortAccount")
                    or item.get("shortRatio")
                    or item.get("short")
                    or item.get("global_account_short_percent")
                    or item.get("top_account_short_percent")
                    or item.get("top_position_short_percent"),
                )
                ratio = self._safe_float(
                    item.get("longShortRatio")
                    or item.get("ratio")
                    or item.get("global_account_long_short_ratio")
                    or item.get("top_account_long_short_ratio")
                    or item.get("top_position_long_short_ratio"),
                )
                if long_val is None or short_val is None:
                    # 尝试从 ratio 推算
                    if ratio is not None:
                        long_val = long_val or ratio / (1 + ratio) if ratio > 0 else 0.5
                        short_val = short_val or 1 / (1 + ratio) if ratio > 0 else 0.5
                    else:
                        continue
                if ratio is None and short_val and short_val > 0:
                    ratio = round(long_val / short_val, 6)
                exchange = item.get("exchangeName") or item.get("exchange") or default_exchange
                results.append(TopLongShortRatio(
                    symbol=symbol,
                    ts=ts,
                    exchange=exchange,
                    long_account=long_val,
                    short_account=short_val,
                    long_short_ratio=ratio or 1.0,
                    data_type=data_type,
                ))
        except Exception as exc:
            logger.error("parse_long_short_ratio_failed", error=str(exc))
        return results

    def _parse_funding_rate_snapshots(
        self,
        data: dict | list,
        symbol: str,
    ) -> list[FundingRateSnapshot]:
        """防御性解析资金费率 OHLC 历史 API 响应。"""
        results: list[FundingRateSnapshot] = []
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
                results.append(FundingRateSnapshot(
                    ts=ts,
                    symbol=symbol,
                    open=self._safe_float(item.get("o") or item.get("open")),
                    high=self._safe_float(item.get("h") or item.get("high")),
                    low=self._safe_float(item.get("l") or item.get("low")),
                    close=self._safe_float(item.get("c") or item.get("close")),
                ))
        except Exception as exc:
            logger.error("parse_funding_rate_snapshots_failed", error=str(exc))
        return results

    def _parse_fr_exchange_list(
        self,
        data: dict | list,
        symbol: str,
    ) -> list[FundingRateExchangeData]:
        """防御性解析资金费率分交易所 API 响应。"""
        results: list[FundingRateExchangeData] = []
        try:
            items = data if isinstance(data, list) else data.get("data", [])
            if not isinstance(items, list):
                items = [items] if items else []
            for item in items:
                if not isinstance(item, dict):
                    continue
                exchange = item.get("exchangeName") or item.get("exchange")
                rate = self._safe_float(
                    item.get("fundingRate") or item.get("rate") or item.get("r"),
                )
                if not exchange or rate is None:
                    continue
                nft_raw = item.get("nextFundingTime") or item.get("nextTime")
                nft = self._to_datetime(nft_raw) if nft_raw else None
                results.append(FundingRateExchangeData(
                    exchange=exchange,
                    symbol=symbol,
                    funding_rate=rate,
                    next_funding_time=nft,
                ))
        except Exception as exc:
            logger.error("parse_fr_exchange_list_failed", error=str(exc))
        return results

    def _parse_weighted_funding_rate(
        self,
        data: dict | list,
        symbol: str,
        rate_field: str = "oi_weighted_rate",
    ) -> list[WeightedFundingRate]:
        """防御性解析加权资金费率 API 响应。"""
        results: list[WeightedFundingRate] = []
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
                # OHLC 格式：取 close 值作为当前费率
                rate_val = self._safe_float(
                    item.get("c") or item.get("close") or item.get("fundingRate"),
                )
                kwargs: dict[str, float | None] = {
                    "oi_weighted_rate": None,
                    "vol_weighted_rate": None,
                }
                kwargs[rate_field] = rate_val
                results.append(WeightedFundingRate(
                    symbol=symbol,
                    ts=ts,
                    **kwargs,
                ))
        except Exception as exc:
            logger.error("parse_weighted_funding_rate_failed", error=str(exc))
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
            # CoinGlass 通常返回毫秒时间戳
            ts = value / 1000 if value > 1e12 else value
            return datetime.fromtimestamp(ts, tz=timezone.utc)
        if isinstance(value, str):
            # 尝试 ISO 格式
            return datetime.fromisoformat(value.replace("Z", "+00:00"))
        return datetime.now(tz=timezone.utc)
