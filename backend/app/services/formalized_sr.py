"""公式化支撑阻力位交叉验证模块（P3-C）。

使用三种公式化算法计算支撑阻力位，与 LLM 产出进行交叉验证：
1. Pivot Point（前日 HLC 标准公式）
2. 布林带边界（BB Upper / Lower）
3. EMA 动态支撑（EMA25 / EMA99）

当 LLM 与公式偏差 > tolerance_pct 时，以公式值/两者中位数为准。
"""

import logging
from dataclasses import dataclass

logger = logging.getLogger(__name__)


@dataclass
class FormulaSRLevels:
    """公式化支撑阻力位集合。"""
    pivot: float | None = None
    r1: float | None = None
    r2: float | None = None
    s1: float | None = None
    s2: float | None = None
    bb_upper: float | None = None
    bb_lower: float | None = None
    ema25: float | None = None
    ema99: float | None = None


def compute_pivot_points(
    prev_high: float,
    prev_low: float,
    prev_close: float,
) -> dict[str, float]:
    """标准 Pivot Point 公式。

    P  = (H + L + C) / 3
    R1 = 2P - L
    S1 = 2P - H
    R2 = P + (H - L)
    S2 = P - (H - L)
    """
    p = (prev_high + prev_low + prev_close) / 3
    r1 = 2 * p - prev_low
    s1 = 2 * p - prev_high
    r2 = p + (prev_high - prev_low)
    s2 = p - (prev_high - prev_low)
    return {"pivot": p, "r1": r1, "s1": s1, "r2": r2, "s2": s2}


def compute_formula_levels(
    klines: list[dict] | None = None,
    indicators: dict | None = None,
) -> FormulaSRLevels:
    """从 K 线和指标数据计算公式化支撑阻力位。

    Args:
        klines: 日线列表，至少需要最后 2 根（用于 Pivot Point）
        indicators: MarketData.indicators 字典（含 bb_upper, bb_lower, ema25, ema99）
    """
    levels = FormulaSRLevels()

    # 1. Pivot Point（前日 HLC）
    if klines and len(klines) >= 2:
        prev = klines[-2]  # 前一根日线
        try:
            prev_h = float(prev.get("high", 0))
            prev_l = float(prev.get("low", 0))
            prev_c = float(prev.get("close", 0))
            if prev_h > 0 and prev_l > 0 and prev_c > 0:
                pp = compute_pivot_points(prev_h, prev_l, prev_c)
                levels.pivot = pp["pivot"]
                levels.r1 = pp["r1"]
                levels.r2 = pp["r2"]
                levels.s1 = pp["s1"]
                levels.s2 = pp["s2"]
        except (TypeError, ValueError) as e:
            logger.warning("pivot_point_calc_error: %s", e)

    # 2. 布林带边界
    if indicators:
        bb_u = indicators.get("bb_upper")
        bb_l = indicators.get("bb_lower")
        if bb_u is not None:
            levels.bb_upper = float(bb_u)
        if bb_l is not None:
            levels.bb_lower = float(bb_l)

    # 3. EMA 动态支撑
    if indicators:
        ema25 = indicators.get("ema25")
        ema99 = indicators.get("ema99")
        if ema25 is not None:
            levels.ema25 = float(ema25)
        if ema99 is not None:
            levels.ema99 = float(ema99)

    return levels


def cross_validate_sr(
    llm_support: float | None,
    llm_resistance: float | None,
    formula: FormulaSRLevels,
    tolerance_pct: float = 0.02,
) -> tuple[float | None, float | None, list[str]]:
    """将 LLM 产出的支撑阻力位与公式值交叉验证。

    当偏差 > tolerance_pct 时，取两者中位数。

    Returns:
        (validated_support, validated_resistance, adjustment_notes)
    """
    notes: list[str] = []

    # 收集公式化支撑候选值
    formula_supports: list[float] = []
    if formula.s1 is not None:
        formula_supports.append(formula.s1)
    if formula.bb_lower is not None:
        formula_supports.append(formula.bb_lower)
    if formula.ema25 is not None:
        formula_supports.append(formula.ema25)
    if formula.ema99 is not None:
        formula_supports.append(formula.ema99)

    # 收集公式化阻力候选值
    formula_resistances: list[float] = []
    if formula.r1 is not None:
        formula_resistances.append(formula.r1)
    if formula.bb_upper is not None:
        formula_resistances.append(formula.bb_upper)

    # 验证支撑位
    validated_support = llm_support
    if llm_support and formula_supports:
        closest = min(formula_supports, key=lambda x: abs(x - llm_support))
        deviation = abs(llm_support - closest) / closest if closest else 0
        if deviation > tolerance_pct:
            # 偏差过大：取中位数
            validated_support = (llm_support + closest) / 2
            notes.append(
                f"支撑位修正: LLM={llm_support:.2f} 偏离公式={closest:.2f} "
                f"({deviation:.1%}), 使用中位数={validated_support:.2f}"
            )

    # 验证阻力位
    validated_resistance = llm_resistance
    if llm_resistance and formula_resistances:
        closest = min(formula_resistances, key=lambda x: abs(x - llm_resistance))
        deviation = abs(llm_resistance - closest) / closest if closest else 0
        if deviation > tolerance_pct:
            validated_resistance = (llm_resistance + closest) / 2
            notes.append(
                f"阻力位修正: LLM={llm_resistance:.2f} 偏离公式={closest:.2f} "
                f"({deviation:.1%}), 使用中位数={validated_resistance:.2f}"
            )

    return validated_support, validated_resistance, notes


# ── TP 候选池构建 ─────────────────────────────────────────────────
# 核心原则：TP 必须锚定到可辨识的技术关口，而非任意 ATR 倍数。
# 候选来源（按可信度降序）：
#   1. Pivot Point R1/R2（做多）/ S1/S2（做空）— 前日 HLC 标准公式
#   2. Swing Highs（做多）/ Swing Lows（做空）— 近期 K 线实际高低点
#   3. EMA99 / EMA25 动态位
#   4. BB Upper（做多）/ BB Lower（做空）
# ATR 只用于候选不足时的 spacing floor，不产生目标值本身。

_SWING_LOOKBACK_BARS: dict[str, int] = {
    "scalping": 20,   # 20 根 15m = 5h
    "intraday": 30,   # 30 根 1h = 30h
    "trend":    60,   # 60 根 4h/1d = 视周期而定
}


def _find_swing_levels(
    klines: list,
    direction: str,
    current_price: float,
    lookback: int,
    min_pct_from_price: float = 0.002,
) -> list[float]:
    """从最近 lookback 根 K 线提取 swing high（做多阻力）或 swing low（做空支撑）。

    只取实际高低点，不做任何插值或估算。
    做多：high > current_price 的前高
    做空：low < current_price 的前低

    min_pct_from_price: 过滤掉太近的点位（避免贴近当前价的噪音）
    """
    if not klines:
        return []

    recent = klines[-lookback:] if len(klines) >= lookback else klines
    levels: list[float] = []

    for bar in recent:
        # 兼容 Kline 对象和 dict
        if hasattr(bar, "high"):
            high = float(bar.high)
            low = float(bar.low)
        else:
            high = float(bar.get("high", 0))
            low = float(bar.get("low", 0))

        if direction == "long":
            if high > current_price * (1 + min_pct_from_price):
                levels.append(high)
        else:  # short
            if low > 0 and low < current_price * (1 - min_pct_from_price):
                levels.append(low)

    # 去重 + 排序
    levels = sorted(set(round(lvl, 8) for lvl in levels))
    return levels


def build_tp_candidates(
    direction: str,
    current_price: float,
    klines: list | None,
    indicators: dict | None,
    mode: str = "scalping",
    atr: float | None = None,
) -> list[float]:
    """构建 TP 候选位列表，按距当前价从近到远排序。

    只返回有真实数据支撑的价格关口，绝不编造百分比位置。
    调用方取前 N 个即可（通常 N=3）。

    Args:
        direction:     "long" 或 "short"
        current_price: 当前价格
        klines:        K 线列表（Kline 对象或 dict，任意周期）
        indicators:    技术指标字典（含 ema25/ema99/bb_upper/bb_lower）
        mode:          分析模式，影响 swing 回溯窗口
        atr:           ATR（仅用于 spacing 验证，不产生目标值）

    Returns:
        按从近到远排序的候选价位列表（未截断，调用方自行取需要的数量）
    """
    if direction == "neutral" or current_price <= 0:
        return []

    candidates: list[float] = []

    # ── 1. Pivot Point ────────────────────────────────────────
    if klines and len(klines) >= 2:
        try:
            prev = klines[-2]
            if hasattr(prev, "high"):
                ph, pl, pc = float(prev.high), float(prev.low), float(prev.close)
            else:
                ph = float(prev.get("high", 0))
                pl = float(prev.get("low", 0))
                pc = float(prev.get("close", 0))

            if ph > 0 and pl > 0 and pc > 0:
                pp = compute_pivot_points(ph, pl, pc)
                if direction == "long":
                    # 做多：Pivot 上方的阻力位是 TP 候选
                    for key in ("r1", "r2"):
                        lvl = pp[key]
                        if lvl > current_price * 1.001:
                            candidates.append(round(lvl, 8))
                else:
                    # 做空：Pivot 下方的支撑位是 TP 候选
                    for key in ("s1", "s2"):
                        lvl = pp[key]
                        if 0 < lvl < current_price * 0.999:
                            candidates.append(round(lvl, 8))
        except Exception as exc:
            logger.debug("Pivot point calc skipped: %s", exc)

    # ── 2. Swing High / Low ───────────────────────────────────
    lookback = _SWING_LOOKBACK_BARS.get(mode, 20)
    swing_levels = _find_swing_levels(klines, direction, current_price, lookback)
    candidates.extend(swing_levels)

    # ── 3. EMA 动态位 ─────────────────────────────────────────
    if indicators:
        for ema_key in ("ema99", "ema25"):
            val = indicators.get(ema_key)
            if val is None:
                continue
            ema_val = float(val)
            if direction == "long" and ema_val > current_price * 1.001:
                candidates.append(round(ema_val, 8))
            elif direction == "short" and ema_val < current_price * 0.999:
                candidates.append(round(ema_val, 8))

    # ── 4. BB Upper / Lower ───────────────────────────────────
    if indicators:
        if direction == "long":
            bb_u = indicators.get("bb_upper")
            if bb_u is not None:
                bb_u = float(bb_u)
                if bb_u > current_price * 1.001:
                    candidates.append(round(bb_u, 8))
        else:
            bb_l = indicators.get("bb_lower")
            if bb_l is not None:
                bb_l = float(bb_l)
                if bb_l < current_price * 0.999:
                    candidates.append(round(bb_l, 8))

    # ── 去重、过滤、排序 ──────────────────────────────────────
    # 做多：从近到远（升序）；做空：从近到远（降序）
    seen: set[float] = set()
    unique: list[float] = []
    for lvl in candidates:
        rounded = round(lvl, 8)
        if rounded not in seen:
            seen.add(rounded)
            unique.append(rounded)

    if direction == "long":
        unique = sorted(unique)   # 最近阻力在前
    else:
        unique = sorted(unique, reverse=True)  # 最近支撑在前

    # ATR spacing 验证：候选位之间至少间距 0.5×ATR（防止同一区域重复计数）
    if atr and atr > 0 and unique:
        min_gap = atr * 0.5
        filtered: list[float] = [unique[0]]
        for lvl in unique[1:]:
            if abs(lvl - filtered[-1]) >= min_gap:
                filtered.append(lvl)
        unique = filtered

    # 最多保留 6 个候选（防止过密噪声），调用方取前 3
    unique = unique[:6]

    if unique:
        logger.debug(
            "build_tp_candidates: direction=%s price=%.4f candidates=%s",
            direction, current_price, [round(c, 4) for c in unique],
        )
    else:
        logger.info(
            "build_tp_candidates: no structural TP levels found for direction=%s price=%.4f mode=%s",
            direction, current_price, mode,
        )

    return unique
