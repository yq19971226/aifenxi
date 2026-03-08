"""试盘识别检测器 — 量化检测庄家试盘行为。

基于2025-2026年市场环境，庄家试盘的4个核心量化特征：
1. 爆量滞涨：成交量 > 2x MA20 但 K线实体 < 0.3 * 振幅 → 试盘
2. 长影线试探：(上影线+下影线) / 实体 > 3 → 试盘
3. RSI 超买滞涨：RSI > 70 且 close < prev_high → 假突破试盘
4. OI 堆积无方向：OI 增加但价格未突破区间 → 试盘蓄势

输出 TrialTradingResult，包含试盘概率、类型、证据和建议。
供 PlaybookAgent / AIDetector / 策略生成模块消费。
"""

import logging
import statistics
from typing import Optional

from pydantic import BaseModel, Field

from app.models.market_data import KlineData, CoinGlassData

logger = logging.getLogger(__name__)


class TrialTradingSignal(BaseModel):
    """单个试盘信号。"""

    signal_type: str          # "volume_stagnation" | "long_wick" | "rsi_divergence" | "oi_buildup"
    description: str          # 人类可读描述
    strength: float = Field(ge=0.0, le=1.0)  # 信号强度
    evidence: str = ""        # 具体数据证据


class TrialTradingResult(BaseModel):
    """试盘检测结果。"""

    is_trial: bool = False                     # 是否检测到试盘
    probability: float = Field(default=0.0, ge=0.0, le=1.0)  # 试盘概率
    trial_type: str = "none"                   # "volume_test" | "wick_test" | "breakout_test" | "oi_test" | "composite"
    signals: list[TrialTradingSignal] = Field(default_factory=list)
    advice: str = ""                           # 交易建议
    cooldown_minutes: int = 0                  # 建议冷却时间（分钟）


# ── 检测阈值 ─────────────────────────────────────────────────

_VOLUME_SPIKE_RATIO = 2.0       # 成交量 / MA20 > 此值视为爆量
_BODY_RANGE_RATIO = 0.3         # 实体 / 振幅 < 此值视为滞涨
_LONG_WICK_RATIO = 3.0          # (上影+下影) / 实体 > 此值视为长影线
_RSI_OVERBOUGHT = 70.0          # RSI 超买阈值
_OI_CHANGE_THRESHOLD = 0.03     # OI 变化百分比阈值（3%）
_TRIAL_PROBABILITY_THRESHOLD = 0.5  # 综合概率 > 此值判定为试盘


def detect_trial_trading(
    klines: list[KlineData],
    rsi: Optional[float] = None,
    coinglass: Optional[CoinGlassData] = None,
    current_price: float = 0.0,
) -> TrialTradingResult:
    """检测试盘行为。

    Args:
        klines: K线数据（建议至少25根，用于计算MA20）
        rsi: 当前RSI值
        coinglass: CoinGlass数据（用于OI分析）
        current_price: 当前价格

    Returns:
        TrialTradingResult 包含试盘概率和建议
    """
    if not klines or len(klines) < 5:
        return TrialTradingResult()

    signals: list[TrialTradingSignal] = []

    # ── 1. 爆量滞涨检测 ──────────────────────────────────────
    vol_signal = _detect_volume_stagnation(klines)
    if vol_signal:
        signals.append(vol_signal)

    # ── 2. 长影线试探检测 ─────────────────────────────────────
    wick_signal = _detect_long_wicks(klines)
    if wick_signal:
        signals.append(wick_signal)

    # ── 3. RSI 超买滞涨检测 ──────────────────────────────────
    rsi_signal = _detect_rsi_divergence(klines, rsi)
    if rsi_signal:
        signals.append(rsi_signal)

    # ── 4. OI 堆积无方向检测 ─────────────────────────────────
    oi_signal = _detect_oi_buildup(klines, coinglass, current_price)
    if oi_signal:
        signals.append(oi_signal)

    # ── 综合评估 ─────────────────────────────────────────────
    if not signals:
        return TrialTradingResult()

    # 加权计算综合概率
    weights = {
        "volume_stagnation": 0.35,
        "long_wick": 0.25,
        "rsi_divergence": 0.20,
        "oi_buildup": 0.20,
    }
    total_weight = sum(weights.get(s.signal_type, 0.1) for s in signals)
    weighted_prob = sum(
        s.strength * weights.get(s.signal_type, 0.1) for s in signals
    )
    probability = min(weighted_prob / max(total_weight, 0.01), 1.0)

    # 多信号叠加加成（2个以上信号同时出现，概率上调）
    if len(signals) >= 3:
        probability = min(probability * 1.3, 1.0)
    elif len(signals) >= 2:
        probability = min(probability * 1.15, 1.0)

    is_trial = probability >= _TRIAL_PROBABILITY_THRESHOLD

    # 确定试盘类型
    if len(signals) >= 2:
        trial_type = "composite"
    elif signals:
        type_map = {
            "volume_stagnation": "volume_test",
            "long_wick": "wick_test",
            "rsi_divergence": "breakout_test",
            "oi_buildup": "oi_test",
        }
        trial_type = type_map.get(signals[0].signal_type, "unknown")
    else:
        trial_type = "none"

    # 生成建议
    advice = _generate_advice(is_trial, probability, signals)
    cooldown = 30 if is_trial and probability >= 0.7 else (15 if is_trial else 0)

    return TrialTradingResult(
        is_trial=is_trial,
        probability=round(probability, 4),
        trial_type=trial_type,
        signals=signals,
        advice=advice,
        cooldown_minutes=cooldown,
    )


# ── 维度1: 爆量滞涨 ─────────────────────────────────────────


def _detect_volume_stagnation(klines: list[KlineData]) -> Optional[TrialTradingSignal]:
    """检测成交量暴增但价格几乎不动的试盘特征。

    庄家试盘时会放量测试抛压，但不让价格产生大幅变化。
    """
    if len(klines) < 21:
        return None

    volumes = [k.volume for k in klines]
    ma20_vol = statistics.mean(volumes[-21:-1])  # 前20根的均值（不含最新）
    if ma20_vol <= 0:
        return None

    latest = klines[-1]
    vol_ratio = latest.volume / ma20_vol

    # 计算K线实体与振幅比
    body = abs(latest.close - latest.open)
    full_range = latest.high - latest.low
    if full_range <= 0:
        return None

    body_ratio = body / full_range

    if vol_ratio >= _VOLUME_SPIKE_RATIO and body_ratio <= _BODY_RANGE_RATIO:
        strength = min((vol_ratio - _VOLUME_SPIKE_RATIO) / 3.0 + 0.5, 1.0)
        return TrialTradingSignal(
            signal_type="volume_stagnation",
            description="爆量滞涨：成交量异常放大但价格几乎不动，庄家正在测试抛压",
            strength=round(strength, 4),
            evidence=(
                f"成交量/MA20={vol_ratio:.2f}x, "
                f"实体/振幅={body_ratio:.2f}, "
                f"volume={latest.volume:.0f}, MA20={ma20_vol:.0f}"
            ),
        )

    # 检查最近3根K线的组合（连续小实体+放量）
    recent_3 = klines[-3:]
    avg_vol_3 = statistics.mean(k.volume for k in recent_3)
    avg_body_ratio_3 = statistics.mean(
        abs(k.close - k.open) / max(k.high - k.low, 1e-10) for k in recent_3
    )

    if avg_vol_3 / ma20_vol >= 1.5 and avg_body_ratio_3 <= 0.35:
        strength = min((avg_vol_3 / ma20_vol - 1.5) / 2.0 + 0.4, 0.85)
        return TrialTradingSignal(
            signal_type="volume_stagnation",
            description="连续爆量滞涨：近3根K线持续放量但实体极小，试盘特征明显",
            strength=round(strength, 4),
            evidence=(
                f"近3根均量/MA20={avg_vol_3/ma20_vol:.2f}x, "
                f"平均实体比={avg_body_ratio_3:.2f}"
            ),
        )

    return None


# ── 维度2: 长影线试探 ────────────────────────────────────────


def _detect_long_wicks(klines: list[KlineData]) -> Optional[TrialTradingSignal]:
    """检测长上/下影线的试盘特征。

    庄家试盘时会快速拉升/打压再收回，形成长影线。
    """
    if len(klines) < 3:
        return None

    # 检查最近3根K线
    wick_signals = 0
    max_wick_ratio = 0.0
    evidence_parts: list[str] = []

    for i, k in enumerate(klines[-3:], 1):
        body = abs(k.close - k.open)
        if body < 1e-10:
            body = (k.high - k.low) * 0.01  # 十字星也计入

        upper_wick = k.high - max(k.open, k.close)
        lower_wick = min(k.open, k.close) - k.low
        total_wick = upper_wick + lower_wick
        wick_ratio = total_wick / max(body, 1e-10)

        if wick_ratio >= _LONG_WICK_RATIO:
            wick_signals += 1
            max_wick_ratio = max(max_wick_ratio, wick_ratio)
            evidence_parts.append(f"K{i}: 影线/实体={wick_ratio:.1f}x")

    if wick_signals == 0:
        return None

    # 多根长影线叠加加成
    strength = min(0.4 + wick_signals * 0.2, 1.0)
    if max_wick_ratio >= 5.0:
        strength = min(strength + 0.15, 1.0)

    return TrialTradingSignal(
        signal_type="long_wick",
        description=f"长影线试探：近3根K线中{wick_signals}根出现异常长影线，庄家正在试探方向",
        strength=round(strength, 4),
        evidence=", ".join(evidence_parts),
    )


# ── 维度3: RSI 超买滞涨 ─────────────────────────────────────


def _detect_rsi_divergence(
    klines: list[KlineData],
    rsi: Optional[float],
) -> Optional[TrialTradingSignal]:
    """检测RSI超买但价格未创新高的试盘特征。

    RSI冲高但价格滞涨，说明买入力度在减弱，庄家可能在试盘。
    """
    if rsi is None or len(klines) < 5:
        return None

    if rsi < _RSI_OVERBOUGHT:
        return None

    # 检查最近的价格是否创新高
    recent_highs = [k.high for k in klines[-5:]]
    current_close = klines[-1].close
    prev_high = max(recent_highs[:-1]) if len(recent_highs) > 1 else recent_highs[0]

    # RSI超买但收盘价未突破前高
    if current_close < prev_high:
        strength = min((rsi - _RSI_OVERBOUGHT) / 20.0 + 0.4, 0.9)
        return TrialTradingSignal(
            signal_type="rsi_divergence",
            description="RSI超买滞涨：RSI已超买但价格未创新高，可能是假突破试盘",
            strength=round(strength, 4),
            evidence=f"RSI={rsi:.1f}, 收盘={current_close:.2f}, 前高={prev_high:.2f}",
        )

    # RSI极端高位（>80）即使创新高也标记
    if rsi > 80 and current_close >= prev_high:
        price_change_pct = (current_close - prev_high) / prev_high * 100
        if price_change_pct < 1.0:  # 突破幅度很小
            return TrialTradingSignal(
                signal_type="rsi_divergence",
                description="RSI极端超买：RSI>80且突破幅度极小，警惕试盘后回落",
                strength=0.45,
                evidence=f"RSI={rsi:.1f}, 突破幅度仅{price_change_pct:.2f}%",
            )

    return None


# ── 维度4: OI 堆积无方向 ────────────────────────────────────


def _detect_oi_buildup(
    klines: list[KlineData],
    coinglass: Optional[CoinGlassData],
    current_price: float,
) -> Optional[TrialTradingSignal]:
    """检测OI持续增加但价格在窄幅震荡的试盘特征。

    大量合约建仓但价格不动，说明多空双方在博弈蓄势。
    """
    if coinglass is None or not coinglass.oi_snapshots:
        return None

    if len(coinglass.oi_snapshots) < 3:
        return None

    # 取最近几条OI快照
    recent_oi = coinglass.oi_snapshots[-5:]
    oi_values = []
    for snap in recent_oi:
        oi_val = snap.get("oi") or snap.get("openInterest")
        if oi_val is not None:
            try:
                oi_values.append(float(oi_val))
            except (ValueError, TypeError):
                pass

    if len(oi_values) < 3:
        return None

    # OI 变化趋势
    oi_change_pct = (oi_values[-1] - oi_values[0]) / max(oi_values[0], 1) * 100

    # 价格变化（区间）
    if len(klines) < 5 or current_price <= 0:
        return None

    recent_prices = [k.close for k in klines[-5:]]
    price_range_pct = (max(recent_prices) - min(recent_prices)) / current_price * 100

    # OI 上涨但价格波动极小 → 试盘蓄势
    if oi_change_pct > _OI_CHANGE_THRESHOLD * 100 and price_range_pct < 2.0:
        strength = min(oi_change_pct / 10.0 + 0.3, 0.85)
        return TrialTradingSignal(
            signal_type="oi_buildup",
            description="OI堆积蓄势：合约持仓量持续增加但价格窄幅震荡，多空博弈试盘中",
            strength=round(strength, 4),
            evidence=(
                f"OI变化={oi_change_pct:+.2f}%, "
                f"价格波幅={price_range_pct:.2f}%, "
                f"OI: {oi_values[0]:.0f} → {oi_values[-1]:.0f}"
            ),
        )

    return None


# ── 建议生成 ────────────────────────────────────────────────


def _generate_advice(
    is_trial: bool,
    probability: float,
    signals: list[TrialTradingSignal],
) -> str:
    """根据试盘检测结果生成交易建议。"""
    if not is_trial:
        if signals:
            return "存在轻微试盘迹象，保持警惕但不影响正常交易"
        return ""

    signal_types = {s.signal_type for s in signals}

    parts: list[str] = [f"检测到试盘行为（概率{probability:.0%}）"]

    if "volume_stagnation" in signal_types:
        parts.append("放量不涨，不追高")

    if "long_wick" in signal_types:
        parts.append("长影线频现，等收盘确认再操作")

    if "rsi_divergence" in signal_types:
        parts.append("RSI超买但动能不足，不做突破追单")

    if "oi_buildup" in signal_types:
        parts.append("OI堆积中，等待方向明确后再入场")

    if probability >= 0.7:
        parts.append("建议暂停交易30分钟，等待试盘结束")
    elif probability >= 0.5:
        parts.append("建议观望或轻仓，等回踩缩量确认后再接")

    return "；".join(parts)
