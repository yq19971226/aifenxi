"""币种注册表 — 管理系统支持的交易对。

`DEFAULT_SYMBOLS` 仅用于数据库不可用时的冷启动回退。
运行时应统一通过 `get_active_symbols()` / `get_active_symbols_sync()` 获取启用币种。
"""

import asyncio
import logging

from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.redis import publish_stream
from app.core.sql_compat import now_func

logger = logging.getLogger(__name__)

DEFAULT_SYMBOLS: list[str] = [
    "BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT", "XRPUSDT",
]


async def get_active_symbols() -> list[str]:
    """从数据库读取已启用币种列表，失败时回退到 DEFAULT_SYMBOLS。

    这是运行时获取币种的唯一推荐入口。
    """
    try:
        from app.core.database import AsyncSessionLocal
        async with AsyncSessionLocal() as session:
            result = await session.execute(
                text("SELECT symbol FROM symbol_registry WHERE enabled = true ORDER BY created_at")
            )
            symbols = [row[0] for row in result.fetchall()]
            if symbols:
                return symbols
    except Exception as exc:
        logger.warning("get_active_symbols: DB read failed, using defaults: %s", exc)
    return list(DEFAULT_SYMBOLS)


def get_active_symbols_sync() -> list[str]:
    """同步版本 — 供 Celery Worker 等非 async 上下文使用。"""
    try:
        return asyncio.run(get_active_symbols())
    except Exception as exc:
        logger.warning("get_active_symbols_sync failed: %s", exc)
        return list(DEFAULT_SYMBOLS)


class SymbolConfig(BaseModel):
    """交易对配置。"""
    symbol: str
    display_name: str
    collect_interval_sec: int = 60
    enabled: bool = True
    has_onchain: bool = True
    has_derivatives: bool = True
    error_count: int = 0


class SymbolRegistry:
    """币种注册表 — 管理系统支持的交易对。"""

    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def list_symbols(self, enabled_only: bool = True) -> list[SymbolConfig]:
        """返回所有（或仅启用的）交易对配置。"""
        if enabled_only:
            sql = text("""
                SELECT symbol, display_name, collect_interval_sec, enabled,
                       has_onchain, has_derivatives, error_count
                FROM symbol_registry WHERE enabled = true
                ORDER BY created_at
            """)
        else:
            sql = text("""
                SELECT symbol, display_name, collect_interval_sec, enabled,
                       has_onchain, has_derivatives, error_count
                FROM symbol_registry ORDER BY created_at
            """)
        result = await self._session.execute(sql)
        return [SymbolConfig(**row) for row in result.mappings()]

    async def add_symbol(self, config: SymbolConfig) -> SymbolConfig:
        """管理员添加新交易对。"""
        await self._session.execute(
            text("""
                INSERT INTO symbol_registry
                    (symbol, display_name, collect_interval_sec, enabled, has_onchain, has_derivatives)
                VALUES
                    (:symbol, :display_name, :collect_interval_sec, :enabled, :has_onchain, :has_derivatives)
                ON CONFLICT (symbol) DO UPDATE SET
                    display_name = EXCLUDED.display_name,
                    collect_interval_sec = EXCLUDED.collect_interval_sec,
                    enabled = EXCLUDED.enabled,
                    has_onchain = EXCLUDED.has_onchain,
                    has_derivatives = EXCLUDED.has_derivatives
            """),
            config.model_dump(exclude={"error_count"}),
        )
        return config

    async def update_symbol(self, symbol: str, **kwargs: object) -> SymbolConfig:
        """更新交易对配置（启用/禁用、采集间隔等）。"""
        sets: list[str] = []
        params: dict[str, object] = {"symbol": symbol}
        allowed_keys = ("enabled", "collect_interval_sec", "has_onchain", "has_derivatives", "error_count")
        for key, value in kwargs.items():
            if key in allowed_keys:
                sets.append(f"{key} = :{key}")
                params[key] = value

        if sets:
            set_clause = ", ".join(sets)
            await self._session.execute(
                text(f"UPDATE symbol_registry SET {set_clause}, updated_at = {now_func()} WHERE symbol = :symbol"),
                params,
            )

        result = await self._session.execute(
            text("""
                SELECT symbol, display_name, collect_interval_sec, enabled,
                       has_onchain, has_derivatives, error_count
                FROM symbol_registry WHERE symbol = :symbol
            """),
            {"symbol": symbol},
        )
        row = result.mappings().first()
        if row is None:
            raise ValueError(f"交易对 {symbol} 不存在")
        return SymbolConfig(**row)

    async def mark_error(self, symbol: str, error_count: int) -> None:
        """标记采集失败次数，连续3次 → 禁用 + 告警。"""
        await self._session.execute(
            text(f"UPDATE symbol_registry SET error_count = :count, updated_at = {now_func()} WHERE symbol = :symbol"),
            {"count": error_count, "symbol": symbol},
        )
        if error_count >= 3:
            await self._session.execute(
                text(f"UPDATE symbol_registry SET enabled = false, updated_at = {now_func()} WHERE symbol = :symbol"),
                {"symbol": symbol},
            )
            try:
                await publish_stream("telegram_alerts", {
                    "type": "admin_alert",
                    "message": f"⚠️ 交易对 {symbol} 连续{error_count}次采集失败，已自动禁用",
                })
            except Exception as exc:
                logger.error("发送管理员告警失败: %s", exc)
            logger.warning("交易对 %s 连续%d次采集失败，已自动禁用", symbol, error_count)

    async def soft_delete(self, symbol: str) -> bool:
        """软删除交易对（设置 enabled=false）。返回是否找到并删除。"""
        result = await self._session.execute(
            text(f"""
                UPDATE symbol_registry SET enabled = false, updated_at = {now_func()}
                WHERE symbol = :symbol AND enabled = true
            """),
            {"symbol": symbol},
        )
        return result.rowcount > 0

    async def get_symbol(self, symbol: str) -> SymbolConfig | None:
        """获取单个交易对配置。"""
        result = await self._session.execute(
            text("""
                SELECT symbol, display_name, collect_interval_sec, enabled,
                       has_onchain, has_derivatives, error_count
                FROM symbol_registry WHERE symbol = :symbol
            """),
            {"symbol": symbol},
        )
        row = result.mappings().first()
        if row is None:
            return None
        return SymbolConfig(**row)
