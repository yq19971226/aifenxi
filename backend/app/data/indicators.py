"""技术指标计算器。

所有计算纯 Python + numpy，无外部 API 调用，无 IO。
"""

import logging
from datetime import datetime, timezone

import numpy as np

from app.models.market_data import IndicatorResult, KlineData

logger = logging.getLogger(__name__)


class IndicatorCalculator:
    # ── 基础指标 ──────────────────────────────────────────────

    @staticmethod
    def calculate_ema(prices: list[float], period: int) -> list[float]:
        """指数移动平均线（EMA）。

        Returns:
            与 prices 等长的 EMA 列表，前 period-1 个值为 NaN。
        """
        if len(prices) < period:
            return [float("nan")] * len(prices)

        arr = np.array(prices, dtype=float)
        k = 2.0 / (period + 1)
        ema = np.empty_like(arr)
        ema[:] = np.nan

        # 第一个有效值用 SMA 初始化
        ema[period - 1] = np.mean(arr[:period])
        for i in range(period, len(arr)):
            ema[i] = arr[i] * k + ema[i - 1] * (1 - k)

        return ema.tolist()

    @staticmethod
    def calculate_rsi(prices: list[float], period: int = 14) -> list[float]:
        """相对强弱指数（RSI）。

        Returns:
            与 prices 等长的 RSI 列表，前 period 个值为 NaN。
        """
        if len(prices) <= period:
            return [float("nan")] * len(prices)

        arr = np.array(prices, dtype=float)
        deltas = np.diff(arr)
        gains = np.where(deltas > 0, deltas, 0.0)
        losses = np.where(deltas < 0, -deltas, 0.0)

        rsi = np.full(len(arr), float("nan"))

        # 初始平均
        avg_gain = np.mean(gains[:period])
        avg_loss = np.mean(losses[:period])

        for i in range(period, len(deltas)):
            avg_gain = (avg_gain * (period - 1) + gains[i]) / period
            avg_loss = (avg_loss * (period - 1) + losses[i]) / period
            rs = avg_gain / avg_loss if avg_loss != 0 else float("inf")
            rsi[i + 1] = 100.0 - (100.0 / (1.0 + rs))

        return rsi.tolist()

    @staticmethod
    def calculate_macd(
        prices: list[float],
        fast: int = 12,
        slow: int = 26,
        signal: int = 9,
    ) -> tuple[list[float], list[float], list[float]]:
        """MACD 指标。

        Returns:
            (macd_line, signal_line, histogram) — 三个与 prices 等长的列表。
        """
        calc = IndicatorCalculator()
        ema_fast = np.array(calc.calculate_ema(prices, fast))
        ema_slow = np.array(calc.calculate_ema(prices, slow))
        macd_line = ema_fast - ema_slow

        # signal 线基于 macd_line 的有效部分
        valid_mask = ~np.isnan(macd_line)
        signal_line = np.full_like(macd_line, float("nan"))
        if valid_mask.sum() >= signal:
            valid_indices = np.where(valid_mask)[0]
            valid_macd = macd_line[valid_mask].tolist()
            sig_vals = calc.calculate_ema(valid_macd, signal)
            for idx, sig in zip(valid_indices, sig_vals):
                signal_line[idx] = sig

        histogram = macd_line - signal_line
        return macd_line.tolist(), signal_line.tolist(), histogram.tolist()

    @staticmethod
    def calculate_bollinger(
        prices: list[float],
        period: int = 20,
        std_dev: float = 2.0,
    ) -> tuple[list[float], list[float], list[float]]:
        """布林带（Bollinger Bands）。

        Returns:
            (upper, middle, lower) — 三个与 prices 等长的列表。
        """
        if len(prices) < period:
            nan_list = [float("nan")] * len(prices)
            return nan_list, nan_list, nan_list

        arr = np.array(prices, dtype=float)
        upper = np.full_like(arr, float("nan"))
        middle = np.full_like(arr, float("nan"))
        lower = np.full_like(arr, float("nan"))

        for i in range(period - 1, len(arr)):
            window = arr[i - period + 1 : i + 1]
            sma = np.mean(window)
            std = np.std(window, ddof=0)
            middle[i] = sma
            upper[i] = sma + std_dev * std
            lower[i] = sma - std_dev * std

        return upper.tolist(), middle.tolist(), lower.tolist()

    @staticmethod
    def calculate_atr(klines: list[KlineData], period: int = 14) -> list[float]:
        """Average True Range（ATR）— 衡量市场波动率。

        TR = max(high - low, |high - prev_close|, |low - prev_close|)
        ATR = TR 的 period 期 EMA 平滑。

        Returns:
            与 klines 等长的 ATR 列表，前 period 个值为 NaN。
        """
        n = len(klines)
        if n < 2:
            return [float("nan")] * n

        tr = np.empty(n, dtype=float)
        tr[0] = klines[0].high - klines[0].low  # 第一根无前收盘

        for i in range(1, n):
            high = klines[i].high
            low = klines[i].low
            prev_close = klines[i - 1].close
            tr[i] = max(high - low, abs(high - prev_close), abs(low - prev_close))

        # 用 EMA 平滑 TR 得到 ATR
        atr = np.full(n, float("nan"))
        if n <= period:
            return atr.tolist()

        atr[period] = np.mean(tr[1 : period + 1])  # 跳过 tr[0]（无前收盘）
        for i in range(period + 1, n):
            atr[i] = (atr[i - 1] * (period - 1) + tr[i]) / period

        return atr.tolist()

    @staticmethod
    def calculate_obv(closes: list[float], volumes: list[float]) -> list[float]:
        """On-Balance Volume（OBV）— 量价趋势确认指标。

        规则：
        - close[i] > close[i-1] → OBV 累加 volume[i]
        - close[i] < close[i-1] → OBV 累减 volume[i]
        - close[i] == close[i-1] → OBV 不变
        - 第一个值为 volume[0]

        Returns:
            与 closes 等长的 OBV 列表；空输入返回空列表。
        """
        if not closes or not volumes:
            return []

        n = min(len(closes), len(volumes))
        obv = [0.0] * n
        obv[0] = volumes[0]

        for i in range(1, n):
            if closes[i] > closes[i - 1]:
                obv[i] = obv[i - 1] + volumes[i]
            elif closes[i] < closes[i - 1]:
                obv[i] = obv[i - 1] - volumes[i]
            else:
                obv[i] = obv[i - 1]

        return obv

    @staticmethod
    def calculate_vwap(
        highs: list[float], lows: list[float], closes: list[float], volumes: list[float]
    ) -> list[float]:
        """成交量加权平均价（VWAP）。

        公式：累积(典型价格 × 成交量) / 累积(成交量)
        典型价格 = (high + low + close) / 3

        Returns:
            与输入等长的 VWAP 列表；累积成交量为零时对应值为 NaN；空输入返回空列表。
        """
        if not highs or not lows or not closes or not volumes:
            return []

        n = min(len(highs), len(lows), len(closes), len(volumes))
        vwap = [0.0] * n
        cum_tp_vol = 0.0
        cum_vol = 0.0

        for i in range(n):
            tp = (highs[i] + lows[i] + closes[i]) / 3.0
            cum_tp_vol += tp * volumes[i]
            cum_vol += volumes[i]
            vwap[i] = cum_tp_vol / cum_vol if cum_vol != 0 else float("nan")

        return vwap

    @staticmethod
    def calculate_volume_ratio(volumes: list[float], period: int = 20) -> list[float]:
        """量比 — 当前成交量与过去 N 根平均成交量的比值。

        公式：volume[i] / mean(volume[i-period:i])
        前 period 个值为 NaN（历史数据不足）。

        Returns:
            与 volumes 等长的量比列表；空输入返回空列表。
        """
        if not volumes:
            return []

        n = len(volumes)
        ratio = [float("nan")] * n

        for i in range(period, n):
            avg = sum(volumes[i - period : i]) / period
            ratio[i] = volumes[i] / avg if avg != 0 else float("nan")

        return ratio

    @staticmethod
    def detect_volume_price_divergence(
        closes: list[float], obv: list[float], window: int = 20
    ) -> str:
        """量价背离检测。

        - 顶背离：价格创窗口新高但 OBV 未创新高 → "bearish_divergence"
        - 底背离：价格创窗口新低但 OBV 未创新低 → "bullish_divergence"
        - 否则 → "none"

        Args:
            closes: 收盘价序列
            obv:    OBV 序列（与 closes 等长）
            window: 回看窗口大小

        Returns:
            "bullish_divergence" | "bearish_divergence" | "none"
        """
        if not closes or not obv or len(closes) < window or len(obv) < window:
            return "none"

        n = min(len(closes), len(obv))
        recent_closes = closes[n - window : n]
        recent_obv = obv[n - window : n]

        price_max = max(recent_closes)
        price_min = min(recent_closes)
        obv_max = max(recent_obv)
        obv_min = min(recent_obv)

        current_price = closes[n - 1]
        current_obv = obv[n - 1]

        # 顶背离：价格创新高但 OBV 未创新高
        if current_price >= price_max and current_obv < obv_max:
            return "bearish_divergence"

        # 底背离：价格创新低但 OBV 未创新低
        if current_price <= price_min and current_obv > obv_min:
            return "bullish_divergence"

        return "none"


    @staticmethod
    def calculate_support_resistance(
        klines: list[KlineData],
        lookback: int = 20,
        tolerance: float = 0.005,
    ) -> tuple[list[float], list[float]]:
        """基于局部极值识别支撑位和阻力位。

        Args:
            klines:    K 线列表（按时间升序）
            lookback:  局部极值窗口大小
            tolerance: 合并相近价位的容差比例（默认 0.5%）

        Returns:
            (support_levels, resistance_levels)
        """
        if len(klines) < lookback * 2 + 1:
            return [], []

        lows = np.array([k.low for k in klines])
        highs = np.array([k.high for k in klines])

        supports: list[float] = []
        resistances: list[float] = []

        for i in range(lookback, len(klines) - lookback):
            window_low = lows[i - lookback : i + lookback + 1]
            if lows[i] == np.min(window_low):
                supports.append(float(lows[i]))

            window_high = highs[i - lookback : i + lookback + 1]
            if highs[i] == np.max(window_high):
                resistances.append(float(highs[i]))

        def _merge_levels(levels: list[float]) -> list[float]:
            if not levels:
                return []
            levels_sorted = sorted(levels)
            merged: list[float] = [levels_sorted[0]]
            for lvl in levels_sorted[1:]:
                if abs(lvl - merged[-1]) / merged[-1] > tolerance:
                    merged.append(lvl)
                else:
                    merged[-1] = (merged[-1] + lvl) / 2  # 取中间值
            return merged

        return _merge_levels(supports), _merge_levels(resistances)

    # ── 综合计算 ──────────────────────────────────────────────

    def calculate_all(self, klines: list[KlineData]) -> IndicatorResult:
        """对一组 K 线计算全部指标，返回 IndicatorResult。"""
        if not klines:
            raise ValueError("klines list is empty")

        closes = [k.close for k in klines]
        volumes = [k.volume for k in klines]
        highs = [k.high for k in klines]
        lows = [k.low for k in klines]
        latest = klines[-1]

        ema7_series = self.calculate_ema(closes, 7)
        ema25_series = self.calculate_ema(closes, 25)
        ema99_series = self.calculate_ema(closes, 99)
        rsi_series = self.calculate_rsi(closes, 14)
        macd_line, signal_line, histogram = self.calculate_macd(closes)
        bb_upper, bb_middle, bb_lower = self.calculate_bollinger(closes)
        supports, resistances = self.calculate_support_resistance(klines)
        atr_series = self.calculate_atr(klines, 14)

        def _last(series: list[float]) -> float | None:
            val = series[-1] if series else float("nan")
            return None if (val != val) else val  # NaN check

        # ── 量价指标（每个独立 try/except，异常不影响其他）──
        obv_val: float | None = None
        vwap_val: float | None = None
        volume_ratio_val: float | None = None
        divergence_val: str | None = None

        try:
            obv_series = self.calculate_obv(closes, volumes)
            obv_val = _last(obv_series)
        except Exception:
            logger.warning("calculate_all: OBV calculation failed", exc_info=True)

        try:
            vwap_series = self.calculate_vwap(highs, lows, closes, volumes)
            vwap_val = _last(vwap_series)
        except Exception:
            logger.warning("calculate_all: VWAP calculation failed", exc_info=True)

        try:
            vr_series = self.calculate_volume_ratio(volumes)
            volume_ratio_val = _last(vr_series)
        except Exception:
            logger.warning("calculate_all: volume_ratio calculation failed", exc_info=True)

        try:
            obv_for_div = obv_series if obv_val is not None else self.calculate_obv(closes, volumes)
            divergence_val = self.detect_volume_price_divergence(closes, obv_for_div)
        except Exception:
            logger.warning("calculate_all: divergence detection failed", exc_info=True)

        return IndicatorResult(
            symbol=latest.symbol,
            interval=latest.interval,
            time=latest.close_time,
            ema7=_last(ema7_series),
            ema25=_last(ema25_series),
            ema99=_last(ema99_series),
            rsi=_last(rsi_series),
            macd=_last(macd_line),
            macd_signal=_last(signal_line),
            macd_histogram=_last(histogram),
            bb_upper=_last(bb_upper),
            bb_middle=_last(bb_middle),
            bb_lower=_last(bb_lower),
            support_levels=supports,
            resistance_levels=resistances,
            atr=_last(atr_series),
            obv=obv_val,
            vwap=vwap_val,
            volume_ratio=volume_ratio_val,
            volume_price_divergence=divergence_val,
        )

