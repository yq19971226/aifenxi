"""量价背离多因子检测器 V2 — 7+1 因子加权评分系统。

经过 5 轮推翻验证后的最终实现：
- F1: 极值点量价背离（find_peaks 对比相邻波峰/波谷）
- F2: Log-Z-Score 量能异常度
- F3: CMF (Chaikin Money Flow) 资金流背离
- F4: MACD+RSI 动量背离（复合因子）
- F5: OBV 趋势背离
- F6: 衍生品健康度（OI+Funding Rate 复合）
- F7: VSA K线效率分析
- F8: 位置系数（Volume Profile 简化版）

设计原则：
- 永不翻转信号（最低 ×0.50 衰减）
- 因子权重从数据库动态读取，支持管理员在线训练调整
- 优雅降级（数据不全时自动重分配权重）
"""

import logging
import math
from enum import Enum
from typing import Any

from pydantic import BaseModel, Field

from app.models.market_data import (
    CoinGlassData,
    DerivativesData,
    IndicatorResult,
    KlineData,
)

logger = logging.getLogger(__name__)

# ── 默认因子权重（可被数据库覆盖）──────────────────────────────

DEFAULT_WEIGHTS: dict[str, float] = {
    "f1_peak_divergence": 0.20,
    "f2_volume_zscore": 0.12,
    "f3_cmf_divergence": 0.12,
    "f4_macd_rsi_divergence": 0.15,
    "f5_obv_divergence": 0.08,
    "f6_derivatives_health": 0.15,
    "f7_vsa_efficiency": 0.10,
    # f8_position 是乘法器，不参与加权
}

# ── 评分到置信度修正的映射 ──────────────────────────────────────

SCORE_TO_MODIFIER: list[tuple[float, float, str]] = [
    (-1.0, -0.7, "极强背离"),
    (-0.7, -0.4, "强背离"),
    (-0.4, -0.2, "中度背离"),
    (-0.2, -0.1, "轻度背离"),
    (-0.1,  0.1, "正常"),
    ( 0.1,  0.3, "轻度确认"),
    ( 0.3,  0.6, "趋势确认"),
    ( 0.6,  1.0, "强确认"),
]

SCORE_TO_CONFIDENCE: dict[str, float] = {
    "极强背离": 0.50,
    "强背离": 0.65,
    "中度背离": 0.80,
    "轻度背离": 0.90,
    "正常": 1.00,
    "轻度确认": 1.05,
    "趋势确认": 1.10,
    "强确认": 1.15,
}


# ── 数据模型 ──────────────────────────────────────────────────


class FactorResult(BaseModel):
    """单个因子的评估结果。"""
    factor_id: str
    factor_name: str
    score: float = Field(ge=-1.0, le=1.0)
    weight: float
    available: bool = True
    detail: str = ""


class DivergenceGrade(str, Enum):
    EXTREME_DIVERGENCE = "极强背离"
    STRONG_DIVERGENCE = "强背离"
    MODERATE_DIVERGENCE = "中度背离"
    MILD_DIVERGENCE = "轻度背离"
    NORMAL = "正常"
    MILD_CONFIRMATION = "轻度确认"
    TREND_CONFIRMATION = "趋势确认"
    STRONG_CONFIRMATION = "强确认"


class VolumePriceDivergenceV2(BaseModel):
    """多因子量价背离检测结果 V2。"""
    score: float = Field(default=0.0, ge=-1.0, le=1.0)
    grade: str = "正常"
    confidence_modifier: float = Field(default=1.0, ge=0.5, le=1.15)
    factors: list[FactorResult] = Field(default_factory=list)
    position: str = "inside_value"
    position_coefficient: float = 1.0
    description: str = ""
    data_completeness: float = 1.0
    price_trend: str = "flat"


# ══════════════════════════════════════════════════════════════
# 因子计算函数
# ══════════════════════════════════════════════════════════════


def _find_local_peaks(values: list[float], distance: int = 5) -> list[int]:
    """局部极大值点检测 —— 纯 Python 实现，无 scipy 依赖。"""
    peaks: list[int] = []
    n = len(values)
    for i in range(distance, n - distance):
        is_peak = True
        for j in range(1, distance + 1):
            if values[i] < values[i - j] or values[i] < values[i + j]:
                is_peak = False
                break
        if is_peak:
            peaks.append(i)
    return peaks


def _find_local_troughs(values: list[float], distance: int = 5) -> list[int]:
    """局部极小值点检测。"""
    troughs: list[int] = []
    n = len(values)
    for i in range(distance, n - distance):
        is_trough = True
        for j in range(1, distance + 1):
            if values[i] > values[i - j] or values[i] > values[i + j]:
                is_trough = False
                break
        if is_trough:
            troughs.append(i)
    return troughs


def _adaptive_distance(atr: float | None, price: float) -> int:
    """根据 ATR/Price 波动率自适应极值点距离。"""
    if atr is None or price <= 0:
        return 5
    vol_ratio = atr / price
    if vol_ratio < 0.01:
        return 8  # 低波动 → 需更宽窗口避免噪音
    elif vol_ratio > 0.03:
        return 3  # 高波动 → 极值点形成更快
    return 5


def _calc_f1_peak_divergence(
    closes: list[float], volumes: list[float], distance: int,
) -> tuple[float, str]:
    """F1：极值点量价背离 —— 核心因子。

    比较相邻两个同向极值点的量价关系。
    """
    if len(closes) < distance * 3:
        return 0.0, "数据不足"

    peaks = _find_local_peaks(closes, distance)
    troughs = _find_local_troughs(closes, distance)

    score = 0.0
    detail_parts: list[str] = []

    # ── 顶背离检测（检查最近两个波峰）──
    if len(peaks) >= 2:
        p1, p2 = peaks[-2], peaks[-1]
        price_higher = closes[p2] > closes[p1]
        vol_lower = volumes[p2] < volumes[p1] * 0.85  # 量需降15%以上才算

        if price_higher and vol_lower:
            vol_drop_pct = 1.0 - volumes[p2] / max(volumes[p1], 1e-10)
            # 双顶检测（价格接近但量缩）
            price_diff_pct = abs(closes[p2] - closes[p1]) / closes[p1]
            if price_diff_pct < 0.01:
                score = min(score, -0.6)
                detail_parts.append(f"隐性顶背离(双顶量缩{vol_drop_pct:.0%})")
            else:
                score = min(score, -0.8)
                detail_parts.append(f"经典顶背离(新高量缩{vol_drop_pct:.0%})")
        elif price_higher and not vol_lower:
            # 价量齐升 → 确认
            vol_ratio = volumes[p2] / max(volumes[p1], 1e-10)
            if vol_ratio > 1.2:
                score = max(score, 0.5)
                detail_parts.append(f"波峰量价齐升({vol_ratio:.0%})")

    # ── 底背离检测（检查最近两个波谷）──
    if len(troughs) >= 2:
        t1, t2 = troughs[-2], troughs[-1]
        price_lower = closes[t2] < closes[t1]
        vol_lower = volumes[t2] < volumes[t1] * 0.85

        if price_lower and vol_lower:
            vol_drop_pct = 1.0 - volumes[t2] / max(volumes[t1], 1e-10)
            price_diff_pct = abs(closes[t2] - closes[t1]) / closes[t1]
            if price_diff_pct < 0.01:
                score = max(score, 0.6)
                detail_parts.append(f"隐性底背离(双底量缩{vol_drop_pct:.0%})")
            else:
                score = max(score, 0.8)
                detail_parts.append(f"经典底背离(新低量缩{vol_drop_pct:.0%})")

    return score, "; ".join(detail_parts) if detail_parts else "无极值背离"


def _calc_f2_log_zscore(volumes: list[float], window: int = 50) -> tuple[float, str]:
    """F2：Log-Z-Score 成交量异常度。

    对成交量取对数后计算 Z-Score，解决成交量非正态分布的问题。
    """
    if len(volumes) < window + 3:
        return 0.0, "数据不足"

    # 对数变换
    log_vols = [math.log(max(v, 1e-10)) for v in volumes]
    historical = log_vols[-window:-3]
    recent = log_vols[-3:]

    mean = sum(historical) / len(historical)
    variance = sum((v - mean) ** 2 for v in historical) / len(historical)
    std = variance ** 0.5

    if std <= 0:
        return 0.0, "标准差为零"

    current_avg = sum(recent) / len(recent)
    z = (current_avg - mean) / std

    # Z-Score → 得分映射
    if z <= -2.0:
        return -1.0, f"极端缩量(Z={z:.2f})"
    elif z <= -1.5:
        return -0.6, f"显著缩量(Z={z:.2f})"
    elif z <= -1.0:
        return -0.3, f"温和缩量(Z={z:.2f})"
    elif z >= 2.0:
        return 1.0, f"极端放量(Z={z:.2f})"
    elif z >= 1.5:
        return 0.6, f"显著放量(Z={z:.2f})"
    elif z >= 1.0:
        return 0.3, f"温和放量(Z={z:.2f})"
    return 0.0, f"正常(Z={z:.2f})"


def _calc_f3_cmf(klines: list[KlineData], period: int = 21) -> tuple[float, str]:
    """F3：Chaikin Money Flow — 区分主动买卖压力。

    CMF = Σ[MFM × Volume] / Σ[Volume]
    MFM (Money Flow Multiplier) = [(close-low) - (high-close)] / (high-low)
    """
    if len(klines) < period:
        return 0.0, "数据不足"

    recent = klines[-period:]
    numerator = 0.0
    denominator = 0.0

    for k in recent:
        hl_range = k.high - k.low
        if hl_range > 0:
            mfm = ((k.close - k.low) - (k.high - k.close)) / hl_range
            numerator += mfm * k.volume
        denominator += k.volume

    if denominator <= 0:
        return 0.0, "成交量为零"

    cmf = numerator / denominator  # 范围约 -1 ~ +1

    # 价格趋势
    price_change = (klines[-1].close - klines[-period].close) / klines[-period].close

    # CMF 背离检测
    if price_change > 0.005 and cmf < -0.1:
        severity = min(abs(cmf) * 2, 1.0)
        return -severity, f"价涨但资金流出(CMF={cmf:.3f})"
    elif price_change < -0.005 and cmf > 0.1:
        severity = min(cmf * 2, 1.0)
        return severity, f"价跌但资金流入(CMF={cmf:.3f})"
    elif cmf > 0.25:
        return 0.5, f"强资金流入(CMF={cmf:.3f})"
    elif cmf < -0.25:
        return -0.5, f"强资金流出(CMF={cmf:.3f})"
    return 0.0, f"资金流正常(CMF={cmf:.3f})"


def _calc_f4_macd_rsi(
    closes: list[float],
    macd_histogram: float | None,
    rsi: float | None,
    peaks: list[int],
    macd_hist_series: list[float] | None = None,
) -> tuple[float, str]:
    """F4：MACD+RSI 动量复合背离。

    MACD 柱状图在相邻波峰处降低 + RSI 超买/超卖系数增强。
    """
    score = 0.0
    detail = "无动量背离"

    # 需要至少 2 个波峰来对比 MACD 柱
    if len(peaks) >= 2 and macd_hist_series and len(macd_hist_series) > peaks[-1]:
        p1, p2 = peaks[-2], peaks[-1]
        if p1 < len(macd_hist_series) and p2 < len(macd_hist_series):
            hist1 = macd_hist_series[p1]
            hist2 = macd_hist_series[p2]

            price_higher = closes[p2] > closes[p1]
            hist_lower = hist2 < hist1

            if price_higher and hist_lower and hist1 > 0:
                drop_pct = 1.0 - hist2 / max(hist1, 1e-10)
                score = -min(drop_pct, 1.0) * 0.8
                detail = f"MACD柱顶背离(柱降{drop_pct:.0%})"

                # RSI 增强系数（先检查极端值）
                if rsi is not None and rsi > 80:
                    score *= 1.5
                    detail += f" RSI极端超买({rsi:.0f})加权"
                elif rsi is not None and rsi > 70:
                    score *= 1.3
                    detail += f" RSI超买({rsi:.0f})加权"

    # 底部 MACD 背离（对称检测）
    troughs = _find_local_troughs(closes, 5) if len(closes) > 15 else []
    if len(troughs) >= 2 and macd_hist_series:
        t1, t2 = troughs[-2], troughs[-1]
        if t1 < len(macd_hist_series) and t2 < len(macd_hist_series):
            hist1 = macd_hist_series[t1]
            hist2 = macd_hist_series[t2]

            price_lower = closes[t2] < closes[t1]
            hist_higher = hist2 > hist1

            if price_lower and hist_higher and hist1 < 0:
                score = min(abs(hist2 - hist1) / max(abs(hist1), 1e-10), 1.0) * 0.8
                detail = f"MACD柱底背离"
                if rsi is not None and rsi < 30:
                    score *= 1.3
                    detail += f" RSI超卖({rsi:.0f})加权"

    score = max(-1.0, min(1.0, score))
    return score, detail


def _calc_f5_obv(
    closes: list[float], obv_series: list[float] | None, peaks: list[int], troughs: list[int],
) -> tuple[float, str]:
    """F5：OBV 趋势背离 — 与 F1 互补的趋势性信号。"""
    if obv_series is None or len(obv_series) < 20:
        return 0.0, "OBV不可用"

    # 顶背离：价格波峰更高但 OBV 波峰更低
    if len(peaks) >= 2:
        p1, p2 = peaks[-2], peaks[-1]
        if p1 < len(obv_series) and p2 < len(obv_series):
            if closes[p2] > closes[p1] and obv_series[p2] < obv_series[p1]:
                return -0.7, "OBV顶背离(价新高,OBV未新高)"

    # 底背离：价格波谷更低但 OBV 波谷更高
    if len(troughs) >= 2:
        t1, t2 = troughs[-2], troughs[-1]
        if t1 < len(obv_series) and t2 < len(obv_series):
            if closes[t2] < closes[t1] and obv_series[t2] > obv_series[t1]:
                return 0.7, "OBV底背离(价新低,OBV未新低)"

    return 0.0, "OBV趋势正常"


def _calc_f6_derivatives(
    derivatives: DerivativesData | None,
    coinglass: CoinGlassData | None,
    price_trend: str,
) -> tuple[float, str]:
    """F6：衍生品健康度 — OI+FR 复合因子（加密专属）。"""
    if derivatives is None:
        return 0.0, "衍生品数据不可用"

    score = 0.0
    parts: list[str] = []

    fr = derivatives.funding_rate

    # ── Funding Rate 拥挤度 ──
    if fr is not None:
        if fr > 0.0005:  # > 0.05%
            if price_trend == "up":
                score -= 0.4
                parts.append(f"多头拥挤(FR={fr*100:.4f}%)")
            else:
                score -= 0.6
                parts.append(f"极端正FR+价未涨(FR={fr*100:.4f}%)")
        elif fr < -0.0005:
            if price_trend == "down":
                score += 0.4
                parts.append(f"空头拥挤(FR={fr*100:.4f}%)")
            else:
                score += 0.6
                parts.append(f"极端负FR+价未跌(FR={fr*100:.4f}%)")

    # ── OI 背离（如果有 CoinGlass 数据）──
    if coinglass and coinglass.oi_snapshots and len(coinglass.oi_snapshots) >= 2:
        try:
            recent_oi = coinglass.oi_snapshots[-1]
            older_oi = coinglass.oi_snapshots[0]
            oi_now = float(recent_oi.get("oi", recent_oi.get("openInterest", 0)))
            oi_old = float(older_oi.get("oi", older_oi.get("openInterest", 0)))

            if oi_old > 0:
                oi_change_pct = (oi_now - oi_old) / oi_old

                if price_trend == "up" and oi_change_pct < -0.05:
                    score -= 0.5
                    parts.append(f"价涨OI降{oi_change_pct:.1%}(空头平仓推动)")
                elif price_trend == "down" and oi_change_pct > 0.05:
                    score -= 0.3
                    parts.append(f"价跌OI涨{oi_change_pct:.1%}(空头建仓)")
                elif price_trend == "down" and oi_change_pct < -0.1:
                    score += 0.3
                    parts.append(f"价跌OI降{oi_change_pct:.1%}(多头投降,可能见底)")
        except (ValueError, TypeError, KeyError):
            pass

    score = max(-1.0, min(1.0, score))
    return score, "; ".join(parts) if parts else "衍生品中性"


def _calc_f7_vsa_efficiency(klines: list[KlineData]) -> tuple[float, str]:
    """F7：VSA K线效率分析 — Wyckoff VSA + ICT 融合。

    K线穿越效率 = body / range
    影线比率 = shadows / body
    E/R 比 = 量变化率 / 价变化率
    """
    if len(klines) < 10:
        return 0.0, "数据不足"

    recent = klines[-5:]
    earlier = klines[-10:-5]

    # K线效率趋势
    efficiencies: list[float] = []
    for k in recent:
        body = abs(k.close - k.open)
        range_ = k.high - k.low
        eff = body / range_ if range_ > 0 else 0.0
        efficiencies.append(eff)

    # 效率线性回归斜率
    n = len(efficiencies)
    x_mean = (n - 1) / 2.0
    y_mean = sum(efficiencies) / n
    numerator = sum((i - x_mean) * (efficiencies[i] - y_mean) for i in range(n))
    denominator = sum((i - x_mean) ** 2 for i in range(n))
    slope = numerator / denominator if denominator > 0 else 0.0

    # 影线比率检查（最后一根）
    last = klines[-1]
    last_body = abs(last.close - last.open)
    upper_shadow = last.high - max(last.close, last.open)
    lower_shadow = min(last.close, last.open) - last.low
    shadow_ratio = (upper_shadow + lower_shadow) / last_body if last_body > 0 else 10.0

    # E/R 比（Wyckoff Effort/Result）
    recent_vol_avg = sum(k.volume for k in recent) / len(recent)
    earlier_vol_avg = sum(k.volume for k in earlier) / max(len(earlier), 1)
    vol_change = recent_vol_avg / earlier_vol_avg if earlier_vol_avg > 0 else 1.0
    price_change = abs(recent[-1].close - recent[0].close) / recent[0].close if recent[0].close > 0 else 0.0
    er_ratio = vol_change / (price_change * 100 + 0.01)

    score = 0.0
    parts: list[str] = []

    # 效率递减 = 动能衰竭
    if slope < -0.08:
        score -= 0.6
        parts.append(f"K线效率急降(slope={slope:.3f})")
    elif slope < -0.03:
        score -= 0.3
        parts.append(f"K线效率递减(slope={slope:.3f})")
    elif slope > 0.05:
        score += 0.3
        parts.append(f"K线效率增强(slope={slope:.3f})")

    # 高影线比率 + 放量 = 剧烈博弈
    if shadow_ratio > 2.0 and vol_change > 1.3:
        score -= 0.4
        parts.append(f"放量长影线(影线比={shadow_ratio:.1f})")

    # 极端 E/R = 吸收/派发
    if er_ratio > 5.0:
        score -= 0.3
        parts.append(f"大量小幅(E/R={er_ratio:.1f},疑似吸收)")

    score = max(-1.0, min(1.0, score))
    return score, "; ".join(parts) if parts else "VSA正常"


def _calc_f8_position(
    closes: list[float], volumes: list[float], atr: float | None,
) -> tuple[float, str]:
    """F8：位置系数 — 简化版 Volume Profile + ATR 过滤。"""
    if len(closes) < 50:
        return 1.0, "数据不足,默认系数"

    # 构建简化 Volume Profile
    price_min = min(closes[-100:]) if len(closes) >= 100 else min(closes)
    price_max = max(closes[-100:]) if len(closes) >= 100 else max(closes)
    if price_max <= price_min:
        return 1.0, "价格无波动"

    num_bins = 30
    bin_size = (price_max - price_min) / num_bins
    vol_profile = [0.0] * num_bins

    n_profile = min(len(closes), 100)
    for i in range(-n_profile, 0):
        idx = min(int((closes[i] - price_min) / bin_size), num_bins - 1)
        vol_profile[idx] += volumes[i] if abs(i) <= len(volumes) else 0.0

    # POC
    poc_bin = vol_profile.index(max(vol_profile))
    poc_price = price_min + (poc_bin + 0.5) * bin_size

    # Value Area (70% 成交量)
    total_vol = sum(vol_profile)
    if total_vol <= 0:
        return 1.0, "无成交量数据"

    sorted_bins = sorted(range(num_bins), key=lambda b: vol_profile[b], reverse=True)
    cum_vol = 0.0
    va_bins: set[int] = set()
    for b in sorted_bins:
        cum_vol += vol_profile[b]
        va_bins.add(b)
        if cum_vol >= total_vol * 0.7:
            break

    vah = price_min + (max(va_bins) + 1) * bin_size
    val_ = price_min + min(va_bins) * bin_size
    current = closes[-1]

    if current > vah:
        return 1.4, f"价值区上方(VAH={vah:.1f})"
    elif current < val_:
        return 1.4, f"价值区下方(VAL={val_:.1f})"
    else:
        return 0.7, f"价值区内(POC={poc_price:.1f})"


# ══════════════════════════════════════════════════════════════
# 主入口
# ══════════════════════════════════════════════════════════════


_weight_cache: dict[str, float] | None = None
_weight_cache_ts: float = 0.0


async def _load_dynamic_weights() -> dict[str, float]:
    """从数据库加载管理员调整过的因子权重（带 60 秒内存缓存）。"""
    import time
    global _weight_cache, _weight_cache_ts

    now = time.monotonic()
    if _weight_cache is not None and now - _weight_cache_ts < 60.0:
        return dict(_weight_cache)

    try:
        from app.services.config_service import get_config_value
        import json
        raw = await get_config_value("vpd_factor_weights", default="")
        if raw and raw.strip():
            weights = json.loads(raw)
            if isinstance(weights, dict):
                _weight_cache = weights
                _weight_cache_ts = now
                return weights
    except Exception:
        pass
    _weight_cache = dict(DEFAULT_WEIGHTS)
    _weight_cache_ts = now
    return dict(DEFAULT_WEIGHTS)


async def detect_volume_price_divergence_v2(
    klines: list[KlineData],
    signal: str = "neutral",
    indicators: IndicatorResult | None = None,
    derivatives: DerivativesData | None = None,
    coinglass: CoinGlassData | None = None,
) -> VolumePriceDivergenceV2:
    """多因子量价背离检测 V2 — 完整版。

    Args:
        klines: K线列表（至少 25 根）
        signal: 当前聚合信号
        indicators: 技术指标（MACD/RSI/OBV 等，可选）
        derivatives: 衍生品数据（Funding Rate，可选）
        coinglass: CoinGlass 数据（OI/CVD，可选）

    Returns:
        VolumePriceDivergenceV2 — 多因子评分结果
    """
    min_required = 25
    if not klines or len(klines) < min_required:
        return VolumePriceDivergenceV2(description="K线数据不足，跳过多因子检测")

    # 提取基础数据
    closes = [k.close for k in klines]
    volumes = [k.volume for k in klines]

    # 价格趋势
    recent_closes = closes[-5:]
    pct = (recent_closes[-1] - recent_closes[0]) / recent_closes[0] * 100
    price_trend = "up" if pct >= 0.3 else ("down" if pct <= -0.3 else "flat")

    # 加载动态权重
    weights = await _load_dynamic_weights()

    # ATR 自适应距离
    atr_val = indicators.atr if indicators else None
    distance = _adaptive_distance(atr_val, closes[-1])

    # 预计算极值点（多个因子复用）
    peaks = _find_local_peaks(closes, distance)
    troughs = _find_local_troughs(closes, distance)

    # 计算 OBV 序列（如果 indicators 只有最新值）
    obv_series: list[float] | None = None
    if indicators and indicators.obv is not None:
        # 用 K 线重建完整 OBV 序列
        obv_series = [0.0] * len(closes)
        obv_series[0] = volumes[0]
        for i in range(1, len(closes)):
            if closes[i] > closes[i - 1]:
                obv_series[i] = obv_series[i - 1] + volumes[i]
            elif closes[i] < closes[i - 1]:
                obv_series[i] = obv_series[i - 1] - volumes[i]
            else:
                obv_series[i] = obv_series[i - 1]

    # MACD 柱状图序列重建
    macd_hist_series: list[float] | None = None
    if indicators and indicators.macd_histogram is not None:
        # 简化：用 EMA12/26 差值近似重建
        from app.data.indicators import IndicatorCalculator
        calc = IndicatorCalculator()
        macd_line, signal_line, hist = calc.calculate_macd(closes)
        macd_hist_series = hist

    # ══════════════════════════════════════════════════════════
    # 计算 7 个因子
    # ══════════════════════════════════════════════════════════

    factor_results: list[FactorResult] = []

    # F1: 极值点背离
    f1_score, f1_detail = _calc_f1_peak_divergence(closes, volumes, distance)
    factor_results.append(FactorResult(
        factor_id="f1_peak_divergence", factor_name="极值点背离",
        score=f1_score, weight=weights.get("f1_peak_divergence", 0.20),
        detail=f1_detail,
    ))

    # F2: Log-Z-Score
    f2_score, f2_detail = _calc_f2_log_zscore(volumes)
    factor_results.append(FactorResult(
        factor_id="f2_volume_zscore", factor_name="量能异常度",
        score=f2_score, weight=weights.get("f2_volume_zscore", 0.12),
        detail=f2_detail,
    ))

    # F3: CMF
    f3_score, f3_detail = _calc_f3_cmf(klines)
    factor_results.append(FactorResult(
        factor_id="f3_cmf_divergence", factor_name="资金流(CMF)",
        score=f3_score, weight=weights.get("f3_cmf_divergence", 0.12),
        detail=f3_detail,
    ))

    # F4: MACD+RSI
    f4_avail = indicators is not None and indicators.macd_histogram is not None
    f4_score, f4_detail = (0.0, "指标不可用")
    if f4_avail:
        f4_score, f4_detail = _calc_f4_macd_rsi(
            closes, indicators.macd_histogram, indicators.rsi,
            peaks, macd_hist_series,
        )
    factor_results.append(FactorResult(
        factor_id="f4_macd_rsi_divergence", factor_name="MACD+RSI动量",
        score=f4_score, weight=weights.get("f4_macd_rsi_divergence", 0.15),
        available=f4_avail, detail=f4_detail,
    ))

    # F5: OBV
    f5_avail = obv_series is not None
    f5_score, f5_detail = (0.0, "OBV不可用")
    if f5_avail:
        f5_score, f5_detail = _calc_f5_obv(closes, obv_series, peaks, troughs)
    factor_results.append(FactorResult(
        factor_id="f5_obv_divergence", factor_name="OBV趋势",
        score=f5_score, weight=weights.get("f5_obv_divergence", 0.08),
        available=f5_avail, detail=f5_detail,
    ))

    # F6: 衍生品
    f6_avail = derivatives is not None
    f6_score, f6_detail = _calc_f6_derivatives(derivatives, coinglass, price_trend)
    factor_results.append(FactorResult(
        factor_id="f6_derivatives_health", factor_name="衍生品健康度",
        score=f6_score, weight=weights.get("f6_derivatives_health", 0.15),
        available=f6_avail, detail=f6_detail,
    ))

    # F7: VSA
    f7_score, f7_detail = _calc_f7_vsa_efficiency(klines)
    factor_results.append(FactorResult(
        factor_id="f7_vsa_efficiency", factor_name="VSA效率",
        score=f7_score, weight=weights.get("f7_vsa_efficiency", 0.10),
        detail=f7_detail,
    ))

    # F8: 位置系数
    pos_coeff, pos_detail = _calc_f8_position(closes, volumes, atr_val)
    position_label = "above_value" if pos_coeff > 1.0 and closes[-1] > sum(closes[-50:]) / 50 else (
        "below_value" if pos_coeff > 1.0 else "inside_value"
    )

    # ══════════════════════════════════════════════════════════
    # 加权评分（自动重分配不可用因子的权重）
    # ══════════════════════════════════════════════════════════

    available_factors = [f for f in factor_results if f.available]
    unavailable_factors = [f for f in factor_results if not f.available]

    total_available_weight = sum(f.weight for f in available_factors)
    data_completeness = total_available_weight / sum(f.weight for f in factor_results) if factor_results else 0.0

    # 加权求和（可用因子权重归一化）
    if total_available_weight > 0:
        raw_score = sum(f.score * f.weight for f in available_factors) / total_available_weight
    else:
        raw_score = 0.0

    # 应用位置系数（方向敏感）
    if position_label == "above_value" and raw_score < 0:
        final_score = raw_score * pos_coeff  # 高位顶背离加强
    elif position_label == "below_value" and raw_score > 0:
        final_score = raw_score * pos_coeff  # 低位底背离加强
    elif position_label == "inside_value":
        final_score = raw_score * pos_coeff  # 价值区内衰减
    else:
        final_score = raw_score

    final_score = max(-1.0, min(1.0, final_score))

    # 评分 → 等级 → 置信度修正
    grade = "正常"
    for low, high, label in SCORE_TO_MODIFIER:
        if low <= final_score < high:
            grade = label
            break
    if final_score >= 0.6:
        grade = "强确认"
    elif final_score <= -0.7:
        grade = "极强背离"

    confidence_modifier = SCORE_TO_CONFIDENCE.get(grade, 1.0)

    # 构建描述
    active_factors = [f for f in available_factors if abs(f.score) > 0.1]
    if active_factors:
        desc_parts = [f"{f.factor_name}:{f.detail}" for f in active_factors[:3]]
        description = f"[{grade}] " + "; ".join(desc_parts)
    else:
        description = f"[{grade}] 量价关系正常"

    if unavailable_factors:
        description += f" (数据完整度{data_completeness:.0%})"

    result = VolumePriceDivergenceV2(
        score=round(final_score, 4),
        grade=grade,
        confidence_modifier=confidence_modifier,
        factors=factor_results,
        position=position_label,
        position_coefficient=round(pos_coeff, 2),
        description=description,
        data_completeness=round(data_completeness, 2),
        price_trend=price_trend,
    )

    if abs(final_score) > 0.1:
        logger.info(
            "vpd_v2_detected",
            extra={
                "score": final_score,
                "grade": grade,
                "modifier": confidence_modifier,
                "active_factors": len(active_factors),
                "data_completeness": data_completeness,
            },
        )

    return result
