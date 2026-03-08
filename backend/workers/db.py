"""Worker 共享数据库工具 — 解决 Celery + asyncio.run() 连接泄漏问题。

每个 Celery task 调用 asyncio.run()，创建新 event loop；模块级 engine 的
连接池绑定在旧 loop 上，session 无法正确释放，导致 idle-in-transaction 堆积。

解决方案：每次 task 按需创建轻量 engine，用完即 dispose。
"""

import logging
from contextlib import asynccontextmanager
from typing import AsyncGenerator

from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from app.core.config import settings

logger = logging.getLogger(__name__)


def _create_engine() -> AsyncEngine:
    db_url = settings.database_url
    if db_url.startswith("sqlite"):
        return create_async_engine(db_url)

    return create_async_engine(
        db_url,
        pool_size=2,
        max_overflow=3,
        pool_pre_ping=True,
        pool_recycle=300,
    )


@asynccontextmanager
async def worker_session() -> AsyncGenerator[AsyncSession, None]:
    """每次 task 创建独立 engine → session，退出时 dispose engine，
    确保连接不泄漏。
    """
    engine = _create_engine()
    factory = async_sessionmaker(engine, expire_on_commit=False)
    try:
        async with factory() as session:
            yield session
    finally:
        await engine.dispose()


@asynccontextmanager
async def worker_engine() -> AsyncGenerator[tuple[AsyncEngine, async_sessionmaker], None]:
    """需要多次 session 操作时使用，退出时 dispose。"""
    engine = _create_engine()
    factory = async_sessionmaker(engine, expire_on_commit=False)
    try:
        yield engine, factory
    finally:
        await engine.dispose()
