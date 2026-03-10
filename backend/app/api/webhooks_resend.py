"""Resend Webhook 接收端点。

接收 Resend 邮件投递事件（delivered/bounced/opened/clicked/complained），
验签后记录日志，退信地址加入抑制列表。
"""

import json
import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Request, HTTPException, status
from sqlalchemy import text

from app.core.database import get_db_context

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/webhooks", tags=["webhooks"])


async def _get_webhook_secret() -> str | None:
    from app.services.config_service import get_config_value
    return await get_config_value("resend_webhook_secret")


async def _verify_signature(request: Request, secret: str) -> dict:
    """用 svix 验证 Resend webhook 签名，返回解析后的 payload。"""
    try:
        from svix.webhooks import Webhook
    except ImportError:
        logger.warning("svix not installed, skipping signature verification")
        body = await request.body()
        return json.loads(body)

    headers = {
        "svix-id": request.headers.get("svix-id", ""),
        "svix-timestamp": request.headers.get("svix-timestamp", ""),
        "svix-signature": request.headers.get("svix-signature", ""),
    }
    body = await request.body()

    wh = Webhook(secret)
    try:
        return wh.verify(body, headers)
    except Exception as exc:
        logger.warning("Resend webhook signature verification failed: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid webhook signature",
        )


@router.post("/resend")
async def resend_webhook(request: Request):
    """接收 Resend 邮件事件回调。"""
    secret = await _get_webhook_secret()

    if secret:
        payload = await _verify_signature(request, secret)
    else:
        body = await request.body()
        try:
            payload = json.loads(body)
        except json.JSONDecodeError:
            raise HTTPException(status_code=400, detail="Invalid JSON")

    event_type = payload.get("type", "")
    data = payload.get("data", {})
    email_id = data.get("email_id", "")
    to_list = data.get("to", [])
    to_email = to_list[0] if to_list else ""
    created_at = payload.get("created_at", "")

    logger.info(
        "Resend webhook: %s | to=%s | email_id=%s",
        event_type, to_email, email_id,
    )

    if event_type == "email.bounced":
        bounce_info = data.get("bounce", {})
        bounce_type = bounce_info.get("type", "unknown")
        logger.warning(
            "Email bounced: to=%s type=%s message=%s",
            to_email, bounce_type, bounce_info.get("message", ""),
        )
        if bounce_type == "Permanent" and to_email:
            await _add_to_suppression_list(to_email, "bounce", bounce_info.get("message", ""))

    elif event_type == "email.complained":
        logger.warning("Email complained: to=%s", to_email)
        if to_email:
            await _add_to_suppression_list(to_email, "complaint", "User marked as spam")

    return {"status": "ok"}


async def _add_to_suppression_list(email: str, reason: str, detail: str):
    """将退信/投诉地址加入抑制列表，后续发送时自动跳过。"""
    try:
        async with get_db_context() as session:
            await session.execute(
                text(
                    "INSERT INTO email_suppression (email, reason, detail, created_at) "
                    "VALUES (:email, :reason, :detail, :created_at) "
                    "ON CONFLICT (email) DO UPDATE SET reason = :reason, detail = :detail, created_at = :created_at"
                ),
                {
                    "email": email.lower().strip(),
                    "reason": reason,
                    "detail": detail[:500],
                    "created_at": datetime.now(timezone.utc),
                },
            )
    except Exception as exc:
        logger.error("Failed to add %s to suppression list: %s", email, exc)
