"""CoinGlass API V4 统一客户端 — 双通道（proxy/official）、限频、重试、超时、套餐感知。

数据层模块，封装所有 CoinGlass API V4 HTTP 请求。
proxy（AlphaNode）优先 + official（官方）fallback 的双通道架构。
依赖 TierManager 做限频和端点检查。
"""

import asyncio
import time
from datetime import datetime, timezone
from typing import NamedTuple

import httpx
import structlog

from app.core.redis import get_redis_pool
from app.data.coinglass_tier import TierManager
from app.services.config_service import get_config_value

logger = structlog.get_logger(__name__)

# ============================================================
# 通道配置
# ============================================================


class ChannelConfig(NamedTuple):
    """双通道配置数据结构。"""

    channel_id: str    # "proxy" | "official"
    base_url: str
    path_prefix: str   # proxy 需要前缀，official 为空
    auth_header: str   # "x-key" | "CG-API-KEY"
    key_config: str    # ConfigService 中的 key 名称


CHANNEL_PROXY = ChannelConfig(
    channel_id="proxy",
    base_url="https://api.alphanode.work",
    path_prefix="/open-api-v4.coinglass.com",
    auth_header="x-key",
    key_config="alphanode_api_key",
)

CHANNEL_OFFICIAL = ChannelConfig(
    channel_id="official",
    base_url="https://open-api-v4.coinglass.com",
    path_prefix="",
    auth_header="CG-API-KEY",
    key_config="coinglass_api_key",
)

# 优先级顺序：proxy > official
_CHANNEL_PRIORITY = [CHANNEL_PROXY, CHANNEL_OFFICIAL]

# ============================================================
# 常量
# ============================================================

_TIMEOUT_SECONDS = 30
_MAX_RETRIES = 2
_DEFAULT_RETRY_AFTER = 5
_MAX_CONSECUTIVE_FAILURES = 3
_PROXY_DAILY_BUDGET = 30000
_PROXY_QUOTA_WARNING_THRESHOLD = 24000  # 80%
_PROXY_THROTTLE_INTERVAL = 1.2  # seconds
_PROBE_INTERVAL = 300  # seconds
_PROBE_PATH = "/api/futures/supported-coins"
_USAGE_ME_PATH = "/usage/me"
_QUOTA_FRESHNESS_SECONDS = 3600  # 供应商真值 1 小时内视为新鲜
_QUOTA_SYNC_LOCK_TTL = 120

# P2-C: 熔断器分级退避阈值
# 3 次 → 降频 30s/次；10 次 → 降频 5min/次；100 次 → 完全熔断（30min 后自动半开）
_CB_STAGE1_THRESHOLD = 3     # 连续失败 3 次 → 降频到 30s 间隔
_CB_STAGE2_THRESHOLD = 10    # 连续失败 10 次 → 降频到 300s 间隔
_CB_OPEN_THRESHOLD = 100     # 连续失败 100 次 → 完全熔断
_CB_STAGE1_SLEEP = 30        # 降频 1 级：30 秒
_CB_STAGE2_SLEEP = 300       # 降频 2 级：5 分钟
_CB_HALF_OPEN_TTL = 1800     # 熔断自动半开：30 分钟

_PAIR_QUOTES = ("USDT", "USDC", "BUSD", "USD", "PERP")


def normalize_pair_symbol(symbol: str) -> str:
    raw = (symbol or "").strip().upper().replace("/", "").replace("-", "").replace("_", "")
    if not raw:
        return raw
    for quote in _PAIR_QUOTES:
        if raw.endswith(quote):
            return raw
    return f"{raw}USDT"


def normalize_coin_symbol(symbol: str) -> str:
    raw = (symbol or "").strip().upper().replace("/", "").replace("-", "").replace("_", "")
    if not raw:
        return raw
    for quote in sorted(_PAIR_QUOTES, key=len, reverse=True):
        if raw.endswith(quote) and len(raw) > len(quote):
            return raw[:-len(quote)]
    return raw


def normalize_compact_interval(interval: str) -> str:
    raw = (interval or "").strip().lower()
    if len(raw) >= 2 and raw[:-1].isdigit() and raw[-1] in {"m", "h", "d", "w"}:
        return f"{raw[-1]}{raw[:-1]}"
    return raw


class CoinGlassClient:
    """CoinGlass API V4 统一客户端 — 双通道、限频、重试、超时、套餐感知。"""

    def __init__(self, tier_manager: TierManager) -> None:
        """初始化客户端，注入 TierManager。"""
        self._tier_manager = tier_manager
        self._channels: dict[str, ChannelConfig] = {}
        self._clients: dict[str, httpx.AsyncClient] = {}
        for ch in _CHANNEL_PRIORITY:
            self._channels[ch.channel_id] = ch
            self._clients[ch.channel_id] = httpx.AsyncClient(
                base_url=ch.base_url,
                timeout=httpx.Timeout(_TIMEOUT_SECONDS),
            )
        self._active_channel: str | None = None  # 内存缓存
        self._last_request_time: float = 0.0  # throttle 用
        self._last_probe_time: float = 0.0  # 探测间隔控制

    # ----------------------------------------------------------
    # 公开 API（签名不变，上层零改动）
    # ----------------------------------------------------------

    async def get(
        self,
        path: str,
        endpoint: str,
        params: dict[str, str | int] | None = None,
    ) -> dict | list | None:
        """发起 GET 请求。

        Args:
            path: API 路径，如 ``/api/futures/openInterest/ohlc-history``。
            endpoint: TierManager 端点名称，如 ``oi-ohlc-history``。
            params: 查询参数。

        Returns:
            成功时返回 JSON 响应体（dict 或 list），失败返回 None。
        """
        # 0. P2-C: 快速失败 — 若当前通道处于全熔断（cg_circuit_open:{ch} 存在），直接返回 None
        #    半开逻辑：Redis key 因 TTL 过期则自动解除，下次重试恢复
        _quick_channel = await self._resolve_channel()
        if _quick_channel and await self._is_circuit_open(_quick_channel):
            logger.warning(
                "circuit_breaker_blocking_request",
                channel=_quick_channel,
                endpoint=endpoint,
            )
            return None

        # 1. 解析活跃通道
        channel_id = await self._resolve_channel()
        if channel_id is None:
            logger.warning("no_channel_available")
            return None

        channel = self._channels[channel_id]

        # 2. proxy 通道：检查日配额
        if channel_id == "proxy":
            quota_ok = await self._check_proxy_quota()
            if not quota_ok:
                await self._switch_channel("official", "proxy_daily_quota_exceeded")
                channel_id = "official"
                channel = self._channels[channel_id]
                # official 也没 Key → 返回 None
                api_key = await get_config_value(channel.key_config, "")
                if not api_key:
                    logger.warning("fallback_channel_no_key", channel=channel_id)
                    return None

        # 3. 检查 API Key
        api_key = await get_config_value(channel.key_config, "")
        if not api_key:
            logger.warning("api_key_not_configured", channel=channel_id)
            return None

        # 4. 检查端点可用性
        tier = await self._tier_manager.get_current_tier()
        if not self._tier_manager.is_endpoint_available(tier, endpoint):
            logger.warning(
                "endpoint_not_available",
                endpoint=endpoint,
                tier=tier.value,
            )
            return None

        # 5. 原子预留限频 slot（跨 worker 保证）
        is_overflow = False  # 借路标志：True 表示本次请求借路 official，不改变运行态
        slot_ok = await self._tier_manager.reserve_rate_slot(channel=channel_id)
        if not slot_ok:
            if channel_id == "proxy" and not await self._is_channel_locked():
                # proxy 限频耗尽 → 单次溢出到 official（不切换活跃通道）
                fb = self._channels.get("official")
                fb_key = (
                    await get_config_value(fb.key_config, "") if fb else ""
                )
                fb_slot = (
                    await self._tier_manager.reserve_rate_slot(channel="official")
                    if fb_key
                    else False
                )
                if fb_slot:
                    logger.info(
                        "proxy_rate_overflow_to_official",
                        endpoint=endpoint,
                    )
                    is_overflow = True
                    channel_id = "official"
                    channel = fb
                    api_key = fb_key
                else:
                    logger.warning(
                        "rate_slot_exhausted_all_channels",
                        endpoint=endpoint,
                        channel=channel_id,
                    )
                    return None
            else:
                logger.warning(
                    "rate_slot_exhausted",
                    endpoint=endpoint,
                    tier=tier.value,
                    channel=channel_id,
                )
                return None

        # 5b. proxy: 递增日用量（保守口径：按 attempt 记账）
        if channel_id == "proxy":
            await self._incr_proxy_daily_usage()

        # 6. proxy 通道：单实例平滑缓冲（非全局保证）
        if channel_id == "proxy":
            await self._throttle_if_proxy()

        # 7. 发起请求
        result = await self._do_request(channel, path, api_key, params)

        if result is not None:
            # 请求成功 — 重置失败计数（rate slot 已在步骤 5 原子预留）
            await self._on_request_success(channel_id)
            # 借路 official 时跳过 probe：活跃通道仍为 proxy，不应触发恢复探测
            if not is_overflow:
                await self._maybe_probe_proxy(channel_id)
            return result

        # 8. 请求失败 — 递增失败计数
        failure_count = await self._on_request_failure(channel_id)

        # 9. 连续失败 ≥ 阈值 → 尝试 fallback
        #    借路 official 失败时不触发通道切换（活跃通道仍为 proxy）
        if not is_overflow and failure_count >= _MAX_CONSECUTIVE_FAILURES:
            locked = await self._is_channel_locked()
            if locked:
                logger.warning(
                    "channel_locked_no_fallback",
                    channel=channel_id,
                    failures=failure_count,
                )
                return None

            fallback_id = self._get_fallback_channel(channel_id)
            if fallback_id is None:
                return None

            fallback = self._channels[fallback_id]
            fb_key = await get_config_value(fallback.key_config, "")
            if not fb_key:
                logger.warning("fallback_channel_no_key", channel=fallback_id)
                return None

            # fallback 通道：原子预留 rate slot
            fb_slot = await self._tier_manager.reserve_rate_slot(channel=fallback_id)
            if not fb_slot:
                return None

            if fallback_id == "proxy":
                await self._incr_proxy_daily_usage()
                await self._throttle_if_proxy()

            fb_result = await self._do_request(fallback, path, fb_key, params)
            if fb_result is not None:
                await self._switch_channel(
                    fallback_id,
                    f"consecutive_failures_{failure_count}_on_{channel_id}",
                )
                await self._on_request_success(fallback_id)
                return fb_result

        # P2-C: 分级退避（不切换通道，只延迟）
        if not is_overflow:
            await self._graduated_backoff(channel_id, failure_count)

        return None

    async def close(self) -> None:
        """关闭所有 httpx.AsyncClient。"""
        for client in self._clients.values():
            await client.aclose()

    # ----------------------------------------------------------
    # 通道解析
    # ----------------------------------------------------------

    async def _resolve_channel(self) -> str | None:
        """从 Redis 读取活跃通道，冷启动按优先级选择。"""
        try:
            redis = get_redis_pool()
            active = await redis.get("cg_channel:active")
            if active and active in self._channels:
                # 校验该通道有 Key
                ch = self._channels[active]
                key = await get_config_value(ch.key_config, "")
                if key:
                    self._active_channel = active
                    return active
                # 活跃通道无 Key，走冷启动逻辑
        except RuntimeError:
            logger.warning("redis_unavailable", action="resolve_channel")
            if self._active_channel and self._active_channel in self._channels:
                return self._active_channel
        except Exception as exc:
            logger.warning("resolve_channel_error", error=str(exc))
            if self._active_channel and self._active_channel in self._channels:
                return self._active_channel

        # 冷启动：按优先级选第一个有 Key 的通道
        return await self._cold_start_select()

    async def _cold_start_select(self) -> str | None:
        """冷启动：按优先级选通道，不探测。"""
        for ch in _CHANNEL_PRIORITY:
            key = await get_config_value(ch.key_config, "")
            if key:
                self._active_channel = ch.channel_id
                # 写入 Redis
                try:
                    redis = get_redis_pool()
                    pipe = redis.pipeline()
                    pipe.set("cg_channel:active", ch.channel_id)
                    pipe.set("cg_channel:switched_at", str(int(time.time())))
                    pipe.set("cg_channel:switch_reason", "cold_start")
                    await pipe.execute()
                except Exception:
                    pass  # Redis 不可用，仅用内存
                logger.info(
                    "channel_cold_start",
                    channel=ch.channel_id,
                )
                return ch.channel_id
        return None

    # ----------------------------------------------------------
    # 通道切换
    # ----------------------------------------------------------

    async def _switch_channel(self, new_channel: str, reason: str) -> None:
        """切换活跃通道，写 Redis + 结构化日志。"""
        if await self._is_channel_locked():
            logger.warning(
                "channel_switch_blocked_by_lock",
                target=new_channel,
                reason=reason,
            )
            return

        old_channel = self._active_channel
        self._active_channel = new_channel

        try:
            redis = get_redis_pool()
            pipe = redis.pipeline()
            pipe.set("cg_channel:active", new_channel)
            pipe.set("cg_channel:switched_at", str(int(time.time())))
            pipe.set("cg_channel:switch_reason", reason)
            # 重置新通道失败计数
            pipe.delete(f"cg_channel:failures:{new_channel}")
            await pipe.execute()
        except Exception as exc:
            logger.warning("switch_channel_redis_error", error=str(exc))

        logger.info(
            "channel_switched",
            old_channel=old_channel or "none",
            new_channel=new_channel,
            reason=reason,
        )

    def _get_fallback_channel(self, current: str) -> str | None:
        """返回另一个通道 ID，如果不存在返回 None。"""
        for ch in _CHANNEL_PRIORITY:
            if ch.channel_id != current:
                return ch.channel_id
        return None

    # ----------------------------------------------------------
    # 运维锁定
    # ----------------------------------------------------------

    async def _is_channel_locked(self) -> bool:
        """检查 Redis 运维锁定标记。"""
        try:
            redis = get_redis_pool()
            locked = await redis.get("cg_channel:locked")
            return bool(locked)
        except Exception:
            return False  # fail-open

    # ----------------------------------------------------------
    # 失败计数（Redis 原子计数器，按通道隔离）
    # ----------------------------------------------------------

    async def _on_request_success(self, channel_id: str) -> None:
        """请求成功：重置失败计数。日用量已在请求前按 attempt 记账。"""
        try:
            redis = get_redis_pool()
            await redis.delete(f"cg_channel:failures:{channel_id}")
        except Exception as exc:
            logger.warning("on_request_success_redis_error", error=str(exc))

    async def _on_request_failure(self, channel_id: str) -> int:
        """请求失败：Redis INCR 失败计数，返回当前计数。"""
        try:
            redis = get_redis_pool()
            key = f"cg_channel:failures:{channel_id}"
            pipe = redis.pipeline()
            pipe.incr(key)
            pipe.expire(key, 120)  # TTL 120s 自动衰减
            results = await pipe.execute()
            cnt = int(results[0])

            # P2-C: 达到全熔断阈值，写熔断键（30min TTL 自动半开）
            if cnt >= _CB_OPEN_THRESHOLD:
                cb_key = f"cg_circuit_open:{channel_id}"
                try:
                    await redis.set(cb_key, str(int(time.time())), ex=_CB_HALF_OPEN_TTL)
                    logger.warning(
                        "circuit_breaker_open",
                        channel=channel_id,
                        failures=cnt,
                        half_open_in_secs=_CB_HALF_OPEN_TTL,
                    )
                except Exception:
                    pass

            return cnt
        except Exception as exc:
            logger.warning("on_request_failure_redis_error", error=str(exc))
            return 0

    async def _graduated_backoff(self, channel_id: str, failure_count: int) -> None:
        """P2-C: 分级退避睡眠（不切换通道）。

        - failure_count >= _CB_STAGE2_THRESHOLD (10): 5 分钟
        - failure_count >= _CB_STAGE1_THRESHOLD  (3): 30 秒
        - 其他: 不睡眠
        """
        if failure_count >= _CB_STAGE2_THRESHOLD:
            logger.warning(
                "circuit_backoff_stage2",
                channel=channel_id,
                failures=failure_count,
                sleep_secs=_CB_STAGE2_SLEEP,
            )
            await asyncio.sleep(_CB_STAGE2_SLEEP)
        elif failure_count >= _CB_STAGE1_THRESHOLD:
            logger.warning(
                "circuit_backoff_stage1",
                channel=channel_id,
                failures=failure_count,
                sleep_secs=_CB_STAGE1_SLEEP,
            )
            await asyncio.sleep(_CB_STAGE1_SLEEP)

    async def _is_circuit_open(self, channel_id: str) -> bool:
        """P2-C: 检查该通道是否处于熔断状态（cg_circuit_open:{channel} 键存在）。"""
        try:
            redis = get_redis_pool()
            val = await redis.get(f"cg_circuit_open:{channel_id}")
            return val is not None
        except Exception:
            return False  # fail-open

    # ----------------------------------------------------------
    # Proxy 配额保护
    # ----------------------------------------------------------

    async def _check_proxy_quota(self) -> bool:
        """检查 proxy 配额。优先参考新鲜的供应商真值，回退到本地日计数。"""
        try:
            redis = get_redis_pool()

            # 定期触发 /usage/me 对账
            await self._maybe_sync_quota(redis)

            # 优先检查供应商月度真值（1 小时内视为新鲜）
            synced_at = await redis.get("cg_proxy_quota_synced_at")
            if synced_at:
                age = int(time.time()) - int(synced_at)
                if age < _QUOTA_FRESHNESS_SECONDS:
                    remaining_str = await redis.get("cg_proxy_quota_remaining")
                    if remaining_str is not None:
                        remaining = int(remaining_str)
                        if remaining <= 0:
                            logger.warning(
                                "proxy_monthly_quota_exhausted_supplier",
                                remaining=remaining,
                            )
                            return False

            # 本地日计数保护
            date_key = self._proxy_daily_key()
            current = await redis.get(date_key)
            count = int(current) if current is not None else 0

            if count >= _PROXY_DAILY_BUDGET:
                logger.warning(
                    "proxy_daily_quota_exceeded",
                    usage=count,
                    budget=_PROXY_DAILY_BUDGET,
                )
                return False

            if count >= _PROXY_QUOTA_WARNING_THRESHOLD:
                logger.warning(
                    "proxy_daily_quota_warning_80pct",
                    usage=count,
                    budget=_PROXY_DAILY_BUDGET,
                )

            return True
        except Exception as exc:
            logger.warning("check_proxy_quota_redis_error", error=str(exc))
            return True  # fail-open

    @staticmethod
    def _proxy_daily_key() -> str:
        """生成 proxy 日配额 Redis key（UTC 日期）。"""
        date_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        return f"cg_proxy_daily:{date_str}"

    async def _incr_proxy_daily_usage(self) -> None:
        """递增 proxy 日用量（保守口径：按 attempt 记账，含主请求/probe/retry）。"""
        try:
            redis = get_redis_pool()
            date_key = self._proxy_daily_key()
            pipe = redis.pipeline()
            pipe.incr(date_key)
            pipe.expire(date_key, 48 * 3600)
            await pipe.execute()
        except Exception as exc:
            logger.warning("incr_proxy_daily_usage_error", error=str(exc))

    # ----------------------------------------------------------
    # Proxy Throttle
    # ----------------------------------------------------------

    async def _throttle_if_proxy(self) -> None:
        """单实例平滑缓冲：proxy 通道下保持请求间隔 ≥ 1.2s。不是全局限频保证。"""
        now = time.monotonic()
        elapsed = now - self._last_request_time
        if elapsed < _PROXY_THROTTLE_INTERVAL:
            await asyncio.sleep(_PROXY_THROTTLE_INTERVAL - elapsed)
        self._last_request_time = time.monotonic()

    # ----------------------------------------------------------
    # 自动恢复探测
    # ----------------------------------------------------------

    async def _maybe_probe_proxy(self, current_channel: str) -> None:
        """当 official 活跃时，定期探测 proxy 是否恢复。"""
        if current_channel != "official":
            return

        now = time.monotonic()
        if now - self._last_probe_time < _PROBE_INTERVAL:
            return

        # Redis 探测锁防止多 worker 并发
        try:
            redis = get_redis_pool()
            acquired = await redis.set(
                "cg_channel:probing", "1", nx=True, ex=60,
            )
            if not acquired:
                return  # 另一个 worker 正在探测
        except Exception:
            return

        self._last_probe_time = now

        if await self._probe_channel("proxy"):
            locked = await self._is_channel_locked()
            if not locked:
                await self._switch_channel("proxy", "probe_recovery")
                logger.info("proxy_recovered_via_probe")
            else:
                logger.info("proxy_probe_ok_but_locked")

    async def _probe_channel(self, channel_id: str) -> bool:
        """对目标通道发送轻量探测请求。探测也需预留 rate slot 和日配额。"""
        ch = self._channels.get(channel_id)
        if ch is None:
            return False

        api_key = await get_config_value(ch.key_config, "")
        if not api_key:
            return False

        # 探测也需要预留 rate slot（保守口径）
        slot_ok = await self._tier_manager.reserve_rate_slot(channel=channel_id)
        if not slot_ok:
            return False

        # 探测也计入 proxy 日配额（按 attempt 记账）
        if channel_id == "proxy":
            await self._incr_proxy_daily_usage()

        full_path = ch.path_prefix + _PROBE_PATH
        headers = {ch.auth_header: api_key}
        client = self._clients.get(channel_id)
        if client is None:
            return False

        try:
            response = await client.get(full_path, headers=headers)
            return 200 <= response.status_code < 300
        except Exception:
            return False

    # ----------------------------------------------------------
    # /usage/me 对账（T7.2）
    # ----------------------------------------------------------

    async def _maybe_sync_quota(self, redis) -> None:
        """每小时触发一次 /usage/me 对账。Redis 锁防止多 worker 并发。"""
        try:
            synced_at = await redis.get("cg_proxy_quota_synced_at")
            if synced_at:
                age = int(time.time()) - int(synced_at)
                if age < _QUOTA_FRESHNESS_SECONDS:
                    return
            acquired = await redis.set(
                "cg_proxy_quota_syncing", "1", nx=True, ex=_QUOTA_SYNC_LOCK_TTL,
            )
            if not acquired:
                return
            await self._sync_proxy_quota()
        except Exception as exc:
            logger.warning("maybe_sync_quota_error", error=str(exc))

    async def _sync_proxy_quota(self) -> None:
        """调用 /usage/me 同步供应商真实配额信息到 Redis。"""
        usage_data = await self._fetch_usage_me()
        if usage_data is None:
            logger.warning("sync_proxy_quota_skipped", reason="usage_me_unavailable")
            return

        try:
            redis = get_redis_pool()
            now_ts = str(int(time.time()))
            pipe = redis.pipeline()

            remaining = usage_data.get("remaining")
            if remaining is None:
                remaining = usage_data.get("quota_remaining")
            used_remote = usage_data.get("used")
            if used_remote is None:
                used_remote = usage_data.get("quota_used")

            if remaining is not None:
                pipe.set("cg_proxy_quota_remaining", str(remaining))
                pipe.expire("cg_proxy_quota_remaining", 48 * 3600)
            if used_remote is not None:
                pipe.set("cg_proxy_quota_used_remote", str(used_remote))
                pipe.expire("cg_proxy_quota_used_remote", 48 * 3600)

            pipe.set("cg_proxy_quota_synced_at", now_ts)
            pipe.expire("cg_proxy_quota_synced_at", 48 * 3600)

            if used_remote is not None:
                local_daily_str = await redis.get(self._proxy_daily_key())
                local_daily = int(local_daily_str) if local_daily_str else 0
                drift = int(used_remote) - local_daily
                pipe.set("cg_proxy_quota_drift", str(drift))
                pipe.expire("cg_proxy_quota_drift", 48 * 3600)
                if abs(drift) > 100:
                    logger.warning(
                        "proxy_quota_drift_detected",
                        local_daily=local_daily,
                        used_remote=used_remote,
                        drift=drift,
                    )

            await pipe.execute()
            logger.info(
                "proxy_quota_synced",
                remaining=remaining,
                used_remote=used_remote,
            )
        except Exception as exc:
            logger.warning("sync_proxy_quota_error", error=str(exc))

    async def _fetch_usage_me(self) -> dict | None:
        """直接调用 AlphaNode /usage/me，不经过 get() 避免递归和自污染。"""
        ch = self._channels.get("proxy")
        if ch is None:
            return None

        api_key = await get_config_value(ch.key_config, "")
        if not api_key:
            return None

        client = self._clients.get("proxy")
        if client is None:
            return None

        try:
            headers = {ch.auth_header: api_key}
            response = await client.get(
                _USAGE_ME_PATH,
                headers=headers,
                timeout=httpx.Timeout(10),
            )
            if 200 <= response.status_code < 300:
                return response.json()
            logger.warning(
                "usage_me_non_2xx",
                status_code=response.status_code,
            )
            return None
        except Exception as exc:
            logger.warning("fetch_usage_me_failed", error=str(exc))
            return None

    # ----------------------------------------------------------
    # HTTP 请求执行
    # ----------------------------------------------------------

    async def _do_request(
        self,
        channel: ChannelConfig,
        path: str,
        api_key: str,
        params: dict[str, str | int] | None,
    ) -> dict | list | None:
        """对指定通道发起 GET 请求（含 429 重试），返回 JSON 或 None。"""
        full_path = channel.path_prefix + path
        headers = {channel.auth_header: api_key}
        client = self._clients[channel.channel_id]

        attempt = 0
        while attempt <= _MAX_RETRIES:
            try:
                response = await client.get(
                    full_path,
                    params=params,
                    headers=headers,
                )
            except httpx.TimeoutException:
                logger.error(
                    "request_timeout",
                    path=path,
                    channel=channel.channel_id,
                    timeout=_TIMEOUT_SECONDS,
                )
                return None
            except httpx.HTTPError as exc:
                logger.error(
                    "request_error",
                    path=path,
                    channel=channel.channel_id,
                    error=str(exc),
                )
                return None

            if response.status_code == 429:
                retry_after = int(
                    response.headers.get("Retry-After", str(_DEFAULT_RETRY_AFTER))
                )
                logger.warning(
                    "rate_limited_429",
                    path=path,
                    channel=channel.channel_id,
                    attempt=attempt + 1,
                    retry_after=retry_after,
                )
                attempt += 1
                if attempt > _MAX_RETRIES:
                    logger.error(
                        "max_retries_exceeded",
                        path=path,
                        channel=channel.channel_id,
                    )
                    return None
                await asyncio.sleep(retry_after)
                continue

            if response.status_code < 200 or response.status_code >= 300:
                logger.error(
                    "non_2xx_response",
                    path=path,
                    channel=channel.channel_id,
                    status_code=response.status_code,
                    body=response.text[:500],
                )
                return None

            # 成功
            try:
                return response.json()
            except Exception as exc:
                logger.error(
                    "json_parse_error",
                    path=path,
                    channel=channel.channel_id,
                    error=str(exc),
                )
                return None

        return None

    # ----------------------------------------------------------
    # 定时主动恢复（T7.3 — 独立于请求流量）
    # ----------------------------------------------------------

    async def scheduled_probe_proxy(self) -> dict:
        """定时任务入口：当 official 活跃时，主动探测 proxy 是否恢复。

        与 request-driven ``_maybe_probe_proxy`` 语义分离：
        - 本方法由 Celery Beat 周期触发，不依赖请求流量
        - 切换原因使用 ``scheduled_probe_recovery``
        - 共享 ``cg_channel:probing`` 分布式锁，避免多 worker 重复探测

        Returns:
            包含 action / reason 的结果字典，供日志 / 监控使用。
        """
        try:
            redis = get_redis_pool()
        except Exception:
            return {"action": "skip", "reason": "redis_unavailable"}

        # 1. 读当前活跃通道
        try:
            active = await redis.get("cg_channel:active")
        except Exception:
            return {"action": "skip", "reason": "redis_read_error"}

        if active != "official":
            return {"action": "noop", "reason": "proxy_already_active"}

        # 2. 检查 lock
        if await self._is_channel_locked():
            logger.info("scheduled_probe_skip_locked")
            return {"action": "skip", "reason": "channel_locked"}

        # 3. 获取分布式探测锁（复用 cg_channel:probing）
        try:
            acquired = await redis.set(
                "cg_channel:probing", "1", nx=True, ex=60,
            )
            if not acquired:
                return {"action": "skip", "reason": "probe_lock_held"}
        except Exception:
            return {"action": "skip", "reason": "probe_lock_error"}

        # 4. 探测 proxy
        try:
            probe_ok = await self._probe_channel("proxy")
        except Exception:
            probe_ok = False

        if not probe_ok:
            logger.info("scheduled_probe_proxy_not_recovered")
            return {"action": "noop", "reason": "proxy_not_recovered"}

        # 5. 探测成功 → 切回 proxy（switch_channel 内部会再次检查 lock）
        await self._switch_channel("proxy", "scheduled_probe_recovery")
        logger.info("proxy_recovered_via_scheduled_probe")
        return {"action": "switched", "reason": "scheduled_probe_recovery"}
