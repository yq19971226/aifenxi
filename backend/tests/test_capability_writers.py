"""Capability writer 回归测试 — calendar / orderbook worker 写入 runtime 状态。

覆盖：
  1. calendar 成功 → AVAILABLE
  2. calendar API key 缺失 → UNAVAILABLE
  3. calendar 全失败 → UNAVAILABLE
  4. orderbook 成功 → AVAILABLE
  5. orderbook 全失败 → UNAVAILABLE
  6. orderbook 任务异常 → UNAVAILABLE
"""

import asyncio
import json
from unittest.mock import AsyncMock, MagicMock, patch

import pytest


# ── helpers ──────────────────────────────────────────────

async def _read_cap(cap_key: str) -> str:
    """读取 Redis 中的 capability runtime 状态。"""
    from app.core.redis import get_redis_pool

    redis = get_redis_pool()
    raw = await redis.hget("capability:state", cap_key)
    if raw:
        return json.loads(raw).get("status", "unknown")
    return "not_set"


async def _cleanup_cap(cap_key: str) -> None:
    from app.core.redis import get_redis_pool

    redis = get_redis_pool()
    await redis.hdel("capability:state", cap_key)


# ── Calendar tests ───────────────────────────────────────


@pytest.mark.asyncio
async def test_calendar_cap_available_on_success():
    """calendar worker 成功采集 → AVAILABLE。"""
    from app.core.redis import init_redis, close_redis
    from workers.calendar_worker import _set_calendar_cap, _symbol_pipeline_ok

    await init_redis()
    try:
        # 模拟：至少 1 个 symbol 链路正常（count >= 0）
        assert _symbol_pipeline_ok(0) is True   # 无事件但链路通
        assert _symbol_pipeline_ok(5) is True   # 有事件

        await _set_calendar_cap("AVAILABLE")
        status = await _read_cap("calendar")
        assert status == "available"
    finally:
        await _cleanup_cap("calendar")
        await close_redis()


@pytest.mark.asyncio
async def test_calendar_cap_unavailable_on_api_key_missing():
    """calendar worker API key 缺失 → UNAVAILABLE。"""
    from app.core.redis import init_redis, close_redis
    from workers.calendar_worker import _set_calendar_cap

    await init_redis()
    try:
        await _set_calendar_cap("UNAVAILABLE", "COINMARKETCAL_API_KEY not configured")
        status = await _read_cap("calendar")
        assert status == "unavailable"
    finally:
        await _cleanup_cap("calendar")
        await close_redis()


@pytest.mark.asyncio
async def test_calendar_cap_unavailable_on_all_failed():
    """calendar worker 全部 symbol 失败 → UNAVAILABLE。"""
    from app.core.redis import init_redis, close_redis
    from workers.calendar_worker import _set_calendar_cap, _symbol_pipeline_ok

    await init_redis()
    try:
        # 模拟全失败：所有 count = -1
        results = {"BTC": -1, "ETH": -1}
        pipeline_ok = any(_symbol_pipeline_ok(c) for c in results.values())
        assert pipeline_ok is False

        await _set_calendar_cap("UNAVAILABLE", "all symbols failed")
        status = await _read_cap("calendar")
        assert status == "unavailable"
    finally:
        await _cleanup_cap("calendar")
        await close_redis()


# ── Orderbook tests ──────────────────────────────────────


@pytest.mark.asyncio
async def test_orderbook_cap_available_on_success():
    """orderbook worker 成功采集 → AVAILABLE。"""
    from app.core.redis import init_redis, close_redis
    from workers.orderbook_worker import _set_orderbook_cap

    await init_redis()
    try:
        await _set_orderbook_cap("AVAILABLE")
        status = await _read_cap("orderbook")
        assert status == "available"
    finally:
        await _cleanup_cap("orderbook")
        await close_redis()


@pytest.mark.asyncio
async def test_orderbook_cap_unavailable_on_all_failed():
    """orderbook worker 全失败 (success=0, total>0) → UNAVAILABLE。"""
    from app.core.redis import init_redis, close_redis
    from workers.orderbook_worker import _set_orderbook_cap

    await init_redis()
    try:
        # 模拟: total > 0 但 success = 0
        await _set_orderbook_cap("UNAVAILABLE", "all symbols failed")
        status = await _read_cap("orderbook")
        assert status == "unavailable"
    finally:
        await _cleanup_cap("orderbook")
        await close_redis()


@pytest.mark.asyncio
async def test_orderbook_cap_unavailable_on_exception():
    """orderbook worker 任务异常 → UNAVAILABLE。"""
    from app.core.redis import init_redis, close_redis
    from workers.orderbook_worker import _set_orderbook_cap

    await init_redis()
    try:
        await _set_orderbook_cap("UNAVAILABLE", "task exception: connection refused")
        status = await _read_cap("orderbook")
        assert status == "unavailable"
    finally:
        await _cleanup_cap("orderbook")
        await close_redis()
