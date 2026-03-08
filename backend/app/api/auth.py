"""用户认证 API 路由 — 注册/登录/刷新token/当前用户。

路由层只做参数校验和响应格式化，认证逻辑在 security.py。
"""

import logging
import secrets
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordRequestForm
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.sql_compat import update_returning

from app.core.auth_rate_limit import check_login_rate, check_register_rate, check_reset_rate
from app.core.database import get_db
from app.core.deps import UserInfo, get_current_user
from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    verify_password,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/auth", tags=["auth"])


# ── 请求/响应模型 ─────────────────────────────────────────────


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=8, description="密码至少8位")
    referral_code: str | None = Field(None, description="邀请码（可选）")


class RegisterResponse(BaseModel):
    user_id: str
    email: str
    message: str


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class RefreshRequest(BaseModel):
    refresh_token: str


class RefreshResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


# ── 路由 ──────────────────────────────────────────────────────


@router.get("/register-config")
async def register_config() -> dict:
    """公开端点：返回注册页配置（是否强制邀请码等）。"""
    from app.services.config_service import get_config_value
    required = (await get_config_value("register_referral_required", "false")).lower() == "true"
    return {"referral_required": required}


@router.post("/register", response_model=RegisterResponse, status_code=status.HTTP_201_CREATED)
async def register(
    body: RegisterRequest,
    request: Request,
    session: AsyncSession = Depends(get_db),
) -> RegisterResponse:
    await check_register_rate(request)
    """注册新用户，同时创建免费会员记录。"""
    try:
        # 检查邮箱唯一性
        existing = await session.execute(
            text("SELECT id FROM users WHERE email = :email"),
            {"email": body.email},
        )
        if existing.first() is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="该邮箱已注册",
            )

        # 强制邀请码检查
        from app.services.config_service import get_config_value as _gcv
        referral_required = (await _gcv("register_referral_required", "false")).lower() == "true"

        # 处理邀请码 → 查找邀请人
        referred_by = None
        if body.referral_code:
            referrer = await session.execute(
                text("SELECT id FROM users WHERE referral_code = :code AND is_active = true"),
                {"code": body.referral_code.upper().strip()},
            )
            referrer_row = referrer.first()
            if referrer_row:
                referred_by = str(referrer_row[0])
            elif referral_required:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="邀请码无效",
                )
        elif referral_required:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="当前注册需要填写邀请码",
            )

        # 生成新用户专属邀请码
        new_referral_code = await _generate_unique_referral_code(session)

        # 创建用户
        hashed = hash_password(body.password)
        user_id = str(uuid.uuid4())
        await session.execute(
            text(
                """
                INSERT INTO users (id, email, password_hash, referral_code, referred_by, referred_at)
                VALUES (:id, :email, :password_hash, :referral_code, :referred_by, :referred_at)
                """
            ),
            {
                "id": user_id,
                "email": body.email,
                "password_hash": hashed,
                "referral_code": new_referral_code,
                "referred_by": referred_by,
                "referred_at": datetime.now(timezone.utc).isoformat() if referred_by else None,
            },
        )

        # 创建免费会员记录（level=0）
        await session.execute(
            text(
                """
                INSERT INTO memberships (id, user_id, level)
                VALUES (:id, :user_id, 0)
                """
            ),
            {"id": str(uuid.uuid4()), "user_id": user_id},
        )

        # 创建默认推送设置
        await session.execute(
            text(
                """
                INSERT INTO push_settings (id, user_id)
                VALUES (:id, :user_id)
                """
            ),
            {"id": str(uuid.uuid4()), "user_id": user_id},
        )

        # 赠送新用户 bonus_credits（从动态配置读取，默认 5 次）
        bonus_msg = ""
        try:
            from app.services.config_service import get_config_value
            from app.services.analysis_quota import AnalysisQuotaService
            from app.models.analysis import AnalysisMode
            from uuid import UUID as _UUID

            bonus_enabled = (await get_config_value("new_user_bonus_enabled", "true")).lower() == "true"
            if bonus_enabled:
                bonus_amount = int(await get_config_value("new_user_bonus_credits", "5"))
                if bonus_amount > 0:
                    quota_svc = AnalysisQuotaService()
                    uid = _UUID(user_id)
                    for mode in AnalysisMode:
                        await quota_svc.add_bonus_credits(uid, mode, bonus_amount)
                    bonus_msg = f"，赠送 {bonus_amount} 次分析体验"
                    logger.info("新用户 bonus_credits 赠送: user_id=%s, amount=%d", user_id, bonus_amount)
        except Exception as exc:
            logger.warning("新用户 bonus_credits 赠送失败（非致命）: %s", exc)

        # get_db 会自动 commit
        return RegisterResponse(
            user_id=user_id,
            email=body.email,
            message=f"注册成功{bonus_msg}",
        )
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("register failed: %s", exc)
        raise HTTPException(status_code=500, detail="注册失败，请稍后重试")


@router.post("/login", response_model=TokenResponse)
async def login(
    request: Request,
    form_data: OAuth2PasswordRequestForm = Depends(),
    session: AsyncSession = Depends(get_db),
) -> TokenResponse:
    await check_login_rate(request)
    """登录（OAuth2 兼容，username 字段传 email）。"""
    invalid_exc = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="邮箱或密码错误",
        headers={"WWW-Authenticate": "Bearer"},
    )

    try:
        result = await session.execute(
            text("SELECT id, email, password_hash, is_active, COALESCE(role, 'user') AS role FROM users WHERE email = :email"),
            {"email": form_data.username},
        )
        row = result.mappings().first()
    except Exception as exc:
        logger.error("login DB query failed: %s", exc)
        raise HTTPException(status_code=500, detail="登录失败，请稍后重试")

    if row is None:
        raise invalid_exc
    if not verify_password(form_data.password, row["password_hash"]):
        raise invalid_exc

    if not row["is_active"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="用户已停用",
        )

    user_id = str(row["id"])
    return TokenResponse(
        access_token=create_access_token(user_id, row["email"]),
        refresh_token=create_refresh_token(user_id),
    )


@router.post("/refresh", response_model=RefreshResponse)
async def refresh(
    body: RefreshRequest,
    session: AsyncSession = Depends(get_db),
) -> RefreshResponse:
    """使用 refresh_token 获取新的 access_token。"""
    try:
        payload = decode_token(body.refresh_token)
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="refresh_token 无效或已过期",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if payload.get("type") != "refresh":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="token 类型错误",
        )

    user_id: str | None = payload.get("sub")
    if user_id is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="token 无效",
        )

    # 验证用户仍然存在且活跃
    try:
        result = await session.execute(
            text("SELECT id, email, is_active FROM users WHERE id = :user_id"),
            {"user_id": user_id},
        )
        row = result.mappings().first()
    except Exception as exc:
        logger.error("refresh DB query failed: %s", exc)
        raise HTTPException(status_code=500, detail="刷新失败，请稍后重试")

    if row is None or not row["is_active"]:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="用户不存在或已停用",
        )

    return RefreshResponse(
        access_token=create_access_token(str(row["id"]), row["email"]),
    )


@router.get("/me", response_model=UserInfo)
async def get_me(user: UserInfo = Depends(get_current_user)) -> UserInfo:
    """获取当前登录用户信息。"""
    return user


# ── 密码重置 ──────────────────────────────────────────────────


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    email: EmailStr
    code: str = Field(..., min_length=6, max_length=6)
    new_password: str = Field(..., min_length=8)


_RESET_CODE_TTL = 600  # 10 min
_RESET_CODE_PREFIX = "pwd_reset:"


@router.post("/forgot-password")
async def forgot_password(
    body: ForgotPasswordRequest,
    request: Request,
    session: AsyncSession = Depends(get_db),
) -> dict[str, str]:
    await check_reset_rate(request)
    """发送密码重置验证码到用户邮箱。"""
    # 始终返回成功（防止邮箱枚举）
    result = await session.execute(
        text("SELECT id FROM users WHERE email = :email AND is_active = true"),
        {"email": body.email},
    )
    row = result.first()
    if row is None:
        return {"message": "如果邮箱已注册，验证码将发送到邮箱"}

    # 生成 6 位数字验证码
    code = "".join(secrets.choice("0123456789") for _ in range(6))

    # 存入 Redis
    from app.core.redis import set_with_ttl
    await set_with_ttl(f"{_RESET_CODE_PREFIX}{body.email}", code, _RESET_CODE_TTL)

    # 发送邮件
    try:
        from app.services.notification.email import send_raw_email
        html = f"""
        <div style="font-family:sans-serif;max-width:400px;margin:0 auto;padding:24px;background:#131316;border-radius:12px;border:1px solid rgba(255,255,255,0.08);">
            <h2 style="color:#e4e4e7;font-size:18px;margin:0 0 16px;">密码重置验证码</h2>
            <div style="background:rgba(99,102,241,0.1);border:1px solid rgba(99,102,241,0.2);border-radius:8px;padding:16px;text-align:center;margin-bottom:16px;">
                <span style="font-size:32px;letter-spacing:8px;font-weight:700;color:#818cf8;font-family:monospace;">{code}</span>
            </div>
            <p style="color:#a1a1aa;font-size:13px;margin:0;">验证码 10 分钟内有效。如果不是您本人操作，请忽略此邮件。</p>
        </div>
        """
        await send_raw_email(body.email, "[Axiom] 密码重置验证码", html)
    except Exception as exc:
        logger.warning("密码重置邮件发送失败: %s", exc)

    return {"message": "如果邮箱已注册，验证码将发送到邮箱"}


@router.post("/reset-password")
async def reset_password(
    body: ResetPasswordRequest,
    request: Request,
    session: AsyncSession = Depends(get_db),
) -> dict[str, str]:
    await check_reset_rate(request)
    """验证验证码并重置密码。"""
    from app.core.redis import get_json, get_redis_pool

    stored_code = await get_json(f"{_RESET_CODE_PREFIX}{body.email}")
    if stored_code is None or str(stored_code) != body.code:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="验证码无效或已过期",
        )

    # 更新密码
    hashed = hash_password(body.new_password)
    result = await update_returning(
        session,
        "UPDATE users SET password_hash = :hash WHERE email = :email AND is_active = true RETURNING id",
        {"hash": hashed, "email": body.email},
        table="users", where="email = :email AND is_active = true",
    )
    if result.first() is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="用户不存在或已停用",
        )

    # 删除验证码
    redis = get_redis_pool()
    await redis.delete(f"{_RESET_CODE_PREFIX}{body.email}")

    return {"message": "密码重置成功，请使用新密码登录"}


# ── 内部辅助函数 ──────────────────────────────────────────────


async def _generate_unique_referral_code(session: AsyncSession, length: int = 8) -> str:
    """生成唯一的 8 位邀请码（大写字母 + 数字，排除易混淆字符）。"""
    alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"  # 排除 I/O/0/1
    for _ in range(10):
        code = "".join(secrets.choice(alphabet) for _ in range(length))
        existing = await session.execute(
            text("SELECT 1 FROM users WHERE referral_code = :code"),
            {"code": code},
        )
        if existing.first() is None:
            return code
    raise RuntimeError("无法生成唯一邀请码，请重试")
