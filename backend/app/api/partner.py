"""合伙人系统 API 路由 — 用户端 + 运营后台。"""

import logging

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import UserInfo, get_current_user, require_admin
from app.services.config_service import ConfigService, ConfigUpdate, get_config_value
from app.services import partner_service

logger = logging.getLogger(__name__)


# ── 请求/响应模型 ─────────────────────────────────────────────


class WalletRequest(BaseModel):
    trc20_address: str = Field(..., min_length=34, max_length=34)


class WithdrawApproveRequest(BaseModel):
    tx_hash: str = Field(..., min_length=1)


class WithdrawRejectRequest(BaseModel):
    reason: str = Field(..., min_length=1)


# ── 用户端路由 ────────────────────────────────────────────────

user_router = APIRouter(prefix="/api/partner", tags=["partner"])


async def _check_partner_enabled():
    """检查合伙人功能开关。"""
    enabled = await get_config_value("partner_feature_enabled", "true")
    if enabled.lower() not in ("true", "active"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="合伙人功能暂未开放",
        )


@user_router.get("/dashboard")
async def get_dashboard(
    user: UserInfo = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
):
    """合伙人面板数据。"""
    await _check_partner_enabled()
    return await partner_service.get_dashboard(session, user.user_id)


@user_router.get("/referral-code")
async def get_referral_code(
    user: UserInfo = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
):
    """获取我的邀请码。"""
    await _check_partner_enabled()
    return await partner_service.get_referral_code(session, user.user_id)


@user_router.get("/invitations")
async def get_invitations(
    limit: int = Query(default=50, le=100),
    offset: int = Query(default=0, ge=0),
    user: UserInfo = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
):
    """我的邀请记录。"""
    await _check_partner_enabled()
    return await partner_service.get_invitations(session, user.user_id, limit, offset)


@user_router.get("/commissions")
async def get_commissions(
    limit: int = Query(default=50, le=100),
    offset: int = Query(default=0, ge=0),
    user: UserInfo = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
):
    """我的佣金记录。"""
    await _check_partner_enabled()
    return await partner_service.get_commissions(session, user.user_id, limit, offset)


@user_router.get("/wallet")
async def get_wallet(
    user: UserInfo = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
):
    """钱包信息。"""
    await _check_partner_enabled()
    wallet = await partner_service.get_wallet(session, user.user_id)
    return wallet or {"trc20_address": None, "is_verified": False}


@user_router.put("/wallet")
async def upsert_wallet(
    body: WalletRequest,
    user: UserInfo = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
):
    """绑定/修改 TRC20 地址。"""
    await _check_partner_enabled()
    try:
        return await partner_service.upsert_wallet(session, user.user_id, body.trc20_address)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@user_router.post("/withdraw")
async def request_withdrawal(
    user: UserInfo = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
):
    """申请提现。"""
    await _check_partner_enabled()
    try:
        return await partner_service.request_withdrawal(session, user.user_id)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@user_router.get("/withdrawals")
async def get_withdrawals(
    limit: int = Query(default=20, le=50),
    user: UserInfo = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
):
    """提现记录。"""
    await _check_partner_enabled()
    return await partner_service.get_withdrawals(session, user.user_id, limit)


# ── 运营后台路由 ──────────────────────────────────────────────

admin_router = APIRouter(prefix="/api/admin/partner", tags=["admin-partner"])
withdrawal_admin_router = APIRouter(prefix="/api/admin/withdrawals", tags=["admin-withdrawals"])


@admin_router.get("/overview")
async def admin_overview(
    admin: UserInfo = Depends(require_admin),
    session: AsyncSession = Depends(get_db),
):
    """合伙人体系概览统计。"""
    await _check_partner_enabled()
    return await partner_service.get_admin_overview(session)


@admin_router.get("/list")
async def admin_partner_list(
    limit: int = Query(default=50, le=100),
    offset: int = Query(default=0, ge=0),
    admin: UserInfo = Depends(require_admin),
    session: AsyncSession = Depends(get_db),
):
    """合伙人列表。"""
    await _check_partner_enabled()
    return await partner_service.get_admin_partner_list(session, limit, offset)


@admin_router.get("/withdrawals")
async def admin_withdrawals(
    status_filter: str | None = Query(default=None, alias="status"),
    limit: int = Query(default=50, le=100),
    admin: UserInfo = Depends(require_admin),
    session: AsyncSession = Depends(get_db),
):
    """提现审核列表。"""
    await _check_partner_enabled()
    return await partner_service.get_admin_withdrawals(session, status_filter, limit)


@admin_router.post("/withdrawals/{withdrawal_id}/approve")
async def admin_approve_withdrawal(
    withdrawal_id: str,
    body: WithdrawApproveRequest,
    admin: UserInfo = Depends(require_admin),
    session: AsyncSession = Depends(get_db),
):
    """审核通过提现。"""
    await _check_partner_enabled()
    try:
        await partner_service.approve_withdrawal(
            session, withdrawal_id, admin.user_id, body.tx_hash
        )
        return {"message": "提现已通过"}
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@admin_router.post("/withdrawals/{withdrawal_id}/reject")
async def admin_reject_withdrawal(
    withdrawal_id: str,
    body: WithdrawRejectRequest,
    admin: UserInfo = Depends(require_admin),
    session: AsyncSession = Depends(get_db),
):
    """驳回提现。"""
    await _check_partner_enabled()
    try:
        await partner_service.reject_withdrawal(
            session, withdrawal_id, admin.user_id, body.reason
        )
        return {"message": "提现已驳回"}
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@admin_router.get("/{user_id}/detail")
async def admin_partner_detail(
    user_id: str,
    admin: UserInfo = Depends(require_admin),
    session: AsyncSession = Depends(get_db),
):
    """合伙人详情。"""
    await _check_partner_enabled()
    try:
        return await partner_service.get_admin_partner_detail(session, user_id)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))


class PartnerConfigRequest(BaseModel):
    partner_commission_rate: float | None = None
    partner_min_withdrawal: float | None = None
    partner_withdrawal_cooldown_days: int | None = None
    partner_address_cooldown_hours: int | None = None


@admin_router.put("/config")
async def admin_update_config(
    body: PartnerConfigRequest,
    admin: UserInfo = Depends(require_admin),
    session: AsyncSession = Depends(get_db),
):
    """更新合伙人分成配置。"""
    svc = ConfigService(session)
    payload = body.model_dump(exclude_none=True)
    if not payload:
        raise HTTPException(status_code=400, detail="无更新字段")

    updated = []
    for key, val in payload.items():
        result = await svc.update_config(
            key,
            ConfigUpdate(value=str(val)),
            admin_user_id=admin.user_id,
        )
        if result is None:
            raise HTTPException(status_code=400, detail=f"配置不存在: {key}")
        updated.append(key)
    await session.flush()
    return {"message": "配置已更新", "updated": updated}


# ── 提现审核 — 独立前缀路由（规格要求 /api/admin/withdrawals） ────


@withdrawal_admin_router.get("")
async def admin_withdrawals_alt(
    status_filter: str | None = Query(default=None, alias="status"),
    limit: int = Query(default=50, le=100),
    admin: UserInfo = Depends(require_admin),
    session: AsyncSession = Depends(get_db),
):
    """提现审核列表（/api/admin/withdrawals）。"""
    await _check_partner_enabled()
    return await partner_service.get_admin_withdrawals(session, status_filter, limit)


@withdrawal_admin_router.post("/{withdrawal_id}/approve")
async def admin_approve_withdrawal_alt(
    withdrawal_id: str,
    body: WithdrawApproveRequest,
    admin: UserInfo = Depends(require_admin),
    session: AsyncSession = Depends(get_db),
):
    """审核通过提现（/api/admin/withdrawals）。"""
    await _check_partner_enabled()
    try:
        await partner_service.approve_withdrawal(
            session, withdrawal_id, admin.user_id, body.tx_hash
        )
        return {"message": "提现已通过"}
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@withdrawal_admin_router.post("/{withdrawal_id}/reject")
async def admin_reject_withdrawal_alt(
    withdrawal_id: str,
    body: WithdrawRejectRequest,
    admin: UserInfo = Depends(require_admin),
    session: AsyncSession = Depends(get_db),
):
    """驳回提现（/api/admin/withdrawals）。"""
    await _check_partner_enabled()
    try:
        await partner_service.reject_withdrawal(
            session, withdrawal_id, admin.user_id, body.reason
        )
        return {"message": "提现已驳回"}
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
