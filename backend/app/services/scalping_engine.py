"""超短线规则引擎 — 纯计算信号评分，替代 LLM 调用。

多维度指标评分 + 多周期确认 + Volume Profile 点位融合。
全流程 < 50ms，无 LLM 调用。
"""

import logging
from dataclasses import dataclass

from app.models.market_data import IndicatorResult, KlineData
from app.models.analysis import CandlestickPattern, FVGResult
from app.services.volume_profile import VolumeProfileResult

logger = logging.getLogger(__name__)

# ── 评分权重 ──────────────────────────────────────────────

_WEIGHTS = {
    "rsi": 1.5,           # RSI 超买超卖
    "ema_alignment": 2.0, # EMA 排列
    "ema_cross": 1.5,     # EMA 交叉
    "macd": 1.0,          # MACD 柱状图
    "bb_position": 1.0,   # 布林带位置
    "pattern": 2.0,       # K线形态
    "obv_confirm": 1.0,   # OBV 量价确认
    "volume_ratio": 0.5,  # 量比
}

_SIGNAL_THRESHOLD = 2.0      # |score| > 2.0 才出信号
_CONFIDENCE_MIN = 0.35       # 最低置信度门槛
_MAX_RAW_SCORE = 8.0         # 评分归一化上限
_MTF_PENALTY = 0.5           # 多周期不一致时的惩罚系数
_MTF_BOOST = 1.2             # 三周期一致时的加成系数


@dataclass
class ScalpingSignal:
    """规则引擎信号结果。"""
    direction: str            # "bullish" / "bearish" / "neutral"
    confidence: float         # 0.0 - 1.0
    raw_score: float          # 原始评分
    score_breakdown: dict     # 各维度得分明细
    reasoning: str            # 自动生成的分析理由
    key_findings: list[str]   # 关键发现列表


def _score_rsi(rsi: float | None) -> float:
    """RSI 评分：超卖看多，超买看空。"""
    if rsi is None:
        return 0.0
    if rsi < 25:
        return 1.5  # 强超卖
    elif rsi < 30:
        return 1.0  # 超卖
    elif rsi > 75:
        return -1.5  # 强超买
    elif rsi > 70:
        return -1.0  # 超买
    elif 45 <= rsi <= 55:
        return 0.0  # 中性区
    elif rsi < 45:
        return 0.3  # 偏弱
    else:
        return -0.3  # 偏强


def _score_ema_alignment(
    ema7: float | None, ema25: float | None, ema99: float | None,
) -> float:
    """EMA 排列评分：多头/空头排列。"""
    if ema7 is None or ema25 is None or ema99 is None:
        return 0.0
    if ema7 > ema25 > ema99:
        return 2.0  # 多头排列
    elif ema7 < ema25 < ema99:
        return -2.0  # 空头排列
    elif ema7 > ema25:
        return 0.5  # 短期偏多
    elif ema7 < ema25:
        return -0.5  # 短期偏空
    return 0.0


def _score_ema_cross(
    price: float, ema7: float | None, ema25: float | None,
) -> float:
    """EMA 交叉评分：价格与 EMA 的关系。"""
    if ema7 is None or ema25 is None:
        return 0.0
    # 价格站上 EMA7 且 EMA7 刚上穿 EMA25 → 金叉
    if price > ema7 > ema25 and abs(ema7 - ema25) / ema25 < 0.002:
        return 1.5
    # 价格跌破 EMA7 且 EMA7 刚下穿 EMA25 → 死叉
    if price < ema7 < ema25 and abs(ema25 - ema7) / ema25 < 0.002:
        return -1.5
    return 0.0


def _score_macd(
    macd_hist: float | None,
) -> float:
    """MACD 柱状图评分。"""
    if macd_hist is None:
        return 0.0
    if macd_hist > 0:
        return min(1.0, macd_hist * 100)  # 正向归一化
    else:
        return max(-1.0, macd_hist * 100)


def _score_bb(
    price: float,
    bb_upper: float | None, bb_middle: float | None, bb_lower: float | None,
) -> float:
    """布林带位置评分。"""
    if bb_upper is None or bb_lower is None or bb_middle is None:
        return 0.0
    bb_width = bb_upper - bb_lower
    if bb_width <= 0:
        return 0.0
    position = (price - bb_lower) / bb_width  # 0=下轨, 1=上轨
    if position <= 0.05:
        return 1.0  # 触下轨
    elif position >= 0.95:
        return -1.0  # 触上轨
    elif position < 0.2:
        return 0.5  # 接近下轨
    elif position > 0.8:
        return -0.5  # 接近上轨
    return 0.0


def _score_patterns(patterns: list[CandlestickPattern]) -> float:
    """K线形态评分：综合所有检测到的形态。"""
    if not patterns:
        return 0.0
    score = 0.0
    for p in patterns:
        if p.direction == "bullish":
            score += p.strength * 2.0
        elif p.direction == "bearish":
            score -= p.strength * 2.0
    return max(-2.0, min(2.0, score))  # 钳位


def _score_obv(
    price: float, obv: float | None,
    prev_price: float | None, prev_obv: float | None,
) -> float:
    """OBV 量价确认/背离评分。"""
    if obv is None or prev_obv is None or prev_price is None:
        return 0.0
    price_up = price > prev_price
    obv_up = obv > prev_obv
    if price_up and obv_up:
        return 1.0  # 量价齐升 → 确认
    elif not price_up and not obv_up:
        return -1.0  # 量价齐跌 → 确认
    elif price_up and not obv_up:
        return -0.6  # 价升量跌 → 顶背离
    else:
        return 0.6  # 价跌量升 → 底背离


def _score_volume_ratio(volume_ratio: float | None) -> float:
    """量比评分。"""
    if volume_ratio is None:
        return 0.0
    if volume_ratio > 2.0:
        return 0.5  # 显著放量
    elif volume_ratio < 0.5:
        return -0.3  # 缩量（信号可靠性降低）
    return 0.0


def compute_scalping_signal(
    price: float,
    indicators: IndicatorResult | None,
    klines_5m: list[KlineData],
    klines_15m: list[KlineData],
    klines_1h: list[KlineData],
    patterns: list[CandlestickPattern],
) -> ScalpingSignal:
    """计算超短线信号（核心函数）。

    Args:
        price: 当前价格
        indicators: 技术指标（基于 15m 周期）
        klines_5m: 5 分钟 K 线
        klines_15m: 15 分钟 K 线
        klines_1h: 1 小时 K 线
        patterns: 已检测到的 K 线形态

    Returns:
        ScalpingSignal 包含方向、置信度、评分明细、分析理由
    """
    breakdown: dict[str, float] = {}
    findings: list[str] = []

    # ── 维度 1: RSI ────────────────────────────────
    rsi_score = _score_rsi(indicators.rsi if indicators else None)
    breakdown["rsi"] = rsi_score
    if indicators and indicators.rsi is not None:
        if abs(rsi_score) >= 1.0:
            zone = "超卖" if rsi_score > 0 else "超买"
            findings.append(f"RSI({indicators.rsi:.1f}) {zone}")

    # ── 维度 2: EMA 排列 ──────────────────────────
    ema_score = _score_ema_alignment(
        indicators.ema7 if indicators else None,
        indicators.ema25 if indicators else None,
        indicators.ema99 if indicators else None,
    )
    breakdown["ema_alignment"] = ema_score
    if abs(ema_score) >= 1.5:
        align = "多头排列" if ema_score > 0 else "空头排列"
        findings.append(f"EMA {align}")

    # ── 维度 3: EMA 交叉 ──────────────────────────
    cross_score = _score_ema_cross(
        price,
        indicators.ema7 if indicators else None,
        indicators.ema25 if indicators else None,
    )
    breakdown["ema_cross"] = cross_score
    if abs(cross_score) >= 1.0:
        cross_type = "金叉" if cross_score > 0 else "死叉"
        findings.append(f"EMA7/25 {cross_type}")

    # ── 维度 4: MACD ─────────────────────────────
    macd_score = _score_macd(
        indicators.macd_histogram if indicators else None,
    )
    breakdown["macd"] = macd_score

    # ── 维度 5: 布林带 ───────────────────────────
    bb_score = _score_bb(
        price,
        indicators.bb_upper if indicators else None,
        indicators.bb_middle if indicators else None,
        indicators.bb_lower if indicators else None,
    )
    breakdown["bb_position"] = bb_score
    if abs(bb_score) >= 0.8:
        bb_zone = "触下轨" if bb_score > 0 else "触上轨"
        findings.append(f"布林带{bb_zone}")

    # ── 维度 6: K线形态 ──────────────────────────
    pattern_score = _score_patterns(patterns)
    breakdown["pattern"] = pattern_score
    for p in patterns:
        if p.strength >= 0.5:
            findings.append(f"{p.display_name}(强度{p.strength})")

    # ── 维度 7: OBV 量价确认 ─────────────────────
    prev_price = klines_5m[-2].close if len(klines_5m) >= 2 else None
    obv_score = _score_obv(
        price,
        indicators.obv if indicators else None,
        prev_price,
        None,  # prev_obv 需从 K 线时序推导，简化处理
    )
    breakdown["obv_confirm"] = obv_score
    if abs(obv_score) >= 0.6:
        if obv_score > 0:
            findings.append("量价齐升确认" if obv_score == 1.0 else "底背离")
        else:
            findings.append("量价齐跌确认" if obv_score == -1.0 else "顶背离")

    # ── 维度 8: 量比 ─────────────────────────────
    vr_score = _score_volume_ratio(
        indicators.volume_ratio if indicators else None,
    )
    breakdown["volume_ratio"] = vr_score

    # ── 加权总分 ─────────────────────────────────
    raw_score = sum(
        breakdown[k] * _WEIGHTS.get(k, 1.0)
        for k in breakdown
    )

    # ── 多周期确认 ───────────────────────────────
    mtf_factor = 1.0
    if klines_15m and len(klines_15m) >= 5:
        # 15m 趋势方向：最近 5 根的收盘均值 vs 当前价
        avg_15m = sum(k.close for k in klines_15m[-5:]) / 5
        trend_15m = "bullish" if price > avg_15m else "bearish"
        signal_5m = "bullish" if raw_score > 0 else "bearish"

        if signal_5m != trend_15m and abs(raw_score) > _SIGNAL_THRESHOLD:
            mtf_factor = _MTF_PENALTY
            findings.append(f"15m 趋势({trend_15m})与 5m 信号不一致，降权")

    if klines_1h and len(klines_1h) >= 3:
        avg_1h = sum(k.close for k in klines_1h[-3:]) / 3
        trend_1h = "bullish" if price > avg_1h else "bearish"
        signal_5m = "bullish" if raw_score > 0 else "bearish"

        # 三周期一致 → 加成
        if klines_15m and len(klines_15m) >= 5:
            avg_15m = sum(k.close for k in klines_15m[-5:]) / 5
            trend_15m = "bullish" if price > avg_15m else "bearish"
            if signal_5m == trend_15m == trend_1h:
                mtf_factor = _MTF_BOOST
                findings.append("5m/15m/1h 三周期共振")

    adjusted_score = raw_score * mtf_factor

    # ── 方向和置信度 ─────────────────────────────
    if adjusted_score > _SIGNAL_THRESHOLD:
        direction = "bullish"
        confidence = min(abs(adjusted_score) / _MAX_RAW_SCORE, 1.0)
    elif adjusted_score < -_SIGNAL_THRESHOLD:
        direction = "bearish"
        confidence = min(abs(adjusted_score) / _MAX_RAW_SCORE, 1.0)
    else:
        direction = "neutral"
        confidence = 0.0

    # 最低置信度门槛
    if confidence < _CONFIDENCE_MIN and direction != "neutral":
        direction = "neutral"
        confidence = 0.0
        findings.append(f"置信度低于门槛({_CONFIDENCE_MIN})，信号抑制")

    # ── 生成 reasoning ───────────────────────────
    reasoning_parts = []
    if direction != "neutral":
        dir_cn = "做多" if direction == "bullish" else "做空"
        reasoning_parts.append(f"综合评分 {adjusted_score:+.2f} → {dir_cn}")
        # 列出 top-3 贡献因子
        sorted_factors = sorted(
            breakdown.items(), key=lambda x: abs(x[1]), reverse=True,
        )
        top3 = [f"{k}={v:+.2f}" for k, v in sorted_factors[:3] if abs(v) > 0]
        if top3:
            reasoning_parts.append(f"主要因子: {', '.join(top3)}")
        if mtf_factor != 1.0:
            reasoning_parts.append(f"多周期系数: {mtf_factor}")
    else:
        reasoning_parts.append("指标信号不一致或置信度不足，暂不出信号")

    return ScalpingSignal(
        direction=direction,
        confidence=round(confidence, 4),
        raw_score=round(adjusted_score, 4),
        score_breakdown=breakdown,
        reasoning="。".join(reasoning_parts),
        key_findings=findings,
    )


def compute_scalping_levels(
    direction: str,
    price: float,
    atr: float,
    vp: VolumeProfileResult | None,
    fvg_list: list[FVGResult],
    symbol: str | None = None,
) -> dict:
    """融合 ATR + Volume Profile + FVG 计算精准入场/止损/目标点位。

    三重锚定策略：
    1. ATR 自适应计算基础点位（复用 S1-5 的 _atr_multipliers）
    2. Volume Profile HVN/VPOC 吸附止损和入场
    3. FVG 缺口边沿吸附目标价

    Args:
        direction: "bullish" / "bearish"
        price: 当前价格
        atr: 当前 ATR 值
        vp: Volume Profile 计算结果（可为 None）
        fvg_list: FVG 检测结果列表
        symbol: 币种（预留自适应阈值）

    Returns:
        {"entry_low", "entry_high", "stop_loss", "targets": [3],
         "level_sources": {"stop_loss": "HVN", ...}}
    """
    from app.services.strategy import _atr_multipliers

    m = _atr_multipliers(atr, price)
    level_sources: dict[str, str] = {}  # 记录各点位的数据来源

    if direction == "bullish":
        entry_low = price - m["entry"] * atr
        entry_high = price
        stop_loss = price - m["stop"] * atr
        targets = [price + t * atr for t in m["targets"]]
        level_sources["stop_loss"] = "ATR"
        level_sources["entry"] = "ATR"
        level_sources["targets"] = "ATR"

        # ── Volume Profile 止损吸附 ──────────────────
        if vp and vp.hvn_levels:
            hvn_below = [h for h in vp.hvn_levels if h < price]
            if hvn_below:
                nearest_hvn = min(hvn_below, key=lambda h: abs(h - stop_loss))
                # 如果 HVN 在 ATR 止损的 ±0.5ATR 范围内 → 吸附
                if abs(nearest_hvn - stop_loss) < atr * 0.5:
                    stop_loss = nearest_hvn * 0.998  # 略低于 HVN
                    level_sources["stop_loss"] = f"HVN({nearest_hvn:.2f})"

        # ── Volume Profile 入场吸附 ──────────────────
        if vp:
            # VAL 作为多头入场下沿参考
            if abs(vp.val - entry_low) < atr:
                entry_low = vp.val
                level_sources["entry"] = f"VAL({vp.val:.2f})"

        # ── FVG 目标吸附 ─────────────────────────────
        bullish_fvgs = [
            f for f in fvg_list
            if f.direction == "bullish" and f.gap_high > price
        ]
        if bullish_fvgs:
            bullish_fvgs.sort(key=lambda f: f.gap_high - price)
            for fvg in bullish_fvgs:
                for i, t in enumerate(targets):
                    if abs(fvg.gap_high - t) < atr * 0.5:
                        targets[i] = fvg.gap_high
                        level_sources["targets"] = f"FVG({fvg.gap_high:.2f})"
                        break

    elif direction == "bearish":
        entry_low = price
        entry_high = price + m["entry"] * atr
        stop_loss = price + m["stop"] * atr
        targets = [price - t * atr for t in m["targets"]]
        level_sources["stop_loss"] = "ATR"
        level_sources["entry"] = "ATR"
        level_sources["targets"] = "ATR"

        # ── Volume Profile 止损吸附 ──────────────────
        if vp and vp.hvn_levels:
            hvn_above = [h for h in vp.hvn_levels if h > price]
            if hvn_above:
                nearest_hvn = min(hvn_above, key=lambda h: abs(h - stop_loss))
                if abs(nearest_hvn - stop_loss) < atr * 0.5:
                    stop_loss = nearest_hvn * 1.002  # 略高于 HVN
                    level_sources["stop_loss"] = f"HVN({nearest_hvn:.2f})"

        # ── Volume Profile 入场吸附 ──────────────────
        if vp:
            if abs(vp.vah - entry_high) < atr:
                entry_high = vp.vah
                level_sources["entry"] = f"VAH({vp.vah:.2f})"

        # ── FVG 目标吸附 ─────────────────────────────
        bearish_fvgs = [
            f for f in fvg_list
            if f.direction == "bearish" and f.gap_low < price
        ]
        if bearish_fvgs:
            bearish_fvgs.sort(key=lambda f: price - f.gap_low)
            for fvg in bearish_fvgs:
                for i, t in enumerate(targets):
                    if abs(fvg.gap_low - t) < atr * 0.5:
                        targets[i] = fvg.gap_low
                        level_sources["targets"] = f"FVG({fvg.gap_low:.2f})"
                        break

    else:
        # neutral → 不生成策略点位
        return {
            "entry_low": round(price * 0.99, 8),
            "entry_high": round(price * 1.01, 8),
            "stop_loss": round(price * 0.95, 8),
            "targets": [],
            "level_sources": {},
        }

    return {
        "entry_low": round(entry_low, 8),
        "entry_high": round(entry_high, 8),
        "stop_loss": round(stop_loss, 8),
        "targets": [round(t, 8) for t in targets[:3]],
        "level_sources": level_sources,
    }
