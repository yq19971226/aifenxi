from unittest.mock import AsyncMock, MagicMock

import pytest


def _invoke_task(task, *args, **kwargs):
    run = getattr(task, "run", None)
    if callable(run):
        return run(*args, **kwargs)
    return task(*args, **kwargs)


def test_calendar_collect_events_marks_unavailable_when_api_key_missing(monkeypatch):
    from app.core.config import settings
    from workers import calendar_worker

    monkeypatch.setattr(settings, "coinmarketcal_api_key", "")
    set_cap_mock = AsyncMock()
    monkeypatch.setattr(calendar_worker, "_set_calendar_cap", set_cap_mock)

    result = _invoke_task(calendar_worker.collect_calendar_events)

    assert result == {}
    set_cap_mock.assert_awaited_once_with(
        "UNAVAILABLE", "COINMARKETCAL_API_KEY not configured"
    )


def test_calendar_collect_events_marks_available_when_any_symbol_pipeline_ok(monkeypatch):
    from app.core.config import settings
    from workers import calendar_worker

    monkeypatch.setattr(settings, "coinmarketcal_api_key", "test-key")
    monkeypatch.setattr(calendar_worker, "_fetch_active_symbols_sync", lambda: ["BTC", "ETH"])
    monkeypatch.setattr(
        calendar_worker,
        "_fetch_and_store_events",
        AsyncMock(side_effect=[0, -1]),
    )
    set_cap_mock = AsyncMock()
    monkeypatch.setattr(calendar_worker, "_set_calendar_cap", set_cap_mock)

    result = _invoke_task(calendar_worker.collect_calendar_events)

    assert result == {"BTC": 0, "ETH": -1}
    set_cap_mock.assert_awaited_once_with("AVAILABLE")


def test_calendar_collect_events_marks_unavailable_when_all_symbols_fail(monkeypatch):
    from app.core.config import settings
    from workers import calendar_worker

    monkeypatch.setattr(settings, "coinmarketcal_api_key", "test-key")
    monkeypatch.setattr(calendar_worker, "_fetch_active_symbols_sync", lambda: ["BTC", "ETH"])
    monkeypatch.setattr(
        calendar_worker,
        "_fetch_and_store_events",
        AsyncMock(side_effect=[-1, -1]),
    )
    set_cap_mock = AsyncMock()
    monkeypatch.setattr(calendar_worker, "_set_calendar_cap", set_cap_mock)

    result = _invoke_task(calendar_worker.collect_calendar_events)

    assert result == {"BTC": -1, "ETH": -1}
    set_cap_mock.assert_awaited_once_with("UNAVAILABLE", "all symbols failed")


def test_calendar_collect_high_impact_marks_unavailable_when_api_key_missing(monkeypatch):
    from app.core.config import settings
    from workers import calendar_worker

    monkeypatch.setattr(settings, "coinmarketcal_api_key", "")
    set_cap_mock = AsyncMock()
    monkeypatch.setattr(calendar_worker, "_set_calendar_cap", set_cap_mock)

    result = _invoke_task(calendar_worker.collect_high_impact_events)

    assert result == {}
    set_cap_mock.assert_awaited_once_with(
        "UNAVAILABLE", "COINMARKETCAL_API_KEY not configured"
    )


def test_calendar_collect_high_impact_marks_available_when_fetch_succeeds(monkeypatch):
    from app.core.config import settings
    from app.data import calendar as calendar_data
    from workers import calendar_worker

    class FakeCollector:
        def __init__(self, api_key: str):
            self.api_key = api_key

        async def fetch_high_impact_events(self, symbol: str, days_ahead: int = 30, min_votes: int = 50):
            return []

    monkeypatch.setattr(settings, "coinmarketcal_api_key", "test-key")
    monkeypatch.setattr(calendar_worker, "_fetch_active_symbols_sync", lambda: ["BTC", "ETH"])
    monkeypatch.setattr(calendar_data, "CoinMarketCalCollector", FakeCollector)
    monkeypatch.setattr(calendar_worker, "_cache_high_impact_events", AsyncMock())
    set_cap_mock = AsyncMock()
    monkeypatch.setattr(calendar_worker, "_set_calendar_cap", set_cap_mock)

    result = _invoke_task(calendar_worker.collect_high_impact_events)

    assert result == {"BTC": 0, "ETH": 0}
    set_cap_mock.assert_awaited_once_with("AVAILABLE")


def test_calendar_collect_high_impact_marks_unavailable_when_all_symbols_fail(monkeypatch):
    from app.core.config import settings
    from app.data import calendar as calendar_data
    from workers import calendar_worker

    class FakeCollector:
        def __init__(self, api_key: str):
            self.api_key = api_key

        async def fetch_high_impact_events(self, symbol: str, days_ahead: int = 30, min_votes: int = 50):
            raise RuntimeError(f"boom-{symbol}")

    monkeypatch.setattr(settings, "coinmarketcal_api_key", "test-key")
    monkeypatch.setattr(calendar_worker, "_fetch_active_symbols_sync", lambda: ["BTC", "ETH"])
    monkeypatch.setattr(calendar_data, "CoinMarketCalCollector", FakeCollector)
    set_cap_mock = AsyncMock()
    monkeypatch.setattr(calendar_worker, "_set_calendar_cap", set_cap_mock)

    result = _invoke_task(calendar_worker.collect_high_impact_events)

    assert result == {"BTC": 0, "ETH": 0}
    set_cap_mock.assert_awaited_once_with("UNAVAILABLE", "all symbols failed")


def test_orderbook_collect_orderbook_task_marks_available_on_success(monkeypatch):
    from workers import orderbook_worker

    monkeypatch.setattr(
        orderbook_worker,
        "_collect_all",
        AsyncMock(return_value={"success": 1, "errors": 1, "total": 2}),
    )
    set_cap_mock = AsyncMock()
    monkeypatch.setattr(orderbook_worker, "_set_orderbook_cap", set_cap_mock)

    result = _invoke_task(orderbook_worker.collect_orderbook_task)

    assert result == {"success": 1, "errors": 1, "total": 2}
    set_cap_mock.assert_awaited_once_with("AVAILABLE")


def test_orderbook_collect_orderbook_task_marks_unavailable_when_all_symbols_fail(monkeypatch):
    from workers import orderbook_worker

    monkeypatch.setattr(
        orderbook_worker,
        "_collect_all",
        AsyncMock(return_value={"success": 0, "errors": 2, "total": 2}),
    )
    set_cap_mock = AsyncMock()
    monkeypatch.setattr(orderbook_worker, "_set_orderbook_cap", set_cap_mock)

    result = _invoke_task(orderbook_worker.collect_orderbook_task)

    assert result == {"success": 0, "errors": 2, "total": 2}
    set_cap_mock.assert_awaited_once_with("UNAVAILABLE", "all symbols failed")


def test_orderbook_collect_orderbook_task_marks_unavailable_and_retries_on_exception(monkeypatch):
    from workers import orderbook_worker

    retry_exc = RuntimeError("retry-called")
    retry_mock = MagicMock(side_effect=retry_exc)
    monkeypatch.setattr(
        orderbook_worker,
        "_collect_all",
        AsyncMock(side_effect=RuntimeError("boom")),
    )
    set_cap_mock = AsyncMock()
    monkeypatch.setattr(orderbook_worker, "_set_orderbook_cap", set_cap_mock)
    monkeypatch.setattr(orderbook_worker.collect_orderbook_task, "retry", retry_mock)

    with pytest.raises(RuntimeError, match="retry-called"):
        _invoke_task(orderbook_worker.collect_orderbook_task)

    set_cap_mock.assert_awaited_once_with("UNAVAILABLE", "task exception: boom")
    retry_mock.assert_called_once()
