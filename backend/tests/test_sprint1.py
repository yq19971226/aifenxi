"""Sprint 1 回归测试 — 覆盖 S1-3/S1-4/S1-5/S1-6 核心逻辑。"""

import pytest
from datetime import datetime, timezone

# ── S1-5: ATR 自适应倍数 ─────────────────────────────────────

from app.services.strategy import _atr_multipliers


class TestATRMultipliers:
    def test_low_volatility(self):
        """vol_ratio < 1% → 低波动倍数。"""
        m = _atr_multipliers(atr=50, current_price=10000)  # 0.5%
        assert m["entry"] == 2.0
        assert m["stop"] == 2.5
        assert m["targets"] == [2.0, 4.0, 7.0]

    def test_normal_volatility(self):
        """1% <= vol_ratio <= 3% → 正常倍数。"""
        m = _atr_multipliers(atr=200, current_price=10000)  # 2%
        assert m["entry"] == 1.5
        assert m["stop"] == 2.0
        assert m["targets"] == [1.5, 3.0, 5.0]

    def test_high_volatility(self):
        """vol_ratio > 3% → 高波动倍数。"""
        m = _atr_multipliers(atr=500, current_price=10000)  # 5%
        assert m["entry"] == 1.0
        assert m["stop"] == 1.5
        assert m["targets"] == [1.0, 2.0, 3.5]

    def test_zero_price_fallback(self):
        """current_price <= 0 → 默认倍数。"""
        m = _atr_multipliers(atr=100, current_price=0)
        assert m["entry"] == 1.5
        assert m["stop"] == 2.0

    def test_boundary_1pct(self):
        """vol_ratio = 1% → 正常（不是低波动）。"""
        m = _atr_multipliers(atr=100, current_price=10000)  # exactly 1%
        assert m["entry"] == 1.5  # normal regime

    def test_boundary_3pct(self):
        """vol_ratio = 3% → 正常（不是高波动）。"""
        m = _atr_multipliers(atr=300, current_price=10000)  # exactly 3%
        assert m["entry"] == 1.5  # normal regime


# ── S1-3: R:R 计算 ──────────────────────────────────────────

from app.services.strategy import StrategyService


class TestCalcRiskReward:
    def test_long_basic(self):
        """做多: entry_mid=100, SL=95, TP1=110 → R:R=2.0。"""
        rr, worth = StrategyService._calc_risk_reward(
            "long", 98.0, 102.0, 95.0, [110.0, 120.0],
        )
        assert rr == 2.0
        assert worth is True

    def test_short_basic(self):
        """做空: entry_mid=100, SL=105, TP1=90 → R:R=2.0。"""
        rr, worth = StrategyService._calc_risk_reward(
            "short", 98.0, 102.0, 105.0, [90.0, 80.0],
        )
        assert rr == 2.0
        assert worth is True

    def test_neutral_returns_zero(self):
        rr, worth = StrategyService._calc_risk_reward(
            "neutral", 98.0, 102.0, 95.0, [110.0],
        )
        assert rr == 0.0
        assert worth is False

    def test_empty_targets_returns_zero(self):
        rr, worth = StrategyService._calc_risk_reward(
            "long", 98.0, 102.0, 95.0, [],
        )
        assert rr == 0.0
        assert worth is False

    def test_zero_risk_returns_zero(self):
        """SL == entry_mid → risk=0 → 返回 0。"""
        rr, worth = StrategyService._calc_risk_reward(
            "long", 100.0, 100.0, 100.0, [110.0],
        )
        assert rr == 0.0
        assert worth is False

    def test_low_rr_not_worth(self):
        """R:R < 1.5 → not worth。"""
        rr, worth = StrategyService._calc_risk_reward(
            "long", 98.0, 102.0, 95.0, [101.0],
        )
        assert rr < 1.5
        assert worth is False


# ── S1-4: 资金费率守卫 ──────────────────────────────────────

from app.services.funding_rate_guard import evaluate_funding_rate


class TestFundingRateGuard:
    def test_none_funding_rate(self):
        result = evaluate_funding_rate(None, "bullish")
        assert result.is_extreme is False
        assert result.confidence_modifier == 1.0

    def test_normal_funding_rate(self):
        result = evaluate_funding_rate(0.0001, "bullish")  # 0.01% < 0.05%
        assert result.is_extreme is False

    def test_warn_same_direction(self):
        """FR=0.0006 (>warn) + bullish → 同向降权。"""
        result = evaluate_funding_rate(0.0006, "bullish")
        assert result.is_extreme is True
        assert result.confidence_modifier == 0.85
        assert result.mean_reversion_direction == "bearish"

    def test_warn_opposite_direction(self):
        """FR=0.0006 (>warn) + bearish → 反向不降权。"""
        result = evaluate_funding_rate(0.0006, "bearish")
        assert result.is_extreme is True
        assert result.confidence_modifier == 1.0

    def test_danger_same_direction(self):
        """FR=0.0015 (>danger) + bullish → 极端降权。"""
        result = evaluate_funding_rate(0.0015, "bullish")
        assert result.is_extreme is True
        assert result.confidence_modifier == 0.75

    def test_negative_fr_bearish(self):
        """FR=-0.0008 + bearish → 空头付费+看空=同向降权。"""
        result = evaluate_funding_rate(-0.0008, "bearish")
        assert result.is_extreme is True
        assert result.confidence_modifier == 0.85
        assert result.mean_reversion_direction == "bullish"

    def test_negative_fr_bullish(self):
        """FR=-0.0008 + bullish → 反向不降权。"""
        result = evaluate_funding_rate(-0.0008, "bullish")
        assert result.is_extreme is True
        assert result.confidence_modifier == 1.0


# ── S1-6: 超短线规则引擎 ────────────────────────────────────

from app.services.scalping_engine import compute_scalping_signal, compute_scalping_levels
from app.models.market_data import IndicatorResult
from app.models.analysis import CandlestickPattern


class TestScalpingSignal:
    def _make_indicator(self, **kwargs):
        defaults = dict(
            symbol="BTCUSDT", interval="15m",
            time=datetime.now(timezone.utc),
        )
        defaults.update(kwargs)
        return IndicatorResult(**defaults)

    def test_bullish_signal(self):
        """RSI超卖 + EMA多头排列 + 看涨形态 → bullish。"""
        ind = self._make_indicator(
            rsi=25.0, ema7=100.5, ema25=100.0, ema99=99.0,
            macd_histogram=0.05,
            bb_upper=102.0, bb_middle=100.0, bb_lower=98.0,
        )
        patterns = [CandlestickPattern(
            pattern_name="bullish_engulfing", display_name="看涨吞没",
            direction="bullish", strength=0.8, candle_index=10,
        )]
        sig = compute_scalping_signal(
            price=100.0, indicators=ind,
            klines_5m=[], klines_15m=[], klines_1h=[],
            patterns=patterns,
        )
        assert sig.direction == "bullish"
        assert sig.confidence >= 0.35

    def test_bearish_signal(self):
        """RSI超买 + EMA空头排列 + 看跌形态 → bearish。"""
        ind = self._make_indicator(
            rsi=78.0, ema7=99.0, ema25=100.0, ema99=101.0,
            macd_histogram=-0.05,
            bb_upper=102.0, bb_middle=100.0, bb_lower=98.0,
        )
        patterns = [CandlestickPattern(
            pattern_name="bearish_engulfing", display_name="看跌吞没",
            direction="bearish", strength=0.8, candle_index=10,
        )]
        sig = compute_scalping_signal(
            price=100.0, indicators=ind,
            klines_5m=[], klines_15m=[], klines_1h=[],
            patterns=patterns,
        )
        assert sig.direction == "bearish"
        assert sig.confidence >= 0.35

    def test_neutral_on_conflict(self):
        """RSI超卖 + EMA空头 → 矛盾 → neutral 或低置信度。"""
        ind = self._make_indicator(
            rsi=28.0, ema7=99.0, ema25=100.0, ema99=101.0,
            macd_histogram=-0.1,
            bb_upper=102.0, bb_middle=100.0, bb_lower=98.0,
        )
        sig = compute_scalping_signal(
            price=100.0, indicators=ind,
            klines_5m=[], klines_15m=[], klines_1h=[],
            patterns=[],
        )
        # RSI看多(+1.0) vs EMA看空(-2.0) + MACD看空 → 偏空或中性
        assert sig.direction in ("neutral", "bearish")

    def test_no_indicators(self):
        """无指标 → neutral。"""
        sig = compute_scalping_signal(
            price=100.0, indicators=None,
            klines_5m=[], klines_15m=[], klines_1h=[],
            patterns=[],
        )
        assert sig.direction == "neutral"
        assert sig.confidence == 0.0


class TestScalpingLevels:
    def test_bullish_levels(self):
        levels = compute_scalping_levels(
            direction="bullish", price=100.0, atr=2.0,
            vp=None, fvg_list=[],
        )
        assert levels["entry_low"] < 100.0
        assert levels["entry_high"] == 100.0
        assert levels["stop_loss"] < levels["entry_low"]
        assert len(levels["targets"]) == 3
        assert all(t > 100.0 for t in levels["targets"])

    def test_bearish_levels(self):
        levels = compute_scalping_levels(
            direction="bearish", price=100.0, atr=2.0,
            vp=None, fvg_list=[],
        )
        assert levels["entry_low"] == 100.0
        assert levels["entry_high"] > 100.0
        assert levels["stop_loss"] > levels["entry_high"]
        assert len(levels["targets"]) == 3
        assert all(t < 100.0 for t in levels["targets"])

    def test_neutral_levels(self):
        levels = compute_scalping_levels(
            direction="neutral", price=100.0, atr=2.0,
            vp=None, fvg_list=[],
        )
        assert levels["targets"] == []
        assert levels["level_sources"] == {}
