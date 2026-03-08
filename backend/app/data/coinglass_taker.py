"""Taker Volume 采集与分析 — 采集、存储、失衡检测。

数据层模块，负责通过 CoinGlassClient 采集主动买卖量数据，
写入 TimescaleDB、检测 Buy/Sell Ratio 失衡并发布事件。
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
from app.models.coinglass import TakerImbalanceEvent, TakerVolumeSnapshot

logger = structlog.get_logger(__name__)

_TAKER_CACHE_TTL = 600  # seconds (3.3x collection interval)


class TakerAnalyzer:
    """Taker Volume 采集与分析 — 采集、存储、失衡检测。"""

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
    # Taker Buy/Sell Volume 历史 (Standard+ 套餐)
    # ----------------------------------------------------------

    async def collect_taker_volume(
        self, symbol: str,
    ) -> list[TakerVolumeSnapshot] | None:
        """调用 /api/futures/taker-buy-sell-volume/history（Standard+ 套餐）。"""
        tier = await self._tier_manager.get_current_tier()
        if not self._tier_manager.is_endpoint_available(tier, "taker-buysell-volume"):
            logger.info(
                "taker_volume_skipped",
                symbol=symbol,
                tier=tier.value,
                reason="endpoint not available for current tier",
            )
            return None
        try:
            data = await self._client.get(
                path="/api/futures/v2/taker-buy-sell-volume/history",
                endpoint="taker-buysell-volume",
                params={
                    "exchange": "Binance",
                    "symbol": normalize_pair_symbol(symbol),
                    "interval": normalize_compact_interval("1h"),
                },
            )
            if data is None:
                return None
            return self._parse_taker_snapshots(data, symbol, source="coinglass")
        except Exception as exc:
            logger.error("collect_taker_volume_failed", symbol=symbol, error=str(exc))
            return None

    # ----------------------------------------------------------
    # 聚合 Taker Buy/Sell Volume 历史 (Standard+ 套餐)
    # ----------------------------------------------------------

    async def collect_aggregated_taker_volume(
        self, symbol: str,
    ) -> list[TakerVolumeSnapshot] | None:
        """调用 /api/futures/aggregated-taker-buysell-volume-history（Standard+ 套餐）。"""
        tier = await self._tier_manager.get_current_tier()
        if not self._tier_manager.is_endpoint_available(
            tier, "aggregated-taker-buysell-volume-history",
        ):
            logger.info(
                "aggregated_taker_volume_skipped",
                symbol=symbol,
                tier=tier.value,
                reason="endpoint not available for current tier",
            )
            return None
        try:
            data = await self._client.get(
                path="/api/futures/aggregated-taker-buy-sell-volume/history",
                endpoint="aggregated-taker-buysell-volume-history",
                params={
                    "exchange_list": "Binance",
                    "symbol": normalize_coin_symbol(symbol),
                    "interval": normalize_compact_interval("1h"),
                },
            )
            if data is None:
                return None
            return self._parse_taker_snapshots(data, symbol, source="coinglass-aggregated")
        except Exception as exc:
            logger.error(
                "collect_aggregated_taker_volume_failed",
                symbol=symbol,
                error=str(exc),
            )
            return None

    # ----------------------------------------------------------
    # Taker 失衡检测
    # ----------------------------------------------------------

    async def detect_imbalance(
        self, symbol: str, threshold: float = 0.3,
    ) -> TakerImbalanceEvent | None:
        """检测 Buy/Sell Ratio 偏离 1.0 超阈值，发布 taker_imbalance 事件。

        Standard+ 套餐才可执行检测。
        Hobbyist/Startup 跳过检测，返回 None。
        """
        tier = await self._tier_manager.get_current_tier()
        if not self._tier_manager.is_feature_enabled(tier, "taker_volume"):
            logger.info(
                "detect_imbalance_skipped",
                symbol=symbol,
                tier=tier.value,
                reason="taker_volume feature not enabled for current tier",
            )
            return None

        try:
            # 尝试从 Redis 缓存读取最新快照
            cached = await get_json(f"cg_taker:{symbol}")
            snapshot: dict | None = None

            if cached and isinstance(cached, list) and len(cached) >= 1:
                snapshot = cached[0]  # 最新一条
            else:
                # 从 DB 读取最近一条
                sql = """
                    SELECT ts, symbol, buy_volume, sell_volume, buy_sell_ratio, source
                    FROM taker_volume_snapshots
                    WHERE symbol = :symbol
                    ORDER BY ts DESC
                    LIMIT 1
                """
                result = await self._session.execute(
                    sqlalchemy.text(sql), {"symbol": symbol},
                )
                row = result.fetchone()
                if row is not None:
                    snapshot = {
                        "ts": str(row[0]),
                        "symbol": row[1],
                        "buy_volume": float(row[2]),
                        "sell_volume": float(row[3]),
                        "buy_sell_ratio": float(row[4]) if row[4] is not None else None,
                        "source": row[5],
                    }

            if not snapshot:
                logger.info("detect_imbalance_no_data", symbol=symbol)
                return None

            buy_vol = float(snapshot["buy_volume"])
            sell_vol = float(snapshot["sell_volume"])

            if sell_vol <= 0:
                return None

            ratio = round(buy_vol / sell_vol, 4)

            if abs(ratio - 1.0) <= threshold:
                return None

            now = datetime.now(tz=timezone.utc)
            event = TakerImbalanceEvent(
                symbol=symbol,
                ts=now,
                buy_volume=buy_vol,
                sell_volume=sell_vol,
                ratio=ratio,
                threshold=threshold,
            )

            # 发布到 Redis Streams
            try:
                await publish_stream("taker_imbalance", {
                    "symbol": event.symbol,
                    "ratio": event.ratio,
                    "buy_volume": event.buy_volume,
                    "sell_volume": event.sell_volume,
                })
            except Exception as pub_exc:
                logger.error(
                    "taker_imbalance_publish_failed",
                    symbol=symbol,
                    error=str(pub_exc),
                )

            return event

        except Exception as exc:
            logger.error("detect_imbalance_failed", symbol=symbol, error=str(exc))
            return None

    # ----------------------------------------------------------
    # DB 写入
    # ----------------------------------------------------------

    async def write_snapshots(self, snapshots: list[TakerVolumeSnapshot]) -> None:
        """将 Taker Volume 快照批量写入 TimescaleDB taker_volume_snapshots 表。"""
        if not snapshots:
            return
        sql = """
            INSERT INTO taker_volume_snapshots (
                ts, symbol, buy_volume, sell_volume, buy_sell_ratio, source
            ) VALUES (
                :ts, :symbol, :buy_vol, :sell_vol, :ratio, :source
            )
            ON CONFLICT(ts, symbol) DO UPDATE SET
                buy_volume = excluded.buy_volume,
                sell_volume = excluded.sell_volume,
                buy_sell_ratio = excluded.buy_sell_ratio,
                source = excluded.source
        """
        try:
            for snap in snapshots:
                await self._session.execute(
                    sqlalchemy.text(sql),
                    {
                        "ts": snap.ts,
                        "symbol": snap.symbol,
                        "buy_vol": snap.buy_volume,
                        "sell_vol": snap.sell_volume,
                        "ratio": snap.buy_sell_ratio,
                        "source": snap.source,
                    },
                )
            await self._session.commit()
        except Exception as exc:
            logger.error(
                "write_taker_snapshots_failed",
                count=len(snapshots),
                error=str(exc),
            )
            raise

    # ----------------------------------------------------------
    # Redis 缓存
    # ----------------------------------------------------------

    async def cache_latest(
        self, symbol: str, snapshots: list[TakerVolumeSnapshot],
    ) -> None:
        """缓存最新 Taker Volume 快照到 Redis，TTL=300s。"""
        if not snapshots:
            return
        try:
            await set_with_ttl(
                f"cg_taker:{symbol}",
                [s.model_dump(mode="json") for s in snapshots],
                ttl_seconds=_TAKER_CACHE_TTL,
            )
        except Exception as exc:
            logger.error(
                "cache_taker_latest_failed", symbol=symbol, error=str(exc),
            )

    # ----------------------------------------------------------
    # 解析辅助方法
    # ----------------------------------------------------------

    def _parse_taker_snapshots(
        self,
        data: dict | list,
        symbol: str,
        source: str = "coinglass",
    ) -> list[TakerVolumeSnapshot]:
        """防御性解析 CoinGlass Taker Volume API 响应为 TakerVolumeSnapshot 列表。"""
        results: list[TakerVolumeSnapshot] = []
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
                buy_raw = item.get("buyVolume")
                if buy_raw is None:
                    buy_raw = item.get("buy")
                if buy_raw is None:
                    buy_raw = item.get("taker_buy_volume_usd")
                if buy_raw is None:
                    buy_raw = item.get("aggregated_buy_volume_usd")
                sell_raw = item.get("sellVolume")
                if sell_raw is None:
                    sell_raw = item.get("sell")
                if sell_raw is None:
                    sell_raw = item.get("taker_sell_volume_usd")
                if sell_raw is None:
                    sell_raw = item.get("aggregated_sell_volume_usd")
                buy_vol = self._safe_float(buy_raw)
                sell_vol = self._safe_float(sell_raw)
                if buy_vol is None or sell_vol is None:
                    continue
                ratio: float | None = None
                if sell_vol > 0:
                    ratio = round(buy_vol / sell_vol, 4)
                results.append(TakerVolumeSnapshot(
                    ts=ts,
                    symbol=symbol,
                    buy_volume=buy_vol,
                    sell_volume=sell_vol,
                    buy_sell_ratio=ratio,
                    source=source,
                ))
        except Exception as exc:
            logger.error("parse_taker_snapshots_failed", error=str(exc))
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
