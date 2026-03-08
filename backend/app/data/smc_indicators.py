"""SMC（聪明钱概念）指标检测器模块。

包含以下检测器：
- CandlestickPatternDetector: K线形态识别
- FVGDetector: 公允价值缺口检测（待实现）
- OrderBlockDetector: 机构订单块检测（待实现）

所有检测器均为纯计算模块，无 IO 操作。
"""

from app.models.market_data import KlineData
from app.models.analysis import CandlestickPattern, FVGResult, OrderBlockResult


# ===========================================================================
# 辅助函数
# ===========================================================================

def _is_bullish(k: KlineData) -> bool:
    """判断是否为阳线（收盘 > 开盘）。"""
    return k.close > k.open


def _is_bearish(k: KlineData) -> bool:
    """判断是否为阴线（收盘 < 开盘）。"""
    return k.close < k.open


def _body(k: KlineData) -> float:
    """计算实体大小（绝对值）。"""
    return abs(k.close - k.open)


def _range(k: KlineData) -> float:
    """计算K线全幅（最高 - 最低）。"""
    return k.high - k.low


def _upper_shadow(k: KlineData) -> float:
    """计算上影线长度。"""
    return k.high - max(k.open, k.close)


def _lower_shadow(k: KlineData) -> float:
    """计算下影线长度。"""
    return min(k.open, k.close) - k.low


# ===========================================================================
# K线形态检测器
# ===========================================================================

class CandlestickPatternDetector:
    """K线形态识别检测器。

    支持检测以下经典形态：
    - 吞没形态（Engulfing）
    - Pin Bar（锤子线/上吊线/倒锤子/射击之星）
    - 晨星/暮星（Morning Star / Evening Star）
    - 刺穿/乌云盖顶（Piercing Line / Dark Cloud Cover）
    - 三内部（Three Inside Bar）
    - 大阳线/大阴线（Marubozu）

    纯计算，无 IO 操作。
    """

    @staticmethod
    def detect(klines: list[KlineData]) -> list[CandlestickPattern]:
        """从K线数据中检测经典形态。

        Args:
            klines: K线数据列表，按时间升序排列。

        Returns:
            检测到的所有形态列表。少于 3 根K线返回空列表。
        """
        if len(klines) < 3:
            return []

        patterns: list[CandlestickPattern] = []

        for i in range(2, len(klines)):
            prev2 = klines[i - 2]
            prev = klines[i - 1]
            curr = klines[i]

            # --- 2-candle patterns (prev + curr) ---
            patterns.extend(CandlestickPatternDetector._detect_engulfing(prev, curr, i))
            patterns.extend(CandlestickPatternDetector._detect_pin_bar(prev, curr, i))
            patterns.extend(CandlestickPatternDetector._detect_piercing_dark_cloud(prev, curr, i))

            # --- 3-candle patterns (prev2 + prev + curr) ---
            patterns.extend(CandlestickPatternDetector._detect_morning_evening_star(prev2, prev, curr, i))
            patterns.extend(CandlestickPatternDetector._detect_three_inside(prev2, prev, curr, i))

            # --- 1-candle patterns (curr only) ---
            patterns.extend(CandlestickPatternDetector._detect_marubozu(curr, i))

        return patterns

    # -----------------------------------------------------------------------
    # 吞没形态（Engulfing）
    # -----------------------------------------------------------------------

    @staticmethod
    def _detect_engulfing(
        prev: KlineData, curr: KlineData, idx: int
    ) -> list[CandlestickPattern]:
        """检测看涨/看跌吞没形态。

        看涨吞没：前一根阴线，当前阳线实体完全包裹前一根实体。
        看跌吞没：前一根阳线，当前阴线实体完全包裹前一根实体。
        """
        results: list[CandlestickPattern] = []
        prev_body = _body(prev)
        curr_body = _body(curr)

        if prev_body == 0 or curr_body == 0:
            return results

        # 看涨吞没
        if _is_bearish(prev) and _is_bullish(curr):
            if curr.close > prev.open and curr.open < prev.close:
                ratio = min(curr_body / prev_body, 3.0) / 3.0
                strength = round(min(max(ratio, 0.3), 1.0), 2)
                results.append(CandlestickPattern(
                    pattern_name="bullish_engulfing",
                    display_name="看涨吞没",
                    direction="bullish",
                    strength=strength,
                    candle_index=idx,
                ))

        # 看跌吞没
        if _is_bullish(prev) and _is_bearish(curr):
            if curr.open > prev.close and curr.close < prev.open:
                ratio = min(curr_body / prev_body, 3.0) / 3.0
                strength = round(min(max(ratio, 0.3), 1.0), 2)
                results.append(CandlestickPattern(
                    pattern_name="bearish_engulfing",
                    display_name="看跌吞没",
                    direction="bearish",
                    strength=strength,
                    candle_index=idx,
                ))

        return results

    # -----------------------------------------------------------------------
    # Pin Bar（锤子线/上吊线/倒锤子/射击之星）
    # -----------------------------------------------------------------------

    @staticmethod
    def _detect_pin_bar(
        prev: KlineData, curr: KlineData, idx: int
    ) -> list[CandlestickPattern]:
        """检测 Pin Bar 形态。

        锤子线（Hammer）：小实体在顶部，长下影线 >= 2倍实体，小上影线（<= 全幅10%）。
        上吊线（Hanging Man）：同锤子线形状，但出现在上升趋势中。
        倒锤子（Inverted Hammer）：长上影线 >= 2倍实体，小下影线（<= 全幅10%）。
        射击之星（Shooting Star）：同倒锤子形状，但出现在上升趋势中。
        """
        results: list[CandlestickPattern] = []
        body = _body(curr)
        rng = _range(curr)
        upper = _upper_shadow(curr)
        lower = _lower_shadow(curr)

        if rng == 0 or body == 0:
            return results

        # 小影线阈值：全幅的 10%，更稳健地判断"小影线"
        small_shadow_threshold = rng * 0.1

        # 锤子线 / 上吊线：长下影线，小上影线
        if lower >= 2.0 * body and upper <= small_shadow_threshold:
            shadow_ratio = lower / body
            strength = round(min(shadow_ratio / 4.0, 1.0), 2)

            # 判断趋势方向：简单用前一根K线判断
            if _is_bearish(prev) or prev.close < prev.open:
                # 下跌后出现 → 锤子线（看涨）
                results.append(CandlestickPattern(
                    pattern_name="pin_bar_hammer",
                    display_name="锤子线",
                    direction="bullish",
                    strength=strength,
                    candle_index=idx,
                ))
            else:
                # 上涨后出现 → 上吊线（看跌）
                results.append(CandlestickPattern(
                    pattern_name="pin_bar_hanging_man",
                    display_name="上吊线",
                    direction="bearish",
                    strength=strength,
                    candle_index=idx,
                ))

        # 倒锤子 / 射击之星：长上影线，小下影线
        if upper >= 2.0 * body and lower <= small_shadow_threshold:
            shadow_ratio = upper / body
            strength = round(min(shadow_ratio / 4.0, 1.0), 2)

            if _is_bearish(prev) or prev.close < prev.open:
                # 下跌后出现 → 倒锤子（看涨）
                results.append(CandlestickPattern(
                    pattern_name="pin_bar_inverted_hammer",
                    display_name="倒锤子",
                    direction="bullish",
                    strength=strength,
                    candle_index=idx,
                ))
            else:
                # 上涨后出现 → 射击之星（看跌）
                results.append(CandlestickPattern(
                    pattern_name="pin_bar_shooting_star",
                    display_name="射击之星",
                    direction="bearish",
                    strength=strength,
                    candle_index=idx,
                ))

        return results


    # -----------------------------------------------------------------------
    # 晨星 / 暮星（Morning Star / Evening Star）
    # -----------------------------------------------------------------------

    @staticmethod
    def _detect_morning_evening_star(
        first: KlineData, second: KlineData, third: KlineData, idx: int
    ) -> list[CandlestickPattern]:
        """检测晨星/暮星三根K线形态。

        晨星（看涨）：大阴线 + 小实体（十字星） + 大阳线。
        暮星（看跌）：大阳线 + 小实体（十字星） + 大阴线。
        """
        results: list[CandlestickPattern] = []
        first_body = _body(first)
        second_body = _body(second)
        third_body = _body(third)
        first_range = _range(first)
        third_range = _range(third)

        if first_range == 0 or third_range == 0:
            return results

        # 中间K线实体应较小（小于第一根和第三根实体的较小者的 50%）
        min_outer_body = min(first_body, third_body)
        if min_outer_body == 0:
            return results

        is_small_middle = second_body < min_outer_body * 0.5

        if not is_small_middle:
            return results

        # 晨星：大阴线 + 小实体 + 大阳线
        if _is_bearish(first) and _is_bullish(third):
            avg_outer = (first_body + third_body) / 2.0
            strength = round(min(avg_outer / first_range, 1.0), 2)
            results.append(CandlestickPattern(
                pattern_name="morning_star",
                display_name="晨星",
                direction="bullish",
                strength=strength,
                candle_index=idx,
            ))

        # 暮星：大阳线 + 小实体 + 大阴线
        if _is_bullish(first) and _is_bearish(third):
            avg_outer = (first_body + third_body) / 2.0
            strength = round(min(avg_outer / third_range, 1.0), 2)
            results.append(CandlestickPattern(
                pattern_name="evening_star",
                display_name="暮星",
                direction="bearish",
                strength=strength,
                candle_index=idx,
            ))

        return results

    # -----------------------------------------------------------------------
    # 刺穿 / 乌云盖顶（Piercing Line / Dark Cloud Cover）
    # -----------------------------------------------------------------------

    @staticmethod
    def _detect_piercing_dark_cloud(
        prev: KlineData, curr: KlineData, idx: int
    ) -> list[CandlestickPattern]:
        """检测刺穿/乌云盖顶形态。

        刺穿（看涨）：阴线后，阳线开盘低于前低，收盘超过前实体中点。
        乌云盖顶（看跌）：阳线后，阴线开盘高于前高，收盘低于前实体中点。
        """
        results: list[CandlestickPattern] = []
        prev_body = _body(prev)

        if prev_body == 0:
            return results

        prev_mid = (prev.open + prev.close) / 2.0

        # 刺穿线（Piercing Line）
        if _is_bearish(prev) and _is_bullish(curr):
            if curr.open < prev.low and curr.close > prev_mid:
                # 穿透深度：收盘在前实体中的位置
                penetration = (curr.close - prev.close) / prev_body
                strength = round(min(max(penetration, 0.3), 1.0), 2)
                results.append(CandlestickPattern(
                    pattern_name="piercing_line",
                    display_name="刺穿线",
                    direction="bullish",
                    strength=strength,
                    candle_index=idx,
                ))

        # 乌云盖顶（Dark Cloud Cover）
        if _is_bullish(prev) and _is_bearish(curr):
            if curr.open > prev.high and curr.close < prev_mid:
                penetration = (prev.close - curr.close) / prev_body
                strength = round(min(max(penetration, 0.3), 1.0), 2)
                results.append(CandlestickPattern(
                    pattern_name="dark_cloud_cover",
                    display_name="乌云盖顶",
                    direction="bearish",
                    strength=strength,
                    candle_index=idx,
                ))

        return results

    # -----------------------------------------------------------------------
    # 三内部（Three Inside Bar）
    # -----------------------------------------------------------------------

    @staticmethod
    def _detect_three_inside(
        first: KlineData, second: KlineData, third: KlineData, idx: int
    ) -> list[CandlestickPattern]:
        """检测三内部形态。

        看涨三内部：阴线 + 小阳线在前实体内 + 阳线收盘高于第一根开盘。
        看跌三内部：阳线 + 小阴线在前实体内 + 阴线收盘低于第一根开盘。
        """
        results: list[CandlestickPattern] = []

        first_high_body = max(first.open, first.close)
        first_low_body = min(first.open, first.close)

        second_high_body = max(second.open, second.close)
        second_low_body = min(second.open, second.close)

        # 看涨三内部
        if _is_bearish(first) and _is_bullish(second) and _is_bullish(third):
            # 第二根实体在第一根实体内
            if second_high_body <= first_high_body and second_low_body >= first_low_body:
                # 第三根收盘高于第一根开盘
                if third.close > first.open:
                    results.append(CandlestickPattern(
                        pattern_name="three_inside_up",
                        display_name="看涨三内部",
                        direction="bullish",
                        strength=0.7,
                        candle_index=idx,
                    ))

        # 看跌三内部
        if _is_bullish(first) and _is_bearish(second) and _is_bearish(third):
            # 第二根实体在第一根实体内
            if second_high_body <= first_high_body and second_low_body >= first_low_body:
                # 第三根收盘低于第一根开盘
                if third.close < first.open:
                    results.append(CandlestickPattern(
                        pattern_name="three_inside_down",
                        display_name="看跌三内部",
                        direction="bearish",
                        strength=0.7,
                        candle_index=idx,
                    ))

        return results

    # -----------------------------------------------------------------------
    # 大阳线 / 大阴线（Marubozu）
    # -----------------------------------------------------------------------

    @staticmethod
    def _detect_marubozu(
        curr: KlineData, idx: int
    ) -> list[CandlestickPattern]:
        """检测大阳线/大阴线（Marubozu）。

        大阳线：收盘 > 开盘，上下影线均小于实体的 5%。
        大阴线：开盘 > 收盘，上下影线均小于实体的 5%。
        """
        results: list[CandlestickPattern] = []
        body = _body(curr)
        rng = _range(curr)
        upper = _upper_shadow(curr)
        lower = _lower_shadow(curr)

        if body == 0 or rng == 0:
            return results

        shadow_threshold = body * 0.05

        if upper <= shadow_threshold and lower <= shadow_threshold:
            strength = round(min(body / rng, 1.0), 2)

            if _is_bullish(curr):
                results.append(CandlestickPattern(
                    pattern_name="bullish_marubozu",
                    display_name="大阳线",
                    direction="bullish",
                    strength=strength,
                    candle_index=idx,
                ))
            elif _is_bearish(curr):
                results.append(CandlestickPattern(
                    pattern_name="bearish_marubozu",
                    display_name="大阴线",
                    direction="bearish",
                    strength=strength,
                    candle_index=idx,
                ))

        return results


# ===========================================================================
# ATR 计算辅助函数
# ===========================================================================


def _calculate_atr(klines: list[KlineData], period: int = 14) -> list[float]:
    """计算每根K线对应的 ATR 值。

    使用经典 ATR 算法：先用 SMA 初始化，后续用 EMA 平滑。
    返回列表长度与 klines 相同，前 period 个位置填充 0.0。

    Args:
        klines: K线数据列表，按时间升序排列。
        period: ATR 周期，默认 14。

    Returns:
        与 klines 等长的 ATR 值列表。K线不足 2 根时返回空列表。
    """
    if len(klines) < 2:
        return []

    true_ranges: list[float] = []
    for i in range(1, len(klines)):
        tr = max(
            klines[i].high - klines[i].low,
            abs(klines[i].high - klines[i - 1].close),
            abs(klines[i].low - klines[i - 1].close),
        )
        true_ranges.append(tr)

    if len(true_ranges) < period:
        return []

    # SMA 初始化第一个 ATR，后续 EMA 平滑
    atr_values: list[float] = []
    atr = sum(true_ranges[:period]) / period
    atr_values.extend([0.0] * period)  # 前 period 个位置（对应 klines[0..period-1]）
    atr_values.append(atr)             # 对应 klines[period]

    for i in range(period, len(true_ranges)):
        atr = (atr * (period - 1) + true_ranges[i]) / period
        atr_values.append(atr)

    return atr_values


# ===========================================================================
# FVG 检测器
# ===========================================================================


# ATR 过滤阈值：Mode → 最小 gap_size 占 ATR 的倍数
_FVG_ATR_THRESHOLDS: dict[int, float] = {
    0: 0.0,   # 无过滤
    1: 0.5,   # 标准过滤
    2: 1.0,   # 严格过滤
    3: 1.5,   # 超严格过滤
}


class FVGDetector:
    """公允价值缺口（FVG）检测器。

    支持看涨/看跌 FVG 检测、4 种 ATR 过滤模式、回补追踪。
    纯计算，无 IO 操作。
    """

    @staticmethod
    def detect(
        klines: list[KlineData],
        current_price: float,
        interval: str = "15m",
        filter_mode: int = 1,
        atr_values: list[float] | None = None,
    ) -> list[FVGResult]:
        """从K线数据中检测公允价值缺口。

        Args:
            klines: K线数据列表，按时间升序排列。至少需要 3 根。
            current_price: 当前价格，用于回补追踪和距离计算。
            interval: K线周期标识（如 "5m", "15m", "1h"）。
            filter_mode: ATR 过滤模式（0=无过滤, 1=标准, 2=严格, 3=超严格）。
            atr_values: 预计算的 ATR 值列表。为 None 时自动计算。

        Returns:
            检测到的 FVG 结果列表。少于 3 根K线返回空列表。
        """
        if len(klines) < 3:
            return []

        # --- ATR 准备 ---
        atr_fallback = False
        effective_mode = filter_mode

        if atr_values is None and filter_mode > 0:
            computed_atr = _calculate_atr(klines)
            if len(computed_atr) == 0:
                # K线不足以计算 ATR → 回退 Mode 0
                atr_fallback = True
                effective_mode = 0
                atr_values = None
            else:
                atr_values = computed_atr

        threshold_multiplier = _FVG_ATR_THRESHOLDS.get(effective_mode, 0.0)

        results: list[FVGResult] = []

        for i in range(2, len(klines)):
            first = klines[i - 2]
            # middle candle index = i - 1
            third = klines[i]

            # --- 看涨 FVG: first.high < third.low ---
            if first.high < third.low:
                gap_high = third.low
                gap_low = first.high
                gap_size = gap_high - gap_low

                fvg = FVGDetector._build_fvg(
                    direction="bullish",
                    gap_high=gap_high,
                    gap_low=gap_low,
                    gap_size=gap_size,
                    candle_index=i - 1,
                    interval=interval,
                    current_price=current_price,
                    filter_mode=effective_mode,
                    atr_fallback=atr_fallback,
                )
                if fvg is not None and FVGDetector._passes_atr_filter(
                    gap_size, threshold_multiplier, atr_values, i - 1, effective_mode,
                ):
                    results.append(fvg)

            # --- 看跌 FVG: first.low > third.high ---
            if first.low > third.high:
                gap_high = first.low
                gap_low = third.high
                gap_size = gap_high - gap_low

                fvg = FVGDetector._build_fvg(
                    direction="bearish",
                    gap_high=gap_high,
                    gap_low=gap_low,
                    gap_size=gap_size,
                    candle_index=i - 1,
                    interval=interval,
                    current_price=current_price,
                    filter_mode=effective_mode,
                    atr_fallback=atr_fallback,
                )
                if fvg is not None and FVGDetector._passes_atr_filter(
                    gap_size, threshold_multiplier, atr_values, i - 1, effective_mode,
                ):
                    results.append(fvg)

        return results

    # -------------------------------------------------------------------
    # 内部辅助方法
    # -------------------------------------------------------------------

    @staticmethod
    def _passes_atr_filter(
        gap_size: float,
        threshold_multiplier: float,
        atr_values: list[float] | None,
        candle_index: int,
        effective_mode: int,
    ) -> bool:
        """判断 FVG 是否通过 ATR 过滤。"""
        if effective_mode == 0:
            return True

        if atr_values is None:
            return True

        # 取对应索引的 ATR 值
        if candle_index < len(atr_values):
            atr_val = atr_values[candle_index]
        else:
            # 索引超出范围时使用最后一个有效 ATR
            atr_val = atr_values[-1] if atr_values else 0.0

        # ATR 为 0 时不过滤
        if atr_val <= 0:
            return True

        return gap_size >= threshold_multiplier * atr_val

    @staticmethod
    def _build_fvg(
        direction: str,
        gap_high: float,
        gap_low: float,
        gap_size: float,
        candle_index: int,
        interval: str,
        current_price: float,
        filter_mode: int,
        atr_fallback: bool,
    ) -> FVGResult:
        """构建 FVGResult 对象，包含回补追踪和距离计算。"""
        # --- 回补追踪 ---
        mitigated = False
        mitigation_type: str | None = None

        if direction == "bullish":
            if current_price >= gap_low and current_price <= gap_high:
                mitigated = True
                mitigation_type = "partial"
            if current_price >= gap_high:
                mitigated = True
                mitigation_type = "full"
        else:  # bearish
            if current_price >= gap_low and current_price <= gap_high:
                mitigated = True
                mitigation_type = "partial"
            if current_price <= gap_low:
                mitigated = True
                mitigation_type = "full"

        # --- 距离计算 ---
        gap_mid = (gap_high + gap_low) / 2.0
        distance_pct = abs(current_price - gap_mid) / current_price * 100 if current_price > 0 else 0.0

        return FVGResult(
            direction=direction,
            gap_high=gap_high,
            gap_low=gap_low,
            gap_size=gap_size,
            candle_index=candle_index,
            interval=interval,
            mitigated=mitigated,
            mitigation_type=mitigation_type,
            distance_pct=round(distance_pct, 4),
            filter_mode=filter_mode,
            atr_fallback=atr_fallback,
        )


# ===========================================================================
# 订单块检测器
# ===========================================================================


# 阶段感知置信度映射: (phase, ob_type) → confidence
_PHASE_CONFIDENCE: dict[tuple[str, str], float] = {
    ("accumulation", "demand"): 0.8,
    ("accumulation", "supply"): 0.3,
    ("distribution", "supply"): 0.8,
    ("distribution", "demand"): 0.3,
    ("markup", "demand"): 0.6,
    ("markup", "supply"): 0.5,
    ("testing", "demand"): 0.4,
    ("testing", "supply"): 0.4,
}


def _find_swing_points(
    klines: list[KlineData],
) -> list[tuple[int, str, float]]:
    """检测摆动高点和摆动低点。

    使用左右各 1-2 根K线比较（至少左右各 1 根）。
    需要至少 5 根K线才能在中间位置检测。

    Args:
        klines: K线数据列表，按时间升序排列。

    Returns:
        摆动点列表，每个元素为 (index, "high"|"low", price)。
    """
    if len(klines) < 5:
        return []

    swings: list[tuple[int, str, float]] = []

    for i in range(2, len(klines) - 2):
        # Swing High: 当前高点高于左右各 1 根
        if klines[i].high > klines[i - 1].high and klines[i].high > klines[i + 1].high:
            swings.append((i, "high", klines[i].high))

        # Swing Low: 当前低点低于左右各 1 根
        if klines[i].low < klines[i - 1].low and klines[i].low < klines[i + 1].low:
            swings.append((i, "low", klines[i].low))

    return swings


def _detect_structure_breaks(
    klines: list[KlineData],
    swing_points: list[tuple[int, str, float]],
) -> list[tuple[int, str, str, bool]]:
    """检测市场结构突破（ChoCh 和 BoS）。

    Args:
        klines: K线数据列表。
        swing_points: 摆动点列表。

    Returns:
        结构突破列表，每个元素为
        (break_candle_index, break_type="choch"|"bos", direction="bullish"|"bearish", is_main)。
    """
    if len(swing_points) < 2:
        return []

    breaks: list[tuple[int, str, str, bool]] = []

    # 追踪当前趋势方向: "up", "down", None（未确定）
    trend: str | None = None
    # 是否已经出现过 ChoCh（用于区分 main vs sub）
    had_choch = False

    # 追踪最近的 swing high 和 swing low
    last_swing_high: tuple[int, float] | None = None
    last_swing_low: tuple[int, float] | None = None
    # 追踪前一个 swing low/high 用于判断 higher-high / lower-low
    prev_swing_high: tuple[int, float] | None = None
    prev_swing_low: tuple[int, float] | None = None

    for idx, stype, price in swing_points:
        if stype == "high":
            prev_swing_high = last_swing_high
            last_swing_high = (idx, price)
        else:
            prev_swing_low = last_swing_low
            last_swing_low = (idx, price)

        # 需要至少一个 high 和一个 low 才能判断
        if last_swing_high is None or last_swing_low is None:
            continue

        # 检查后续K线是否突破了摆动点
        # 我们检查从当前摆动点之后的K线
        search_start = idx + 1
        search_end = min(idx + 10, len(klines))  # 向后看最多 10 根

        for ci in range(search_start, search_end):
            candle = klines[ci]

            # --- 向上突破 swing high ---
            if candle.close > last_swing_high[1]:
                # 判断是 ChoCh 还是 BoS
                if trend == "down" or trend is None:
                    # 趋势从下降转为上升 → ChoCh
                    is_main = not had_choch
                    breaks.append((ci, "choch", "bullish", is_main))
                    had_choch = True
                    trend = "up"
                elif trend == "up":
                    # 趋势延续 → BoS
                    breaks.append((ci, "bos", "bullish", False))
                break

            # --- 向下突破 swing low ---
            if candle.close < last_swing_low[1]:
                if trend == "up" or trend is None:
                    # 趋势从上升转为下降 → ChoCh
                    is_main = not had_choch
                    breaks.append((ci, "choch", "bearish", is_main))
                    had_choch = True
                    trend = "down"
                elif trend == "down":
                    # 趋势延续 → BoS
                    breaks.append((ci, "bos", "bearish", False))
                break

    return breaks


def _zones_overlap(a_low: float, a_high: float, b_low: float, b_high: float) -> bool:
    """判断两个价格区间是否重叠。"""
    return a_low <= b_high and b_low <= a_high


class OrderBlockDetector:
    """机构订单块（Order Block）检测器。

    基于 SMC 方法论，通过市场结构突破（ChoCh / BoS）识别机构资金
    进出的关键价格区域。支持 6 种 OB 类型、阶段感知置信度评分和
    巨鲸交叉验证。

    纯计算，无 IO 操作。
    """

    @staticmethod
    def detect(
        klines: list[KlineData],
        current_price: float,
        interval: str = "1h",
        phase: str | None = None,
        whale_data: dict | None = None,
    ) -> list[OrderBlockResult]:
        """从K线数据中检测机构订单块。

        Args:
            klines: K线数据列表，按时间升序排列。至少需要 5 根。
            current_price: 当前价格，用于距离计算。
            interval: K线周期标识（如 "1h", "4h", "1d"）。
            phase: 当前庄家操盘阶段（来自 PhaseTracker），
                   可选值: "accumulation", "distribution", "markup", "testing"。
            whale_data: 巨鲸活动数据，可选。格式:
                {"whale_buy_zones": [(low, high), ...],
                 "whale_sell_zones": [(low, high), ...]}

        Returns:
            检测到的订单块结果列表。数据不足时返回空列表。
        """
        if len(klines) < 5:
            return []

        # 1. 检测摆动点
        swing_points = _find_swing_points(klines)
        if len(swing_points) < 2:
            return []

        # 2. 检测结构突破
        structure_breaks = _detect_structure_breaks(klines, swing_points)
        if not structure_breaks:
            return []

        # 3. 为每个结构突破找到对应的 OB K线
        results: list[OrderBlockResult] = []

        for break_idx, break_type, direction, is_main in structure_breaks:
            ob_candle_idx = OrderBlockDetector._find_ob_candle(
                klines, break_idx, direction,
            )
            if ob_candle_idx is None:
                continue

            ob_candle = klines[ob_candle_idx]
            ob_high = ob_candle.high
            ob_low = ob_candle.low

            # OB 类型
            ob_type: str = "demand" if direction == "bullish" else "supply"

            # 触发类型
            if break_type == "choch":
                trigger = "main_choch" if is_main else "sub_choch"
            else:
                trigger = "bos"

            # 距离计算
            ob_mid = (ob_high + ob_low) / 2.0
            distance_pct = (
                abs(current_price - ob_mid) / current_price * 100
                if current_price > 0
                else 0.0
            )

            # 阶段感知置信度
            phase_confidence = 0.0
            if phase is not None:
                phase_confidence = _PHASE_CONFIDENCE.get(
                    (phase, ob_type), 0.0,
                )

            # 巨鲸交叉验证
            whale_confirmed = False
            if whale_data is not None:
                whale_confirmed = OrderBlockDetector._check_whale_overlap(
                    ob_type, ob_low, ob_high, whale_data,
                )

            results.append(OrderBlockResult(
                ob_type=ob_type,
                trigger=trigger,
                ob_high=ob_high,
                ob_low=ob_low,
                candle_index=ob_candle_idx,
                interval=interval,
                distance_pct=round(distance_pct, 4),
                phase_context=phase,
                phase_confidence=phase_confidence,
                whale_confirmed=whale_confirmed,
            ))

        return results

    # -------------------------------------------------------------------
    # 内部辅助方法
    # -------------------------------------------------------------------

    @staticmethod
    def _find_ob_candle(
        klines: list[KlineData],
        break_idx: int,
        direction: str,
    ) -> int | None:
        """找到结构突破前的 OB K线。

        - Demand OB（看涨突破）：突破前最后一根阴线。
        - Supply OB（看跌突破）：突破前最后一根阳线。

        Args:
            klines: K线数据列表。
            break_idx: 结构突破发生的K线索引。
            direction: 突破方向 "bullish" 或 "bearish"。

        Returns:
            OB K线索引，未找到时返回 None。
        """
        for i in range(break_idx - 1, -1, -1):
            if direction == "bullish" and _is_bearish(klines[i]):
                return i
            if direction == "bearish" and _is_bullish(klines[i]):
                return i
        return None

    @staticmethod
    def _check_whale_overlap(
        ob_type: str,
        ob_low: float,
        ob_high: float,
        whale_data: dict,
    ) -> bool:
        """检查 OB 是否与巨鲸活动区间重叠。

        Args:
            ob_type: "demand" 或 "supply"。
            ob_low: OB 区域下沿。
            ob_high: OB 区域上沿。
            whale_data: 巨鲸数据字典。

        Returns:
            是否经巨鲸确认。
        """
        if ob_type == "demand":
            zones = whale_data.get("whale_buy_zones", [])
        else:
            zones = whale_data.get("whale_sell_zones", [])

        for zone in zones:
            zone_low, zone_high = zone[0], zone[1]
            if _zones_overlap(ob_low, ob_high, zone_low, zone_high):
                return True

        return False
