"""风险预警智能体 — 监控链上数据阈值，触发后写入 Redis Streams 告警。

阈值规则（支持从 config_service 动态读取，降级使用硬编码默认值）：
- 交易所单笔流入 > 1000 BTC
- 巨鲸转账 > $10M
- MVRV > 3.5 或 < 1
- 恐慌贪婪指数 < 15 或 > 85

触发后通过 publish_stream("alerts", ...) 写入 Redis Streams，
同时调用 LLM 对风险信号进行综合解读。
"""

import asyncio
import logging
from datetime import datetime, timezone
from enum import Enum
from typing import Any, Literal

from pydantic import BaseModel, Field

from app.agents.base import AgentReport, BaseAgent
from app.agents.i18n_prompts import get_system_prompt
from app.agents.language_detect import check_language_mismatch
from app.core.redis import publish_stream
from app.models.market_data import MarketData

logger = logging.getLogger(__name__)


# ── 阈值常量 ─────────────────────────────────────────────────

EXCHANGE_INFLOW_BTC_THRESHOLD: float = 1000.0
WHALE_TRANSFER_USD_THRESHOLD: float = 10_000_000.0
MVRV_HIGH_THRESHOLD: float = 3.5
MVRV_LOW_THRESHOLD: float = 1.0
FEAR_GREED_PANIC_THRESHOLD: int = 15
FEAR_GREED_GREED_THRESHOLD: int = 85

# ── 合约数据阈值常量 (需求12) ────────────────────────────────

FUNDING_RATE_THRESHOLD: float = 0.001          # |rate| > 0.1%
LIQUIDATION_1H_THRESHOLD: float = 50_000_000   # $50M
LONG_SHORT_IMBALANCE_THRESHOLD: float = 0.5    # 偏离1.0超过0.5


# ── Pydantic 模型 ────────────────────────────────────────────


class AlertSeverity(str, Enum):
    """告警严重程度。"""

    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"


class AlertType(str, Enum):
    """告警类型。"""

    EXCHANGE_LARGE_INFLOW = "exchange_large_inflow"
    WHALE_LARGE_TRANSFER = "whale_large_transfer"
    MVRV_EXTREME = "mvrv_extreme"
    FEAR_GREED_EXTREME = "fear_greed_extreme"
    FUNDING_RATE_EXTREME = "funding_rate_extreme"
    LARGE_LIQUIDATION = "large_liquidation"
    LONG_SHORT_IMBALANCE = "long_short_imbalance"
    FUNDING_RATE_MANIPULATION = "funding_rate_manipulation"


class RiskAlert(BaseModel):
    """单条风险告警 — 写入 Redis Streams 的数据结构。"""

    alert_type: str
    symbol: str
    severity: str
    message: str
    triggered_value: float
    threshold: float
    timestamp: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


# ── 动态阈值读取 ─────────────────────────────────────────────

# 配置键名与模块级常量的映射
_THRESHOLD_CONFIG_KEYS: dict[str, str] = {
    "exchange_inflow_btc": "risk_threshold_exchange_inflow_btc",
    "whale_transfer_usd": "risk_threshold_whale_transfer_usd",
    "mvrv_high": "risk_threshold_mvrv_high",
    "mvrv_low": "risk_threshold_mvrv_low",
    "fear_greed_panic": "risk_threshold_fear_greed_panic",
    "fear_greed_greed": "risk_threshold_fear_greed_greed",
    "funding_rate": "risk_threshold_funding_rate",
    "liquidation_1h": "risk_threshold_liquidation_1h",
    "long_short_imbalance": "risk_threshold_long_short_imbalance",
}


def _apply_threshold_jitter(
    thresholds: dict[str, float], jitter_pct: float = 0.10
) -> dict[str, float]:
    """为阈值施加随机噪声（±jitter_pct），防止庄家精确试探检测边界。

    噪声种子基于当前小时，同一小时内结果稳定，跨小时自动变化。
    """
    import hashlib
    import random

    hour_seed = datetime.now(timezone.utc).strftime("%Y%m%d%H")
    result: dict[str, float] = {}
    for key, value in thresholds.items():
        seed_str = f"{key}:{hour_seed}"
        seed_int = int(hashlib.sha256(seed_str.encode()).hexdigest()[:8], 16)
        rng = random.Random(seed_int)
        factor = 1.0 + rng.uniform(-jitter_pct, jitter_pct)
        result[key] = value * factor
    return result


async def _get_risk_thresholds() -> dict[str, float]:
    """从 config_service 异步读取风险阈值，不可用时降级使用硬编码默认值。

    返回值会叠加 ±10% 随机噪声（抗侦察），每小时变化一次。
    """
    defaults: dict[str, float] = {
        "exchange_inflow_btc": EXCHANGE_INFLOW_BTC_THRESHOLD,
        "whale_transfer_usd": WHALE_TRANSFER_USD_THRESHOLD,
        "mvrv_high": MVRV_HIGH_THRESHOLD,
        "mvrv_low": MVRV_LOW_THRESHOLD,
        "fear_greed_panic": float(FEAR_GREED_PANIC_THRESHOLD),
        "fear_greed_greed": float(FEAR_GREED_GREED_THRESHOLD),
        "funding_rate": FUNDING_RATE_THRESHOLD,
        "liquidation_1h": LIQUIDATION_1H_THRESHOLD,
        "long_short_imbalance": LONG_SHORT_IMBALANCE_THRESHOLD,
    }

    try:
        from app.services.config_service import get_config_value

        results: dict[str, float] = {}
        for key, config_key in _THRESHOLD_CONFIG_KEYS.items():
            raw = await asyncio.wait_for(
                get_config_value(config_key, str(defaults[key])),
                timeout=5.0,
            )
            results[key] = float(raw)

        logger.info("Risk thresholds loaded from config_service")
        return _apply_threshold_jitter(results)

    except Exception as exc:
        logger.warning(
            "Failed to load risk thresholds from config_service, using defaults",
            extra={"error": str(exc)},
        )
        return _apply_threshold_jitter(defaults)


# ── 阈值检查函数 ─────────────────────────────────────────────


async def check_thresholds(data: MarketData) -> list[RiskAlert]:
    """检查 MarketData 中的链上数据是否触发风险阈值，返回告警列表。

    阈值优先从 config_service 动态读取，不可用时降级使用硬编码默认值。
    """
    thresholds = await _get_risk_thresholds()

    alerts: list[RiskAlert] = []
    oc = data.onchain
    if oc is None:
        # 即使无链上数据，仍检查合约数据
        alerts.extend(_check_derivatives_thresholds(data, thresholds))
        return alerts

    t_exchange_inflow = thresholds["exchange_inflow_btc"]
    t_whale_transfer = thresholds["whale_transfer_usd"]
    t_mvrv_high = thresholds["mvrv_high"]
    t_mvrv_low = thresholds["mvrv_low"]
    t_fg_panic = thresholds["fear_greed_panic"]
    t_fg_greed = thresholds["fear_greed_greed"]

    # 交易所单笔流入 > 阈值 BTC
    if oc.exchange_netflow is not None and oc.exchange_netflow > t_exchange_inflow:
        alerts.append(
            RiskAlert(
                alert_type=AlertType.EXCHANGE_LARGE_INFLOW,
                symbol=data.symbol,
                severity=AlertSeverity.HIGH,
                message=f"交易所大额流入 {oc.exchange_netflow:.2f} BTC，超过阈值 {t_exchange_inflow} BTC",
                triggered_value=oc.exchange_netflow,
                threshold=t_exchange_inflow,
            )
        )

    # 巨鲸转账 > 阈值（whale_change_24h 为百分比，用 current_price 估算绝对值）
    if oc.whale_change_24h is not None:
        # whale_change_24h 是百分比变化，估算绝对美元价值
        estimated_whale_usd = abs(oc.whale_change_24h) * data.current_price * 100
        if estimated_whale_usd > t_whale_transfer:
            alerts.append(
                RiskAlert(
                    alert_type=AlertType.WHALE_LARGE_TRANSFER,
                    symbol=data.symbol,
                    severity=AlertSeverity.HIGH,
                    message=f"巨鲸大额转账，估算价值 ${estimated_whale_usd:,.0f}，超过阈值 ${t_whale_transfer:,.0f}",
                    triggered_value=estimated_whale_usd,
                    threshold=t_whale_transfer,
                )
            )

    # MVRV > 高位阈值 或 < 低位阈值
    if oc.mvrv is not None:
        if oc.mvrv > t_mvrv_high:
            alerts.append(
                RiskAlert(
                    alert_type=AlertType.MVRV_EXTREME,
                    symbol=data.symbol,
                    severity=AlertSeverity.HIGH,
                    message=f"MVRV 达到 {oc.mvrv:.2f}，超过高位阈值 {t_mvrv_high}，市场可能过热",
                    triggered_value=oc.mvrv,
                    threshold=t_mvrv_high,
                )
            )
        elif oc.mvrv < t_mvrv_low:
            alerts.append(
                RiskAlert(
                    alert_type=AlertType.MVRV_EXTREME,
                    symbol=data.symbol,
                    severity=AlertSeverity.MEDIUM,
                    message=f"MVRV 仅 {oc.mvrv:.2f}，低于阈值 {t_mvrv_low}，市场可能被低估",
                    triggered_value=oc.mvrv,
                    threshold=t_mvrv_low,
                )
            )

    # 恐慌贪婪指数 < 恐慌阈值 或 > 贪婪阈值
    if oc.fear_greed_index is not None:
        if oc.fear_greed_index > t_fg_greed:
            alerts.append(
                RiskAlert(
                    alert_type=AlertType.FEAR_GREED_EXTREME,
                    symbol=data.symbol,
                    severity=AlertSeverity.HIGH,
                    message=f"恐慌贪婪指数 {oc.fear_greed_index}，超过贪婪阈值 {t_fg_greed}，市场极度贪婪",
                    triggered_value=float(oc.fear_greed_index),
                    threshold=float(t_fg_greed),
                )
            )
        elif oc.fear_greed_index < t_fg_panic:
            alerts.append(
                RiskAlert(
                    alert_type=AlertType.FEAR_GREED_EXTREME,
                    symbol=data.symbol,
                    severity=AlertSeverity.MEDIUM,
                    message=f"恐慌贪婪指数 {oc.fear_greed_index}，低于恐慌阈值 {t_fg_panic}，市场极度恐慌",
                    triggered_value=float(oc.fear_greed_index),
                    threshold=float(t_fg_panic),
                )
            )

    # 合约数据阈值检查
    alerts.extend(_check_derivatives_thresholds(data, thresholds))

    # ── 统计异常检测层（Z-Score + 百分位数）──
    try:
        from app.agents.anomaly_detector import (
            detect_anomalies,
            extract_risk_indicators,
            load_indicator_stats,
        )

        raw_indicators = extract_risk_indicators(oc, data.derivatives, data.current_price)
        stats_map = await load_indicator_stats(data.symbol)
        if stats_map:
            anomalies = detect_anomalies(raw_indicators, stats_map, z_threshold=2.5)
            for a in anomalies:
                # 统计异常与固定阈值告警是互补视角，均保留
                anomaly_type = f"statistical_{a.indicator}"
                alerts.append(
                    RiskAlert(
                        alert_type=anomaly_type,
                        symbol=data.symbol,
                        severity=AlertSeverity.HIGH if a.percentile_rank == "extreme" else AlertSeverity.MEDIUM,
                        message=f"统计异常: {a.detail}",
                        triggered_value=a.value,
                        threshold=a.z_score,
                    )
                )
    except Exception as exc:
        logger.warning("Statistical anomaly detection failed, skipping: %s", exc)

    return alerts


def _check_derivatives_thresholds(
    data: MarketData, thresholds: dict[str, float]
) -> list[RiskAlert]:
    """检查合约数据是否触发风险阈值，返回告警列表。"""
    alerts: list[RiskAlert] = []
    deriv = data.derivatives
    if deriv is None:
        return alerts

    t_funding_rate = thresholds["funding_rate"]
    t_liquidation_1h = thresholds["liquidation_1h"]
    t_long_short_imbalance = thresholds["long_short_imbalance"]

    # 资金费率异常: |rate| > 阈值
    if deriv.funding_rate is not None and abs(deriv.funding_rate) > t_funding_rate:
        direction = "多头过热" if deriv.funding_rate > 0 else "空头过热"
        alerts.append(
            RiskAlert(
                alert_type=AlertType.FUNDING_RATE_EXTREME,
                symbol=data.symbol,
                severity=AlertSeverity.HIGH,
                message=f"资金费率异常 {deriv.funding_rate:.6f}（{direction}），超过阈值 ±{t_funding_rate}",
                triggered_value=deriv.funding_rate,
                threshold=t_funding_rate,
            )
        )

    # 大规模爆仓: 1h > 阈值
    if deriv.liquidation_1h_usd is not None and deriv.liquidation_1h_usd > t_liquidation_1h:
        alerts.append(
            RiskAlert(
                alert_type=AlertType.LARGE_LIQUIDATION,
                symbol=data.symbol,
                severity=AlertSeverity.HIGH,
                message=f"1小时爆仓总额 ${deriv.liquidation_1h_usd:,.0f}，超过阈值 ${t_liquidation_1h:,.0f}",
                triggered_value=deriv.liquidation_1h_usd,
                threshold=t_liquidation_1h,
            )
        )

    # 多空失衡: 偏离1.0超过阈值
    if deriv.long_short_ratio is not None and abs(deriv.long_short_ratio - 1.0) > t_long_short_imbalance:
        bias = "多头偏重" if deriv.long_short_ratio > 1.0 else "空头偏重"
        alerts.append(
            RiskAlert(
                alert_type=AlertType.LONG_SHORT_IMBALANCE,
                symbol=data.symbol,
                severity=AlertSeverity.MEDIUM,
                message=f"多空比 {deriv.long_short_ratio:.4f}（{bias}），偏离1.0超过阈值 {t_long_short_imbalance}",
                triggered_value=deriv.long_short_ratio,
                threshold=t_long_short_imbalance,
            )
        )

    # 资金费率操纵组合检测：费率极端 + 多空比极端偏离 → 可能存在现货推价+期货收费率的操纵
    if (
        deriv.funding_rate is not None
        and deriv.long_short_ratio is not None
        and abs(deriv.funding_rate) > t_funding_rate
        and (deriv.long_short_ratio > 2.0 or deriv.long_short_ratio < 0.5)
    ):
        manipulation_dir = (
            "现货推高+期货做空收费率" if deriv.funding_rate > 0
            else "现货砸低+期货做多收费率"
        )
        alerts.append(
            RiskAlert(
                alert_type=AlertType.FUNDING_RATE_MANIPULATION,
                symbol=data.symbol,
                severity=AlertSeverity.HIGH,
                message=(
                    f"⚠️ 资金费率操纵嫌疑: 费率={deriv.funding_rate:.6f}, "
                    f"多空比={deriv.long_short_ratio:.2f}, "
                    f"模式={manipulation_dir}"
                ),
                triggered_value=deriv.funding_rate,
                threshold=t_funding_rate,
            )
        )

    return alerts


# ── LLM Prompt ───────────────────────────────────────────────

_SYSTEM_PROMPT = """你是一位专业的加密货币风险分析师，擅长从链上数据中识别异常信号并评估风险等级。
根据提供的风险告警信息和链上数据，给出综合风险评估。

你必须以 JSON 格式回复，包含以下字段：
{
  "signal": "bullish" | "bearish" | "neutral",
  "confidence": 0.0 到 1.0 之间的浮点数,
  "risk_level": "high" | "medium" | "low",
  "reasoning": "综合风险分析说明",
  "recommendations": ["建议1", "建议2", ...],
  "key_risks": ["风险点1", "风险点2", ...]
}

评估规则：
- 多个高严重度告警同时触发 → signal=bearish, confidence 较高
- 单个中等严重度告警 → signal=neutral, confidence 适中
- MVRV 极高 + 恐慌贪婪极度贪婪 → 强烈 bearish 信号
- MVRV 极低 + 恐慌贪婪极度恐慌 → 可能是 bullish 机会（反向信号）
- 无告警触发 → signal=neutral, confidence 低

【硬约束 - 反幻觉规则】
1. 风险评估必须基于实际触发的告警和输入的链上数据，禁止编造未在输入中出现的风险事件
2. 当输入数据标注为"数据缺失"时，对应风险维度必须标注为"数据不足，无法评估"
3. risk_factors 中每条风险因素必须引用输入中的具体数值"""


def _build_risk_user_prompt(data: MarketData, alerts: list[RiskAlert]) -> str:
    """构建风险分析用户 prompt。"""
    parts: list[str] = [
        f"交易对: {data.symbol}",
        f"当前价格: {data.current_price}",
        f"触发告警数量: {len(alerts)}",
        "",
        "=== 触发的告警 ===",
    ]

    if alerts:
        for i, alert in enumerate(alerts, 1):
            parts.append(
                f"{i}. [{alert.severity}] {alert.alert_type}: {alert.message}"
            )
    else:
        parts.append("无告警触发，所有指标在正常范围内。")

    parts.append("")
    parts.append("=== 链上数据 ===")

    oc = data.onchain
    if oc:
        parts.append(
            f"交易所净流量: {oc.exchange_netflow}" if oc.exchange_netflow is not None else "交易所净流量: 数据缺失"
        )
        parts.append(
            f"巨鲸持仓24h变化: {oc.whale_change_24h}%" if oc.whale_change_24h is not None else "巨鲸持仓24h变化: 数据缺失"
        )
        parts.append(
            f"恐慌贪婪指数: {oc.fear_greed_index}/100" if oc.fear_greed_index is not None else "恐慌贪婪指数: 数据缺失"
        )
        parts.append(
            f"MVRV: {oc.mvrv}" if oc.mvrv is not None else "MVRV: 数据缺失"
        )
    else:
        parts.append("链上数据: 全部缺失")

    # 合约数据
    deriv = data.derivatives
    if deriv:
        parts.append("\n=== 合约数据 ===")
        parts.append(
            f"资金费率: {deriv.funding_rate}" if deriv.funding_rate is not None else "资金费率: 数据缺失"
        )
        parts.append(
            f"多空比: {deriv.long_short_ratio}" if deriv.long_short_ratio is not None else "多空比: 数据缺失"
        )
        parts.append(
            f"1h爆仓总额: ${deriv.liquidation_1h_usd:,.0f}" if deriv.liquidation_1h_usd is not None else "1h爆仓总额: 数据缺失"
        )

    # CoinGlass 衍生品数据
    cg = data.coinglass
    if cg:
        parts.append("\n=== CoinGlass 衍生品数据 ===")
        if cg.oi_snapshots:
            latest_oi = cg.oi_snapshots[-1]
            oi_val = latest_oi.get('open_interest', latest_oi.get('oi', 'N/A'))
            oi_chg = latest_oi.get('oi_change_24h', latest_oi.get('oi_change_pct', 'N/A'))
            parts.append(f"OI 持仓量: {oi_val} 24h变化: {oi_chg}")
        if cg.netflow_snapshots:
            latest_nf = cg.netflow_snapshots[-1]
            nf_val = latest_nf.get('net_flow', latest_nf.get('netflow', 'N/A'))
            parts.append(f"期货净流入: {nf_val}")
        if cg.funding_rate_history:
            parts.append("多交易所资金费率:")
            for snap in cg.funding_rate_history[-3:]:
                fr_val = snap.get('close', snap.get('rate', 'N/A'))
                parts.append(f"  {snap.get('exchange', '?')}: {fr_val}")
        if cg.option_max_pain:
            parts.append(f"期权 Max Pain: {cg.option_max_pain.get('max_pain_price', 'N/A')}")
        if cg.option_info:
            parts.append(
                f"期权 Put/Call 比: {cg.option_info.get('put_call_ratio', 'N/A')} "
                f"总 OI: {cg.option_info.get('total_oi', 'N/A')}"
            )

    return "\n".join(parts)


# ── RiskAgent ────────────────────────────────────────────────


class RiskAgent(BaseAgent):
    """风险预警智能体 — 单一职责：监控链上阈值并发布告警。"""

    AGENT_ID: str = "risk"

    async def analyze(self, data: MarketData) -> AgentReport:
        """检查阈值 → 发布告警到 Redis Streams → 调用 LLM 综合解读。"""

        # 1. 阈值检查
        alerts = await check_thresholds(data)

        # 2. 发布告警到 Redis Streams
        published_ids: list[str] = []
        for alert in alerts:
            try:
                msg_id = await publish_stream("alerts", alert.model_dump())
                published_ids.append(msg_id)
                logger.info(
                    "Risk alert published",
                    extra={
                        "alert_type": alert.alert_type,
                        "symbol": alert.symbol,
                        "severity": alert.severity,
                        "stream_msg_id": msg_id,
                    },
                )
            except Exception as exc:
                logger.error(
                    "Failed to publish risk alert",
                    extra={
                        "alert_type": alert.alert_type,
                        "symbol": alert.symbol,
                        "error": str(exc),
                    },
                )

        # 3. 调用 LLM 综合解读风险信号
        user_prompt = _build_risk_user_prompt(data, alerts)

        try:
            locale = getattr(data, "locale", "zh-CN")
            risk_prompt = get_system_prompt("risk", locale)
            enriched_prompt = await self._enrich_prompt(risk_prompt, data.symbol)
            from app.core.model_router import call_with_fallback
            _model_key, result = await call_with_fallback(
                "risk",
                system_prompt=enriched_prompt,
                user_prompt=user_prompt,
            )

            # 解析 signal
            signal: Literal["bullish", "bearish", "neutral"] = result.get("signal", "neutral")
            if signal not in ("bullish", "bearish", "neutral"):
                signal = "neutral"

            # 解析 confidence
            confidence: float = result.get("confidence", 0.0)
            if not isinstance(confidence, (int, float)) or not (0.0 <= confidence <= 1.0):
                confidence = 0.0

            # 解析 risk_level
            risk_level: str = result.get("risk_level", "low")
            if risk_level not in ("high", "medium", "low"):
                risk_level = "low"

            # 解析 recommendations
            recommendations: list[str] = result.get("recommendations", [])
            if not isinstance(recommendations, list):
                recommendations = []

            # 解析 key_risks
            key_risks: list[str] = result.get("key_risks", [])
            if not isinstance(key_risks, list):
                key_risks = []

            # 风险等级中文映射
            _risk_level_zh = {"high": "高", "medium": "中", "low": "低"}.get(risk_level, risk_level)
            key_findings: list[str] = [f"风险等级: {_risk_level_zh}"]
            key_findings.append(f"触发告警: {len(alerts)} 条")
            key_findings.extend(key_risks)
            key_findings.extend(f"建议: {r}" for r in recommendations)

            reasoning_text = result.get("reasoning", "风险评估完成")
            content_locale, lang_mismatch = check_language_mismatch(
                reasoning_text, locale,
            )

            return AgentReport(
                agent_id=self.AGENT_ID,
                symbol=data.symbol,
                signal=signal,
                confidence=confidence,
                reasoning=reasoning_text,
                key_findings=key_findings,
                raw_data={
                    "risk_level": risk_level,
                    "alerts_count": len(alerts),
                    "alerts": [a.model_dump() for a in alerts],
                    "published_stream_ids": published_ids,
                    "recommendations": recommendations,
                    "key_risks": key_risks,
                    "is_fallback": result.get("is_fallback", False),
                },
                content_locale=content_locale,
                language_mismatch=lang_mismatch,
            )

        except Exception as exc:
            logger.error(
                "RiskAgent analyze failed",
                extra={"symbol": data.symbol, "error": str(exc)},
            )
            return AgentReport(
                agent_id=self.AGENT_ID,
                symbol=data.symbol,
                signal="neutral",
                confidence=0.0,
                reasoning=f"风险分析失败: {exc}",
                key_findings=[f"触发告警: {len(alerts)} 条", "风险分析过程中发生异常"],
                raw_data={
                    "risk_level": "low",
                    "alerts_count": len(alerts),
                    "alerts": [a.model_dump() for a in alerts],
                    "published_stream_ids": published_ids,
                    "recommendations": [],
                    "key_risks": [],
                    "error": str(exc),
                    "is_fallback": True,
                },
            )
