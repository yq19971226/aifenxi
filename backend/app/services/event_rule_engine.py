"""事件合约规则引擎 — 基于订单流 + 1 分钟指标的方向预测。

主信号（订单流，权重 70%）：
  - 30 秒买卖比 > 1.3   → +1（看涨）/ < 0.77 → +1（看跌）
  - 订单簿失衡 > 20%    → +1
  - 大单净流向 > ±50K    → +1

辅助信号（1 分钟指标，权重 30%）：
  - RSI(14) > 55 / < 45 → +0.5
  - EMA5 > EMA10        → +0.5
  - 成交量比 > 1.5      → +0.5

决策：主信号 ≥ 2 且 辅助 ≥ 1 → 出预测，否则跳过。
       如果对侧主信号 ≥ 1，strength 降权 20%（矛盾惩罚）。
"""

from __future__ import annotations

import logging
from typing import Any, Literal

logger = logging.getLogger(__name__)

# 大单净差最小阈值（USDT），低于此值视为噪音不触发信号
_LARGE_ORDER_MIN_THRESHOLD = 50_000


class SignalResult:
    """规则引擎评估结果。"""

    def __init__(
        self,
        direction: Literal["up", "down"] | None,
        strength: float,
        primary_score: float,
        secondary_score: float,
        signals: list[str],
    ) -> None:
        self.direction = direction
        self.strength = strength  # 0.0 ~ 1.0
        self.primary_score = primary_score
        self.secondary_score = secondary_score
        self.signals = signals

    def to_dict(self) -> dict:
        return {
            "direction": self.direction,
            "strength": round(self.strength, 4),
            "primary_score": self.primary_score,
            "secondary_score": self.secondary_score,
            "signals": self.signals,
        }


def evaluate(metrics: dict[str, Any]) -> SignalResult:
    """评估实时指标，返回方向预测或 None（跳过）。

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

    # ── 主信号 1: 买卖比 ──
    bsr = metrics.get("buy_sell_ratio_30s", 1.0)
    if bsr > 1.3:
        bullish_primary += 1
        signals.append(f"buy_sell_ratio={bsr:.2f}>1.3 → bullish")
    elif bsr < 0.77:  # 1/1.3 ≈ 0.77
        bearish_primary += 1
        signals.append(f"buy_sell_ratio={bsr:.2f}<0.77 → bearish")

    # ── 主信号 2: 订单簿失衡 ──
    obi = metrics.get("orderbook_imbalance", 0.0)
    if obi > 0.20:
        bullish_primary += 1
        signals.append(f"orderbook_imbalance={obi:.2%}>20% → bullish")
    elif obi < -0.20:
        bearish_primary += 1
        signals.append(f"orderbook_imbalance={obi:.2%}<-20% → bearish")

    # ── 主信号 3: 大单净方向（修复 #15 — 需超过最小阈值） ──
    lof = metrics.get("large_order_flow", 0.0)
    if lof > _LARGE_ORDER_MIN_THRESHOLD:
        bullish_primary += 1
        signals.append(f"large_order_flow={lof:,.0f}>{_LARGE_ORDER_MIN_THRESHOLD:,} → bullish")
    elif lof < -_LARGE_ORDER_MIN_THRESHOLD:
        bearish_primary += 1
        signals.append(f"large_order_flow={lof:,.0f}<-{_LARGE_ORDER_MIN_THRESHOLD:,} → bearish")
    elif abs(lof) > 0:
        signals.append(f"large_order_flow={lof:,.0f} (below threshold, ignored)")

    # ── 辅助信号 1: RSI ──
    rsi = metrics.get("rsi_1m")
    if rsi is not None:
        if rsi > 55:
            bullish_secondary += 0.5
            signals.append(f"rsi_1m={rsi:.1f}>55 → bullish")
        elif rsi < 45:
            bearish_secondary += 0.5
            signals.append(f"rsi_1m={rsi:.1f}<45 → bearish")

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
        # 量增方向跟随主信号
        if bullish_primary > bearish_primary:
            bullish_secondary += 0.5
        elif bearish_primary > bullish_primary:
            bearish_secondary += 0.5
        signals.append(f"volume_ratio={vol_ratio:.2f}>1.5 → momentum confirm")

    # ── 决策（修复 #14 — 矛盾信号降权） ──
    # 多方判定
    if bullish_primary >= 2 and bullish_secondary >= 1:
        strength = min(1.0, (bullish_primary / 3 * 0.7) + (bullish_secondary / 1.5 * 0.3))
        # 矛盾检测：对侧存在主信号时降权
        if bearish_primary >= 1:
            strength *= 0.8
            signals.append(f"⚠ conflict: bearish_primary={bearish_primary}, strength reduced 20%")
        return SignalResult("up", strength, bullish_primary, bullish_secondary, signals)

    # 空方判定
    if bearish_primary >= 2 and bearish_secondary >= 1:
        strength = min(1.0, (bearish_primary / 3 * 0.7) + (bearish_secondary / 1.5 * 0.3))
        # 矛盾检测：对侧存在主信号时降权
        if bullish_primary >= 1:
            strength *= 0.8
            signals.append(f"⚠ conflict: bullish_primary={bullish_primary}, strength reduced 20%")
        return SignalResult("down", strength, bearish_primary, bearish_secondary, signals)

    # 信号不足 → 跳过
    total = max(bullish_primary + bullish_secondary, bearish_primary + bearish_secondary)
    return SignalResult(None, total / 4.5, max(bullish_primary, bearish_primary),
                        max(bullish_secondary, bearish_secondary), signals)
