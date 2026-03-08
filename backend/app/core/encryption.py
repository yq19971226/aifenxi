"""Fernet 对称加密模块，基于 secret_key 派生密钥。"""

import base64
import hashlib

import structlog
from cryptography.fernet import Fernet, InvalidToken

logger = structlog.get_logger(__name__)


class EncryptionModule:
    """Fernet 加解密，基于 secret_key 派生密钥。

    使用 SHA-256 哈希将任意长度的 secret_key 转换为 32 字节，
    再 base64url 编码为 Fernet 兼容的 44 字节密钥。
    """

    def __init__(self, secret_key: str) -> None:
        raw = hashlib.sha256(secret_key.encode()).digest()
        fernet_key = base64.urlsafe_b64encode(raw)
        self._fernet = Fernet(fernet_key)

    def encrypt(self, plaintext: str) -> str:
        """加密明文，返回 base64 Fernet token 字符串。"""
        token: bytes = self._fernet.encrypt(plaintext.encode())
        return token.decode()

    def decrypt(self, ciphertext: str) -> str:
        """解密密文。失败时记录错误日志并返回空字符串。"""
        try:
            plaintext: bytes = self._fernet.decrypt(ciphertext.encode())
            return plaintext.decode()
        except (InvalidToken, Exception) as exc:
            logger.error("decrypt_failed", error=str(exc))
            return ""

    def mask_value(self, value: str) -> str:
        """掩码处理：长度 ≥ 4 返回 '****' + 最后4字符，否则返回 '****'。"""
        if len(value) >= 4:
            return "****" + value[-4:]
        return "****"
