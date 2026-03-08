"""NowPayments 支付服务 — 创建支付、Webhook 验签、幂等处理。

所有外部 API 调用使用 httpx.AsyncClient + asyncio.wait_for 超时控制。
数据库操作使用 sqlalchemy text()，多表更新在事务内完成。
"""

import asyncio
import hashlib
import hmac
import json
import logging
from datetime import datetime
from typing import Literal

import httpx
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.sql_compat import insert_returning
from app.services.subscription import upgrade_membership
from app.services.partner_service import grant_commission

logger = logging.getLogger(__name__)

# ── 常量 ──────────────────────────────────────────────────────

NOWPAYMENTS_API_BASE = "https://api.nowpayments.io/v1"
API_TIMEOUT_SECONDS = 30

NETWORK_CURRENCY: dict[str, str] = {
    "TRC-20": "usdttrc20",
    "ERC-20": "usdterc20",
    "BEP-20": "usdtbep20",
}

PLAN_PRICES: dict[int, float] = {1: 99.00, 2: 299.00}

_PLAN_PRICE_CONFIG_KEYS: dict[int, str] = {
    1: "plan_price_pro",
    2: "plan_price_flagship",
}

DURATION_DISCOUNTS: dict[int, float] = {1: 1.0, 3: 0.9, 12: 0.7}

_DURATION_DISCOUNT_CONFIG_KEYS: dict[int, str] = {
    3: "plan_discount_quarterly",
    12: "plan_discount_yearly",
}

DURATION_DAYS: dict[int, int] = {1: 30, 3: 90, 12: 365}


async def _get_plan_price(plan: int) -> float | None:
    """从动态配置读取套餐月价，失败时回退到硬编码默认值。"""
    fallback = PLAN_PRICES.get(plan)
    config_key = _PLAN_PRICE_CONFIG_KEYS.get(plan)
    if config_key is None:
        return fallback
    try:
        from app.services.config_service import get_config_value

        raw = await get_config_value(config_key, str(fallback) if fallback else "")
        return float(raw) if raw else fallback
    except Exception:
        logger.warning("读取动态定价失败，使用默认值: plan=%d", plan)
        return fallback


async def _get_duration_discount(months: int) -> float:
    """从动态配置读取时长折扣，失败时回退到硬编码默认值。"""
    fallback = DURATION_DISCOUNTS.get(months, 1.0)
    config_key = _DURATION_DISCOUNT_CONFIG_KEYS.get(months)
    if config_key is None:
        return fallback
    try:
        from app.services.config_service import get_config_value

        raw = await get_config_value(config_key, str(fallback))
        return float(raw) if raw else fallback
    except Exception:
        logger.warning("读取时长折扣失败，使用默认值: months=%d", months)
        return fallback


# ── Pydantic 模型 ─────────────────────────────────────────────

class CreatePaymentRequest(BaseModel):
    """创建支付请求。"""

    plan: int = Field(..., ge=1, le=2, description="套餐: 1=专业, 2=旗舰")
    network: Literal["TRC-20", "ERC-20", "BEP-20"] = Field(
        ..., description="支付网络"
    )
    duration_months: Literal[1, 3, 12] = Field(
        default=1, description="订阅时长: 1=月付, 3=季付, 12=年付"
    )


class PaymentInfo(BaseModel):
    """支付信息响应模型。"""

    id: str
    payment_id: str
    user_id: str
    plan: int
    amount_usd: float
    network: str | None = None
    status: str = "pending"
    created_at: datetime | None = None
    pay_address: str | None = None
    pay_amount: float | None = None
    pay_currency: str | None = None


class WebhookPayload(BaseModel):
    """NowPayments IPN Webhook 载荷。"""

    payment_id: int | str
    payment_status: str
    pay_address: str | None = None
    price_amount: float | None = None
    price_currency: str | None = None
    pay_amount: float | None = None
    pay_currency: str | None = None
    order_id: str | None = None
    order_description: str | None = None


# ── 服务函数 ──────────────────────────────────────────────────

async def create_payment(
    session: AsyncSession,
    user_id: str,
    request: CreatePaymentRequest,
) -> PaymentInfo:
    """创建 NowPayments 支付订单并写入数据库。

    1. 调用 NowPayments API 创建支付
    2. 将支付记录插入 payments 表
    3. 返回包含支付地址的 PaymentInfo
    """
    monthly_price = await _get_plan_price(request.plan)
    if monthly_price is None:
        raise ValueError(f"无效的套餐: {request.plan}")

    discount = await _get_duration_discount(request.duration_months)
    amount = round(monthly_price * request.duration_months * discount, 2)
    duration_days = DURATION_DAYS.get(request.duration_months, 30)

    pay_currency = NETWORK_CURRENCY.get(request.network)
    if pay_currency is None:
        raise ValueError(f"不支持的网络: {request.network}")

    # 调用 NowPayments API
    try:
        from app.services.config_service import get_config_value

        np_api_key = await get_config_value("nowpayments_api_key")
        np_response = await asyncio.wait_for(
            _call_nowpayments_create(amount, pay_currency, user_id, api_key=np_api_key),
            timeout=API_TIMEOUT_SECONDS,
        )
    except asyncio.TimeoutError:
        logger.error("NowPayments API timeout: user_id=%s", user_id)
        raise RuntimeError("支付服务超时，请稍后重试")
    except Exception as exc:
        logger.error("NowPayments API error: %s", exc)
        raise RuntimeError("支付服务异常，请稍后重试")

    payment_id = str(np_response["payment_id"])
    pay_address = np_response.get("pay_address", "")
    pay_amount = np_response.get("pay_amount", 0)

    # 写入数据库
    try:
        result = await insert_returning(
            session,
            """
            INSERT INTO payments (payment_id, user_id, plan, amount_usd, network, status, duration_months)
            VALUES (:payment_id, :user_id, :plan, :amount_usd, :network, 'pending', :duration_months)
            RETURNING id, created_at
            """,
            {
                "payment_id": payment_id,
                "user_id": user_id,
                "plan": request.plan,
                "amount_usd": amount,
                "network": request.network,
                "duration_months": request.duration_months,
            },
            table="payments",
        )
        row = result.mappings().first()
        await session.flush()
    except Exception as exc:
        logger.error("create_payment DB error: %s", exc)
        raise

    return PaymentInfo(
        id=str(row["id"]),
        payment_id=payment_id,
        user_id=user_id,
        plan=request.plan,
        amount_usd=amount,
        network=request.network,
        status="pending",
        created_at=row["created_at"],
        pay_address=pay_address,
        pay_amount=float(pay_amount),
        pay_currency=pay_currency,
    )


def verify_webhook_signature(body: bytes, signature: str, ipn_secret: str = "") -> bool:
    """验证 NowPayments IPN Webhook 签名（HMAC-SHA512）。

    NowPayments 使用 IPN Secret 对请求体进行 HMAC-SHA512 签名，
    签名值通过 x-nowpayments-sig 请求头传递。

    Args:
        body: 原始请求体
        signature: x-nowpayments-sig 请求头值
        ipn_secret: NowPayments IPN Secret（由调用方从 ConfigService 获取）
    """
    if not ipn_secret:
        logger.warning("NowPayments IPN secret not configured")
        return False

    # NowPayments 要求对 JSON body 按 key 排序后计算签名
    try:
        payload_dict = json.loads(body)
        sorted_payload = json.dumps(payload_dict, sort_keys=True, separators=(",", ":"))
    except (json.JSONDecodeError, TypeError):
        logger.error("Webhook body is not valid JSON")
        return False

    expected = hmac.new(
        ipn_secret.encode("utf-8"),
        sorted_payload.encode("utf-8"),
        hashlib.sha512,
    ).hexdigest()

    return hmac.compare_digest(expected, signature)


async def handle_webhook(
    session: AsyncSession,
    payload: WebhookPayload,
) -> None:
    """处理 NowPayments IPN Webhook 回调。

    幂等性：已完成的支付不会重复处理。
    支付成功时在事务内完成：更新状态 → 升级会员 → 记录日志。
    """
    payment_id = str(payload.payment_id)
    status = payload.payment_status

    # 查询现有支付记录
    try:
        result = await session.execute(
            text(
                """
                SELECT id, user_id, plan, status
                FROM payments
                WHERE payment_id = :payment_id
                """
            ),
            {"payment_id": payment_id},
        )
        existing = result.mappings().first()
    except Exception as exc:
        logger.error("handle_webhook DB query error: %s", exc)
        raise

    if existing is None:
        logger.warning("Webhook for unknown payment_id=%s", payment_id)
        return

    # 幂等性：已完成的支付跳过
    if existing["status"] == "completed":
        logger.info("Payment already completed, skipping: payment_id=%s", payment_id)
        return

    if status in ("finished", "confirmed"):
        # 支付成功 → 更新状态 + 升级会员（事务内）
        try:
            await session.execute(
                text(
                    """
                    UPDATE payments
                    SET status = 'completed', updated_at = NOW()
                    WHERE payment_id = :payment_id
                    """
                ),
                {"payment_id": payment_id},
            )

            user_id = str(existing["user_id"])
            plan = existing["plan"]
            duration = DURATION_DAYS.get(plan, 30)
            # 从支付记录还原 duration — 用金额反推
            try:
                result_dur = await session.execute(
                    text("SELECT duration_months FROM payments WHERE payment_id = :pid"),
                    {"pid": payment_id},
                )
                dur_row = result_dur.mappings().first()
                if dur_row and dur_row["duration_months"]:
                    duration = DURATION_DAYS.get(int(dur_row["duration_months"]), 30)
            except Exception:
                pass
            await upgrade_membership(session, user_id, plan, duration_days=duration)

            # 合伙人佣金发放（检查邀请关系，有则发放）
            try:
                amount_usd = float(payload.price_amount) if payload.price_amount else 0
                if amount_usd > 0:
                    await grant_commission(
                        session, user_id, str(existing["id"]), amount_usd
                    )
            except Exception as comm_exc:
                logger.warning(
                    "Commission grant failed (non-fatal): payment_id=%s, error=%s",
                    payment_id, comm_exc,
                )

            await session.flush()
            logger.info(
                "Payment completed: payment_id=%s, user_id=%s, plan=%d",
                payment_id,
                user_id,
                plan,
            )
        except Exception as exc:
            logger.error("handle_webhook update error: %s", exc)
            raise

    elif status in ("failed", "expired"):
        try:
            await session.execute(
                text(
                    """
                    UPDATE payments
                    SET status = :status, updated_at = NOW()
                    WHERE payment_id = :payment_id
                    """
                ),
                {"payment_id": payment_id, "status": status},
            )
            await session.flush()
            logger.info(
                "Payment %s: payment_id=%s",
                status,
                payment_id,
            )
        except Exception as exc:
            logger.error("handle_webhook status update error: %s", exc)
            raise


async def get_payment_history(
    session: AsyncSession,
    user_id: str,
    limit: int = 20,
) -> list[PaymentInfo]:
    """查询用户支付历史记录。"""
    try:
        result = await session.execute(
            text(
                """
                SELECT id, payment_id, user_id, plan, amount_usd, network, status, created_at
                FROM payments
                WHERE user_id = :user_id
                ORDER BY created_at DESC
                LIMIT :limit
                """
            ),
            {"user_id": user_id, "limit": limit},
        )
        rows = result.mappings().all()
    except Exception as exc:
        logger.error("get_payment_history DB error: %s", exc)
        raise

    return [
        PaymentInfo(
            id=str(row["id"]),
            payment_id=row["payment_id"],
            user_id=str(row["user_id"]),
            plan=row["plan"],
            amount_usd=float(row["amount_usd"]),
            network=row["network"],
            status=row["status"],
            created_at=row["created_at"],
        )
        for row in rows
    ]


# ── 内部辅助函数 ──────────────────────────────────────────────

async def _call_nowpayments_create(
    amount: float,
    pay_currency: str,
    order_id: str,
    api_key: str = "",
) -> dict:
    """调用 NowPayments 创建支付 API。

    Args:
        amount: 支付金额（USD）
        pay_currency: 支付币种
        order_id: 订单 ID
        api_key: NowPayments API Key（由调用方从 ConfigService 获取）
    """
    async with httpx.AsyncClient() as client:
        response = await client.post(
            f"{NOWPAYMENTS_API_BASE}/payment",
            headers={
                "x-api-key": api_key,
                "Content-Type": "application/json",
            },
            json={
                "price_amount": amount,
                "price_currency": "usd",
                "pay_currency": pay_currency,
                "order_id": order_id,
                "order_description": f"Axiom membership plan",
            },
            timeout=API_TIMEOUT_SECONDS,
        )
        response.raise_for_status()
        return response.json()
