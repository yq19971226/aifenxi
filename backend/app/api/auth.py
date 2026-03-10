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
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.sql_compat import update_returning

from app.core.auth_rate_limit import check_login_rate, check_register_rate, check_reset_rate, check_refresh_rate
from app.core.database import get_db
from app.core.deps import UserInfo, get_current_user
from app.core.i18n_errors import localized_http_exception
from app.core.i18n_middleware import get_locale_from_request
from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    verify_password,
)
from app.services.notification.email import (
    RegisterCodeEmailData,
    ResetCodeEmailData,
    send_register_code_email,
    send_reset_code_email,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/auth", tags=["auth"])



def _normalize_email(email: str) -> str:
    """邮箱归一化：小写 + 去空白。

    RFC 5321 的 local-part 理论上区分大小写，但所有主流服务商
    （Gmail/Outlook/QQ/iCloud）均不区分，行业惯例全部 lower。
    """
    return email.lower().strip()


def _is_enabled(raw: str) -> bool:
    return raw.strip().lower() == "true"


async def _get_registration_flags() -> tuple[bool, bool]:
    from app.services.config_service import get_config_value

    register_enabled = _is_enabled(await get_config_value("register_feature_enabled", "true"))
    referral_required = _is_enabled(await get_config_value("register_referral_required", "false"))
    return register_enabled, referral_required


async def _ensure_registration_enabled(request_locale: str) -> None:
    register_enabled, _ = await _get_registration_flags()
    if register_enabled:
        return
    raise localized_http_exception(
        status_code=status.HTTP_403_FORBIDDEN,
        error_key="auth.registration_disabled",
        locale=request_locale,
    )


# ── 请求/响应模型 ─────────────────────────────────────────────


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=8, description="密码至少8位")
    code: str = Field(..., min_length=6, max_length=6, description="邮箱验证码")
    referral_code: str | None = Field(None, description="邀请码（可选）")


class RegisterResponse(BaseModel):
    user_id: str
    email: str
    message: str
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class RefreshRequest(BaseModel):
    refresh_token: str


class RefreshResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class RegisterCodeRequest(BaseModel):
    email: EmailStr


# ── 路由 ──────────────────────────────────────────────────────


@router.get("/register-config")
async def register_config() -> dict:
    """公开端点：返回注册页配置（是否强制邀请码等）。"""
    register_enabled, referral_required = await _get_registration_flags()
    return {"register_enabled": register_enabled, "referral_required": referral_required}


@router.post("/send-register-code")
async def send_register_code(
    body: RegisterCodeRequest,
    request: Request,
    session: AsyncSession = Depends(get_db),
) -> dict[str, str]:
    """发送注册验证码到邮箱。"""
    await check_register_rate(request)

    email = _normalize_email(body.email)
    request_locale = get_locale_from_request(request)
    await _ensure_registration_enabled(request_locale)
    from app.core.redis import get_redis_pool

    try:
        redis = get_redis_pool()
    except Exception as exc:
        logger.exception("send_register_code Redis 不可用: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="验证码服务暂时不可用，请稍后重试",
        )
    redis_key = f"{_REGISTER_CODE_PREFIX}{email}"
    cooldown_key = f"{_REGISTER_COOLDOWN_PREFIX}{email}"
    email_window_key = f"{_REGISTER_EMAIL_WINDOW_PREFIX}{email}"
    cooldown_ttl = await redis.ttl(cooldown_key)
    if cooldown_ttl > 0:
        raise localized_http_exception(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            error_key="auth.register_code_cooldown",
            locale=request_locale,
            seconds=max(cooldown_ttl, 1),
        )

    existing = await session.execute(
        text("SELECT id FROM users WHERE LOWER(email) = :email"),
        {"email": email},
    )
    if existing.first() is not None:
        raise localized_http_exception(
            status_code=status.HTTP_409_CONFLICT,
            error_key="auth.email_already_registered",
            locale=request_locale,
        )

    email_send_count = await redis.incr(email_window_key)
    if email_send_count == 1:
        await redis.expire(email_window_key, _REGISTER_EMAIL_WINDOW_TTL)
    if email_send_count > _REGISTER_EMAIL_WINDOW_LIMIT:
        email_window_ttl = await redis.ttl(email_window_key)
        raise localized_http_exception(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            error_key="auth.register_code_email_rate_limited",
            locale=request_locale,
            seconds=max(email_window_ttl, 1),
        )

    code = "".join(secrets.choice("0123456789") for _ in range(6))
    from app.core.redis import set_with_ttl
    await set_with_ttl(redis_key, {"code": code, "failures": 0}, _REGISTER_CODE_TTL)
    await redis.setex(cooldown_key, _REGISTER_COOLDOWN_TTL, "1")
    try:
        await send_register_code_email(email, RegisterCodeEmailData(code=code, locale=request_locale))
    except Exception as exc:
        logger.warning("注册验证码邮件发送失败: %s", exc)

    return {"message": _get_auth_message("register_code.sent", request_locale)}


@router.post("/register", response_model=RegisterResponse, status_code=status.HTTP_201_CREATED)
async def register(
    body: RegisterRequest,
    request: Request,
    session: AsyncSession = Depends(get_db),
) -> RegisterResponse:
    """注册新用户，同时创建免费会员记录并返回登录凭证。"""
    await check_register_rate(request)

    email = _normalize_email(body.email)
    request_locale = get_locale_from_request(request)
    await _ensure_registration_enabled(request_locale)

    try:
        # 检查邮箱唯一性（LOWER 兼容存量混合大小写数据）
        existing = await session.execute(
            text("SELECT id FROM users WHERE LOWER(email) = :email"),
            {"email": email},
        )
        if existing.first() is not None:
            raise localized_http_exception(
                status_code=status.HTTP_409_CONFLICT,
                error_key="auth.email_already_registered",
                locale=request_locale,
            )

        from app.core.redis import get_json, get_redis_pool, set_with_ttl

        register_code_key = f"{_REGISTER_CODE_PREFIX}{email}"
        stored_payload = await get_json(register_code_key)
        stored_code = stored_payload.get("code") if isinstance(stored_payload, dict) else stored_payload
        failure_count = (
            int(stored_payload.get("failures", 0) or 0)
            if isinstance(stored_payload, dict)
            else 0
        )
        code_matches = stored_code is not None and str(stored_code) == body.code
        if not code_matches:
            redis = get_redis_pool()
            next_failure_count = failure_count + 1
            register_code_ttl = await redis.ttl(register_code_key)
            if isinstance(stored_payload, dict) and register_code_ttl > 0:
                if next_failure_count >= _REGISTER_CODE_MAX_FAILURES:
                    await redis.delete(register_code_key)
                else:
                    await set_with_ttl(
                        register_code_key,
                        {"code": str(stored_code), "failures": next_failure_count},
                        register_code_ttl,
                    )
            elif next_failure_count >= _REGISTER_CODE_MAX_FAILURES:
                await redis.delete(register_code_key)

            if next_failure_count >= _REGISTER_CODE_MAX_FAILURES:
                raise localized_http_exception(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    error_key="auth.register_code_too_many_attempts",
                    locale=request_locale,
                )
            raise localized_http_exception(
                status_code=status.HTTP_400_BAD_REQUEST,
                error_key="auth.register_code_invalid",
                locale=request_locale,
            )

        # 强制邀请码检查
        _, referral_required = await _get_registration_flags()

        # 处理邀请码 → 查找邀请人（统一错误信息防止邀请码枚举）
        _referral_invalid_msg = "请填写有效的邀请码"
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
                    detail=_referral_invalid_msg,
                )
        elif referral_required:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=_referral_invalid_msg,
            )

        # 生成新用户专属邀请码
        new_referral_code = await _generate_unique_referral_code(session)

        # 创建用户（email 存储归一化后的小写形式）
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
                "email": email,
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

        # 显式 flush 确保 DB 写入在当前事务中可见，
        # 然后手动 commit 避免 token-before-commit 竞态
        # (FastAPI yield 依赖的 commit 在响应发送后才执行)
        await session.flush()
        await session.commit()

        access_tok = create_access_token(user_id, email)
        refresh_tok = create_refresh_token(user_id)

        try:
            redis = get_redis_pool()
            await redis.delete(register_code_key)
        except Exception as redis_exc:
            logger.warning("注册成功后删除验证码 Redis 键失败（可忽略）: %s", redis_exc)

        return RegisterResponse(
            user_id=user_id,
            email=email,
            message=f"{_get_auth_message('register.success', request_locale)}{bonus_msg}",
            access_token=access_tok,
            refresh_token=refresh_tok,
        )
    except HTTPException:
        raise
    except IntegrityError:
        logger.warning("register IntegrityError (likely duplicate email): %s", email)
        raise localized_http_exception(
            status_code=status.HTTP_409_CONFLICT,
            error_key="auth.email_already_registered",
            locale=request_locale,
        )
    except RuntimeError as exc:
        if "邀请码" in str(exc) or "referral" in str(exc).lower():
            logger.warning("register referral code generation failed: %s", exc)
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="暂时无法完成注册，请稍后重试",
            )
        raise
    except Exception as exc:
        logger.exception("register failed: %s", exc)
        raise HTTPException(status_code=500, detail="注册失败，请稍后重试")


@router.post("/login", response_model=TokenResponse)
async def login(
    request: Request,
    form_data: OAuth2PasswordRequestForm = Depends(),
    session: AsyncSession = Depends(get_db),
) -> TokenResponse:
    """登录（OAuth2 兼容，username 字段传 email）。"""
    await check_login_rate(request)

    email = _normalize_email(form_data.username)
    invalid_exc = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="邮箱或密码错误",
        headers={"WWW-Authenticate": "Bearer"},
    )

    try:
        # LOWER() 兼容存量混合大小写数据
        result = await session.execute(
            text("SELECT id, email, password_hash, is_active, COALESCE(role, 'user') AS role FROM users WHERE LOWER(email) = :email"),
            {"email": email},
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
    request: Request,
    body: RefreshRequest,
    session: AsyncSession = Depends(get_db),
) -> RefreshResponse:
    """使用 refresh_token 获取新的 access_token。"""
    await check_refresh_rate(request)
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
_REGISTER_CODE_TTL = 600  # 10 min
_REGISTER_CODE_PREFIX = "register_code:"
_REGISTER_COOLDOWN_TTL = 60
_REGISTER_COOLDOWN_PREFIX = "register_code_cooldown:"
_REGISTER_EMAIL_WINDOW_TTL = 3600
_REGISTER_EMAIL_WINDOW_LIMIT = 5
_REGISTER_EMAIL_WINDOW_PREFIX = "register_code_email_window:"
_REGISTER_CODE_MAX_FAILURES = 5
_AUTH_RESPONSE_MESSAGES: dict[str, dict[str, str]] = {
    "register_code.sent": {
        "zh-CN": "验证码已发送到邮箱，请在 10 分钟内完成注册",
        "zh-TW": "驗證碼已發送至信箱，請在 10 分鐘內完成註冊",
        "en": "Verification code sent. Please complete registration within 10 minutes.",
    },
    "register.success": {
        "zh-CN": "注册成功",
        "zh-TW": "註冊成功",
        "en": "Registration successful",
    },
    "forgot_password.sent": {
        "zh-CN": "如果邮箱已注册，验证码将发送到邮箱",
        "zh-TW": "如果信箱已註冊，驗證碼將發送到信箱",
        "en": "If the email is registered, a verification code will be sent.",
    },
    "reset_password.success": {
        "zh-CN": "密码重置成功，请使用新密码登录",
        "zh-TW": "密碼重置成功，請使用新密碼登入",
        "en": "Password reset successful. Please sign in with your new password.",
    },
}


def _get_auth_message(key: str, locale: str) -> str:
    """获取认证接口的本地化响应文案。"""
    messages = _AUTH_RESPONSE_MESSAGES.get(key, {})
    if locale in messages:
        return messages[locale]
    if locale.startswith("zh"):
        return messages.get("zh-CN", key)
    return messages.get("en", key)


@router.post("/forgot-password")
async def forgot_password(
    body: ForgotPasswordRequest,
    request: Request,
    session: AsyncSession = Depends(get_db),
) -> dict[str, str]:
    """发送密码重置验证码到用户邮箱。"""
    await check_reset_rate(request)

    email = _normalize_email(body.email)
    request_locale = get_locale_from_request(request)

    # 始终返回成功（防止邮箱枚举）
    result = await session.execute(
        text(
            """
            SELECT u.id, up.locale
            FROM users u
            LEFT JOIN user_preferences up ON up.user_id = u.id
            WHERE LOWER(u.email) = :email AND u.is_active = true
            """
        ),
        {"email": email},
    )
    row = result.mappings().first()
    if row is None:
        return {"message": _get_auth_message("forgot_password.sent", request_locale)}

    # 生成 6 位数字验证码
    code = "".join(secrets.choice("0123456789") for _ in range(6))

    # 存入 Redis（key 用归一化邮箱，确保 forgot 和 reset 一致）
    from app.core.redis import set_with_ttl
    redis_key = f"{_RESET_CODE_PREFIX}{email}"
    await set_with_ttl(redis_key, code, _RESET_CODE_TTL)

    # 开发模式兜底：未配置邮件服务时，验证码打印到后端日志
    logger.info("=== 密码重置验证码 === email=%s code=%s (开发模式可见，生产环境请配置 resend_api_key 或 sendgrid_api_key) ===", email, code)

    try:
        locale = row["locale"] or request_locale
        await send_reset_code_email(email, ResetCodeEmailData(code=code, locale=locale))
    except Exception as exc:
        logger.warning("密码重置邮件发送失败: %s", exc)

    return {"message": _get_auth_message("forgot_password.sent", request_locale)}


@router.post("/reset-password")
async def reset_password(
    body: ResetPasswordRequest,
    request: Request,
    session: AsyncSession = Depends(get_db),
) -> dict[str, str]:
    """验证验证码并重置密码。"""
    await check_reset_rate(request)

    email = _normalize_email(body.email)
    request_locale = get_locale_from_request(request)
    from app.core.redis import get_json, get_redis_pool

    # Redis key 用归一化邮箱，与 forgot-password 一致
    redis_key = f"{_RESET_CODE_PREFIX}{email}"
    stored_code = await get_json(redis_key)

    if stored_code is None or str(stored_code) != body.code:
        raise localized_http_exception(
            status_code=status.HTTP_400_BAD_REQUEST,
            error_key="auth.reset_code_invalid",
            locale=request_locale,
        )

    # 更新密码（LOWER 兼容存量）
    hashed = hash_password(body.new_password)
    result = await update_returning(
        session,
        "UPDATE users SET password_hash = :hash WHERE LOWER(email) = :email AND is_active = true RETURNING id",
        {"hash": hashed, "email": email},
        table="users", where="LOWER(email) = :email AND is_active = true",
    )
    if result.first() is None:
        raise localized_http_exception(
            status_code=status.HTTP_400_BAD_REQUEST,
            error_key="auth.user_not_found_or_disabled",
            locale=request_locale,
        )

    # 删除验证码
    redis = get_redis_pool()
    await redis.delete(f"{_RESET_CODE_PREFIX}{email}")

    return {"message": _get_auth_message("reset_password.success", request_locale)}


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
