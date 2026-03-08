"""JWT 生成/验证 + 密码哈希工具。

所有安全相关配置从 Settings 读取，禁止硬编码密钥。
"""

import logging
from datetime import datetime, timedelta, timezone

import bcrypt
from jose import JWTError, jwt

from app.core.config import settings

logger = logging.getLogger(__name__)


def hash_password(password: str) -> str:
    """使用 bcrypt 对明文密码进行哈希。"""
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    """验证明文密码与 bcrypt 哈希是否匹配。"""
    return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))


def create_access_token(user_id: str, email: str) -> str:
    """生成 access_token（有效期由 settings 控制，默认 1h）。"""
    expire = datetime.now(timezone.utc) + timedelta(
        minutes=settings.access_token_expire_minutes,
    )
    payload = {
        "sub": user_id,
        "email": email,
        "exp": expire,
        "type": "access",
    }
    return jwt.encode(payload, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)


def create_refresh_token(user_id: str) -> str:
    """生成 refresh_token（有效期由 settings 控制，默认 7d）。"""
    expire = datetime.now(timezone.utc) + timedelta(
        days=settings.refresh_token_expire_days,
    )
    payload = {
        "sub": user_id,
        "exp": expire,
        "type": "refresh",
    }
    return jwt.encode(payload, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)


def decode_token(token: str) -> dict:
    """解码并验证 JWT，过期或无效时抛出异常。"""
    try:
        payload: dict = jwt.decode(
            token,
            settings.jwt_secret_key,
            algorithms=[settings.jwt_algorithm],
        )
        return payload
    except JWTError as exc:
        logger.warning("JWT decode failed: %s", exc)
        raise
