"""市场方向一致性过滤器 — 逆势信号置信度惩罚。

P5 优化：扩展到 ranging 市场
  - trending: confidence × 0.65（逆势惩罚）
  - ranging:  confidence × 0.50（震荡市假突破更多，惩罚更重）
  - volatile: 不惩罚（高波动允许双向操作）

设计原则：
  - 纯函数，无 I/O，无 async，100% 可单元测试
  - 失败安全：klines 不足或计算异常时原样返回 report
  - 不改变 signal 值，只降低 confidence（让下游 insufficient 检查决定是否转 neutral）
"""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from app.models.analysis import AnalysisReport
    from app.models.market_data import MarketData

logger = logging.getLogger(__name__)

# ── 参数常量 ───────────────────────────────────────────────────

# 按 regime 定义逆势惩罚系数（未列出的 regime 不惩罚）
COUNTER_TREND_PENALTIES: dict[str, float] = {
    "trending": 0.65,    # 保留 65%
    "ranging":  0.50,    # 震荡市假突破多，惩罚更重（保留 50%）
}

EMA_PERIOD = 20                 # 均线窗口（根数）
MIN_KLINES = EMA_PERIOD * 2 + 1  # 最少需要的 K 线数量
MIN_SLOPE_PCT = 0.005           # ±0.5%，低于此认为趋势不明确


# ── 内部工具函数 ──────────────────────────────────────────────


def _simple_sma(closes: list[float], period: int) -> float:
    """计算最近 period 个收盘价的简单均值。"""
    segment = closes[-period:]
    return sum(segment) / len(segment)


def _infer_trend_direction(klines: list, period: int = EMA_PERIOD) -> str:
    """用两段 SMA 斜率推断大周期趋势方向。

    Returns:
        "bullish"  — 近段均价明显高于前段（上升趋势）
        "bearish"  — 近段均价明显低于前段（下降趋势）
        "neutral"  — 斜率不显著或数据不足
    """
    if len(klines) < MIN_KLINES:
        return "neutral"

    closes = [k.close for k in klines]

    # 近 period 期均值 vs 前 period 期均值
    sma_recent = _simple_sma(closes, period)
    sma_prev = _simple_sma(closes[:-period], period)

    if sma_prev <= 0:
        return "neutral"

    slope_pct = (sma_recent - sma_prev) / sma_prev

    if slope_pct > MIN_SLOPE_PCT:
        return "bullish"
    if slope_pct < -MIN_SLOPE_PCT:
        return "bearish"
    return "neutral"


# ── 主接口 ────────────────────────────────────────────────────


def apply_regime_direction_filter(
    report: "AnalysisReport",
    market_data: "MarketData",
) -> "AnalysisReport":
    """检查信号方向与趋势方向的一致性，逆势时降低置信度。

    Args:
        report:      当前 AnalysisReport（从 confluence_filter 输出后传入）
        market_data: 原始市场数据，用于读取 1h K 线

    Returns:
        原 report（顺势）或置信度被打折过的新 report（逆势）
    """
    signal = report.signal
    if signal not in ("bullish", "bearish"):
        # neutral 信号无方向，不做处理
        return report

    # 查找当前 regime 的惩罚系数，不在表中则跳过（如 volatile）
    regime = report.market_regime or ""
    penalty = COUNTER_TREND_PENALTIES.get(regime)
    if penalty is None:
        return report

    # 优先用 1h K 线，回退到 15m
    klines = getattr(market_data, "klines_1h", None) or []
    if not klines:
        klines = getattr(market_data, "klines_15m", None) or []

    if len(klines) < MIN_KLINES:
        logger.debug(
            "regime_direction_filter: insufficient klines (%d), skipping",
            len(klines),
        )
        return report

    trend_dir = _infer_trend_direction(klines)
    if trend_dir == "neutral":
        # 趋势不明确，不惩罚
        return report

    is_counter_trend = (
        (signal == "bullish" and trend_dir == "bearish")
        or (signal == "bearish" and trend_dir == "bullish")
    )

    if not is_counter_trend:
        return report

    new_confidence = round(report.confidence * penalty, 4)
    logger.info(
        "regime_direction_filter: counter-trend penalty | signal=%s trend=%s "
        "regime=%s penalty=%.2f conf %.3f→%.3f",
        signal,
        trend_dir,
        regime,
        penalty,
        report.confidence,
        new_confidence,
    )

    return report.model_copy(update={
        "confidence": new_confidence,
        "regime_direction_penalized": True,
    })

