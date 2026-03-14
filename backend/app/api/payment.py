"""支付 API 路由 — 创建支付、Webhook 回调、支付历史。

路由层只做参数校验和响应格式化，业务逻辑在 service 层。
"""

import logging

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import UserInfo, get_current_user
from app.services.payment import (
    CreatePaymentRequest,
    PaymentInfo,
    WebhookPayload,
    create_payment,
    get_payment_history,
    handle_webhook,
    reconcile_payment_status,
    verify_webhook_signature,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/payment", tags=["payment"])


@router.post("/create", response_model=PaymentInfo)
async def create_payment_order(
    request: CreatePaymentRequest,
    user: UserInfo = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> PaymentInfo:
    """创建 USDT 支付订单。

    返回支付地址和金额，前端展示二维码供用户转账。
    """
    try:
        return await create_payment(session, user.id, request)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc))
    except Exception as exc:
        logger.error("create_payment_order failed: %s", exc)
        raise HTTPException(status_code=500, detail="创建支付订单失败")


@router.post("/webhook")
async def payment_webhook(
    request: Request,
    session: AsyncSession = Depends(get_db),
    hmac_sig: str | None = Header(None, alias="HMAC"),
) -> str:
    """Oxapay Webhook 回调。

    公开端点，无需认证。通过 HMAC-SHA512 验签确保请求合法性。
    Oxapay 要求返回 HTTP 200 + body "ok"。
    """
    body = await request.body()

    if not hmac_sig:
        logger.warning("Webhook missing HMAC signature header")
        raise HTTPException(status_code=400, detail="缺少签名")

    from app.services.config_service import get_config_value

    merchant_key = await get_config_value("oxapay_merchant_key")
    if not verify_webhook_signature(body, hmac_sig, merchant_key=merchant_key):
        logger.warning("Webhook signature verification failed")
        raise HTTPException(status_code=403, detail="签名验证失败")

    try:
        payload = WebhookPayload.model_validate_json(body)
    except Exception as exc:
        logger.error("Webhook payload parse error: %s", exc)
        raise HTTPException(status_code=400, detail="请求体格式错误")

    try:
        await handle_webhook(session, payload)
    except Exception as exc:
        logger.error("Webhook processing error: %s", exc)
        raise HTTPException(status_code=500, detail="Webhook 处理失败")

    # Oxapay 要求返回 "ok" 字符串
    return "ok"


@router.post("/{payment_id}/sync", response_model=PaymentInfo)
async def sync_payment_status(
    payment_id: str,
    user: UserInfo = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> PaymentInfo:
    try:
        return await reconcile_payment_status(session, payment_id, user_id=user.id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc))
    except Exception as exc:
        logger.error("sync_payment_status failed: %s", exc)
        raise HTTPException(status_code=500, detail="同步支付状态失败")


@router.get("/history", response_model=list[PaymentInfo])
async def payment_history(
    user: UserInfo = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
    limit: int = Query(20, ge=1, le=100, description="返回记录数"),
) -> list[PaymentInfo]:
    """查询当前用户的支付历史记录。"""
    try:
        return await get_payment_history(session, user.id, limit)
    except Exception as exc:
        logger.error("payment_history failed: %s", exc)
        raise HTTPException(status_code=500, detail="查询支付历史失败")
