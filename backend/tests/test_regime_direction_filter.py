"""单元测试 — 市场方向一致性过滤器（regime_direction_filter.py）"""

from datetime import datetime, timezone
from types import SimpleNamespace

import pytest

from app.models.analysis import AnalysisMode, AnalysisReport
from app.services.regime_direction_filter import (
    COUNTER_TREND_PENALTY,
    EMA_PERIOD,
    MIN_KLINES,
    _infer_trend_direction,
    apply_regime_direction_filter,
)


# ── 辅助工厂 ──────────────────────────────────────────────────


def _make_kline(close: float):
    """伪造一根 K 线对象（只需要 .close 属性）。"""
    return SimpleNamespace(close=close)


def _make_uptrend_klines(n: int = MIN_KLINES + 5) -> list:
    """生成明显上升趋势的 K 线列表。"""
    base = 100.0
    return [_make_kline(base + i * 0.5) for i in range(n)]


def _make_downtrend_klines(n: int = MIN_KLINES + 5) -> list:
    """生成明显下降趋势的 K 线列表。"""
    base = 200.0
    return [_make_kline(base - i * 0.5) for i in range(n)]


def _make_flat_klines(n: int = MIN_KLINES + 5) -> list:
    """生成横盘 K 线列表。"""
    return [_make_kline(100.0 + (i % 3) * 0.01) for i in range(n)]


def _make_report(
    signal: str = "bullish",
    confidence: float = 0.75,
    market_regime: str | None = "trending",
) -> AnalysisReport:
    return AnalysisReport(
        symbol="BTCUSDT",
        mode=AnalysisMode.INTRADAY,
        timestamp=datetime.now(timezone.utc),
        signal=signal,
        confidence=confidence,
        sections=[],
        market_regime=market_regime,
    )


def _make_market_data(klines_1h=None, klines_15m=None):
    return SimpleNamespace(
        klines_1h=klines_1h or [],
        klines_15m=klines_15m or [],
    )


# ── _infer_trend_direction 单元测试 ──────────────────────────


def test_infer_uptrend():
    klines = _make_uptrend_klines()
    assert _infer_trend_direction(klines) == "bullish"


def test_infer_downtrend():
    klines = _make_downtrend_klines()
    assert _infer_trend_direction(klines) == "bearish"


def test_infer_flat_returns_neutral():
    klines = _make_flat_klines()
    assert _infer_trend_direction(klines) == "neutral"


def test_infer_insufficient_data_returns_neutral():
    klines = [_make_kline(100.0)] * (MIN_KLINES - 1)
    assert _infer_trend_direction(klines) == "neutral"


# ── apply_regime_direction_filter 场景测试 ───────────────────


def test_counter_trend_bearish_signal_in_uptrend_penalized():
    """bearish 信号 + uptrend + trending → 置信度被打折。"""
    report = _make_report(signal="bearish", confidence=0.70, market_regime="trending")
    md = _make_market_data(klines_1h=_make_uptrend_klines())

    result = apply_regime_direction_filter(report, md)

    expected = round(0.70 * COUNTER_TREND_PENALTY, 4)
    assert result.confidence == expected
    assert result.regime_direction_penalized is True


def test_counter_trend_bullish_signal_in_downtrend_penalized():
    """bullish 信号 + downtrend + trending → 置信度被打折。"""
    report = _make_report(signal="bullish", confidence=0.80, market_regime="trending")
    md = _make_market_data(klines_1h=_make_downtrend_klines())

    result = apply_regime_direction_filter(report, md)

    expected = round(0.80 * COUNTER_TREND_PENALTY, 4)
    assert result.confidence == expected
    assert result.regime_direction_penalized is True


def test_aligned_signal_not_penalized():
    """bullish 信号 + uptrend + trending → 不惩罚。"""
    report = _make_report(signal="bullish", confidence=0.70, market_regime="trending")
    md = _make_market_data(klines_1h=_make_uptrend_klines())

    result = apply_regime_direction_filter(report, md)

    assert result.confidence == 0.70
    assert result.regime_direction_penalized is False


def test_ranging_market_not_penalized():
    """ranging 市场下逆势信号不惩罚（允许双向操作）。"""
    report = _make_report(signal="bearish", confidence=0.70, market_regime="ranging")
    md = _make_market_data(klines_1h=_make_uptrend_klines())

    result = apply_regime_direction_filter(report, md)

    assert result.confidence == 0.70
    assert result.regime_direction_penalized is False


def test_volatile_market_not_penalized():
    """volatile 市场下不惩罚。"""
    report = _make_report(signal="bearish", confidence=0.70, market_regime="volatile")
    md = _make_market_data(klines_1h=_make_uptrend_klines())

    result = apply_regime_direction_filter(report, md)

    assert result.confidence == 0.70
    assert result.regime_direction_penalized is False


def test_neutral_signal_not_penalized():
    """neutral 信号无方向，不做处理。"""
    report = _make_report(signal="neutral", confidence=0.30, market_regime="trending")
    md = _make_market_data(klines_1h=_make_uptrend_klines())

    result = apply_regime_direction_filter(report, md)

    assert result.confidence == 0.30
    assert result.regime_direction_penalized is False


def test_insufficient_klines_not_penalized():
    """K 线数量不足时失败安全，不施加惩罚。"""
    report = _make_report(signal="bearish", confidence=0.70, market_regime="trending")
    too_few = [_make_kline(100.0 + i * 0.5) for i in range(MIN_KLINES - 1)]
    md = _make_market_data(klines_1h=too_few)

    result = apply_regime_direction_filter(report, md)

    assert result.confidence == 0.70
    assert result.regime_direction_penalized is False


def test_flat_trend_in_trending_market_not_penalized():
    """趋势市场但均线斜率不显著 → neutral 方向 → 不惩罚。"""
    report = _make_report(signal="bearish", confidence=0.70, market_regime="trending")
    md = _make_market_data(klines_1h=_make_flat_klines())

    result = apply_regime_direction_filter(report, md)

    assert result.confidence == 0.70
    assert result.regime_direction_penalized is False


def test_no_market_regime_not_penalized():
    """market_regime 为 None 时不惩罚。"""
    report = _make_report(signal="bearish", confidence=0.70, market_regime=None)
    md = _make_market_data(klines_1h=_make_uptrend_klines())

    result = apply_regime_direction_filter(report, md)

    assert result.confidence == 0.70
    assert result.regime_direction_penalized is False


def test_fallback_to_15m_when_1h_empty():
    """1h K 线为空时，回退到 15m K 线。"""
    report = _make_report(signal="bearish", confidence=0.70, market_regime="trending")
    md = _make_market_data(klines_1h=[], klines_15m=_make_uptrend_klines())

    result = apply_regime_direction_filter(report, md)

    expected = round(0.70 * COUNTER_TREND_PENALTY, 4)
    assert result.confidence == expected
    assert result.regime_direction_penalized is True
