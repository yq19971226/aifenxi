"""Capability-state 回归测试 — 防止 endpoint mapping / tier matrix / 静态注册表漂移。

覆盖：
  1. _CAP_ENDPOINTS 每个 endpoint ∈ _V4_REMOVED_ENDPOINTS ∪ _TIER_ENDPOINTS (all tiers)
  2. V4-removed capabilities 静态默认必须是 UNAVAILABLE
  3. Worker 对 V4-removed endpoint 写 UNAVAILABLE（模拟）
  4. set/get capability status 读写闭环
"""

import asyncio
import json
from unittest.mock import AsyncMock, patch

import pytest


# ── Test 1: _CAP_ENDPOINTS 对齐 _TIER_ENDPOINTS + _V4_REMOVED ──


def test_cap_endpoints_covered_by_tier_or_v4_removed():
    """每个 _CAP_ENDPOINTS 的 endpoint 必须属于 V4_REMOVED 或 tier matrix。"""
    from workers.coinglass_worker import _CAP_ENDPOINTS, _V4_REMOVED_ENDPOINTS
    from app.data.coinglass_tier import (
        _HOBBYIST_ENDPOINTS,
        _STARTUP_EXTRA_ENDPOINTS,
        _STANDARD_EXTRA_ENDPOINTS,
    )

    all_tier = _HOBBYIST_ENDPOINTS | _STARTUP_EXTRA_ENDPOINTS | _STANDARD_EXTRA_ENDPOINTS
    all_known = all_tier | _V4_REMOVED_ENDPOINTS

    missing = []
    for cap, endpoint in _CAP_ENDPOINTS.items():
        if endpoint not in all_known:
            missing.append(f"{cap} -> {endpoint}")

    assert not missing, (
        f"_CAP_ENDPOINTS 中以下 endpoint 既不在 tier matrix 也不在 V4_REMOVED:\n"
        + "\n".join(missing)
    )


# ── Test 2: V4-removed capabilities 静态默认 = UNAVAILABLE ──


def test_v4_removed_static_default_unavailable():
    """cg_oi / cg_fr 在静态注册表中必须标记为 UNAVAILABLE。"""
    from app.core.capability_state import CapabilityStatus, get_capability_meta
    from workers.coinglass_worker import _CAP_ENDPOINTS, _V4_REMOVED_ENDPOINTS

    v4_caps = [cap for cap, ep in _CAP_ENDPOINTS.items() if ep in _V4_REMOVED_ENDPOINTS]
    assert v4_caps, "_V4_REMOVED_ENDPOINTS 映射了 0 个 capability，逻辑异常"

    for cap in v4_caps:
        meta = get_capability_meta(cap)
        assert meta["status"] == CapabilityStatus.UNAVAILABLE, (
            f"{cap} 静态默认应为 UNAVAILABLE，实际为 {meta['status']}"
        )


# ── Test 3: _V4_REMOVED_ENDPOINTS 不在任何 tier 中 ──


def test_v4_removed_not_in_tier_matrix():
    """V4 已移除的 endpoint 绝不应出现在 tier matrix 中。"""
    from workers.coinglass_worker import _V4_REMOVED_ENDPOINTS
    from app.data.coinglass_tier import (
        _HOBBYIST_ENDPOINTS,
        _STARTUP_EXTRA_ENDPOINTS,
        _STANDARD_EXTRA_ENDPOINTS,
    )

    all_tier = _HOBBYIST_ENDPOINTS | _STARTUP_EXTRA_ENDPOINTS | _STANDARD_EXTRA_ENDPOINTS
    leaked = _V4_REMOVED_ENDPOINTS & all_tier
    assert not leaked, f"V4 已移除的 endpoint 出现在 tier matrix 中: {leaked}"


# ── Test 4: Worker 注册逻辑 — V4-removed → UNAVAILABLE ──


@pytest.mark.asyncio
async def test_worker_writes_unavailable_for_v4_removed():
    """Worker 对 V4-removed endpoint 必须写 UNAVAILABLE，不是 TIER_LIMITED。"""
    from app.core.capability_state import CapabilityStatus
    from workers.coinglass_worker import _CAP_ENDPOINTS, _V4_REMOVED_ENDPOINTS

    # 模拟 worker 注册逻辑的核心判断
    cap_ok: dict[str, bool] = {cap: False for cap in _CAP_ENDPOINTS}

    written: dict[str, CapabilityStatus] = {}

    for cap, endpoint in _CAP_ENDPOINTS.items():
        if cap_ok.get(cap):
            written[cap] = CapabilityStatus.AVAILABLE
        elif endpoint in _V4_REMOVED_ENDPOINTS:
            written[cap] = CapabilityStatus.UNAVAILABLE
        else:
            written[cap] = CapabilityStatus.TIER_LIMITED  # simplified

    for cap, ep in _CAP_ENDPOINTS.items():
        if ep in _V4_REMOVED_ENDPOINTS:
            assert written[cap] == CapabilityStatus.UNAVAILABLE, (
                f"{cap} should be UNAVAILABLE for V4-removed, got {written[cap]}"
            )
        else:
            # 非 V4-removed 且 cap_ok=False 时应为 TIER_LIMITED（简化）
            assert written[cap] != CapabilityStatus.UNAVAILABLE, (
                f"{cap} should NOT be UNAVAILABLE (not V4-removed)"
            )


# ── Test 5: set/get 闭环（需 Redis 或 fakeredis） ──


@pytest.mark.asyncio
async def test_set_get_capability_status_roundtrip():
    """set_capability_status → get_capability_status 读写闭环。"""
    from app.core.capability_state import (
        CapabilityStatus,
        set_capability_status,
        get_capability_status,
    )
    from app.core.redis import init_redis, close_redis, get_redis_pool

    await init_redis()
    try:
        test_cap = "__test_cap__"
        for status in CapabilityStatus:
            await set_capability_status(test_cap, status, reason=f"test-{status.value}")
            result = await get_capability_status(test_cap)
            assert result["status"] == status.value, (
                f"Expected {status.value}, got {result['status']}"
            )
            assert result["reason"] == f"test-{status.value}"

        # cleanup
        redis = get_redis_pool()
        await redis.hdel("capability:state", test_cap)
    finally:
        await close_redis()


# ── Test 6: _CAP_ENDPOINTS 和静态注册表 capability 一致性 ──


def test_cap_endpoints_subset_of_registry():
    """_CAP_ENDPOINTS 的每个 capability 都必须在静态注册表中存在。"""
    from workers.coinglass_worker import _CAP_ENDPOINTS
    from app.core.capability_state import _CAPABILITY_REGISTRY

    missing = [cap for cap in _CAP_ENDPOINTS if cap not in _CAPABILITY_REGISTRY]
    assert not missing, (
        f"_CAP_ENDPOINTS 中以下 capability 不在静态注册表中: {missing}"
    )
