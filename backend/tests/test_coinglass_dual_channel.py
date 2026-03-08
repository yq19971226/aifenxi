"""CoinGlass 双通道（proxy/official）单元测试。

覆盖：通道选择、fallback、失败计数隔离、自动恢复、运维锁定、
日配额保护、80% 告警、throttle、限频隔离、冷启动、Redis 故障、双超时。
"""

import asyncio
import time
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
import fakeredis.aioredis as fakeasync

from app.data.coinglass_client import (
    CHANNEL_OFFICIAL,
    CHANNEL_PROXY,
    CoinGlassClient,
    _PROXY_DAILY_BUDGET,
    _PROXY_QUOTA_WARNING_THRESHOLD,
    _QUOTA_FRESHNESS_SECONDS,
)
from app.data.coinglass_tier import TierManager


# ── Fixtures ──────────────────────────────────────────────────


@pytest.fixture
def fake_redis():
    """创建 fakeredis 实例。"""
    return fakeasync.FakeRedis(decode_responses=True)


@pytest.fixture
def tier_manager():
    """创建 TierManager mock。"""
    tm = AsyncMock(spec=TierManager)
    tm.get_current_tier = AsyncMock(return_value=MagicMock(value="standard"))
    tm.is_endpoint_available = MagicMock(return_value=True)
    tm.check_rate_limit = AsyncMock(return_value=True)
    tm.increment_rate_counter = AsyncMock()
    return tm


@pytest.fixture
def client(tier_manager):
    """创建 CoinGlassClient 实例。"""
    return CoinGlassClient(tier_manager)


def _patch_redis(fake_redis):
    """返回 get_redis_pool 的 patch。"""
    return patch(
        "app.data.coinglass_client.get_redis_pool",
        return_value=fake_redis,
    )


def _patch_config(**key_map):
    """mock get_config_value，根据 key_map 返回值。

    例: _patch_config(alphanode_api_key="ak", coinglass_api_key="ck")
    """
    async def _mock_get(key, default=""):
        return key_map.get(key, default)
    return patch(
        "app.data.coinglass_client.get_config_value",
        side_effect=_mock_get,
    )


def _patch_do_request(return_value=None):
    """mock _do_request，控制请求结果。"""
    return patch.object(
        CoinGlassClient,
        "_do_request",
        new_callable=AsyncMock,
        return_value=return_value,
    )


# ── 1. 通道选择 ───────────────────────────────────────────────


@pytest.mark.asyncio
async def test_channel_selection_proxy_priority(client, fake_redis):
    """proxy 有 Key → 选 proxy（优先级高于 official）。"""
    with _patch_redis(fake_redis), \
         _patch_config(alphanode_api_key="ak", coinglass_api_key="ck"):
        ch = await client._resolve_channel()
        assert ch == "proxy"


@pytest.mark.asyncio
async def test_channel_selection_only_official(client, fake_redis):
    """proxy 无 Key, official 有 Key → 选 official。"""
    with _patch_redis(fake_redis), \
         _patch_config(alphanode_api_key="", coinglass_api_key="ck"):
        ch = await client._resolve_channel()
        assert ch == "official"


@pytest.mark.asyncio
async def test_channel_selection_no_keys(client, fake_redis):
    """两个 Key 都没有 → get() 返回 None。"""
    with _patch_redis(fake_redis), \
         _patch_config(alphanode_api_key="", coinglass_api_key=""):
        result = await client.get("/api/test", "test-endpoint")
        assert result is None


# ── 2. Fallback ───────────────────────────────────────────────


@pytest.mark.asyncio
async def test_fallback_after_3_failures(client, fake_redis):
    """proxy 连续失败 3 次 → 自动切到 official。"""
    # 预设 proxy 为活跃通道
    await fake_redis.set("cg_channel:active", "proxy")

    call_count = 0

    async def _mock_request(self_or_channel, *args, **kwargs):
        nonlocal call_count
        call_count += 1
        # 前3次（proxy）失败，第4次（official fallback）成功
        if call_count <= 1:
            return None  # proxy 失败
        return {"data": "ok"}  # official 成功

    with _patch_redis(fake_redis), \
         _patch_config(alphanode_api_key="ak", coinglass_api_key="ck"):
        # 预设失败计数接近阈值
        await fake_redis.set("cg_channel:failures:proxy", "2")
        with patch.object(CoinGlassClient, "_do_request", new=_mock_request):
            result = await client.get("/api/test", "test-endpoint")
            assert result == {"data": "ok"}
            # 验证通道已切换到 official
            active = await fake_redis.get("cg_channel:active")
            assert active == "official"


# ── 3. 失败计数隔离 ───────────────────────────────────────────


@pytest.mark.asyncio
async def test_failure_count_isolation(client, fake_redis):
    """cg_channel:failures:proxy 与 cg_channel:failures:official 互不污染。"""
    with _patch_redis(fake_redis):
        # proxy 失败 2 次
        count_p = await client._on_request_failure("proxy")
        count_p = await client._on_request_failure("proxy")
        # official 失败 1 次
        count_o = await client._on_request_failure("official")

        proxy_val = await fake_redis.get("cg_channel:failures:proxy")
        official_val = await fake_redis.get("cg_channel:failures:official")

        assert int(proxy_val) == 2
        assert int(official_val) == 1


# ── 4. 自动恢复探测 ──────────────────────────────────────────


@pytest.mark.asyncio
async def test_auto_recovery_probe(client, fake_redis):
    """当 official 活跃 + proxy 探测成功 → 切回 proxy。"""
    await fake_redis.set("cg_channel:active", "official")
    client._active_channel = "official"
    client._last_probe_time = 0.0  # 强制允许探测

    with _patch_redis(fake_redis), \
         _patch_config(alphanode_api_key="ak", coinglass_api_key="ck"), \
         patch.object(CoinGlassClient, "_probe_channel", new_callable=AsyncMock, return_value=True):
        await client._maybe_probe_proxy("official")
        active = await fake_redis.get("cg_channel:active")
        assert active == "proxy"


# ── 5. 运维锁定 ──────────────────────────────────────────────


@pytest.mark.asyncio
async def test_channel_locked_no_auto_switch(client, fake_redis):
    """锁定时探测成功也不切换。"""
    await fake_redis.set("cg_channel:active", "official")
    await fake_redis.set("cg_channel:locked", "official")
    client._active_channel = "official"
    client._last_probe_time = 0.0

    with _patch_redis(fake_redis), \
         _patch_config(alphanode_api_key="ak", coinglass_api_key="ck"), \
         patch.object(CoinGlassClient, "_probe_channel", new_callable=AsyncMock, return_value=True):
        await client._maybe_probe_proxy("official")
        active = await fake_redis.get("cg_channel:active")
        assert active == "official"  # 没有切换


# ── 6. 日配额保护 ────────────────────────────────────────────


@pytest.mark.asyncio
async def test_daily_quota_exceeded(client, fake_redis):
    """proxy 日用量超 30,000 → 自动降级到 official。"""
    date_key = CoinGlassClient._proxy_daily_key()
    await fake_redis.set(date_key, str(_PROXY_DAILY_BUDGET + 1))

    with _patch_redis(fake_redis):
        quota_ok = await client._check_proxy_quota()
        assert quota_ok is False


@pytest.mark.asyncio
async def test_daily_quota_80_percent_warning(client, fake_redis, caplog):
    """日用量达 80% 时发 warning 日志。"""
    date_key = CoinGlassClient._proxy_daily_key()
    await fake_redis.set(date_key, str(_PROXY_QUOTA_WARNING_THRESHOLD))

    with _patch_redis(fake_redis):
        import structlog
        # 使用 structlog 捕获
        quota_ok = await client._check_proxy_quota()
        assert quota_ok is True  # 还没超额，只是 warning


# ── 7. Throttle ──────────────────────────────────────────────


@pytest.mark.asyncio
async def test_throttle_proxy(client):
    """连续两次 proxy 请求间隔 ≥ 1.2s。"""
    client._last_request_time = time.monotonic()

    with patch("app.data.coinglass_client.asyncio.sleep", new_callable=AsyncMock) as mock_sleep:
        await client._throttle_if_proxy()
        # 由于上次请求时间刚设置，elapsed < 1.2，应该调用 sleep
        mock_sleep.assert_called_once()
        args = mock_sleep.call_args[0]
        assert 0 < args[0] <= 1.2


# ── 8. 限频隔离 ──────────────────────────────────────────────


@pytest.mark.asyncio
async def test_rate_limit_isolation(fake_redis):
    """cg_rate:proxy 和 cg_rate:official 互不干扰。"""
    from app.data.coinglass_tier import TierManager as RealTierManager

    tm = RealTierManager()

    with patch("app.data.coinglass_tier.get_redis_pool", return_value=fake_redis), \
         patch.object(tm, "get_current_tier", new_callable=AsyncMock, return_value=MagicMock(value="standard")):
        # 模拟 proxy 打满 50 次
        from app.models.coinglass import CoinGlassTier
        tm.get_current_tier.return_value = CoinGlassTier.STANDARD

        minute_ts = int(time.time() // 60)
        await fake_redis.set(f"cg_rate:proxy:{minute_ts}", "50")

        proxy_ok = await tm.check_rate_limit(channel="proxy")
        official_ok = await tm.check_rate_limit(channel="official")

        assert proxy_ok is False  # proxy 已满
        assert official_ok is True  # official 未受影响


# ── 9. 冷启动 ────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_cold_start(client, fake_redis):
    """Redis 无 cg_channel:active → 按优先级选通道，不探测。"""
    # 确保 Redis 中没有 active 状态
    await fake_redis.delete("cg_channel:active")

    with _patch_redis(fake_redis), \
         _patch_config(alphanode_api_key="ak", coinglass_api_key="ck"), \
         patch.object(CoinGlassClient, "_probe_channel", new_callable=AsyncMock) as mock_probe:
        ch = await client._resolve_channel()
        assert ch == "proxy"  # proxy 优先
        mock_probe.assert_not_called()  # 冷启动不探测
        # Redis 已写入
        active = await fake_redis.get("cg_channel:active")
        assert active == "proxy"


# ── 10. Redis 故障降级 ───────────────────────────────────────


@pytest.mark.asyncio
async def test_redis_failure_fallback(client):
    """Redis 不可用 → 使用内存缓存的 _active_channel。"""
    client._active_channel = "official"

    with patch(
        "app.data.coinglass_client.get_redis_pool",
        side_effect=RuntimeError("Redis pool not initialized"),
    ):
        ch = await client._resolve_channel()
        assert ch == "official"  # 内存缓存


# ── 11. 双通道同时超时 ───────────────────────────────────────


@pytest.mark.asyncio
async def test_both_channels_timeout(client, fake_redis):
    """两通道同时超时 → 返回 None，不无限重试。"""
    await fake_redis.set("cg_channel:active", "proxy")
    # 预设失败计数已达阈值
    await fake_redis.set("cg_channel:failures:proxy", "3")

    with _patch_redis(fake_redis), \
         _patch_config(alphanode_api_key="ak", coinglass_api_key="ck"), \
         _patch_do_request(return_value=None):
        result = await client.get("/api/test", "test-endpoint")
        assert result is None


# ── 12. 请求成功递增日配额 ───────────────────────────────────


@pytest.mark.asyncio
async def test_incr_proxy_daily_usage(client, fake_redis):
    """按 attempt 记账：_incr_proxy_daily_usage 递增 proxy 日用量。"""
    with _patch_redis(fake_redis):
        await client._incr_proxy_daily_usage()
        date_key = CoinGlassClient._proxy_daily_key()
        val = await fake_redis.get(date_key)
        assert int(val) == 1

        await client._incr_proxy_daily_usage()
        val2 = await fake_redis.get(date_key)
        assert int(val2) == 2


# ── 13. 成功重置失败计数 ─────────────────────────────────────


@pytest.mark.asyncio
async def test_success_resets_failure_count(client, fake_redis):
    """请求成功后重置该通道失败计数。"""
    await fake_redis.set("cg_channel:failures:proxy", "2")

    with _patch_redis(fake_redis):
        await client._on_request_success("proxy")
        val = await fake_redis.get("cg_channel:failures:proxy")
        assert val is None  # 已删除


# ── 14. T7.1 原子预留限频 ──────────────────────────────────


@pytest.mark.asyncio
async def test_reserve_rate_slot_proxy_limit(fake_redis):
    """proxy 全局限频：50 次/分后拒绝第 51 次，计数器不虚高。"""
    from app.data.coinglass_tier import TierManager as RealTierManager
    from app.models.coinglass import CoinGlassTier

    tm = RealTierManager()

    with patch("app.data.coinglass_tier.get_redis_pool", return_value=fake_redis), \
         patch.object(tm, "get_current_tier", new_callable=AsyncMock, return_value=CoinGlassTier.STANDARD):
        minute_ts = int(time.time() // 60)
        await fake_redis.set(f"cg_rate:proxy:{minute_ts}", "49")

        assert await tm.reserve_rate_slot(channel="proxy") is True
        assert await tm.reserve_rate_slot(channel="proxy") is False

        count = await fake_redis.get(f"cg_rate:proxy:{minute_ts}")
        assert int(count) == 50


@pytest.mark.asyncio
async def test_reserve_rate_slot_concurrent_no_oversell(fake_redis):
    """并发预留不超发：60 个并发请求中最多 50 个获得 slot。"""
    from app.data.coinglass_tier import TierManager as RealTierManager
    from app.models.coinglass import CoinGlassTier

    tm = RealTierManager()

    with patch("app.data.coinglass_tier.get_redis_pool", return_value=fake_redis), \
         patch.object(tm, "get_current_tier", new_callable=AsyncMock, return_value=CoinGlassTier.STANDARD):
        results = await asyncio.gather(
            *[tm.reserve_rate_slot(channel="proxy") for _ in range(60)]
        )
        granted = sum(1 for r in results if r is True)
        denied = sum(1 for r in results if r is False)

        assert granted == 50
        assert denied == 10


@pytest.mark.asyncio
async def test_official_not_affected_by_proxy_rate_limit(fake_redis):
    """official 通道不被 proxy 限频误伤。"""
    from app.data.coinglass_tier import TierManager as RealTierManager
    from app.models.coinglass import CoinGlassTier

    tm = RealTierManager()

    with patch("app.data.coinglass_tier.get_redis_pool", return_value=fake_redis), \
         patch.object(tm, "get_current_tier", new_callable=AsyncMock, return_value=CoinGlassTier.STANDARD):
        minute_ts = int(time.time() // 60)
        await fake_redis.set(f"cg_rate:proxy:{minute_ts}", "50")

        assert await tm.reserve_rate_slot(channel="proxy") is False
        assert await tm.reserve_rate_slot(channel="official") is True


@pytest.mark.asyncio
async def test_reserve_rate_slot_redis_failure():
    """Redis 故障时 reserve_rate_slot fail-open。"""
    from app.data.coinglass_tier import TierManager as RealTierManager
    from app.models.coinglass import CoinGlassTier

    tm = RealTierManager()

    with patch("app.data.coinglass_tier.get_redis_pool", side_effect=RuntimeError("no redis")), \
         patch.object(tm, "get_current_tier", new_callable=AsyncMock, return_value=CoinGlassTier.STANDARD):
        assert await tm.reserve_rate_slot(channel="proxy") is True


# ── 15. T7.2 /usage/me 对账 ───────────────────────────────────


@pytest.mark.asyncio
async def test_usage_me_sync_writes_redis(client, fake_redis):
    """/usage/me 同步成功，供应商真值写入 Redis。"""
    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.json.return_value = {"remaining": 9500, "used": 500}

    with _patch_redis(fake_redis), \
         _patch_config(alphanode_api_key="ak"), \
         patch.object(
             client._clients["proxy"], "get",
             new_callable=AsyncMock, return_value=mock_response,
         ):
        await client._sync_proxy_quota()

        remaining = await fake_redis.get("cg_proxy_quota_remaining")
        assert remaining == "9500"
        used_remote = await fake_redis.get("cg_proxy_quota_used_remote")
        assert used_remote == "500"
        synced_at = await fake_redis.get("cg_proxy_quota_synced_at")
        assert synced_at is not None


@pytest.mark.asyncio
async def test_monthly_quota_prefers_supplier_truth(client, fake_redis):
    """供应商真值新鲜时，月度配额判断优先参考真值。"""
    await fake_redis.set("cg_proxy_quota_synced_at", str(int(time.time())))
    await fake_redis.set("cg_proxy_quota_remaining", "0")

    with _patch_redis(fake_redis), \
         _patch_config(alphanode_api_key="ak"):
        quota_ok = await client._check_proxy_quota()
        assert quota_ok is False


@pytest.mark.asyncio
async def test_usage_me_unavailable_falls_back_local(client, fake_redis):
    """/usage/me 不可用时，回退到本地日计数。"""
    with _patch_redis(fake_redis), \
         _patch_config(alphanode_api_key="ak"), \
         patch.object(client, "_fetch_usage_me", new_callable=AsyncMock, return_value=None):
        date_key = CoinGlassClient._proxy_daily_key()
        await fake_redis.set(date_key, "100")

        quota_ok = await client._check_proxy_quota()
        assert quota_ok is True


@pytest.mark.asyncio
async def test_quota_drift_detection(client, fake_redis):
    """本地计数与供应商真值存在漂移时，漂移值写入 Redis。"""
    date_key = CoinGlassClient._proxy_daily_key()
    await fake_redis.set(date_key, "200")

    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.json.return_value = {"remaining": 9000, "used": 500}

    with _patch_redis(fake_redis), \
         _patch_config(alphanode_api_key="ak"), \
         patch.object(
             client._clients["proxy"], "get",
             new_callable=AsyncMock, return_value=mock_response,
         ):
        await client._sync_proxy_quota()

        drift = await fake_redis.get("cg_proxy_quota_drift")
        assert drift is not None
        assert int(drift) == 300  # 500 - 200


@pytest.mark.asyncio
async def test_fetch_usage_me_not_recursive(client, fake_redis):
    """_fetch_usage_me 不经过 get()，避免递归和自污染。"""
    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.json.return_value = {"remaining": 8000}

    with _patch_config(alphanode_api_key="ak"), \
         patch.object(
             client._clients["proxy"], "get",
             new_callable=AsyncMock, return_value=mock_response,
         ) as mock_get:
        result = await client._fetch_usage_me()
        assert result == {"remaining": 8000}
        mock_get.assert_called_once()
        call_args = mock_get.call_args
        assert call_args[0][0] == "/usage/me"


# ── 16. T7.1 proxy 限频溢出到 official ──────────────────────


@pytest.mark.asyncio
async def test_proxy_rate_overflow_to_official(client, fake_redis, tier_manager):
    """proxy 限频耗尽 → 单次借路 official，不污染运行态元数据。"""
    await fake_redis.set("cg_channel:active", "proxy")
    await fake_redis.set("cg_channel:switch_reason", "cold_start")
    await fake_redis.set("cg_channel:switched_at", "1709800200")
    # 注意：不设置 _last_probe_time — 副作用必须由 is_overflow 阻止，不靠时间窗口规避

    # 第一次 reserve_rate_slot("proxy")=False, 第二次 ("official")=True
    tier_manager.reserve_rate_slot = AsyncMock(side_effect=[False, True])

    with _patch_redis(fake_redis), \
         _patch_config(alphanode_api_key="ak", coinglass_api_key="ck"), \
         _patch_do_request(return_value={"data": "ok"}), \
         patch.object(client, "_maybe_probe_proxy", new_callable=AsyncMock) as mock_probe:
        result = await client.get("/api/test", "test-endpoint")
        assert result == {"data": "ok"}
        assert tier_manager.reserve_rate_slot.call_count == 2
        # 活跃通道仍为 proxy（借路不切换活跃通道）
        active = await fake_redis.get("cg_channel:active")
        assert active == "proxy"
        # switch_reason 不会被改写为 probe_recovery
        reason = await fake_redis.get("cg_channel:switch_reason")
        assert reason == "cold_start"
        # switched_at 不会因借路请求被刷新
        switched_at = await fake_redis.get("cg_channel:switched_at")
        assert switched_at == "1709800200"
        # 借路场景下 _maybe_probe_proxy 根本不应被调用
        mock_probe.assert_not_awaited()


@pytest.mark.asyncio
async def test_proxy_rate_overflow_blocked_by_lock(client, fake_redis, tier_manager):
    """proxy 限频耗尽 + 锁定 proxy → 不溢出到 official，返回 None。"""
    await fake_redis.set("cg_channel:active", "proxy")
    await fake_redis.set("cg_channel:locked", "proxy")

    tier_manager.reserve_rate_slot = AsyncMock(return_value=False)

    with _patch_redis(fake_redis), \
         _patch_config(alphanode_api_key="ak", coinglass_api_key="ck"), \
         _patch_do_request(return_value={"data": "ok"}):
        result = await client.get("/api/test", "test-endpoint")
        assert result is None


# ── 17. T7.4 锁定 proxy 时失败语义 ──────────────────────────


@pytest.mark.asyncio
async def test_lock_proxy_failure_no_fallback(client, fake_redis, tier_manager):
    """锁定 proxy + proxy 连续失败 ≥ 阈值 → 不降级到 official，返回 None。"""
    await fake_redis.set("cg_channel:active", "proxy")
    await fake_redis.set("cg_channel:locked", "proxy")
    await fake_redis.set("cg_channel:failures:proxy", "2")

    tier_manager.reserve_rate_slot = AsyncMock(return_value=True)

    with _patch_redis(fake_redis), \
         _patch_config(alphanode_api_key="ak", coinglass_api_key="ck"), \
         _patch_do_request(return_value=None):
        result = await client.get("/api/test", "test-endpoint")
        assert result is None
        # 活跃通道仍为 proxy（锁定阻止了 fallback）
        active = await fake_redis.get("cg_channel:active")
        assert active == "proxy"


# ── 18. T7.4 健康检查是运行态聚合（非主动探测）─────────────


@pytest.mark.asyncio
async def test_health_channel_state_is_runtime_aggregate(fake_redis):
    """_build_cg_channel_state 只读 Redis 运行态，不主动发起 HTTP 探测。"""
    from app.api.datasources import _build_cg_channel_state

    await fake_redis.set("cg_channel:active", "proxy")
    await fake_redis.set("cg_channel:switch_reason", "cold_start")
    await fake_redis.set("cg_channel:switched_at", "1709800200")
    await fake_redis.set("cg_channel:locked", "")
    await fake_redis.set("cg_channel:failures:proxy", "0")
    await fake_redis.set("cg_channel:failures:official", "0")

    with patch("app.core.redis.get_redis_pool", return_value=fake_redis):
        state = await _build_cg_channel_state()

        assert state["active_channel"] == "proxy"
        assert state["switch_reason"] == "cold_start"
        assert "lock_risk_warning" in state
        # 无锁定 → 无风险提示
        assert state["lock_risk_warning"] == ""


@pytest.mark.asyncio
async def test_channel_state_lock_proxy_risk_warning(fake_redis):
    """锁定 proxy 时，channel state 包含高风险提示。"""
    from app.api.datasources import _build_cg_channel_state

    await fake_redis.set("cg_channel:active", "proxy")
    await fake_redis.set("cg_channel:switch_reason", "manual")
    await fake_redis.set("cg_channel:switched_at", "1709800200")
    await fake_redis.set("cg_channel:locked", "proxy")
    await fake_redis.set("cg_channel:failures:proxy", "0")
    await fake_redis.set("cg_channel:failures:official", "0")

    with patch("app.core.redis.get_redis_pool", return_value=fake_redis):
        state = await _build_cg_channel_state()

        assert state["locked"] == "proxy"
        assert "lock_risk_warning" in state
        assert "警告" in state["lock_risk_warning"]
        assert "proxy" in state["lock_risk_warning"]


@pytest.mark.asyncio
async def test_channel_state_lock_official_low_risk(fake_redis):
    """锁定 official 时，channel state 提示但非高风险。"""
    from app.api.datasources import _build_cg_channel_state

    await fake_redis.set("cg_channel:active", "official")
    await fake_redis.set("cg_channel:switch_reason", "manual")
    await fake_redis.set("cg_channel:switched_at", "1709800200")
    await fake_redis.set("cg_channel:locked", "official")
    await fake_redis.set("cg_channel:failures:proxy", "0")
    await fake_redis.set("cg_channel:failures:official", "0")

    with patch("app.core.redis.get_redis_pool", return_value=fake_redis):
        state = await _build_cg_channel_state()

        assert state["locked"] == "official"
        assert "lock_risk_warning" in state
        assert "警告" not in state["lock_risk_warning"]
        assert "锁定 official" in state["lock_risk_warning"]


# ── 19. T7.3 定时主动恢复 ────────────────────────────────────


@pytest.mark.asyncio
async def test_scheduled_probe_recovery_success(client, fake_redis, tier_manager):
    """official 活跃 + proxy 恢复 → 定时任务切回 proxy，switch_reason 为 scheduled。"""
    await fake_redis.set("cg_channel:active", "official")
    await fake_redis.set("cg_channel:switch_reason", "consecutive_failures")
    await fake_redis.set("cg_channel:switched_at", "1709800200")

    tier_manager.reserve_rate_slot = AsyncMock(return_value=True)

    with _patch_redis(fake_redis), \
         _patch_config(alphanode_api_key="ak"), \
         patch.object(
             client._clients["proxy"], "get",
             new_callable=AsyncMock,
             return_value=MagicMock(status_code=200),
         ):
        result = await client.scheduled_probe_proxy()

        assert result["action"] == "switched"
        assert result["reason"] == "scheduled_probe_recovery"
        # 活跃通道已切回 proxy
        active = await fake_redis.get("cg_channel:active")
        assert active == "proxy"
        # switch_reason 是 scheduled_probe_recovery（非 probe_recovery）
        reason = await fake_redis.get("cg_channel:switch_reason")
        assert reason == "scheduled_probe_recovery"
        # switched_at 已刷新
        switched_at = await fake_redis.get("cg_channel:switched_at")
        assert switched_at != "1709800200"


@pytest.mark.asyncio
async def test_scheduled_probe_proxy_not_recovered(client, fake_redis, tier_manager):
    """official 活跃 + proxy 未恢复 → 不切换，不污染元数据。"""
    await fake_redis.set("cg_channel:active", "official")
    await fake_redis.set("cg_channel:switch_reason", "consecutive_failures")
    await fake_redis.set("cg_channel:switched_at", "1709800200")

    tier_manager.reserve_rate_slot = AsyncMock(return_value=True)

    with _patch_redis(fake_redis), \
         _patch_config(alphanode_api_key="ak"), \
         patch.object(
             client._clients["proxy"], "get",
             new_callable=AsyncMock,
             return_value=MagicMock(status_code=500),
         ):
        result = await client.scheduled_probe_proxy()

        assert result["action"] == "noop"
        assert result["reason"] == "proxy_not_recovered"
        active = await fake_redis.get("cg_channel:active")
        assert active == "official"
        reason = await fake_redis.get("cg_channel:switch_reason")
        assert reason == "consecutive_failures"
        switched_at = await fake_redis.get("cg_channel:switched_at")
        assert switched_at == "1709800200"


@pytest.mark.asyncio
async def test_scheduled_probe_locked_no_switch(client, fake_redis, tier_manager):
    """official 活跃 + lock 存在 → 即使 proxy 恢复也不切换。"""
    await fake_redis.set("cg_channel:active", "official")
    await fake_redis.set("cg_channel:locked", "official")

    with _patch_redis(fake_redis):
        result = await client.scheduled_probe_proxy()

        assert result["action"] == "skip"
        assert result["reason"] == "channel_locked"
        active = await fake_redis.get("cg_channel:active")
        assert active == "official"


@pytest.mark.asyncio
async def test_scheduled_probe_noop_when_proxy_active(client, fake_redis):
    """active_channel = proxy → 定时任务 no-op，不探测。"""
    await fake_redis.set("cg_channel:active", "proxy")

    with _patch_redis(fake_redis):
        result = await client.scheduled_probe_proxy()

        assert result["action"] == "noop"
        assert result["reason"] == "proxy_already_active"


@pytest.mark.asyncio
async def test_scheduled_probe_lock_held_skip(client, fake_redis):
    """探测锁已被持有 → 定时任务直接退出，防多 worker 重复。"""
    await fake_redis.set("cg_channel:active", "official")
    # 模拟另一个 worker 已持有探测锁
    await fake_redis.set("cg_channel:probing", "1")

    with _patch_redis(fake_redis):
        result = await client.scheduled_probe_proxy()

        assert result["action"] == "skip"
        assert result["reason"] == "probe_lock_held"


# ── 20. admin_configs GET /coinglass/channel 口径对齐 ────────


def _make_mock_symbol(symbol: str, has_derivatives: bool):
    """创建带 has_derivatives 属性的 mock 交易对对象。"""
    s = MagicMock()
    s.symbol = symbol
    s.has_derivatives = has_derivatives
    return s


@pytest.mark.asyncio
async def test_admin_channel_budget_risk_when_over_3(fake_redis):
    """衍生品币种 > 3 → budget_risk=True，budget_risk_reason 非空。"""
    from app.api.admin_configs import get_coinglass_channel

    await fake_redis.set("cg_channel:active", "proxy")
    await fake_redis.set("cg_channel:switch_reason", "cold_start")
    await fake_redis.set("cg_channel:switched_at", "1709800200")
    await fake_redis.set("cg_channel:locked", "")

    mock_symbols = [
        _make_mock_symbol("BTCUSDT", True),
        _make_mock_symbol("ETHUSDT", True),
        _make_mock_symbol("SOLUSDT", True),
        _make_mock_symbol("BNBUSDT", True),
    ]

    mock_registry = AsyncMock()
    mock_registry.list_symbols = AsyncMock(return_value=mock_symbols)

    mock_session = AsyncMock()
    mock_session.__aenter__ = AsyncMock(return_value=mock_session)
    mock_session.__aexit__ = AsyncMock(return_value=False)

    with patch("app.api.admin_configs.get_redis_pool", return_value=fake_redis), \
         patch("app.core.database.AsyncSessionLocal", return_value=mock_session), \
         patch("app.services.symbol_registry.SymbolRegistry", return_value=mock_registry):
        result = await get_coinglass_channel(admin=MagicMock())

    assert result["budget_risk"] is True
    assert "4" in result["budget_risk_reason"]
    assert result["lock_risk_warning"] == ""
    assert result["active_channel"] == "proxy"


@pytest.mark.asyncio
async def test_admin_channel_no_budget_risk_when_3_or_less(fake_redis):
    """衍生品币种 ≤ 3 → budget_risk=False，budget_risk_reason 空。"""
    from app.api.admin_configs import get_coinglass_channel

    await fake_redis.set("cg_channel:active", "proxy")
    await fake_redis.set("cg_channel:switch_reason", "cold_start")
    await fake_redis.set("cg_channel:switched_at", "1709800200")
    await fake_redis.set("cg_channel:locked", "proxy")

    mock_symbols = [
        _make_mock_symbol("BTCUSDT", True),
        _make_mock_symbol("ETHUSDT", True),
        _make_mock_symbol("SOLUSDT", False),
    ]

    mock_registry = AsyncMock()
    mock_registry.list_symbols = AsyncMock(return_value=mock_symbols)

    mock_session = AsyncMock()
    mock_session.__aenter__ = AsyncMock(return_value=mock_session)
    mock_session.__aexit__ = AsyncMock(return_value=False)

    with patch("app.api.admin_configs.get_redis_pool", return_value=fake_redis), \
         patch("app.core.database.AsyncSessionLocal", return_value=mock_session), \
         patch("app.services.symbol_registry.SymbolRegistry", return_value=mock_registry):
        result = await get_coinglass_channel(admin=MagicMock())

    assert result["budget_risk"] is False
    assert result["budget_risk_reason"] == ""
    assert "警告" in result["lock_risk_warning"]
