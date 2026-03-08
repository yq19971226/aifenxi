"""点杀预警引擎 — 综合多维信号检测庄家点杀行为。

Service 层模块，从 Redis 缓存和 TimescaleDB 读取 OI、Taker、
爆仓热力图、多空比等数据，按套餐等级执行三级点杀检测。
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any

import sqlalchemy
import structlog
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.redis import get_json, get_redis_pool, publish_stream, set_with_ttl
from app.data.coinglass_tier import TierManager
from app.models.coinglass import CoinGlassTier, KillZoneAlert

logger = structlog.get_logger(__name__)

_DEDUP_TTL = 600  # 10 minutes
_DEDUP_KEY_PREFIX = "kill_alert_dedup"
_SCORE_UPDATE_THRESHOLD = 20  # only update if score increases by this much


class KillDetector:
    """点杀预警引擎 — 综合多维信号检测庄家点杀行为。"""

    def __init__(
        self,
        tier_manager: TierManager,
        session: AsyncSession,
    ) -> None:
        self._tier_manager = tier_manager
        self._session = session

    # ----------------------------------------------------------
    # 主检测入口
    # ----------------------------------------------------------

    async def evaluate(self, symbol: str) -> KillZoneAlert | None:
        """对单个交易对执行点杀检测。"""
        tier = await self._tier_manager.get_current_tier()

        # Hobbyist 跳过检测
        if not self._tier_manager.is_feature_enabled(tier, "kill_basic"):
            logger.info("kill_detect_skipped", symbol=symbol, tier=tier.value)
            return None

        try:
            # 确定检测版本
            if self._tier_manager.is_feature_enabled(tier, "kill_full"):
                version = "full"
            elif self._tier_manager.is_feature_enabled(tier, "kill_enhanced"):
                version = "enhanced"
            else:
                version = "basic"

            # 读取缓存数据
            oi_data = await get_json(f"cg_oi:{symbol}")
            heatmap_data = await get_json(f"liq_heatmap:{symbol}")

            # 读取当前价格用于距离计算
            _redis = get_redis_pool()
            _raw_price = await _redis.get(f"latest_price:{symbol}")
            _current_price = float(_raw_price) if _raw_price else 0.0

            # 计算 OI 变化率
            oi_change_pct = self._calc_oi_change(oi_data)

            # 读取多空比（从 DB 最新记录）
            ls_ratio = await self._get_latest_ls_ratio(symbol)
            top_ls_deviation = abs(ls_ratio - 1.0) if ls_ratio else 0.0

            # 读取净持仓变化
            net_pos_change = await self._get_net_position_change(symbol)

            # 计算价格接近爆仓密集区程度
            price_proximity = self._calc_price_proximity(heatmap_data, _current_price)
            nearest_liq_usd = self._get_nearest_liq_usd(heatmap_data)

            if version == "basic":
                # 读取加权资金费率
                weighted_fr = await self._get_weighted_fr_deviation(symbol)
                score = self.compute_basic_score(
                    oi_change_pct=oi_change_pct,
                    top_ls_ratio_deviation=top_ls_deviation,
                    net_position_change=net_pos_change,
                    price_proximity_pct=price_proximity,
                    weighted_fr_deviation=weighted_fr,
                )
                direction = "long_kill" if (ls_ratio or 1.0) > 1.0 else "short_kill"
                alert = KillZoneAlert(
                    ts=datetime.now(tz=timezone.utc),
                    symbol=symbol,
                    direction=direction,
                    risk_score=score,
                    version="basic",
                    oi_change_pct=oi_change_pct,
                    ls_ratio=ls_ratio,
                    nearest_liq_usd=nearest_liq_usd,
                    details={
                        "net_position_change": net_pos_change,
                        "price_proximity_pct": price_proximity,
                        "weighted_fr_deviation": weighted_fr,
                        "top_ls_deviation": top_ls_deviation,
                    },
                )
            else:
                # Enhanced or Full — need Taker data
                taker_data = await get_json(f"cg_taker:{symbol}")
                taker_ratio = self._calc_taker_ratio(taker_data)
                taker_deviation = abs(taker_ratio - 1.0) if taker_ratio else 0.0

                # Liquidation order severity
                liq_severity = await self._get_liq_order_severity(symbol)

                # Max pain proximity
                max_pain_prox = await self._get_max_pain_proximity(symbol)

                # FR arbitrage anomaly
                fr_arb = await self._get_fr_arbitrage_anomaly(symbol)

                score = self.compute_enhanced_score(
                    oi_change_pct=oi_change_pct,
                    taker_deviation=taker_deviation,
                    price_proximity_pct=price_proximity,
                    top_ls_ratio_deviation=top_ls_deviation,
                    liq_order_severity=liq_severity,
                    max_pain_proximity=max_pain_prox,
                    fr_arbitrage_anomaly=fr_arb,
                )
                # Direction: Taker Buy dominant → long_kill
                if taker_ratio and taker_ratio > 1.0:
                    direction = "long_kill"
                else:
                    direction = "short_kill"

                actual_version = "full" if version == "full" else "enhanced"
                alert = KillZoneAlert(
                    ts=datetime.now(tz=timezone.utc),
                    symbol=symbol,
                    direction=direction,
                    risk_score=score,
                    version=actual_version,
                    oi_change_pct=oi_change_pct,
                    taker_ratio=taker_ratio,
                    ls_ratio=ls_ratio,
                    nearest_liq_usd=nearest_liq_usd,
                    details={
                        "taker_deviation": taker_deviation,
                        "price_proximity_pct": price_proximity,
                        "top_ls_deviation": top_ls_deviation,
                        "liq_order_severity": liq_severity,
                        "max_pain_proximity": max_pain_prox,
                        "fr_arbitrage_anomaly": fr_arb,
                        "net_position_change": net_pos_change,
                    },
                )

            # 去重检查
            if not await self._should_emit(symbol, alert.risk_score):
                logger.info(
                    "kill_alert_deduped",
                    symbol=symbol,
                    score=alert.risk_score,
                )
                return None

            # 写入 DB
            await self._write_alert(alert)

            # 发布到 Redis Streams
            await self._publish_alert(alert)

            # 更新去重 key
            await self._update_dedup(symbol, alert.risk_score)

            return alert

        except Exception as exc:
            logger.error("kill_detect_failed", symbol=symbol, error=str(exc))
            return None

    async def evaluate_all(self, symbols: list[str]) -> list[KillZoneAlert]:
        """批量检测所有监控交易对。"""
        results: list[KillZoneAlert] = []
        for symbol in symbols:
            alert = await self.evaluate(symbol)
            if alert is not None:
                results.append(alert)
        return results

    # ----------------------------------------------------------
    # 评分函数
    # ----------------------------------------------------------

    @staticmethod
    def compute_basic_score(
        oi_change_pct: float,
        top_ls_ratio_deviation: float,
        net_position_change: float,
        price_proximity_pct: float,
        weighted_fr_deviation: float,
    ) -> int:
        """基础版评分：OI(30%) + 大户多空比(20%) + 净持仓(20%) + 价格接近度(20%) + 加权资金费率(10%)。

        Each input is normalized to [0, 100] before weighting.
        """
        oi_score = min(abs(oi_change_pct) * 10, 100.0)  # 10% change → 100
        ls_score = min(top_ls_ratio_deviation * 200, 100.0)  # 0.5 deviation → 100
        net_score = min(abs(net_position_change) * 5, 100.0)  # 20% change → 100
        prox_score = max(100.0 - price_proximity_pct * 20, 0.0)  # closer = higher
        fr_score = min(abs(weighted_fr_deviation) * 1000, 100.0)  # 0.1% → 100

        raw = (
            oi_score * 0.30
            + ls_score * 0.20
            + net_score * 0.20
            + prox_score * 0.20
            + fr_score * 0.10
        )
        return max(0, min(100, int(round(raw))))

    @staticmethod
    def compute_enhanced_score(
        oi_change_pct: float,
        taker_deviation: float,
        price_proximity_pct: float,
        top_ls_ratio_deviation: float,
        liq_order_severity: float,
        max_pain_proximity: float,
        fr_arbitrage_anomaly: float,
    ) -> int:
        """增强版评分：OI(20%) + Taker(20%) + 价格接近度(15%) + 大户多空比(15%) + 爆仓订单(10%) + 清算最大痛点(10%) + 资金费率套利(10%)。"""
        oi_score = min(abs(oi_change_pct) * 10, 100.0)
        taker_score = min(taker_deviation * 200, 100.0)
        prox_score = max(100.0 - price_proximity_pct * 20, 0.0)
        ls_score = min(top_ls_ratio_deviation * 200, 100.0)
        liq_score = min(liq_order_severity, 100.0)
        pain_score = max(100.0 - max_pain_proximity * 20, 0.0)
        arb_score = min(fr_arbitrage_anomaly * 50, 100.0)

        raw = (
            oi_score * 0.20
            + taker_score * 0.20
            + prox_score * 0.15
            + ls_score * 0.15
            + liq_score * 0.10
            + pain_score * 0.10
            + arb_score * 0.10
        )
        return max(0, min(100, int(round(raw))))

    @staticmethod
    def compute_full_score(
        oi_change_pct: float,
        taker_deviation: float,
        price_proximity_pct: float,
        top_ls_ratio_deviation: float,
        liq_order_severity: float,
        max_pain_proximity: float,
        fr_arbitrage_anomaly: float,
    ) -> int:
        """完整版评分：与增强版相同公式。"""
        return KillDetector.compute_enhanced_score(
            oi_change_pct=oi_change_pct,
            taker_deviation=taker_deviation,
            price_proximity_pct=price_proximity_pct,
            top_ls_ratio_deviation=top_ls_ratio_deviation,
            liq_order_severity=liq_order_severity,
            max_pain_proximity=max_pain_proximity,
            fr_arbitrage_anomaly=fr_arbitrage_anomaly,
        )

    # ----------------------------------------------------------
    # 数据读取辅助方法
    # ----------------------------------------------------------

    @staticmethod
    def _calc_oi_change(oi_data: Any) -> float:
        """从缓存的 OI 快照计算变化百分比。"""
        if not oi_data or not isinstance(oi_data, list) or len(oi_data) < 2:
            return 0.0
        try:
            latest = float(oi_data[0].get("open_interest", 0))
            previous = float(oi_data[-1].get("open_interest", 0))
            if previous <= 0:
                return 0.0
            return abs(latest - previous) / previous * 100
        except (ValueError, TypeError, KeyError):
            return 0.0

    async def _get_latest_ls_ratio(self, symbol: str) -> float | None:
        """从 derivatives_snapshots 读取最新多空比。"""
        try:
            sql = """
                SELECT long_short_account_ratio
                FROM derivatives_snapshots
                WHERE symbol = :symbol AND source = 'coinglass'
                  AND long_short_account_ratio IS NOT NULL
                ORDER BY time DESC
                LIMIT 1
            """
            result = await self._session.execute(
                sqlalchemy.text(sql), {"symbol": symbol},
            )
            row = result.fetchone()
            return float(row[0]) if row else None
        except Exception as exc:
            logger.error("get_latest_ls_ratio_failed", symbol=symbol, error=str(exc))
            return None

    async def _get_net_position_change(self, symbol: str) -> float:
        """从 DB 读取最近 2 条净持仓，计算变化百分比。"""
        try:
            sql = """
                SELECT net_position FROM (
                    SELECT ts, symbol,
                           (long_position - short_position) as net_position
                    FROM (
                        SELECT ts, symbol, open_interest as long_position,
                               oi_change_1h as short_position
                        FROM oi_snapshots
                        WHERE symbol = :symbol
                        ORDER BY ts DESC
                        LIMIT 2
                    ) sub
                ) outer_sub
            """
            # Actually, net position is stored separately. Read from cache first.
            cached = await get_json(f"cg_net_position:{symbol}")
            if cached and isinstance(cached, list) and len(cached) >= 2:
                latest = float(cached[0].get("net_position", 0))
                previous = float(cached[-1].get("net_position", 0))
                if abs(previous) > 0:
                    return (latest - previous) / abs(previous) * 100
            return 0.0
        except Exception as exc:
            logger.error("get_net_position_change_failed", symbol=symbol, error=str(exc))
            return 0.0

    @staticmethod
    def _calc_price_proximity(heatmap_data: Any, current_price: float = 0.0) -> float:
        """计算当前价格与最近爆仓密集区的距离百分比。

        Returns distance as percentage (0 = at the zone, higher = farther).
        """
        if not heatmap_data or not isinstance(heatmap_data, list):
            return 10.0  # default: far from zone
        if current_price <= 0:
            return 10.0
        try:
            # Find the zone with highest estimated_liq_usd
            max_zone = max(heatmap_data, key=lambda z: float(z.get("estimated_liq_usd", 0)))
            price_mid = (float(max_zone.get("price_low", 0)) + float(max_zone.get("price_high", 0))) / 2
            if price_mid <= 0:
                return 10.0
            return abs(current_price - price_mid) / current_price * 100
        except (ValueError, TypeError, KeyError):
            return 10.0

    @staticmethod
    def _get_nearest_liq_usd(heatmap_data: Any) -> float | None:
        """获取最近爆仓密集区的预估爆仓量。"""
        if not heatmap_data or not isinstance(heatmap_data, list):
            return None
        try:
            max_zone = max(heatmap_data, key=lambda z: float(z.get("estimated_liq_usd", 0)))
            return float(max_zone.get("estimated_liq_usd", 0))
        except (ValueError, TypeError, KeyError):
            return None

    @staticmethod
    def _calc_taker_ratio(taker_data: Any) -> float | None:
        """从缓存的 Taker 数据计算 Buy/Sell Ratio。"""
        if not taker_data or not isinstance(taker_data, list):
            return None
        try:
            latest = taker_data[0]
            return float(latest.get("buy_sell_ratio", 1.0))
        except (ValueError, TypeError, KeyError, IndexError):
            return None

    async def _get_weighted_fr_deviation(self, symbol: str) -> float:
        """读取加权资金费率偏离值。"""
        try:
            cached = await get_json(f"cg_weighted_fr:{symbol}")
            if cached and isinstance(cached, dict):
                oi_rate = float(cached.get("oi_weighted_rate", 0) or 0)
                vol_rate = float(cached.get("vol_weighted_rate", 0) or 0)
                # Use the larger deviation
                return max(abs(oi_rate), abs(vol_rate))
            return 0.0
        except Exception as exc:
            logger.error("get_weighted_fr_failed", symbol=symbol, error=str(exc))
            return 0.0

    async def _get_liq_order_severity(self, symbol: str) -> float:
        """读取爆仓订单严重程度（0-100）。"""
        try:
            cached = await get_json(f"cg_large_orders:{symbol}")
            if cached and isinstance(cached, list) and len(cached) > 0:
                total_usd = sum(float(o.get("usd_value", 0)) for o in cached)
                # Normalize: $1M → 50, $5M → 100
                return min(total_usd / 50000, 100.0)
            return 0.0
        except Exception as exc:
            logger.error("get_liq_severity_failed", symbol=symbol, error=str(exc))
            return 0.0

    async def _get_max_pain_proximity(self, symbol: str) -> float:
        """读取清算最大痛点接近度。"""
        try:
            cached = await get_json(f"cg_option_maxpain:{symbol}")
            if cached and isinstance(cached, dict):
                return float(cached.get("proximity_pct", 10.0))
            return 10.0
        except Exception as exc:
            logger.error("get_max_pain_failed", symbol=symbol, error=str(exc))
            return 10.0

    async def _get_fr_arbitrage_anomaly(self, symbol: str) -> float:
        """读取资金费率套利异常值。"""
        try:
            cached = await get_json(f"cg_fr_arb:{symbol}")
            if cached and isinstance(cached, dict):
                return float(cached.get("anomaly_score", 0))
            return 0.0
        except Exception as exc:
            logger.error("get_fr_arb_failed", symbol=symbol, error=str(exc))
            return 0.0

    # ----------------------------------------------------------
    # 去重
    # ----------------------------------------------------------

    async def _should_emit(self, symbol: str, new_score: float) -> bool:
        """检查是否应发出预警（去重逻辑）。

        10 分钟内重复预警被跳过，评分提升 > 20 分时更新。
        """
        try:
            key = f"{_DEDUP_KEY_PREFIX}:{symbol}"
            cached = await get_json(key)
            if cached is None:
                return True
            prev_score = float(cached.get("risk_score", 0))
            return (new_score - prev_score) > _SCORE_UPDATE_THRESHOLD
        except Exception as exc:
            logger.error("dedup_check_failed", symbol=symbol, error=str(exc))
            return True  # fail-open

    async def _update_dedup(self, symbol: str, score: float) -> None:
        """更新去重 key。"""
        try:
            key = f"{_DEDUP_KEY_PREFIX}:{symbol}"
            await set_with_ttl(key, {"risk_score": score}, ttl_seconds=_DEDUP_TTL)
        except Exception as exc:
            logger.error("dedup_update_failed", symbol=symbol, error=str(exc))

    # ----------------------------------------------------------
    # DB 写入 & 发布
    # ----------------------------------------------------------

    async def _write_alert(self, alert: KillZoneAlert) -> None:
        """将预警写入 TimescaleDB kill_zone_alerts 表。"""
        sql = """
            INSERT INTO kill_zone_alerts (
                ts, symbol, direction, risk_score, version,
                oi_change_pct, taker_ratio, ls_ratio,
                nearest_liq_usd, details
            ) VALUES (
                :ts, :symbol, :direction, :risk_score, :version,
                :oi_change_pct, :taker_ratio, :ls_ratio,
                :nearest_liq_usd, :details
            )
        """
        try:
            await self._session.execute(
                sqlalchemy.text(sql),
                {
                    "ts": alert.ts,
                    "symbol": alert.symbol,
                    "direction": alert.direction,
                    "risk_score": alert.risk_score,
                    "version": alert.version,
                    "oi_change_pct": alert.oi_change_pct,
                    "taker_ratio": alert.taker_ratio,
                    "ls_ratio": alert.ls_ratio,
                    "nearest_liq_usd": alert.nearest_liq_usd,
                    "details": json.dumps(alert.details) if alert.details else None,
                },
            )
            await self._session.commit()
        except Exception as exc:
            logger.error(
                "write_alert_failed",
                symbol=alert.symbol,
                error=str(exc),
            )
            raise

    async def _publish_alert(self, alert: KillZoneAlert) -> None:
        """发布预警到 Redis Streams alerts。"""
        try:
            await publish_stream("alerts", {
                "alert_type": "kill_zone_warning",
                "symbol": alert.symbol,
                "risk_score": alert.risk_score,
                "detection_version": alert.version,
                "direction": alert.direction,
                "oi_change_percent": alert.oi_change_pct or 0,
                "taker_ratio": alert.taker_ratio,
                "ls_ratio": alert.ls_ratio,
                "nearest_liq_usd": alert.nearest_liq_usd,
            })
        except Exception as exc:
            logger.error(
                "publish_alert_failed",
                symbol=alert.symbol,
                error=str(exc),
            )
