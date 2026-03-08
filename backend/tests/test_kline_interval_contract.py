from app.core.mode_contract import ALL_MODE_KLINE_INTERVALS, MODE_CONTRACTS
from app.services.kline_scheduler import INTERVALS as SCHEDULER_INTERVALS
from workers.kline_backfill import DEFAULT_INTERVALS as BACKFILL_INTERVALS
from workers.kline_collector import DEFAULT_INTERVALS as COLLECTOR_INTERVALS


def test_all_mode_kline_intervals_derive_from_contracts_in_order():
    expected = []
    for contract in MODE_CONTRACTS.values():
        for interval in contract.kline_intervals:
            if interval not in expected:
                expected.append(interval)

    assert ALL_MODE_KLINE_INTERVALS == expected
    assert ALL_MODE_KLINE_INTERVALS == ["5m", "15m", "1h", "4h", "1d", "1w"]


def test_scheduler_and_collectors_share_mode_contract_interval_source():
    assert SCHEDULER_INTERVALS == ALL_MODE_KLINE_INTERVALS
    assert COLLECTOR_INTERVALS == ALL_MODE_KLINE_INTERVALS
    assert BACKFILL_INTERVALS == ALL_MODE_KLINE_INTERVALS
