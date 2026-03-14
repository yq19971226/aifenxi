"""Oxapay 支付服务 — 创建支付、Webhook 验签、幂等处理。

所有外部 API 调用使用 httpx.AsyncClient + asyncio.wait_for 超时控制。
数据库操作使用 sqlalchemy text()，多表更新在事务内完成。
"""

import asyncio
import hashlib
import hmac
import json
import logging
from datetime import datetime
from typing import Any, Literal
from uuid import uuid4

import httpx
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.sql_compat import insert_returning, is_sqlite
from app.services.partner_service import grant_commission
from app.services.subscription import upgrade_membership

logger = logging.getLogger(__name__)

# ── 常量 ──────────────────────────────────────────────────────

OXAPAY_API_BASE = "https://api.oxapay.com"
API_TIMEOUT_SECONDS = 30

# 前端展示网络 → Oxapay network 参数映射
NETWORK_MAP: dict[str, str] = {
    "TRC-20": "TRC20",
    "ERC-20": "ERC20",
    "BEP-20": "BEP20",
}

# Oxapay 支付状态映射（Oxapay 返回首字母大写，统一转小写比较）
PROVIDER_SUCCESS_STATUSES = frozenset({"paid"})
PROVIDER_FAILED_STATUSES = frozenset({"failed"})
PROVIDER_EXPIRED_STATUSES = frozenset({"expired"})
PROVIDER_PENDING_STATUSES = frozenset({
    "waiting",
    "paying",
    "confirming",
})

PAYMENT_AUDIT_COLUMN_DEFS: dict[str, tuple[str, str]] = {
    "pay_address": ("TEXT", "TEXT"),
    "pay_amount": ("NUMERIC(24, 8)", "REAL"),
    "pay_currency": ("VARCHAR(30)", "TEXT"),
    "provider_status": ("VARCHAR(40)", "TEXT"),
    "status_reason": ("VARCHAR(40)", "TEXT"),
    "provider_payload_json": ("TEXT", "TEXT"),
    "provider_observed_at": ("TIMESTAMPTZ", "TEXT"),
    "provider_observation_source": ("VARCHAR(20)", "TEXT"),
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


async def _get_callback_url() -> str:
    try:
        from app.services.config_service import get_config_value

        configured = (await get_config_value("oxapay_callback_url", "")).strip()
        if configured.startswith("http://") or configured.startswith("https://"):
            return configured
    except Exception:
        logger.warning("读取支付回调地址失败，尝试使用站点域名推导")

    try:
        from app.core.config import settings

        origins = [
            origin.strip().rstrip("/")
            for origin in settings.cors_origins.split(",")
            if origin.strip()
        ]
        for origin in origins:
            if "localhost" in origin or "127.0.0.1" in origin:
                continue
            return f"{origin}/api/payment/webhook"
    except Exception:
        logger.warning("推导支付回调地址失败")

    logger.warning("Oxapay callback URL not configured")
    return ""


def _build_external_order_id(user_id: str) -> str:
    return f"axiom-{user_id[:8]}-{uuid4().hex[:12]}"


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
    provider_status: str | None = None
    status_reason: str | None = None
    payment_url: str | None = None  # Oxapay 托管支付页面链接


class WebhookPayload(BaseModel):
    """Oxapay Webhook 回调载荷。

    官方文档字段名均为 snake_case:
    track_id, status, type, module_name, amount, value, currency,
    order_id, email, note, fee_paid_by_payer, under_paid_coverage,
    description, date, txs[]
    """

    track_id: int | str | None = None
    status: str | None = None
    type: str | None = None  # invoice / white_label / static_address
    amount: float | str | None = None
    value: float | str | None = None  # 币种等值金额
    sent_value: float | str | None = None
    currency: str | None = None
    order_id: str | None = None
    email: str | None = None
    description: str | None = None
    date: int | None = None
    txs: list[dict] | None = None  # 交易详情数组

    def get_payment_id(self) -> str:
        return str(self.track_id or "")

    def get_status(self) -> str:
        return self.status or "waiting"

    def get_address(self) -> str | None:
        """从 txs 数组中提取第一个交易地址。"""
        if self.txs and len(self.txs) > 0:
            return self.txs[0].get("address")
        return None

    def get_network(self) -> str | None:
        """从 txs 数组中提取网络。"""
        if self.txs and len(self.txs) > 0:
            return self.txs[0].get("network")
        return None

    def get_amount(self) -> float | None:
        val = self.amount
        if val is not None:
            try:
                return float(val)
            except (ValueError, TypeError):
                return None
        return None

    def get_currency(self) -> str | None:
        return self.currency


# ── 服务函数 ──────────────────────────────────────────────────

def _normalize_provider_status(status: str | None) -> str:
    normalized = (status or "waiting").strip().lower()
    return normalized or "waiting"


def _normalize_pay_currency(pay_currency: str | None) -> str | None:
    normalized = (pay_currency or "").strip().lower()
    return normalized or None


def _map_local_payment_status(provider_status: str) -> str:
    if provider_status in PROVIDER_SUCCESS_STATUSES:
        return "completed"
    if provider_status in PROVIDER_FAILED_STATUSES:
        return "failed"
    if provider_status in PROVIDER_EXPIRED_STATUSES:
        return "expired"
    if provider_status in PROVIDER_PENDING_STATUSES:
        return "pending"
    return "pending"


def _derive_status_reason(
    provider_status: str,
    *,
    expected_network: str | None = None,
    actual_pay_currency: str | None = None,
) -> str | None:
    if provider_status == "paying":
        return "partial"
    if provider_status in PROVIDER_PENDING_STATUSES - {"paying"}:
        return provider_status
    return None


def _serialize_provider_payload(payload_dict: dict[str, Any]) -> str:
    return json.dumps(payload_dict, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def _build_provider_audit_values(
    payload: WebhookPayload,
    *,
    expected_network: str | None,
    source: Literal["create", "webhook", "sync", "legacy"],
) -> dict[str, Any]:
    provider_status = _normalize_provider_status(payload.get_status())
    pay_currency = _normalize_pay_currency(payload.get_currency())
    payload_dict = payload.model_dump(exclude_none=True)
    payload_dict["status"] = provider_status
    if pay_currency:
        payload_dict["currency"] = pay_currency

    return {
        "pay_address": payload.get_address(),
        "pay_amount": payload.get_amount(),
        "pay_currency": pay_currency,
        "provider_status": provider_status,
        "status_reason": _derive_status_reason(
            provider_status,
            expected_network=expected_network,
            actual_pay_currency=pay_currency,
        ),
        "provider_payload_json": _serialize_provider_payload(payload_dict),
        "provider_observation_source": source,
    }


async def _update_provider_snapshot(
    session: AsyncSession,
    payment_id: str,
    *,
    audit_values: dict[str, Any],
) -> None:
    await session.execute(
        text(
            """
            UPDATE payments
            SET pay_address = COALESCE(:pay_address, pay_address),
                pay_amount = COALESCE(:pay_amount, pay_amount),
                pay_currency = COALESCE(:pay_currency, pay_currency),
                provider_status = :provider_status,
                status_reason = :status_reason,
                provider_payload_json = :provider_payload_json,
                provider_observed_at = CURRENT_TIMESTAMP,
                provider_observation_source = :provider_observation_source,
                updated_at = CURRENT_TIMESTAMP
            WHERE payment_id = :payment_id
            """
        ),
        {"payment_id": payment_id, **audit_values},
    )


async def ensure_payment_audit_columns(session: AsyncSession) -> None:
    if is_sqlite:
        result = await session.execute(text("PRAGMA table_info(payments)"))
        existing_columns = {row[1] for row in result.fetchall()}
        for column_name, (_, sqlite_type) in PAYMENT_AUDIT_COLUMN_DEFS.items():
            if column_name not in existing_columns:
                await session.execute(
                    text(f"ALTER TABLE payments ADD COLUMN {column_name} {sqlite_type}")
                )
    else:
        result = await session.execute(
            text(
                """
                SELECT column_name
                FROM information_schema.columns
                WHERE table_schema = current_schema()
                  AND table_name = 'payments'
                """
            )
        )
        existing_columns = {row[0] for row in result.fetchall()}
        for column_name, (pg_type, _) in PAYMENT_AUDIT_COLUMN_DEFS.items():
            if column_name not in existing_columns:
                await session.execute(
                    text(
                        f"ALTER TABLE payments ADD COLUMN IF NOT EXISTS {column_name} {pg_type}"
                    )
                )

    await session.execute(
        text(
            """
            UPDATE payments
            SET provider_status = COALESCE(provider_status, status),
                provider_observed_at = COALESCE(provider_observed_at, updated_at),
                provider_observation_source = COALESCE(provider_observation_source, 'legacy')
            WHERE provider_status IS NULL
               OR provider_observed_at IS NULL
               OR provider_observation_source IS NULL
            """
        )
    )
    await session.commit()

def _payment_info_from_row(row: dict) -> PaymentInfo:
    return PaymentInfo(
        id=str(row["id"]),
        payment_id=str(row["payment_id"]),
        user_id=str(row["user_id"]),
        plan=row["plan"],
        amount_usd=float(row["amount_usd"]),
        network=row.get("network"),
        status=row["status"],
        created_at=row.get("created_at"),
        pay_address=row.get("pay_address"),
        pay_amount=float(row["pay_amount"]) if row.get("pay_amount") is not None else None,
        pay_currency=row.get("pay_currency"),
        provider_status=row.get("provider_status"),
        status_reason=row.get("status_reason"),
    )


async def _get_payment_row(
    session: AsyncSession,
    payment_id: str,
    user_id: str | None = None,
) -> dict | None:
    sql = """
        SELECT id, payment_id, user_id, plan, amount_usd, network, status,
               created_at, pay_address, pay_amount, pay_currency,
               provider_status, status_reason
        FROM payments
        WHERE payment_id = :payment_id
    """
    params: dict[str, str] = {"payment_id": payment_id}
    if user_id is not None:
        sql += " AND user_id = :user_id"
        params["user_id"] = user_id

    result = await session.execute(text(sql), params)
    return result.mappings().first()

async def create_payment(
    session: AsyncSession,
    user_id: str,
    request: CreatePaymentRequest,
) -> PaymentInfo:
    """创建 Oxapay 支付订单并写入数据库。

    1. 调用 Oxapay Merchant API 创建发票
    2. 将支付记录插入 payments 表
    3. 返回包含支付地址的 PaymentInfo
    """
    monthly_price = await _get_plan_price(request.plan)
    if monthly_price is None:
        raise ValueError(f"无效的套餐: {request.plan}")

    discount = await _get_duration_discount(request.duration_months)
    amount = round(monthly_price * request.duration_months * discount, 2)
    oxapay_network = NETWORK_MAP.get(request.network)
    if oxapay_network is None:
        raise ValueError(f"不支持的网络: {request.network}")

    # 调用 Oxapay API
    try:
        from app.services.config_service import get_config_value

        merchant_key = await get_config_value("oxapay_merchant_key")
        callback_url = await _get_callback_url()
        external_order_id = _build_external_order_id(user_id)
        ox_response = await asyncio.wait_for(
            _call_oxapay_create(
                amount=amount,
                currency="USDT",
                network=oxapay_network,
                order_id=external_order_id,
                merchant_key=merchant_key,
                callback_url=callback_url,
            ),
            timeout=API_TIMEOUT_SECONDS,
        )
    except asyncio.TimeoutError:
        logger.error("Oxapay API timeout: user_id=%s", user_id)
        raise RuntimeError("支付服务超时，请稍后重试")
    except Exception as exc:
        logger.error("Oxapay API error: %s", exc)
        raise RuntimeError("支付服务异常，请稍后重试")

    # Oxapay V1 返回 { "data": { "track_id": "...", "payment_url": "..." }, "status": 200 }
    resp_data = ox_response.get("data", {})
    payment_id = str(resp_data.get("track_id", ""))
    if not payment_id:
        logger.error("Oxapay response missing track_id: %s", ox_response)
        raise RuntimeError("支付服务返回异常")

    payment_url = resp_data.get("payment_url", "")
    # Invoice 创建时还没有具体 pay_address，需要用户在支付页面选择后才有
    pay_address = ""
    pay_amount = amount  # 创建时金额就是请求金额

    create_payload = WebhookPayload(
        track_id=payment_id,
        status="waiting",
        amount=pay_amount,
        currency="USD",
        order_id=external_order_id,
    )
    create_audit = _build_provider_audit_values(
        create_payload,
        expected_network=request.network,
        source="create",
    )

    # 写入数据库
    try:
        result = await insert_returning(
            session,
            """
            INSERT INTO payments (
                payment_id, user_id, plan, amount_usd, network, status, duration_months,
                pay_address, pay_amount, pay_currency,
                provider_status, status_reason, provider_payload_json, provider_observation_source, provider_observed_at
            )
            VALUES (
                :payment_id, :user_id, :plan, :amount_usd, :network, 'pending', :duration_months,
                :pay_address, :pay_amount, :pay_currency,
                :provider_status, :status_reason, :provider_payload_json, :provider_observation_source, CURRENT_TIMESTAMP
            )
            RETURNING id, created_at
            """,
            {
                "payment_id": payment_id,
                "user_id": user_id,
                "plan": request.plan,
                "amount_usd": amount,
                "network": request.network,
                "duration_months": request.duration_months,
                **create_audit,
            },
            table="payments",
        )
        row = result.mappings().first()
        await session.flush()
    except Exception as exc:
        logger.error("create_payment DB error: %s", exc)
        raise

    info = PaymentInfo(
        id=str(row["id"]),
        payment_id=payment_id,
        user_id=user_id,
        plan=request.plan,
        amount_usd=amount,
        network=request.network,
        status="pending",
        created_at=row["created_at"],
        pay_address=pay_address or None,
        pay_amount=float(pay_amount) if pay_amount else None,
        pay_currency="usd",
        provider_status=create_audit["provider_status"],
        status_reason=create_audit["status_reason"],
        payment_url=payment_url or None,
    )
    return info


def verify_webhook_signature(body: bytes, signature: str, merchant_key: str = "") -> bool:
    """验证 Oxapay Webhook 签名（HMAC-SHA512）。

    Oxapay 使用 Merchant API Key 对原始请求体进行 HMAC-SHA512 签名，
    签名值通过 HMAC 请求头传递。

    Args:
        body: 原始请求体
        signature: HMAC 请求头值
        merchant_key: Oxapay Merchant API Key
    """
    if not merchant_key:
        logger.warning("Oxapay merchant key not configured")
        return False

    try:
        expected = hmac.new(
            merchant_key.encode("utf-8"),
            body,
            hashlib.sha512,
        ).hexdigest()
    except Exception:
        logger.error("Webhook HMAC calculation failed")
        return False

    return hmac.compare_digest(expected, signature)


async def handle_webhook(
    session: AsyncSession,
    payload: WebhookPayload,
    source: Literal["webhook", "sync"] = "webhook",
) -> None:
    """处理 Oxapay Webhook 回调。

    幂等性：已完成的支付不会重复处理。
    支付成功时在事务内完成：更新状态 → 升级会员 → 记录日志。
    """
    payment_id = payload.get_payment_id()
    provider_status = _normalize_provider_status(payload.get_status())

    # 查询现有支付记录
    try:
        result = await session.execute(
            text(
                """
                SELECT id, user_id, plan, network, status
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

    audit_values = _build_provider_audit_values(
        payload,
        expected_network=existing.get("network"),
        source=source,
    )

    try:
        await _update_provider_snapshot(
            session,
            payment_id,
            audit_values=audit_values,
        )
    except Exception as exc:
        logger.error("handle_webhook audit update error: %s", exc)
        raise

    local_status = _map_local_payment_status(provider_status)

    # 幂等性：已完成的支付仍记录审计快照，但不重复执行业务副作用
    if existing["status"] == "completed":
        logger.info(
            "Payment already completed, audit snapshot updated: payment_id=%s, provider_status=%s",
            payment_id,
            provider_status,
        )
        return

    if local_status == "completed":
        # 支付成功 → 更新状态 + 升级会员（事务内）
        try:
            await session.execute(
                text(
                    """
                    UPDATE payments
                    SET status = 'completed',
                        status_reason = :status_reason,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE payment_id = :payment_id
                    """
                ),
                {
                    "payment_id": payment_id,
                    "status_reason": audit_values["status_reason"],
                },
            )

            user_id = str(existing["user_id"])
            plan = existing["plan"]

            # duration 计算：优先从订单落库值读取，严禁兜底错误默认值
            duration = None
            try:
                result_dur = await session.execute(
                    text("SELECT duration_months FROM payments WHERE payment_id = :pid"),
                    {"pid": payment_id},
                )
                dur_row = result_dur.mappings().first()
                if dur_row and dur_row["duration_months"]:
                    dm = int(dur_row["duration_months"])
                    duration = DURATION_DAYS.get(dm)
            except Exception:
                pass
            if duration is None:
                duration = DURATION_DAYS.get(plan, 30)
                logger.warning(
                    "duration_months missing or unmapped, falling back to plan-based: "
                    "payment_id=%s, plan=%s, duration=%d",
                    payment_id, plan, duration,
                )
            await upgrade_membership(session, user_id, plan, duration_days=duration)

            # 合伙人佣金发放（DB 事务内写记录，事务提交后同步 Redis）
            commission_result = None
            try:
                amount_usd = payload.get_amount() or 0
                if amount_usd > 0:
                    commission_result = await grant_commission(
                        session, user_id, str(existing["id"]), amount_usd
                    )
            except Exception as comm_exc:
                logger.warning(
                    "Commission grant failed (non-fatal): payment_id=%s, error=%s",
                    payment_id, comm_exc,
                )

            await session.flush()

            # DB 事务已 flush，现在安全同步佣金到 Redis（3次重试）
            if commission_result:
                for _attempt in range(3):
                    try:
                        from app.services.partner_service import sync_commission_to_redis
                        await sync_commission_to_redis(
                            commission_result["partner_id"],
                            commission_result["commission"],
                        )
                        break
                    except Exception as redis_exc:
                        if _attempt == 2:
                            logger.error(
                                "Commission Redis sync failed after 3 retries "
                                "(reconcile job will fix): partner=%s amount=%s error=%s",
                                commission_result["partner_id"],
                                commission_result["commission"],
                                redis_exc,
                            )
                        else:
                            await asyncio.sleep(0.5 * (_attempt + 1))
            logger.info(
                "Payment completed: payment_id=%s, user_id=%s, plan=%d, provider_status=%s",
                payment_id,
                user_id,
                plan,
                provider_status,
            )
        except Exception as exc:
            logger.error("handle_webhook update error: %s", exc)
            raise

    elif local_status in {"failed", "expired"}:
        try:
            await session.execute(
                text(
                    """
                    UPDATE payments
                    SET status = :status,
                        status_reason = :status_reason,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE payment_id = :payment_id
                    """
                ),
                {
                    "payment_id": payment_id,
                    "status": local_status,
                    "status_reason": audit_values["status_reason"],
                },
            )
            await session.flush()
            logger.info(
                "Payment %s: payment_id=%s, provider_status=%s",
                local_status,
                payment_id,
                provider_status,
            )
        except Exception as exc:
            logger.error("handle_webhook status update error: %s", exc)
            raise

    elif existing["status"] not in {"failed", "expired"}:
        try:
            await session.execute(
                text(
                    """
                    UPDATE payments
                    SET status = 'pending',
                        status_reason = :status_reason,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE payment_id = :payment_id
                    """
                ),
                {
                    "payment_id": payment_id,
                    "status_reason": audit_values["status_reason"],
                },
            )
            await session.flush()
            logger.info(
                "Payment pending update: payment_id=%s, provider_status=%s, reason=%s",
                payment_id,
                provider_status,
                audit_values["status_reason"],
            )
        except Exception as exc:
            logger.error("handle_webhook pending update error: %s", exc)
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
                SELECT id, payment_id, user_id, plan, amount_usd, network, status, created_at,
                       pay_address, pay_amount, pay_currency, provider_status, status_reason
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

    return [_payment_info_from_row(row) for row in rows]


async def reconcile_payment_status(
    session: AsyncSession,
    payment_id: str,
    user_id: str | None = None,
) -> PaymentInfo:
    existing = await _get_payment_row(session, payment_id, user_id=user_id)
    if existing is None:
        raise ValueError("支付订单不存在")

    try:
        from app.services.config_service import get_config_value

        merchant_key = await get_config_value("oxapay_merchant_key")
        if not merchant_key:
            raise RuntimeError("未配置支付网关密钥")

        provider_response = await asyncio.wait_for(
            _call_oxapay_inquiry(payment_id, merchant_key=merchant_key),
            timeout=API_TIMEOUT_SECONDS,
        )
    except asyncio.TimeoutError:
        logger.error("Oxapay status query timeout: payment_id=%s", payment_id)
        raise RuntimeError("支付状态查询超时，请稍后重试")
    except httpx.HTTPStatusError as exc:
        if exc.response.status_code == 404:
            raise ValueError("支付订单不存在")
        logger.error("Oxapay status query failed: payment_id=%s, status=%s", payment_id, exc.response.status_code)
        raise RuntimeError("支付状态查询失败，请稍后重试")
    except RuntimeError:
        raise
    except Exception as exc:
        logger.error("Oxapay status query error: payment_id=%s, error=%s", payment_id, exc)
        raise RuntimeError("支付状态查询失败，请稍后重试")

    try:
        payload = WebhookPayload.model_validate(provider_response)
    except Exception as exc:
        logger.error("Oxapay status payload parse error: payment_id=%s, error=%s", payment_id, exc)
        raise RuntimeError("支付状态响应格式错误")

    await handle_webhook(session, payload, source="sync")

    refreshed = await _get_payment_row(session, payment_id, user_id=user_id)
    if refreshed is None:
        raise ValueError("支付订单不存在")
    return _payment_info_from_row(refreshed)


# ── 内部辅助函数 ──────────────────────────────────────────────

_http_client: httpx.AsyncClient | None = None


def _get_http_client() -> httpx.AsyncClient:
    """获取可复用的 httpx 客户端（连接池）。"""
    global _http_client
    if _http_client is None or _http_client.is_closed:
        _http_client = httpx.AsyncClient(
            timeout=API_TIMEOUT_SECONDS,
            limits=httpx.Limits(max_connections=10, max_keepalive_connections=5),
        )
    return _http_client


async def _call_oxapay_create(
    amount: float,
    currency: str,
    network: str,
    order_id: str,
    merchant_key: str = "",
    callback_url: str = "",
) -> dict:
    """调用 Oxapay Merchant API V1 创建发票。

    官方文档端点: POST https://api.oxapay.com/v1/payment/invoice
    认证: merchant_api_key 放在 HTTP 请求头中
    字段名: 全部 snake_case
    成功响应: { "data": { "track_id": "...", "payment_url": "..." }, "status": 200 }
    """
    client = _get_http_client()
    headers = {
        "merchant_api_key": merchant_key,
        "Content-Type": "application/json",
    }
    payload: dict[str, Any] = {
        "amount": amount,
        "currency": currency,
        "lifetime": 30,  # 30 分钟有效期
        "fee_paid_by_payer": 0,  # 手续费由商户承担
        "to_currency": "USDT",  # 自动转换为 USDT
        "order_id": order_id,
        "description": "Axiom membership plan",
        "sandbox": False,
    }
    if callback_url:
        payload["callback_url"] = callback_url

    response = await client.post(
        f"{OXAPAY_API_BASE}/v1/payment/invoice",
        json=payload,
        headers=headers,
    )
    response.raise_for_status()
    data = response.json()

    # Oxapay V1 返回 status=200 表示成功
    if data.get("status") != 200:
        error_msg = data.get("message", "Unknown error")
        errors = data.get("error", {})
        logger.error("Oxapay create invoice failed: %s, errors=%s", error_msg, errors)
        raise RuntimeError(f"支付服务异常: {error_msg}")

    return data


async def _call_oxapay_inquiry(
    payment_id: str,
    merchant_key: str = "",
) -> dict:
    """调用 Oxapay Merchant API V1 查询支付详情。

    官方文档端点: GET https://api.oxapay.com/v1/payment/{track_id}
    认证: merchant_api_key 放在 HTTP 请求头中
    """
    client = _get_http_client()
    headers = {
        "merchant_api_key": merchant_key,
        "Content-Type": "application/json",
    }
    response = await client.get(
        f"{OXAPAY_API_BASE}/v1/payment/{payment_id}",
        headers=headers,
    )
    response.raise_for_status()
    data = response.json()

    if data.get("status") != 200:
        error_msg = data.get("message", "Unknown error")
        logger.error("Oxapay inquiry failed: %s", error_msg)
        raise RuntimeError(f"支付状态查询异常: {error_msg}")

    # 返回 data 子对象，字段结构与 Webhook 载荷一致
    return data.get("data", data)
