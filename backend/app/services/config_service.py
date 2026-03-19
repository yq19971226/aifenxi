"""动态配置管理服务 — 缓存、加解密、审计一体化。"""

import json

import structlog
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.encryption import EncryptionModule
from app.core.sql_compat import insert_returning, update_returning, now_func
from app.core.redis import get_redis_pool

logger = structlog.get_logger(__name__)


# ── Pydantic 请求/响应模型 ────────────────────────────────────


class ConfigCreate(BaseModel):
    config_key: str
    value: str
    category: str
    description: str = ""
    is_secret: bool = True


class ConfigUpdate(BaseModel):
    value: str
    description: str | None = None
    is_secret: bool | None = None


class SystemConfigResponse(BaseModel):
    id: str
    config_key: str
    value: str
    category: str
    description: str
    is_secret: bool
    created_at: str
    updated_at: str


class AuditLogResponse(BaseModel):
    id: str
    admin_user_id: str
    config_key: str
    action: str
    old_value_masked: str | None
    new_value_masked: str | None
    created_at: str


# ── ConfigService ─────────────────────────────────────────────


class ConfigService:
    """配置管理服务 — 缓存优先读取、加密存储、变更审计。"""

    CACHE_PREFIX: str = "sys_config:"
    CACHE_TTL: int = 300

    def __init__(self, session: AsyncSession) -> None:
        from app.core.config import settings

        self._session = session
        self._enc = EncryptionModule(settings.jwt_secret_key)

    # ── 内部读取（返回解密明文） ───────────────────────────

    async def get_config(self, key: str, default: str = "") -> str:
        """内部使用：缓存 → 数据库 → default。返回解密后的明文。"""
        cache_key = f"{self.CACHE_PREFIX}{key}"

        # 1. 尝试 Redis 缓存
        try:
            redis = get_redis_pool()
            raw = await redis.get(cache_key)
            if raw is not None:
                cached = json.loads(raw)
                encrypted_value: str = cached["encrypted_value"]
                return self._enc.decrypt(encrypted_value)
        except RuntimeError:
            logger.warning("redis_unavailable", action="get_config", key=key)
        except Exception as exc:
            logger.warning("cache_read_failed", key=key, error=str(exc))

        # 2. 查询数据库
        result = await self._session.execute(
            text(
                "SELECT encrypted_value, is_secret FROM system_configs "
                "WHERE config_key = :key"
            ),
            {"key": key},
        )
        row = result.mappings().first()

        if row is None:
            logger.warning("config_not_found", key=key, using_default=True)
            return default

        encrypted_value = row["encrypted_value"]
        is_secret = row["is_secret"]

        # 3. 写入缓存
        try:
            redis = get_redis_pool()
            cache_data = json.dumps(
                {"encrypted_value": encrypted_value, "is_secret": is_secret}
            )
            await redis.setex(cache_key, self.CACHE_TTL, cache_data)
        except Exception as exc:
            logger.warning("cache_write_failed", key=key, error=str(exc))

        # 4. 解密返回
        return self._enc.decrypt(encrypted_value)

    # ── API 列表查询（掩码） ──────────────────────────────

    async def get_all_configs(
        self, category: str | None = None
    ) -> list[SystemConfigResponse]:
        """API 使用：返回配置列表，敏感值掩码。支持 category 过滤。"""
        if category:
            result = await self._session.execute(
                text(
                    "SELECT id, config_key, encrypted_value, category, "
                    "description, is_secret, created_at, updated_at "
                    "FROM system_configs WHERE category = :category "
                    "ORDER BY category, config_key"
                ),
                {"category": category},
            )
        else:
            result = await self._session.execute(
                text(
                    "SELECT id, config_key, encrypted_value, category, "
                    "description, is_secret, created_at, updated_at "
                    "FROM system_configs ORDER BY category, config_key"
                )
            )

        configs: list[SystemConfigResponse] = []
        for row in result.mappings():
            plaintext = self._enc.decrypt(row["encrypted_value"])
            value = self._enc.mask_value(plaintext) if row["is_secret"] else plaintext
            configs.append(
                SystemConfigResponse(
                    id=str(row["id"]),
                    config_key=row["config_key"],
                    value=value,
                    category=row["category"],
                    description=row["description"] or "",
                    is_secret=row["is_secret"],
                    created_at=str(row["created_at"]),
                    updated_at=str(row["updated_at"]),
                )
            )
        return configs

    # ── API 单条详情（掩码） ──────────────────────────────

    async def get_config_detail(self, key: str) -> SystemConfigResponse | None:
        """API 使用：返回单条配置，敏感值掩码。"""
        result = await self._session.execute(
            text(
                "SELECT id, config_key, encrypted_value, category, "
                "description, is_secret, created_at, updated_at "
                "FROM system_configs WHERE config_key = :key"
            ),
            {"key": key},
        )
        row = result.mappings().first()
        if row is None:
            return None

        plaintext = self._enc.decrypt(row["encrypted_value"])
        value = self._enc.mask_value(plaintext) if row["is_secret"] else plaintext
        return SystemConfigResponse(
            id=str(row["id"]),
            config_key=row["config_key"],
            value=value,
            category=row["category"],
            description=row["description"] or "",
            is_secret=row["is_secret"],
            created_at=str(row["created_at"]),
            updated_at=str(row["updated_at"]),
        )

    # ── 创建配置 ──────────────────────────────────────────

    async def create_config(
        self, data: ConfigCreate, admin_user_id: str
    ) -> SystemConfigResponse:
        """创建配置：加密存储 + 写审计日志 + 清缓存。"""
        encrypted = self._enc.encrypt(data.value)

        result = await insert_returning(
            self._session,
            "INSERT INTO system_configs "
            "(config_key, encrypted_value, category, description, is_secret) "
            "VALUES (:key, :enc_val, :category, :desc, :is_secret) "
            "RETURNING id, config_key, encrypted_value, category, "
            "description, is_secret, created_at, updated_at",
            {
                "key": data.config_key,
                "enc_val": encrypted,
                "category": data.category,
                "desc": data.description,
                "is_secret": data.is_secret,
            },
            table="system_configs",
        )
        row = result.mappings().first()

        # 审计日志
        new_masked = (
            self._enc.mask_value(data.value) if data.is_secret else data.value
        )
        await self._write_audit_log(
            admin_user_id=admin_user_id,
            config_key=data.config_key,
            action="create",
            old_value_masked=None,
            new_value_masked=new_masked,
        )

        # 清缓存
        await self._clear_cache(data.config_key)

        plaintext = self._enc.decrypt(row["encrypted_value"])
        value = self._enc.mask_value(plaintext) if row["is_secret"] else plaintext
        return SystemConfigResponse(
            id=str(row["id"]),
            config_key=row["config_key"],
            value=value,
            category=row["category"],
            description=row["description"] or "",
            is_secret=row["is_secret"],
            created_at=str(row["created_at"]),
            updated_at=str(row["updated_at"]),
        )

    # ── 更新配置 ──────────────────────────────────────────

    async def update_config(
        self, key: str, data: ConfigUpdate, admin_user_id: str
    ) -> SystemConfigResponse | None:
        """更新配置：加密新值 + 写审计日志 + 清缓存。不存在返回 None。"""
        # 查询现有配置
        existing = await self._session.execute(
            text(
                "SELECT id, config_key, encrypted_value, category, "
                "description, is_secret, created_at, updated_at "
                "FROM system_configs WHERE config_key = :key"
            ),
            {"key": key},
        )
        old_row = existing.mappings().first()
        if old_row is None:
            return None

        old_plaintext = self._enc.decrypt(old_row["encrypted_value"])
        old_is_secret: bool = old_row["is_secret"]

        # 构建 UPDATE SET 子句
        sets: list[str] = [f"updated_at = {now_func()}"]
        params: dict = {"key": key}

        encrypted_new = self._enc.encrypt(data.value)
        sets.append("encrypted_value = :enc_val")
        params["enc_val"] = encrypted_new

        if data.description is not None:
            sets.append("description = :desc")
            params["desc"] = data.description

        new_is_secret = data.is_secret if data.is_secret is not None else old_is_secret
        if data.is_secret is not None:
            sets.append("is_secret = :is_secret")
            params["is_secret"] = data.is_secret

        set_clause = ", ".join(sets)
        result = await update_returning(
            self._session,
            f"UPDATE system_configs SET {set_clause} "
            "WHERE config_key = :key "
            "RETURNING id, config_key, encrypted_value, category, "
            "description, is_secret, created_at, updated_at",
            params,
            table="system_configs", where="config_key = :key",
        )
        row = result.mappings().first()

        # 审计日志
        old_masked = (
            self._enc.mask_value(old_plaintext) if old_is_secret else old_plaintext
        )
        new_masked = (
            self._enc.mask_value(data.value) if new_is_secret else data.value
        )
        await self._write_audit_log(
            admin_user_id=admin_user_id,
            config_key=key,
            action="update",
            old_value_masked=old_masked,
            new_value_masked=new_masked,
        )

        # 清缓存
        await self._clear_cache(key)


        plaintext = self._enc.decrypt(row["encrypted_value"])
        value = self._enc.mask_value(plaintext) if row["is_secret"] else plaintext
        return SystemConfigResponse(
            id=str(row["id"]),
            config_key=row["config_key"],
            value=value,
            category=row["category"],
            description=row["description"] or "",
            is_secret=row["is_secret"],
            created_at=str(row["created_at"]),
            updated_at=str(row["updated_at"]),
        )

    # ── 删除配置 ──────────────────────────────────────────

    async def delete_config(self, key: str, admin_user_id: str) -> bool:
        """删除配置：写审计日志 + 清缓存。不存在返回 False。"""
        # 查询现有配置（审计需要旧值）
        existing = await self._session.execute(
            text(
                "SELECT encrypted_value, is_secret "
                "FROM system_configs WHERE config_key = :key"
            ),
            {"key": key},
        )
        old_row = existing.mappings().first()
        if old_row is None:
            return False

        old_plaintext = self._enc.decrypt(old_row["encrypted_value"])
        old_is_secret: bool = old_row["is_secret"]

        # 删除
        await self._session.execute(
            text("DELETE FROM system_configs WHERE config_key = :key"),
            {"key": key},
        )

        # 审计日志
        old_masked = (
            self._enc.mask_value(old_plaintext) if old_is_secret else old_plaintext
        )
        await self._write_audit_log(
            admin_user_id=admin_user_id,
            config_key=key,
            action="delete",
            old_value_masked=old_masked,
            new_value_masked=None,
        )

        # 清缓存
        await self._clear_cache(key)

        return True


    # ── 审计日志查询 ──────────────────────────────────────

    async def get_audit_logs(
        self, page: int = 1, size: int = 20
    ) -> tuple[list[AuditLogResponse], int]:
        """分页查询审计日志。返回 (logs, total_count)。"""
        offset = (page - 1) * size

        # 总数
        count_result = await self._session.execute(
            text("SELECT COUNT(*) AS cnt FROM config_audit_log")
        )
        total: int = count_result.scalar_one()

        # 分页数据
        result = await self._session.execute(
            text(
                "SELECT id, admin_user_id, config_key, action, "
                "old_value_masked, new_value_masked, created_at "
                "FROM config_audit_log "
                "ORDER BY created_at DESC "
                "LIMIT :size OFFSET :offset"
            ),
            {"size": size, "offset": offset},
        )

        logs: list[AuditLogResponse] = []
        for row in result.mappings():
            logs.append(
                AuditLogResponse(
                    id=str(row["id"]),
                    admin_user_id=str(row["admin_user_id"]),
                    config_key=row["config_key"],
                    action=row["action"],
                    old_value_masked=row["old_value_masked"],
                    new_value_masked=row["new_value_masked"],
                    created_at=str(row["created_at"]),
                )
            )
        return logs, total

    # ── 批量预热缓存 ─────────────────────────────────────

    async def load_all_to_cache(self) -> int:
        """批量加载所有配置到 Redis 缓存。返回加载数量。"""
        result = await self._session.execute(
            text(
                "SELECT config_key, encrypted_value, is_secret "
                "FROM system_configs"
            )
        )

        count = 0
        try:
            redis = get_redis_pool()
            for row in result.mappings():
                cache_key = f"{self.CACHE_PREFIX}{row['config_key']}"
                cache_data = json.dumps(
                    {
                        "encrypted_value": row["encrypted_value"],
                        "is_secret": row["is_secret"],
                    }
                )
                await redis.setex(cache_key, self.CACHE_TTL, cache_data)
                count += 1
        except RuntimeError:
            logger.warning("redis_unavailable", action="load_all_to_cache")
        except Exception as exc:
            logger.error("cache_bulk_load_failed", error=str(exc))

        logger.info("config_cache_loaded", count=count)
        return count

    # ── 私有辅助方法 ─────────────────────────────────────

    async def _write_audit_log(
        self,
        admin_user_id: str,
        config_key: str,
        action: str,
        old_value_masked: str | None,
        new_value_masked: str | None,
    ) -> None:
        """写入审计日志。失败时记录错误但不回滚配置变更。"""
        try:
            await self._session.execute(
                text(
                    "INSERT INTO config_audit_log "
                    "(admin_user_id, config_key, action, "
                    "old_value_masked, new_value_masked) "
                    "VALUES (:admin_user_id, :config_key, :action, "
                    ":old_masked, :new_masked)"
                ),
                {
                    "admin_user_id": admin_user_id,
                    "config_key": config_key,
                    "action": action,
                    "old_masked": old_value_masked,
                    "new_masked": new_value_masked,
                },
            )
        except Exception as exc:
            logger.error(
                "audit_log_write_failed",
                config_key=config_key,
                action=action,
                error=str(exc),
            )

    # 配置 key → 独立 Redis 缓存 key 的映射（这些独立缓存由各 API 端点自行管理）
    _EXTRA_CACHE_KEYS: dict[str, list[str]] = {
        "analysis_maintenance_enabled": ["analysis:maintenance_enabled"],
    }

    async def _clear_cache(self, key: str) -> None:
        """清除指定配置的 Redis 缓存。包括独立端点缓存。"""
        try:
            redis = get_redis_pool()
            keys_to_delete = [f"{self.CACHE_PREFIX}{key}"]
            # 同步清除独立缓存 key（如 analysis:maintenance_enabled）
            keys_to_delete.extend(self._EXTRA_CACHE_KEYS.get(key, []))
            await redis.delete(*keys_to_delete)
        except RuntimeError:
            logger.warning("redis_unavailable", action="clear_cache", key=key)
        except Exception as exc:
            logger.warning("cache_clear_failed", key=key, error=str(exc))


# ── 独立辅助函数（非请求上下文使用） ─────────────────────────


async def get_config_value(key: str, default: str = "") -> str:
    """独立辅助函数 — 创建临时会话读取单条配置。供非请求上下文使用。"""
    from app.core.database import AsyncSessionLocal

    async with AsyncSessionLocal() as session:
        svc = ConfigService(session)
        return await svc.get_config(key, default)


async def set_config_value(
    key: str,
    value: str,
    category: str = "general",
    description: str = "",
    is_secret: bool = False,
) -> None:
    """独立辅助函数 — 创建或更新单条配置。供非请求上下文使用（如 model_router）。"""
    from app.core.database import AsyncSessionLocal

    async with AsyncSessionLocal() as session:
        svc = ConfigService(session)
        # 检查是否已存在
        existing = await svc.get_config_detail(key)
        if existing:
            await svc.update_config(
                key,
                ConfigUpdate(value=value, description=description, is_secret=is_secret),
                admin_user_id="system",
            )
        else:
            await svc.create_config(
                ConfigCreate(
                    config_key=key,
                    value=value,
                    category=category,
                    description=description,
                    is_secret=is_secret,
                ),
                admin_user_id="system",
            )
        await session.commit()
