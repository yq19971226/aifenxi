from unittest.mock import AsyncMock

import pytest

from app.services import payment
from app.services import config_service


@pytest.mark.asyncio
async def test_reconcile_payment_status_updates_from_provider(monkeypatch):
    session = object()
    pending_row = {
        "id": "local-1",
        "payment_id": "151811887",
        "user_id": "user-1",
        "plan": 1,
        "amount_usd": 99.0,
        "network": "TRC-20",
        "status": "pending",
        "created_at": "2026-03-09T00:00:00",
    }
    completed_row = {**pending_row, "status": "completed"}
    rows = [pending_row, completed_row]

    async def fake_get_payment_row(session_arg, payment_id, user_id=None):
        assert payment_id == "151811887"
        assert user_id == "user-1"
        return rows.pop(0)

    handle_webhook = AsyncMock()

    monkeypatch.setattr(payment, "_get_payment_row", fake_get_payment_row)
    monkeypatch.setattr(
        payment,
        "_call_oxapay_inquiry",
        AsyncMock(
            return_value={
                "track_id": "151811887",
                "status": "Paid",
                "type": "invoice",
                "amount": 99.0,
                "currency": "USD",
                "order_id": "ORD-12345",
                "txs": [
                    {
                        "address": "TXyz123abc",
                        "currency": "USDT",
                        "network": "Tron Network",
                        "status": "confirmed",
                    }
                ],
            }
        ),
    )
    monkeypatch.setattr(payment, "handle_webhook", handle_webhook)
    monkeypatch.setattr(
        config_service,
        "get_config_value",
        AsyncMock(return_value="ox-test-key"),
    )

    result = await payment.reconcile_payment_status(session, "151811887", user_id="user-1")

    assert result.payment_id == "151811887"
    assert result.status == "completed"
    handle_webhook.assert_awaited_once()


@pytest.mark.asyncio
async def test_reconcile_payment_status_raises_for_unknown_payment(monkeypatch):
    monkeypatch.setattr(payment, "_get_payment_row", AsyncMock(return_value=None))

    with pytest.raises(ValueError, match="支付订单不存在"):
        await payment.reconcile_payment_status(object(), "missing-payment", user_id="user-1")


def test_build_provider_audit_values_marks_partial_payment_reason():
    """Oxapay status 'Paying' = 部分支付 → status_reason='partial'"""
    payload = payment.WebhookPayload(
        track_id="151811887",
        status="Paying",
        currency="POL",
        amount=10,
        txs=[{
            "address": "0xabc",
            "currency": "POL",
            "network": "Polygon Network",
            "status": "confirming",
        }],
    )

    audit = payment._build_provider_audit_values(
        payload,
        expected_network="TRC-20",
        source="sync",
    )

    assert audit["provider_status"] == "paying"
    assert audit["status_reason"] == "partial"
    assert payment._map_local_payment_status(audit["provider_status"]) == "pending"


def test_build_provider_audit_values_marks_confirming_reason():
    """Status that is in pending but not 'paying' → status_reason = status itself"""
    payload = payment.WebhookPayload(
        track_id="151811887",
        status="Confirming",
        currency="USDT",
        amount=99.0,
    )

    audit = payment._build_provider_audit_values(
        payload,
        expected_network="TRC-20",
        source="webhook",
    )

    assert audit["provider_status"] == "confirming"
    assert audit["status_reason"] == "confirming"


def test_webhook_payload_extracts_address_from_txs():
    """Address should be extracted from the txs array, not a top-level field."""
    payload = payment.WebhookPayload(
        track_id="151811887",
        status="Paid",
        type="invoice",
        amount=10,
        currency="POL",
        txs=[{
            "address": "TXyz123abc",
            "currency": "POL",
            "network": "Polygon Network",
            "status": "confirmed",
        }],
    )

    assert payload.get_payment_id() == "151811887"
    assert payload.get_status() == "Paid"
    assert payload.get_address() == "TXyz123abc"
    assert payload.get_network() == "Polygon Network"
    assert payload.get_amount() == 10.0
    assert payload.get_currency() == "POL"


def test_normalize_provider_status_lowercases():
    """Oxapay returns statuses like 'Paying', 'Paid' — normalization lowercases them."""
    assert payment._normalize_provider_status("Paying") == "paying"
    assert payment._normalize_provider_status("Paid") == "paid"
    assert payment._normalize_provider_status("Failed") == "failed"
    assert payment._normalize_provider_status(None) == "waiting"
