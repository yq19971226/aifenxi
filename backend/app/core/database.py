import uuid
from contextlib import asynccontextmanager
from collections.abc import AsyncGenerator
from datetime import datetime, timezone

from sqlalchemy import event
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase

from app.core.config import settings


class Base(DeclarativeBase):
    pass


_is_sqlite = settings.database_url.startswith("sqlite")

_engine_kwargs: dict = {"echo": not settings.is_production}
if not _is_sqlite:
    _engine_kwargs.update(
        pool_size=5,
        max_overflow=5,
        pool_pre_ping=True,
        pool_recycle=300,
    )

engine = create_async_engine(settings.database_url, **_engine_kwargs)

# Register PostgreSQL-compatible functions for SQLite
if _is_sqlite:
    @event.listens_for(engine.sync_engine, "connect")
    def _register_sqlite_functions(dbapi_conn, connection_record):
        dbapi_conn.create_function("gen_random_uuid", 0, lambda: str(uuid.uuid4()))
        dbapi_conn.create_function(
            "NOW", 0, lambda: datetime.now(timezone.utc).isoformat()
        )

AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autoflush=False,
    autocommit=False,
)


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """FastAPI dependency – yields an async DB session.

    事务边界约定：
    - 本函数是请求级事务的唯一 owner，请求结束时自动 commit/rollback。
    - Service 层应使用 flush() 而非 commit()，以获取 RETURNING 值。
    - 允许显式 commit 的白名单（独立会话 / 后台任务 / Worker）：
      [Service 层]
      * performance.py — 策略快照/结算，独立 AsyncSessionLocal
      * kill_detector.py — Worker 上下文写入预警
      * notification_log_service.py — 独立会话记录通知
      * notification/telegram.py — Telegram 绑定回调
      * learning_service.py — 管理操作，多步清理
      * agent_management.py — 初始化/更新配置
      * config_service.py — 系统配置初始化
      [Data 层 — Worker 采集上下文]
      * coinglass_oi.py — CoinGlass OI 快照写入
      * coinglass_taker.py — Taker 快照写入
      * coinglass_heatmap.py — 热力图快照写入
      * derivatives.py — Binance 合约快照/爆仓写入
      * binance.py — WebSocket K线写入 (session_factory)
      * datasource_registry.py — 数据源开关持久化 (AsyncSessionLocal)
    """
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


@asynccontextmanager
async def get_db_context() -> AsyncGenerator[AsyncSession, None]:
    """Independent async DB session context for non-request code."""
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()
