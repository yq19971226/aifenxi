from contextlib import asynccontextmanager
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock

import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.data.coinglass_oi import OIMonitor
from app.models.coinglass import TopLongShortRatio


def _make_monitor(session=None):
    return OIMonitor(MagicMock(), MagicMock(), session or AsyncMock())


def _make_ratio(ts, *, exchange, ratio, data_type):
    if ratio <= 0:
        long_account = 50.0
        short_account = 50.0
    else:
        long_account = round(ratio / (1 + ratio) * 100, 6)
        short_account = round(100 - long_account, 6)
    return TopLongShortRatio(
        symbol="BTCUSDT",
        ts=ts,
        exchange=exchange,
        long_account=long_account,
        short_account=short_account,
        long_short_ratio=ratio,
        data_type=data_type,
    )


@pytest.mark.parametrize(
    ("payload", "data_type", "default_exchange", "expected_exchange", "expected_ratio"),
    [
        (
            {
                "time": "2026-03-08T07:00:00Z",
                "global_account_long_percent": 66.0,
                "global_account_short_percent": 34.0,
                "global_account_long_short_ratio": 1.94,
            },
            "account",
            "global",
            "global",
            1.94,
        ),
        (
            {
                "time": "2026-03-08T07:00:00Z",
                "top_account_long_percent": 67.32,
                "top_account_short_percent": 32.68,
                "top_account_long_short_ratio": 2.06,
            },
            "account",
            "Binance",
            "Binance",
            2.06,
        ),
        (
            {
                "time": "2026-03-08T07:00:00Z",
                "top_position_long_percent": 54.55,
                "top_position_short_percent": 45.45,
                "top_position_long_short_ratio": 1.2,
            },
            "position",
            "Binance",
            "Binance",
            1.2,
        ),
    ],
)
def test_parse_long_short_ratio_accepts_v4_field_families(
    payload,
    data_type,
    default_exchange,
    expected_exchange,
    expected_ratio,
):
    monitor = _make_monitor()

    rows = monitor._parse_long_short_ratio(
        {"data": [payload]},
        "BTCUSDT",
        data_type=data_type,
        default_exchange=default_exchange,
    )

    assert len(rows) == 1
    row = rows[0]
    assert row.symbol == "BTCUSDT"
    assert row.exchange == expected_exchange
    assert row.data_type == data_type
    assert row.long_short_ratio == pytest.approx(expected_ratio)
    assert row.ts == datetime(2026, 3, 8, 7, 0, tzinfo=timezone.utc)


def test_merge_derivatives_ratio_rows_merges_into_single_snapshot_row():
    monitor = _make_monitor()
    ts = datetime(2026, 3, 8, 7, 0, tzinfo=timezone.utc)

    rows = monitor._merge_derivatives_ratio_rows(
        "BTCUSDT",
        [
            _make_ratio(ts, exchange="global", ratio=1.94, data_type="account"),
            _make_ratio(ts, exchange="Binance", ratio=2.06, data_type="account"),
            _make_ratio(ts, exchange="Binance", ratio=1.2, data_type="position"),
        ],
    )

    assert len(rows) == 1
    row = rows[0]
    assert row["time"] == ts
    assert row["symbol"] == "BTCUSDT"
    assert row["ls_account"] == pytest.approx(1.94)
    assert row["top_account"] == pytest.approx(2.06)
    assert row["ls_position"] == pytest.approx(1.2)
    assert row["top_position"] == pytest.approx(1.2)


@pytest.mark.asyncio
async def test_write_derivatives_snapshots_rewrites_single_row_and_preserves_existing_values():
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as conn:
        await conn.execute(
            text(
                """
                CREATE TABLE derivatives_snapshots (
                    time TEXT NOT NULL,
                    symbol TEXT NOT NULL,
                    funding_rate REAL,
                    predicted_funding_rate REAL,
                    long_short_account_ratio REAL,
                    long_short_position_ratio REAL,
                    top_long_short_account_ratio REAL,
                    top_long_short_position_ratio REAL,
                    source TEXT DEFAULT 'binance'
                )
                """
            )
        )

    session_factory = async_sessionmaker(engine, expire_on_commit=False)
    ts = datetime(2026, 3, 8, 7, 0, tzinfo=timezone.utc)

    async with session_factory() as session:
        await session.execute(
            text(
                """
                INSERT INTO derivatives_snapshots (
                    time, symbol, funding_rate, predicted_funding_rate,
                    long_short_account_ratio, source
                ) VALUES (
                    :time, :symbol, :funding_rate, :predicted_funding_rate,
                    :ls_account, 'coinglass'
                )
                """
            ),
            {
                "time": ts,
                "symbol": "BTCUSDT",
                "funding_rate": 0.01,
                "predicted_funding_rate": 0.02,
                "ls_account": 1.94,
            },
        )
        await session.commit()

        monitor = _make_monitor(session)
        ratios = [
            _make_ratio(ts, exchange="Binance", ratio=2.06, data_type="account"),
            _make_ratio(ts, exchange="Binance", ratio=1.2, data_type="position"),
        ]

        await monitor.write_derivatives_snapshots("BTCUSDT", ratios)
        await monitor.write_derivatives_snapshots("BTCUSDT", ratios)

        result = await session.execute(
            text(
                """
                SELECT funding_rate, predicted_funding_rate,
                       long_short_account_ratio, long_short_position_ratio,
                       top_long_short_account_ratio, top_long_short_position_ratio,
                       source
                FROM derivatives_snapshots
                WHERE symbol = :symbol AND source = 'coinglass'
                """
            ),
            {"symbol": "BTCUSDT"},
        )
        rows = result.mappings().all()

    await engine.dispose()

    assert len(rows) == 1
    row = rows[0]
    assert row["funding_rate"] == pytest.approx(0.01)
    assert row["predicted_funding_rate"] == pytest.approx(0.02)
    assert row["long_short_account_ratio"] == pytest.approx(1.94)
    assert row["long_short_position_ratio"] == pytest.approx(1.2)
    assert row["top_long_short_account_ratio"] == pytest.approx(2.06)
    assert row["top_long_short_position_ratio"] == pytest.approx(1.2)
    assert row["source"] == "coinglass"


@pytest.mark.asyncio
async def test_collect_for_symbol_merges_long_short_batches_before_single_write(monkeypatch):
    from app.core import capability_state
    from workers import coinglass_worker

    ts = datetime(2026, 3, 8, 7, 0, tzinfo=timezone.utc)
    global_ratio = _make_ratio(ts, exchange="global", ratio=1.94, data_type="account")
    top_account_ratio = _make_ratio(ts, exchange="Binance", ratio=2.06, data_type="account")
    top_position_ratio = _make_ratio(ts, exchange="Binance", ratio=1.2, data_type="position")

    class FakeClient:
        async def close(self):
            return None

    tier = MagicMock(value="standard")
    tier_manager = MagicMock()
    tier_manager.get_current_tier = AsyncMock(return_value=tier)
    tier_manager.is_endpoint_available = MagicMock(return_value=True)

    oi_monitor = MagicMock()
    oi_monitor.collect_oi_ohlc = AsyncMock(return_value=None)
    oi_monitor.detect_oi_surge = AsyncMock()
    oi_monitor.collect_net_position = AsyncMock(return_value=None)
    oi_monitor.collect_global_long_short_ratio = AsyncMock(return_value=[global_ratio])
    oi_monitor.collect_top_long_short_account_ratio = AsyncMock(return_value=[top_account_ratio])
    oi_monitor.collect_top_long_short_position_ratio = AsyncMock(return_value=[top_position_ratio])
    oi_monitor.write_derivatives_snapshots = AsyncMock()
    oi_monitor.collect_oi_weighted_funding_rate = AsyncMock(return_value=None)
    oi_monitor.collect_vol_weighted_funding_rate = AsyncMock(return_value=None)
    oi_monitor.collect_funding_rate_arbitrage = AsyncMock(return_value=None)
    oi_monitor.collect_funding_rate_history = AsyncMock(return_value=None)

    taker_analyzer = MagicMock()
    taker_analyzer.collect_taker_volume = AsyncMock(return_value=None)
    taker_analyzer.detect_imbalance = AsyncMock()

    heatmap_collector = MagicMock()
    heatmap_collector.collect_heatmap_model1 = AsyncMock(return_value=None)
    heatmap_collector.collect_basic_liquidation = AsyncMock(return_value=None)

    flow_collector = MagicMock()
    flow_collector.collect_cvd_history = AsyncMock(return_value=None)
    flow_collector.collect_netflow = AsyncMock(return_value=None)

    orderbook_collector = MagicMock()
    orderbook_collector.collect_orderbook_history = AsyncMock(return_value=None)
    orderbook_collector.collect_large_orders = AsyncMock(return_value=None)

    options_collector = MagicMock()
    options_collector.collect_max_pain = AsyncMock(return_value=None)
    options_collector.collect_options_info = AsyncMock(return_value=None)

    @asynccontextmanager
    async def fake_session_ctx():
        yield object()

    @asynccontextmanager
    async def fake_worker_engine():
        yield (None, lambda: fake_session_ctx())

    monkeypatch.setattr(coinglass_worker, "init_redis", AsyncMock())
    monkeypatch.setattr(coinglass_worker, "set_with_ttl", AsyncMock())
    monkeypatch.setattr(coinglass_worker, "CoinGlassClient", lambda _: FakeClient())
    monkeypatch.setattr(coinglass_worker, "TierManager", lambda: tier_manager)
    monkeypatch.setattr(coinglass_worker, "OIMonitor", lambda client, tier_mgr, session: oi_monitor)
    monkeypatch.setattr(coinglass_worker, "TakerAnalyzer", lambda client, tier_mgr, session: taker_analyzer)
    monkeypatch.setattr(coinglass_worker, "HeatmapCollector", lambda client, tier_mgr, session: heatmap_collector)
    monkeypatch.setattr(coinglass_worker, "FlowCollector", lambda client, tier_mgr: flow_collector)
    monkeypatch.setattr(coinglass_worker, "OrderBookCollector", lambda client, tier_mgr: orderbook_collector)
    monkeypatch.setattr(coinglass_worker, "OptionsCollector", lambda client, tier_mgr: options_collector)
    monkeypatch.setattr(coinglass_worker, "worker_engine", fake_worker_engine)
    monkeypatch.setattr(capability_state, "set_capability_status", AsyncMock())

    result = await coinglass_worker._collect_for_symbol("BTCUSDT")

    assert result["errors"] == 0
    oi_monitor.write_derivatives_snapshots.assert_awaited_once()
    called_symbol, called_ratios = oi_monitor.write_derivatives_snapshots.await_args.args
    assert called_symbol == "BTCUSDT"
    assert called_ratios == [global_ratio, top_account_ratio, top_position_ratio]
