from unittest.mock import AsyncMock

import pytest

from app.services import payment
from app.services import config_service


@pytest.mark.asyncio
async def test_reconcile_payment_status_updates_from_provider(monkeypatch):
    session = object()
    pending_row = {
        "id": "local-1",
        "payment_id": "np-123",
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
        assert payment_id == "np-123"
        assert user_id == "user-1"
        return rows.pop(0)

    handle_webhook = AsyncMock()

    monkeypatch.setattr(payment, "_get_payment_row", fake_get_payment_row)
    monkeypatch.setattr(
        payment,
        "_call_nowpayments_status",
        AsyncMock(
            return_value={
                "payment_id": "np-123",
                "payment_status": "confirmed",
                "price_amount": 99.0,
                "pay_currency": "usdttrc20",
            }
        ),
    )
    monkeypatch.setattr(payment, "handle_webhook", handle_webhook)
    monkeypatch.setattr(
        config_service,
        "get_config_value",
        AsyncMock(return_value="np-test-key"),
    )

    result = await payment.reconcile_payment_status(session, "np-123", user_id="user-1")

    assert result.payment_id == "np-123"
    assert result.status == "completed"
    handle_webhook.assert_awaited_once()


@pytest.mark.asyncio
async def test_reconcile_payment_status_raises_for_unknown_payment(monkeypatch):
    monkeypatch.setattr(payment, "_get_payment_row", AsyncMock(return_value=None))

    with pytest.raises(ValueError, match="支付订单不存在"):
        await payment.reconcile_payment_status(object(), "missing-payment", user_id="user-1")


def test_build_provider_audit_values_marks_partial_payment_reason():
    payload = payment.WebhookPayload(
        payment_id="np-456",
        payment_status="partially_paid",
        pay_currency="usdttrc20",
        pay_amount=12.5,
    )

    audit = payment._build_provider_audit_values(
        payload,
        expected_network="TRC-20",
        source="sync",
    )

    assert audit["provider_status"] == "partially_paid"
    assert audit["status_reason"] == "partial"
    assert payment._map_local_payment_status(audit["provider_status"]) == "pending"


def test_build_provider_audit_values_marks_wrong_asset_reason():
    payload = payment.WebhookPayload(
        payment_id="np-789",
        payment_status="confirming",
        pay_currency="usdterc20",
        pay_amount=99.0,
    )

    audit = payment._build_provider_audit_values(
        payload,
        expected_network="TRC-20",
        source="webhook",
    )

    assert audit["provider_status"] == "confirming"
    assert audit["status_reason"] == "wrong_asset"
