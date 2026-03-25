"""事件合约规则引擎 v2 — 信号分层 + 自适应阈值 + 多窗口确认。

信号分层：
  - strong  (高确信): 主信号 ≥ 2 + 辅助 ≥ 1 + 无矛盾 + 趋势一致
  - medium  (中确信): 主信号 ≥ 1 + 辅助 ≥ 1，或 主 ≥ 2 + 辅 = 0
  - weak    (低确信): 主信号 ≥ 1 + 辅助 ≥ 0.5
  - None    (跳过):   不满足以上

主信号（订单流，权重 70%）：
  - 买卖比 > 动态阈值       → +1
  - 订单簿失衡 > 动态阈值   → +1
  - 大单净流向 > 动态阈值   → +1

辅助信号（1 分钟指标，权重 30%）：
  - RSI(14) 偏离             → +0.5
  - EMA5 > EMA10             → +0.5
  - 成交量突增               → +0.5

加成：
  - 订单流加速度             → +0.3
  - 多窗口趋势一致           → +0.3 (strong) / +0.2 (部分一致)

波动率自适应：
  - 低波动 → 放宽阈值（更容易出信号）
  - 高波动 → 收紧阈值（对信号要求更高）
"""

from __future__ import annotations

import logging
from typing import Any, Literal

logger = logging.getLogger(__name__)

# ── 基准阈值 ────────────────────────────────────────────────
_BASE_BSR_THRESHOLD = 1.40       # 买卖比基准阈值
_BASE_OBI_THRESHOLD = 0.20       # 订单簿失衡基准阈值
_BASE_LARGE_ORDER_THRESHOLD = 80_000  # 大单净差基准阈值


class SignalResult:
    """规则引擎评估结果。"""

    def __init__(
        self,
        direction: Literal["up", "down"] | None,
        strength: float,
        primary_score: float,
        secondary_score: float,
        signals: list[str],
        tier: Literal["strong", "medium", "weak"] | None = None,
    ) -> None:
        self.direction = direction
        self.strength = strength  # 0.0 ~ 1.0
        self.primary_score = primary_score
        self.secondary_score = secondary_score
        self.signals = signals
        self.tier = tier  # 信号分层：strong / medium / weak / None

    def to_dict(self) -> dict:
        return {
            "direction": self.direction,
            "strength": round(self.strength, 4),
            "primary_score": self.primary_score,
            "secondary_score": self.secondary_score,
            "signals": self.signals,
            "tier": self.tier,
        }


def _adaptive_thresholds(volatility: float | None) -> dict[str, float]:
    """根据波动率动态调整阈值。"""
    if volatility is None or volatility <= 0:
        # 数据不足，使用默认值
        return {
            "bsr": _BASE_BSR_THRESHOLD,
            "obi": _BASE_OBI_THRESHOLD,
            "lof": _BASE_LARGE_ORDER_THRESHOLD,
        }

    if volatility < 0.0015:
        # 极低波动（横盘）→ 放宽阈值
        factor = 0.75
    elif volatility < 0.003:
        # 低波动 → 略放宽
        factor = 0.85
    elif volatility < 0.006:
        # 正常波动 → 默认
        factor = 1.0
    elif volatility < 0.01:
        # 高波动 → 收紧
        factor = 1.20
    else:
        # 极高波动（暴力行情）→ 大幅收紧
        factor = 1.50

    return {
        "bsr": round(1.0 + (_BASE_BSR_THRESHOLD - 1.0) * factor, 3),
        "obi": round(_BASE_OBI_THRESHOLD * factor, 3),
        "lof": round(_BASE_LARGE_ORDER_THRESHOLD * factor, 0),
    }


def evaluate(metrics: dict[str, Any]) -> SignalResult:
    """评估实时指标，返回分层预测结果。

    Args:
        metrics: EventStreamAggregator._metrics 快照

    Returns:
        SignalResult 对象，direction 为 None 表示信号不足。
    """
    bullish_primary = 0.0
    bearish_primary = 0.0
    bullish_secondary = 0.0
    bearish_secondary = 0.0
    signals: list[str] = []

    # ── 波动率自适应阈值 ──
    volatility = metrics.get("volatility")
    thresholds = _adaptive_thresholds(volatility)
    bsr_thresh = thresholds["bsr"]
    bsr_thresh_inv = round(1.0 / bsr_thresh, 4)
    obi_thresh = thresholds["obi"]
    lof_thresh = thresholds["lof"]

    if volatility is not None:
        signals.append(f"volatility={volatility:.5f} → thresholds(bsr={bsr_thresh}, obi={obi_thresh}, lof={lof_thresh:.0f})")

    # ── 主信号 1: 买卖比（30s 窗口） ──
    bsr = metrics.get("buy_sell_ratio_30s", 1.0)
    if bsr > bsr_thresh:
        bullish_primary += 1
        signals.append(f"bsr_30s={bsr:.2f}>{bsr_thresh} → bullish")
    elif bsr < bsr_thresh_inv:
        bearish_primary += 1
        signals.append(f"bsr_30s={bsr:.2f}<{bsr_thresh_inv} → bearish")

    # ── 主信号 2: 订单簿失衡（EMA 平滑） ──
    obi = metrics.get("orderbook_imbalance", 0.0)
    if obi > obi_thresh:
        bullish_primary += 1
        signals.append(f"obi={obi:.2%}>{obi_thresh:.0%} → bullish")
    elif obi < -obi_thresh:
        bearish_primary += 1
        signals.append(f"obi={obi:.2%}<-{obi_thresh:.0%} → bearish")

    # ── 主信号 3: 大单净方向 ──
    lof = metrics.get("large_order_flow", 0.0)
    if lof > lof_thresh:
        bullish_primary += 1
        signals.append(f"large_order_flow={lof:,.0f}>{lof_thresh:,.0f} → bullish")
    elif lof < -lof_thresh:
        bearish_primary += 1
        signals.append(f"large_order_flow={lof:,.0f}<-{lof_thresh:,.0f} → bearish")
    elif abs(lof) > 0:
        signals.append(f"large_order_flow={lof:,.0f} (below threshold {lof_thresh:,.0f})")

    # ── 辅助信号 1: RSI ──
    rsi = metrics.get("rsi_1m")
    if rsi is not None:
        if rsi > 60:
            bullish_secondary += 0.5
            signals.append(f"rsi_1m={rsi:.1f}>60 → bullish")
        elif rsi < 40:
            bearish_secondary += 0.5
            signals.append(f"rsi_1m={rsi:.1f}<40 → bearish")

    # ── 辅助信号 2: EMA 趋势 ──
    ema_diff = metrics.get("ema5_vs_ema10", 0.0)
    if ema_diff > 0:
        bullish_secondary += 0.5
        signals.append(f"ema5>ema10 (diff={ema_diff:.4f}) → bullish")
    elif ema_diff < 0:
        bearish_secondary += 0.5
        signals.append(f"ema5<ema10 (diff={ema_diff:.4f}) → bearish")

    # ── 辅助信号 3: 成交量突增 ──
    vol_ratio = metrics.get("volume_ratio", 1.0)
    if vol_ratio > 1.5:
        if bullish_primary > bearish_primary:
            bullish_secondary += 0.5
        elif bearish_primary > bullish_primary:
            bearish_secondary += 0.5
        signals.append(f"volume_ratio={vol_ratio:.2f}>1.5 → momentum confirm")

    # ── 加成: 订单流加速度 ──
    bsr_momentum = metrics.get("bsr_momentum", "neutral")
    bsr_accel = metrics.get("bsr_acceleration", 0.0)
    if bsr_momentum == "bullish_accelerating":
        bullish_secondary += 0.3
        signals.append(f"bsr_acceleration={bsr_accel:.4f} → bullish momentum ↑")
    elif bsr_momentum == "bearish_accelerating":
        bearish_secondary += 0.3
        signals.append(f"bsr_acceleration={bsr_accel:.4f} → bearish momentum ↓")

    # ── 加成: 多窗口趋势一致 ──
    trend_alignment = metrics.get("trend_alignment", "neutral")
    trend_strength = metrics.get("trend_strength", 0.0)
    if trend_alignment == "bullish":
        bonus = 0.3 if trend_strength >= 1.0 else 0.2
        bullish_secondary += bonus
        signals.append(f"trend_alignment=bullish (strength={trend_strength:.1f}) → +{bonus}")
    elif trend_alignment == "bearish":
        bonus = 0.3 if trend_strength >= 1.0 else 0.2
        bearish_secondary += bonus
        signals.append(f"trend_alignment=bearish (strength={trend_strength:.1f}) → +{bonus}")

    # ── 分层决策 ──
    # 先确定优势方向
    bull_total = bullish_primary + bullish_secondary
    bear_total = bearish_primary + bearish_secondary
    is_bullish = bull_total > bear_total
    dominant_primary = bullish_primary if is_bullish else bearish_primary
    dominant_secondary = bullish_secondary if is_bullish else bearish_secondary
    opposite_primary = bearish_primary if is_bullish else bullish_primary
    direction: Literal["up", "down"] = "up" if is_bullish else "down"

    # 计算 strength
    max_primary = 3.0
    max_secondary = 2.3  # 0.5*3 + 0.3 + 0.5
    strength = min(1.0, (dominant_primary / max_primary * 0.7) + (dominant_secondary / max_secondary * 0.3))

    # ── 强信号: 主 ≥ 2 + 辅 ≥ 1 + 无矛盾 + 趋势一致 ──
    if (dominant_primary >= 2 and dominant_secondary >= 1.0
            and opposite_primary == 0
            and trend_alignment in (direction.replace("up", "bullish").replace("down", "bearish"), "neutral")):
        signals.append(f"★ STRONG signal: primary={dominant_primary}, secondary={dominant_secondary:.1f}")
        return SignalResult(direction, strength, dominant_primary, dominant_secondary, signals, tier="strong")

    # ── 中信号: 主 ≥ 1 + 辅 ≥ 1, 或 主 ≥ 2 + 辅 = 0 ──
    if dominant_primary >= 1 and dominant_secondary >= 1.0 and opposite_primary <= 1:
        # 有对侧主信号时降低 strength
        if opposite_primary >= 1:
            strength *= 0.8
            signals.append(f"⚠ partial conflict: opposite_primary={opposite_primary}, strength reduced")
        signals.append(f"◆ MEDIUM signal: primary={dominant_primary}, secondary={dominant_secondary:.1f}")
        return SignalResult(direction, strength, dominant_primary, dominant_secondary, signals, tier="medium")

    if dominant_primary >= 2 and dominant_secondary < 1.0 and opposite_primary == 0:
        signals.append(f"◆ MEDIUM signal (primary-heavy): primary={dominant_primary}, secondary={dominant_secondary:.1f}")
        return SignalResult(direction, strength * 0.85, dominant_primary, dominant_secondary, signals, tier="medium")

    # ── 弱信号: 主 ≥ 1 + 辅 ≥ 0.5 ──
    if dominant_primary >= 1 and dominant_secondary >= 0.5 and opposite_primary == 0:
        signals.append(f"○ WEAK signal: primary={dominant_primary}, secondary={dominant_secondary:.1f}")
        return SignalResult(direction, strength * 0.7, dominant_primary, dominant_secondary, signals, tier="weak")

    # ── 信号不足 → 跳过 ──
    total = max(bull_total, bear_total)
    signals.append(f"✗ insufficient: primary={dominant_primary}, secondary={dominant_secondary:.1f}, opposite={opposite_primary}")
    return SignalResult(None, total / (max_primary + max_secondary), dominant_primary,
                        dominant_secondary, signals, tier=None)
