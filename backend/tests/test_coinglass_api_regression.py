from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi import HTTPException

from app.api import coinglass as coinglass_api
from app.core.deps import UserInfo


def _make_user() -> UserInfo:
    return UserInfo(
        id="u1",
        email="test@example.com",
        membership_level=1,
        is_active=True,
        is_admin=False,
        role="user",
    )


def _make_session_with_rows(rows: list[dict]):
    mappings = MagicMock()
    mappings.all.return_value = rows
    result = MagicMock()
    result.mappings.return_value = mappings
    session = AsyncMock()
    session.execute = AsyncMock(return_value=result)
    return session


@pytest.mark.asyncio
async def test_get_oi_snapshot_falls_back_to_db_when_cache_missing(monkeypatch):
    session = _make_session_with_rows(
        [
            {
                "ts": datetime(2026, 3, 8, 7, 0, tzinfo=timezone.utc),
                "symbol": "BTCUSDT",
                "exchange": "Binance",
                "open_interest": 123.45,
                "oi_change_1h": 1.1,
                "oi_change_4h": 2.2,
                "oi_change_24h": 3.3,
                "source": "coinglass",
            }
        ]
    )
    monkeypatch.setattr(coinglass_api, "get_json", AsyncMock(return_value=None))

    data = await coinglass_api.get_oi_snapshot("btcusdt", _make_user(), session)

    assert data == [
        {
            "ts": "2026-03-08T07:00:00Z",
            "symbol": "BTCUSDT",
            "exchange": "Binance",
            "open_interest": 123.45,
            "oi_change_1h": 1.1,
            "oi_change_4h": 2.2,
            "oi_change_24h": 3.3,
            "source": "coinglass",
        }
    ]
    session.execute.assert_awaited_once()


@pytest.mark.asyncio
async def test_get_oi_snapshot_prefers_cache_when_present(monkeypatch):
    cached = [{"ts": "2026-03-08T07:00:00Z", "symbol": "BTCUSDT"}]
    session = _make_session_with_rows([])
    monkeypatch.setattr(coinglass_api, "get_json", AsyncMock(return_value=cached))

    data = await coinglass_api.get_oi_snapshot("BTCUSDT", _make_user(), session)

    assert data == cached
    session.execute.assert_not_awaited()


@pytest.mark.asyncio
async def test_get_taker_volume_falls_back_to_db_when_cache_missing(monkeypatch):
    tier = MagicMock(value="standard")
    monkeypatch.setattr(coinglass_api, "get_json", AsyncMock(return_value=None))
    monkeypatch.setattr(coinglass_api._tier_manager, "get_current_tier", AsyncMock(return_value=tier))
    monkeypatch.setattr(coinglass_api._tier_manager, "is_feature_enabled", MagicMock(return_value=True))
    session = _make_session_with_rows(
        [
            {
                "ts": datetime(2026, 3, 8, 7, 0, tzinfo=timezone.utc),
                "symbol": "BTCUSDT",
                "buy_volume": 10.0,
                "sell_volume": 5.0,
                "buy_sell_ratio": 2.0,
                "source": "coinglass",
            }
        ]
    )

    data = await coinglass_api.get_taker_volume("btcusdt", _make_user(), session)

    assert data == [
        {
            "ts": "2026-03-08T07:00:00Z",
            "symbol": "BTCUSDT",
            "buy_volume": 10.0,
            "sell_volume": 5.0,
            "buy_sell_ratio": 2.0,
            "source": "coinglass",
        }
    ]
    session.execute.assert_awaited_once()


@pytest.mark.asyncio
async def test_get_taker_volume_raises_404_when_cache_and_db_missing(monkeypatch):
    tier = MagicMock(value="standard")
    monkeypatch.setattr(coinglass_api, "get_json", AsyncMock(return_value=None))
    monkeypatch.setattr(coinglass_api._tier_manager, "get_current_tier", AsyncMock(return_value=tier))
    monkeypatch.setattr(coinglass_api._tier_manager, "is_feature_enabled", MagicMock(return_value=True))
    session = _make_session_with_rows([])

    with pytest.raises(HTTPException) as exc_info:
        await coinglass_api.get_taker_volume("BTCUSDT", _make_user(), session)

    assert exc_info.value.status_code == 404
