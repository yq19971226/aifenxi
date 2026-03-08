"""市场状态检测器 — 判断当前市场处于震荡、趋势还是高波动状态。

使用 ADX、布林带宽、ATR 比率三重指标交叉验证，输出 MarketRegime。
供前端预检提示和后端策略自适应使用。
"""

import logging
import math
from enum import Enum
from typing import Optional

import numpy as np
from pydantic import BaseModel, Field

from app.models.market_data import KlineData

logger = logging.getLogger(__name__)


class RegimeType(str, Enum):
    """市场状态枚举。"""
    RANGING = "ranging"        # 震荡/区间
    TRENDING = "trending"      # 趋势（单边）
    VOLATILE = "volatile"      # 高波动（剧烈震荡）


class MarketRegime(BaseModel):
    """市场状态检测结果。"""
    symbol: str
    regime: RegimeType
    confidence: float = Field(ge=0.0, le=1.0, description="判断置信度")
    adx: Optional[float] = Field(default=None, description="ADX 值 (0-100)")
    bb_width_pct: Optional[float] = Field(default=None, description="布林带宽度占价格百分比")
    atr_ratio: Optional[float] = Field(default=None, description="ATR/价格 百分比")
    support: Optional[float] = Field(default=None, description="最近支撑位")
    resistance: Optional[float] = Field(default=None, description="最近阻力位")
    suggestion: str = Field(default="", description="给用户的建议文案")
    recommended_mode: str = Field(default="scalping", description="建议的分析模式")


# ── ADX 计算 ─────────────────────────────────────────────────

def _calculate_adx(klines: list[KlineData], period: int = 14) -> float | None:
    """计算 ADX（Average Directional Index）。

    ADX < 20: 无趋势（震荡）
    ADX 20-25: 弱趋势
    ADX 25-50: 强趋势
    ADX > 50: 极强趋势
    """
    n = len(klines)
    if n < period * 2 + 1:
        return None

    highs = np.array([k.high for k in klines])
    lows = np.array([k.low for k in klines])
    closes = np.array([k.close for k in klines])

    # True Range
    tr = np.zeros(n)
    tr[0] = highs[0] - lows[0]
    for i in range(1, n):
        tr[i] = max(
            highs[i] - lows[i],
            abs(highs[i] - closes[i - 1]),
            abs(lows[i] - closes[i - 1]),
        )

    # +DM / -DM
    plus_dm = np.zeros(n)
    minus_dm = np.zeros(n)
    for i in range(1, n):
        up = highs[i] - highs[i - 1]
        down = lows[i - 1] - lows[i]
        plus_dm[i] = up if (up > down and up > 0) else 0.0
        minus_dm[i] = down if (down > up and down > 0) else 0.0

    # Wilder's smoothing (EMA-like)
    def _wilder_smooth(data: np.ndarray, p: int) -> np.ndarray:
        result = np.full(len(data), float("nan"))
        result[p] = np.sum(data[1 : p + 1])
        for i in range(p + 1, len(data)):
            result[i] = result[i - 1] - result[i - 1] / p + data[i]
        return result

    atr_smooth = _wilder_smooth(tr, period)
    plus_dm_smooth = _wilder_smooth(plus_dm, period)
    minus_dm_smooth = _wilder_smooth(minus_dm, period)

    # +DI / -DI
    plus_di = np.where(atr_smooth > 0, 100 * plus_dm_smooth / atr_smooth, 0.0)
    minus_di = np.where(atr_smooth > 0, 100 * minus_dm_smooth / atr_smooth, 0.0)

    # DX
    di_sum = plus_di + minus_di
    dx = np.where(di_sum > 0, 100 * np.abs(plus_di - minus_di) / di_sum, 0.0)

    # ADX = DX 的 period 期 Wilder 平滑
    adx = np.full(n, float("nan"))
    start = period * 2
    if start >= n:
        return None
    adx[start] = np.nanmean(dx[period : start + 1])
    for i in range(start + 1, n):
        if math.isnan(adx[i - 1]):
            continue
        adx[i] = (adx[i - 1] * (period - 1) + dx[i]) / period

    last_adx = adx[-1]
    return None if math.isnan(last_adx) else float(last_adx)


# ── 主检测函数 ────────────────────────────────────────────────

def detect_market_regime(
    klines: list[KlineData],
    symbol: str = "",
) -> MarketRegime:
    """分析 K 线数据判断市场状态。

    Args:
        klines: 至少 50 根 K 线（建议 100+）
        symbol: 交易对名称

    Returns:
        MarketRegime 包含状态、置信度、指标值和建议
    """
    if len(klines) < 30:
        return MarketRegime(
            symbol=symbol,
            regime=RegimeType.RANGING,
            confidence=0.3,
            suggestion="K线数据不足，默认判定为震荡",
            recommended_mode="scalping",
        )

    closes = np.array([k.close for k in klines])
    highs = np.array([k.high for k in klines])
    lows = np.array([k.low for k in klines])
    current_price = closes[-1]

    # ── 1. ADX ──
    adx = _calculate_adx(klines, 14)

    # ── 2. 布林带宽度 ──
    bb_period = 20
    bb_std = 2.0
    bb_width_pct: float | None = None
    if len(closes) >= bb_period:
        sma = np.mean(closes[-bb_period:])
        std = np.std(closes[-bb_period:], ddof=1)
        bb_upper = sma + bb_std * std
        bb_lower = sma - bb_std * std
        if sma > 0:
            bb_width_pct = (bb_upper - bb_lower) / sma * 100

    # ── 3. ATR 比率 ──
    atr_period = 14
    atr_ratio: float | None = None
    if len(klines) > atr_period + 1:
        tr_list = []
        for i in range(1, len(klines)):
            tr = max(
                highs[i] - lows[i],
                abs(highs[i] - closes[i - 1]),
                abs(lows[i] - closes[i - 1]),
            )
            tr_list.append(tr)
        if len(tr_list) >= atr_period:
            atr_val = np.mean(tr_list[-atr_period:])
            if current_price > 0:
                atr_ratio = atr_val / current_price * 100

    # ── 4. 近期支撑/阻力 ──
    lookback = min(50, len(klines))
    recent_lows = lows[-lookback:]
    recent_highs = highs[-lookback:]
    support = float(np.percentile(recent_lows, 10))
    resistance = float(np.percentile(recent_highs, 90))

    # ── 综合判定 ──
    scores = {"ranging": 0.0, "trending": 0.0, "volatile": 0.0}

    # ADX 判定
    if adx is not None:
        if adx < 20:
            scores["ranging"] += 0.4
        elif adx < 25:
            scores["ranging"] += 0.2
            scores["trending"] += 0.1
        elif adx < 50:
            scores["trending"] += 0.4
        else:
            scores["trending"] += 0.3
            scores["volatile"] += 0.2

    # 布林带宽度判定
    if bb_width_pct is not None:
        if bb_width_pct < 3.0:
            scores["ranging"] += 0.3
        elif bb_width_pct < 6.0:
            scores["ranging"] += 0.1
            scores["trending"] += 0.1
        elif bb_width_pct < 10.0:
            scores["trending"] += 0.3
        else:
            scores["volatile"] += 0.4

    # ATR 比率判定
    if atr_ratio is not None:
        if atr_ratio < 1.0:
            scores["ranging"] += 0.3
        elif atr_ratio < 2.5:
            scores["trending"] += 0.2
        else:
            scores["volatile"] += 0.3

    # 取最高分
    best = max(scores, key=lambda k: scores[k])
    total = sum(scores.values())
    confidence = scores[best] / total if total > 0 else 0.5

    regime = RegimeType(best)

    # 生成建议
    if regime == RegimeType.RANGING:
        suggestion = "当前处于震荡区间，价格在支撑位与阻力位之间波动。建议采用区间策略（高抛低吸），或等待突破后再入场。"
        recommended_mode = "scalping"
    elif regime == RegimeType.TRENDING:
        suggestion = "当前处于趋势行情，建议顺势操作。趋势布局模式可获得更完整的多维度分析。"
        recommended_mode = "trend"
    else:
        suggestion = "当前市场波动剧烈，风险较高。建议降低仓位，使用短线模式并严格止损。"
        recommended_mode = "scalping"

    return MarketRegime(
        symbol=symbol,
        regime=regime,
        confidence=round(confidence, 3),
        adx=round(adx, 2) if adx is not None else None,
        bb_width_pct=round(bb_width_pct, 3) if bb_width_pct is not None else None,
        atr_ratio=round(atr_ratio, 4) if atr_ratio is not None else None,
        support=round(support, 2),
        resistance=round(resistance, 2),
        suggestion=suggestion,
        recommended_mode=recommended_mode,
    )
