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
