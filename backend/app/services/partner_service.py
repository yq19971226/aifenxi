"""合伙人系统核心服务 — 邀请码、佣金、钱包、提现。"""

import re
from datetime import datetime, timezone

import structlog
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.redis import get_redis_pool
from app.core.sql_compat import insert_returning
from app.services.config_service import get_config_value

logger = structlog.get_logger(__name__)

# TRC20 地址格式: 以 T 开头，34 位 Base58 字符
TRC20_REGEX = re.compile(r"^T[1-9A-HJ-NP-Za-km-z]{33}$")


async def _redis_get_float(redis, key: str) -> float:
    """读取 Redis 浮点值，异常/脏值时回退 0。"""
    raw = await redis.get(key)
    try:
        return float(raw or "0")
    except (TypeError, ValueError):
        logger.warning("redis_invalid_amount", key=key, raw_value=raw)
        return 0.0


async def _redis_transfer(redis, from_key: str, to_key: str, amount: float) -> None:
    """在 Redis 内原子迁移金额：from 减，to 加。"""
    if amount == 0:
        return
    pipe = redis.pipeline(transaction=True)
    pipe.incrbyfloat(from_key, -amount)
    pipe.incrbyfloat(to_key, amount)
    await pipe.execute()


# ── 合伙人面板数据 ────────────────────────────────────────────


async def get_dashboard(session: AsyncSession, user_id: str) -> dict:
    """获取合伙人面板汇总数据。"""
    redis = get_redis_pool()

    # 余额信息
    balance = await _redis_get_float(redis, f"partner_balance:{user_id}")
    frozen = await _redis_get_float(redis, f"partner_frozen:{user_id}")

    # 邀请码
    result = await session.execute(
        text("SELECT referral_code FROM users WHERE id = :uid"),
        {"uid": user_id},
    )
    row = result.mappings().first()
    referral_code = row["referral_code"] if row else ""

    # 累计邀请人数
    result = await session.execute(
        text("SELECT COUNT(*) AS cnt FROM users WHERE referred_by = :uid"),
        {"uid": user_id},
    )
    total_invitations = result.scalar() or 0

    # 累计付费人数
    result = await session.execute(
        text(
            """
            SELECT COUNT(DISTINCT referee_id) AS cnt
            FROM commissions
            WHERE partner_id = :uid
            """
        ),
        {"uid": user_id},
    )
    total_paid_referees = result.scalar() or 0

    # 累计佣金
    result = await session.execute(
        text(
            """
            SELECT COALESCE(SUM(commission_amount), 0) AS total
            FROM commissions
            WHERE partner_id = :uid AND status != 'cancelled'
            """
        ),
        {"uid": user_id},
    )
    total_commission = float(result.scalar() or 0)

    # 当前费率
    _rate_str = await get_config_value("partner_commission_rate", "0.10")
    rate = float(_rate_str) if _rate_str else 0.10

    # 品牌链接
    brand_url = await get_config_value("site_brand_url", "")

    return {
        "referral_code": referral_code,
        "referral_link": f"{brand_url}/?ref={referral_code}" if brand_url else "",
        "balance": balance,
        "frozen": frozen,
        "total_invitations": total_invitations,
        "total_paid_referees": total_paid_referees,
        "total_commission": total_commission,
        "commission_rate": rate,
    }


# ── 邀请记录 ─────────────────────────────────────────────────


async def get_invitations(
    session: AsyncSession, user_id: str, limit: int = 50, offset: int = 0
) -> list[dict]:
    """获取合伙人的邀请记录列表。"""
    result = await session.execute(
        text(
            """
            SELECT
                u.id,
                u.email,
                u.created_at AS registered_at,
                u.referred_at,
                COALESCE(m.level, 0) AS membership_level,
                COALESCE(c.total_commission, 0) AS total_commission
            FROM users u
            LEFT JOIN memberships m ON m.user_id = u.id
            LEFT JOIN (
                SELECT referee_id, SUM(commission_amount) AS total_commission
                FROM commissions
                WHERE partner_id = :uid AND status != 'cancelled'
                GROUP BY referee_id
            ) c ON c.referee_id = u.id
            WHERE u.referred_by = :uid
            ORDER BY u.created_at DESC
            LIMIT :lim OFFSET :off
            """
        ),
        {"uid": user_id, "lim": limit, "off": offset},
    )
    rows = result.mappings().all()

    return [
        {
            "user_id": str(r["id"]),
            "email_masked": _mask_email(r["email"]),
            "registered_at": r["registered_at"].isoformat() if r["registered_at"] else None,
            "membership_level": r["membership_level"],
            "total_commission": float(r["total_commission"]),
        }
        for r in rows
    ]


# ── 佣金记录 ─────────────────────────────────────────────────


async def get_commissions(
    session: AsyncSession, user_id: str, limit: int = 50, offset: int = 0
) -> list[dict]:
    """获取合伙人的佣金记录。"""
    result = await session.execute(
        text(
            """
            SELECT c.id, c.referee_id, c.payment_amount_usd,
                   c.commission_rate, c.commission_amount, c.status, c.created_at,
                   u.email AS referee_email
            FROM commissions c
            JOIN users u ON u.id = c.referee_id
            WHERE c.partner_id = :uid
            ORDER BY c.created_at DESC
            LIMIT :lim OFFSET :off
            """
        ),
        {"uid": user_id, "lim": limit, "off": offset},
    )
    rows = result.mappings().all()

    return [
        {
            "id": str(r["id"]),
            "referee_email_masked": _mask_email(r["referee_email"]),
            "payment_amount_usd": float(r["payment_amount_usd"]),
            "commission_rate": float(r["commission_rate"]),
            "commission_amount": float(r["commission_amount"]),
            "status": r["status"],
            "created_at": r["created_at"].isoformat(),
        }
        for r in rows
    ]


# ── 佣金发放（支付成功后调用） ────────────────────────────────


async def grant_commission(
    session: AsyncSession,
    user_id: str,
    payment_id: str,
    amount_usd: float,
) -> None:
    """检查被邀请关系，发放佣金给邀请人。

    在 payment webhook 中支付成功后调用。
    """
    # 查询付费用户的邀请人
    result = await session.execute(
        text("SELECT referred_by FROM users WHERE id = :uid"),
        {"uid": user_id},
    )
    row = result.mappings().first()
    if not row or not row["referred_by"]:
        return

    partner_id = str(row["referred_by"])

    # 检查合伙人功能是否启用
    enabled = await get_config_value("partner_feature_enabled", "true")
    if enabled.lower() != "true":
        return

    # 读取分成比例
    _rate_str = await get_config_value("partner_commission_rate", "0.10")
    rate = float(_rate_str) if _rate_str else 0.10
    commission = round(amount_usd * rate, 2)
    if commission <= 0:
        return

    # 写入佣金记录
    await session.execute(
        text(
            """
            INSERT INTO commissions
                (partner_id, referee_id, payment_id, payment_amount_usd,
                 commission_rate, commission_amount, status)
            VALUES (:partner_id, :referee_id, :payment_id, :amount,
                    :rate, :commission, 'confirmed')
            """
        ),
        {
            "partner_id": partner_id,
            "referee_id": user_id,
            "payment_id": payment_id,
            "amount": amount_usd,
            "rate": rate,
            "commission": commission,
        },
    )
    await session.flush()

    # 更新 Redis 可提现余额
    redis = get_redis_pool()
    await redis.incrbyfloat(f"partner_balance:{partner_id}", commission)

    logger.info(
        "commission_granted",
        partner_id=partner_id,
        referee_id=user_id,
        amount_usd=amount_usd,
        commission=commission,
        rate=rate,
    )


# ── 钱包管理 ─────────────────────────────────────────────────


async def get_wallet(session: AsyncSession, user_id: str) -> dict | None:
    """获取用户的 TRC20 钱包信息。"""
    result = await session.execute(
        text(
            """
            SELECT id, trc20_address, is_verified, created_at, updated_at
            FROM partner_wallets
            WHERE user_id = :uid
            """
        ),
        {"uid": user_id},
    )
    row = result.mappings().first()
    if not row:
        return None
    return {
        "id": str(row["id"]),
        "trc20_address": row["trc20_address"],
        "is_verified": row["is_verified"],
        "created_at": row["created_at"].isoformat(),
        "updated_at": row["updated_at"].isoformat(),
    }


async def upsert_wallet(session: AsyncSession, user_id: str, trc20_address: str) -> dict:
    """绑定或修改 TRC20 钱包地址。"""
    address = trc20_address.strip()
    if not TRC20_REGEX.match(address):
        raise ValueError("TRC20 地址格式无效，应以 T 开头，共 34 位")

    # 检查冷却期
    cooldown_hours = int(await get_config_value("partner_address_cooldown_hours", "24"))
    existing = await session.execute(
        text("SELECT updated_at FROM partner_wallets WHERE user_id = :uid"),
        {"uid": user_id},
    )
    existing_row = existing.mappings().first()
    if existing_row:
        last_update = existing_row["updated_at"]
        if last_update:
            elapsed = (datetime.now(timezone.utc) - last_update.replace(tzinfo=timezone.utc)).total_seconds()
            if elapsed < cooldown_hours * 3600:
                remaining_hours = round((cooldown_hours * 3600 - elapsed) / 3600, 1)
                raise ValueError(f"地址修改冷却中，请 {remaining_hours} 小时后再试")

    # Upsert
    await session.execute(
        text(
            """
            INSERT INTO partner_wallets (user_id, trc20_address, is_verified, updated_at)
            VALUES (:uid, :addr, true, NOW())
            ON CONFLICT (user_id)
            DO UPDATE SET trc20_address = :addr, is_verified = true, updated_at = NOW()
            """
        ),
        {"uid": user_id, "addr": address},
    )
    await session.flush()

    return {"trc20_address": address, "is_verified": True}


# ── 提现 ─────────────────────────────────────────────────────


async def request_withdrawal(session: AsyncSession, user_id: str) -> dict:
    """申请提现。"""
    # 检查钱包绑定
    wallet = await get_wallet(session, user_id)
    if not wallet:
        raise ValueError("请先绑定 TRC20 地址")

    # 检查余额
    redis = get_redis_pool()
    balance = await _redis_get_float(redis, f"partner_balance:{user_id}")
    min_amount = float(await get_config_value("partner_min_withdrawal", "50"))
    if balance < min_amount:
        raise ValueError(f"可提现余额不足，最低 {min_amount} USDT")

    # 检查冷却期
    cooldown_days = int(await get_config_value("partner_withdrawal_cooldown_days", "7"))
    last = await session.execute(
        text(
            """
            SELECT created_at FROM withdrawals
            WHERE user_id = :uid AND status != 'rejected'
            ORDER BY created_at DESC LIMIT 1
            """
        ),
        {"uid": user_id},
    )
    last_row = last.mappings().first()
    if last_row:
        elapsed_days = (datetime.now(timezone.utc) - last_row["created_at"].replace(tzinfo=timezone.utc)).days
        if elapsed_days < cooldown_days:
            raise ValueError(f"距上次提现不足 {cooldown_days} 天")

    # 冻结余额
    await _redis_transfer(
        redis,
        from_key=f"partner_balance:{user_id}",
        to_key=f"partner_frozen:{user_id}",
        amount=balance,
    )

    # 创建提现记录
    result = await insert_returning(
        session,
        """
        INSERT INTO withdrawals (user_id, amount, trc20_address, status)
        VALUES (:uid, :amount, :addr, 'pending')
        RETURNING id, created_at
        """,
        {"uid": user_id, "amount": balance, "addr": wallet["trc20_address"]},
        table="withdrawals",
    )
    row = result.mappings().first()
    await session.flush()

    logger.info("withdrawal_requested", user_id=user_id, amount=balance)

    return {
        "id": str(row["id"]),
        "amount": balance,
        "trc20_address": wallet["trc20_address"],
        "status": "pending",
        "created_at": row["created_at"].isoformat(),
    }


async def get_withdrawals(
    session: AsyncSession, user_id: str, limit: int = 20
) -> list[dict]:
    """获取用户提现记录。"""
    result = await session.execute(
        text(
            """
            SELECT id, amount, trc20_address, status, tx_hash,
                   reject_reason, created_at
            FROM withdrawals
            WHERE user_id = :uid
            ORDER BY created_at DESC
            LIMIT :lim
            """
        ),
        {"uid": user_id, "lim": limit},
    )
    rows = result.mappings().all()

    return [
        {
            "id": str(r["id"]),
            "amount": float(r["amount"]),
            "trc20_address": r["trc20_address"],
            "status": r["status"],
            "tx_hash": r["tx_hash"],
            "reject_reason": r["reject_reason"],
            "created_at": r["created_at"].isoformat(),
        }
        for r in rows
    ]


# ── 后台审核 ─────────────────────────────────────────────────


async def approve_withdrawal(
    session: AsyncSession, withdrawal_id: str, admin_id: str, tx_hash: str
) -> None:
    """审核通过提现，填入 tx_hash。"""
    result = await session.execute(
        text("SELECT user_id, amount, status FROM withdrawals WHERE id = :wid"),
        {"wid": withdrawal_id},
    )
    row = result.mappings().first()
    if not row:
        raise ValueError("提现记录不存在")
    if row["status"] != "pending":
        raise ValueError(f"提现状态为 {row['status']}，无法审核")

    await session.execute(
        text(
            """
            UPDATE withdrawals
            SET status = 'completed', tx_hash = :tx_hash,
                reviewed_by = :admin_id, reviewed_at = NOW()
            WHERE id = :wid
            """
        ),
        {"wid": withdrawal_id, "tx_hash": tx_hash, "admin_id": admin_id},
    )

    # 清除冻结金额
    redis = get_redis_pool()
    user_id = str(row["user_id"])
    amount = float(row["amount"])
    await redis.incrbyfloat(f"partner_frozen:{user_id}", -amount)

    await session.flush()
    logger.info("withdrawal_approved", withdrawal_id=withdrawal_id, tx_hash=tx_hash)


async def reject_withdrawal(
    session: AsyncSession, withdrawal_id: str, admin_id: str, reason: str
) -> None:
    """驳回提现，退回冻结金额。"""
    result = await session.execute(
        text("SELECT user_id, amount, status FROM withdrawals WHERE id = :wid"),
        {"wid": withdrawal_id},
    )
    row = result.mappings().first()
    if not row:
        raise ValueError("提现记录不存在")
    if row["status"] != "pending":
        raise ValueError(f"提现状态为 {row['status']}，无法驳回")

    await session.execute(
        text(
            """
            UPDATE withdrawals
            SET status = 'rejected', reject_reason = :reason,
                reviewed_by = :admin_id, reviewed_at = NOW()
            WHERE id = :wid
            """
        ),
        {"wid": withdrawal_id, "reason": reason, "admin_id": admin_id},
    )

    # 退回冻结金额到可提现余额
    redis = get_redis_pool()
    amount = float(row["amount"])
    user_id = str(row["user_id"])
    await _redis_transfer(
        redis,
        from_key=f"partner_frozen:{user_id}",
        to_key=f"partner_balance:{user_id}",
        amount=amount,
    )

    await session.flush()
    logger.info("withdrawal_rejected", withdrawal_id=withdrawal_id, reason=reason)


# ── 后台统计 ─────────────────────────────────────────────────


async def get_admin_overview(session: AsyncSession) -> dict:
    """合伙人体系概览统计（后台用）。"""
    result = await session.execute(
        text(
            """
            SELECT
                (SELECT COUNT(*) FROM users WHERE referred_by IS NOT NULL) AS total_referrals,
                (SELECT COUNT(DISTINCT partner_id) FROM commissions) AS active_partners,
                (SELECT COALESCE(SUM(commission_amount), 0) FROM commissions WHERE status = 'confirmed') AS total_commission,
                (SELECT COUNT(*) FROM withdrawals WHERE status = 'pending') AS pending_withdrawals,
                (SELECT COALESCE(SUM(amount), 0) FROM withdrawals WHERE status = 'completed') AS total_withdrawn
            """
        )
    )
    row = result.mappings().first()
    return {
        "total_referrals": row["total_referrals"],
        "active_partners": row["active_partners"],
        "total_commission": float(row["total_commission"]),
        "pending_withdrawals": row["pending_withdrawals"],
        "total_withdrawn": float(row["total_withdrawn"]),
    }


async def get_admin_partner_list(
    session: AsyncSession, limit: int = 50, offset: int = 0
) -> list[dict]:
    """合伙人列表（后台用）。"""
    result = await session.execute(
        text(
            """
            SELECT
                u.id, u.email, u.referral_code, u.created_at,
                COUNT(r.id) AS invitation_count,
                COALESCE(SUM(c.commission_amount), 0) AS total_commission
            FROM users u
            LEFT JOIN users r ON r.referred_by = u.id
            LEFT JOIN commissions c ON c.partner_id = u.id AND c.status != 'cancelled'
            WHERE u.referral_code IS NOT NULL
            GROUP BY u.id
            HAVING COUNT(r.id) > 0
            ORDER BY total_commission DESC
            LIMIT :lim OFFSET :off
            """
        ),
        {"lim": limit, "off": offset},
    )
    rows = result.mappings().all()

    return [
        {
            "user_id": str(r["id"]),
            "email": r["email"],
            "referral_code": r["referral_code"],
            "invitation_count": r["invitation_count"],
            "total_commission": float(r["total_commission"]),
            "created_at": r["created_at"].isoformat(),
        }
        for r in rows
    ]


async def get_admin_withdrawals(
    session: AsyncSession, status_filter: str | None = None, limit: int = 50
) -> list[dict]:
    """提现列表（后台用）。"""
    where = "WHERE 1=1"
    params: dict = {"lim": limit}
    if status_filter:
        where += " AND w.status = :status"
        params["status"] = status_filter

    result = await session.execute(
        text(
            f"""
            SELECT w.id, w.user_id, w.amount, w.trc20_address, w.status,
                   w.tx_hash, w.reject_reason, w.created_at, w.reviewed_at,
                   u.email
            FROM withdrawals w
            JOIN users u ON u.id = w.user_id
            {where}
            ORDER BY w.created_at DESC
            LIMIT :lim
            """
        ),
        params,
    )
    rows = result.mappings().all()

    return [
        {
            "id": str(r["id"]),
            "user_id": str(r["user_id"]),
            "email": r["email"],
            "amount": float(r["amount"]),
            "trc20_address": r["trc20_address"],
            "status": r["status"],
            "tx_hash": r["tx_hash"],
            "reject_reason": r["reject_reason"],
            "created_at": r["created_at"].isoformat(),
            "reviewed_at": r["reviewed_at"].isoformat() if r["reviewed_at"] else None,
        }
        for r in rows
    ]


# ── 工具函数 ─────────────────────────────────────────────────


async def get_referral_code(session: AsyncSession, user_id: str) -> dict:
    """获取用户的邀请码和邀请链接。"""
    result = await session.execute(
        text("SELECT referral_code FROM users WHERE id = :uid"),
        {"uid": user_id},
    )
    row = result.mappings().first()
    code = row["referral_code"] if row else ""
    brand_url = await get_config_value("site_brand_url", "")
    return {
        "referral_code": code,
        "referral_link": f"{brand_url}/?ref={code}" if brand_url and code else "",
    }


async def get_admin_partner_detail(session: AsyncSession, user_id: str) -> dict:
    """合伙人详情（后台用）。"""
    redis = get_redis_pool()

    # 基本信息
    result = await session.execute(
        text(
            """
            SELECT u.id, u.email, u.referral_code, u.created_at,
                   COALESCE(m.level, 0) AS membership_level
            FROM users u
            LEFT JOIN memberships m ON m.user_id = u.id
            WHERE u.id = :uid
            """
        ),
        {"uid": user_id},
    )
    user_row = result.mappings().first()
    if not user_row:
        raise ValueError("用户不存在")

    # 余额
    balance = await _redis_get_float(redis, f"partner_balance:{user_id}")
    frozen = await _redis_get_float(redis, f"partner_frozen:{user_id}")

    # 邀请数
    result = await session.execute(
        text("SELECT COUNT(*) AS cnt FROM users WHERE referred_by = :uid"),
        {"uid": user_id},
    )
    invitation_count = result.scalar() or 0

    # 佣金汇总
    result = await session.execute(
        text(
            """
            SELECT
                COALESCE(SUM(commission_amount), 0) AS total_commission,
                COUNT(*) AS commission_count
            FROM commissions
            WHERE partner_id = :uid AND status != 'cancelled'
            """
        ),
        {"uid": user_id},
    )
    comm_row = result.mappings().first()

    # 钱包
    wallet_result = await session.execute(
        text("SELECT trc20_address, is_verified FROM partner_wallets WHERE user_id = :uid"),
        {"uid": user_id},
    )
    wallet_row = wallet_result.mappings().first()

    # 最近提现
    wd_result = await session.execute(
        text(
            """
            SELECT id, amount, status, created_at
            FROM withdrawals
            WHERE user_id = :uid
            ORDER BY created_at DESC
            LIMIT 5
            """
        ),
        {"uid": user_id},
    )
    recent_withdrawals = [
        {
            "id": str(r["id"]),
            "amount": float(r["amount"]),
            "status": r["status"],
            "created_at": r["created_at"].isoformat(),
        }
        for r in wd_result.mappings().all()
    ]

    return {
        "user_id": str(user_row["id"]),
        "email": user_row["email"],
        "referral_code": user_row["referral_code"],
        "membership_level": user_row["membership_level"],
        "created_at": user_row["created_at"].isoformat(),
        "balance": balance,
        "frozen": frozen,
        "invitation_count": invitation_count,
        "total_commission": float(comm_row["total_commission"]),
        "commission_count": comm_row["commission_count"],
        "wallet": {
            "trc20_address": wallet_row["trc20_address"] if wallet_row else None,
            "is_verified": wallet_row["is_verified"] if wallet_row else False,
        },
        "recent_withdrawals": recent_withdrawals,
    }


# ── 工具函数 ─────────────────────────────────────────────────


def _mask_email(email: str) -> str:
    """邮箱脱敏: user@domain.com → u***@domain.com"""
    parts = email.split("@")
    if len(parts) != 2 or len(parts[0]) == 0:
        return "***"
    name = parts[0]
    return f"{name[0]}***@{parts[1]}"
