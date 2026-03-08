from datetime import datetime, timezone

from app.models.analysis import AnalysisMode
from app.models.market_data import KlineData
from app.services.fingerprint import compute_fingerprint


def _kline(close: float) -> KlineData:
    now = datetime.now(timezone.utc)
    return KlineData(
        symbol="ETHUSDT",
        interval="15m",
        open_time=now,
        open=close,
        high=close * 1.001,
        low=close * 0.999,
        close=close,
        volume=100.0,
        close_time=now,
        is_closed=True,
    )


def test_fingerprint_stable_within_intraday_price_bucket() -> None:
    klines = [_kline(2000.0) for _ in range(6)]

    f1 = compute_fingerprint(2000.0, klines, AnalysisMode.INTRADAY)
    f2 = compute_fingerprint(2002.0, klines, AnalysisMode.INTRADAY)

    # intraday precision = 0.5% => bucket step ~= 10 at 2000 price
    assert f1 == f2


def test_fingerprint_changes_when_price_crosses_bucket() -> None:
    klines = [_kline(2000.0) for _ in range(6)]

    f1 = compute_fingerprint(2000.0, klines, AnalysisMode.INTRADAY)
    f2 = compute_fingerprint(2011.0, klines, AnalysisMode.INTRADAY)

    assert f1 != f2


def test_fingerprint_changes_when_klines_change() -> None:
    base = [_kline(2000.0) for _ in range(6)]
    changed = base[:-1] + [_kline(2010.0)]

    f1 = compute_fingerprint(2000.0, base, AnalysisMode.SCALPING)
    f2 = compute_fingerprint(2000.0, changed, AnalysisMode.SCALPING)

    assert f1 != f2
