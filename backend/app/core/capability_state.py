"""Redis 能力状态协议 — UI / API / Agent 共享同一份 capability contract。

每个 Redis 数据能力对应一个状态：
  - available      : 有写入端且数据正常刷新
  - unavailable    : 暂无写入端（如需接入第三方 API），读取侧应优雅降级
  - disabled       : 管理员主动关闭或数据源未启用
  - tier-limited   : 能力存在但受会员等级限制，需升级后可见

消费侧统一通过 get_capability_status() 获取状态，
写入侧通过 set_capability_status() 注册/更新状态。
"""

import enum
import json
import logging
from typing import Any

logger = logging.getLogger(__name__)


class CapabilityStatus(str, enum.Enum):
    AVAILABLE = "available"
    UNAVAILABLE = "unavailable"
    DISABLED = "disabled"
    TIER_LIMITED = "tier-limited"
    DEGRADED = "degraded"


# ── 能力注册表（静态声明 + 运行时状态） ─────────────────────────

# 每个 capability 的元信息：canonical key pattern, 默认状态, 原因
_CAPABILITY_REGISTRY: dict[str, dict[str, Any]] = {
    # ── market 域 · owner: Binance ──────────────────────────────
    "market_klines":     {"status": CapabilityStatus.AVAILABLE,   "reason": "", "domain": "market",      "owner": "Binance",      "cache_key": "klines:{symbol}:{interval}"},
    "orderbook":         {"status": CapabilityStatus.AVAILABLE,   "reason": "", "domain": "market",      "owner": "Binance",      "cache_key": "orderbook:{symbol}"},
    "derivatives":       {"status": CapabilityStatus.AVAILABLE,   "reason": "", "domain": "market",      "owner": "Binance",      "cache_key": "derivatives:{symbol}"},
    # ── derivatives 域 · owner: CoinGlass ───────────────────────
    "cg_oi":             {"status": CapabilityStatus.AVAILABLE,   "reason": "", "domain": "derivatives", "owner": "CoinGlass", "cache_key": "cg_oi:{symbol}"},
    "cg_cvd":            {"status": CapabilityStatus.AVAILABLE,   "reason": "", "domain": "derivatives", "owner": "CoinGlass",    "cache_key": "cg_cvd:{symbol}"},
    "cg_netflow":        {"status": CapabilityStatus.AVAILABLE,   "reason": "", "domain": "derivatives", "owner": "CoinGlass",    "cache_key": "cg_netflow:{symbol}"},
    "cg_orderbook":      {"status": CapabilityStatus.AVAILABLE,   "reason": "", "domain": "derivatives", "owner": "CoinGlass",    "cache_key": "cg_orderbook:{symbol}"},
    "cg_fr":             {"status": CapabilityStatus.AVAILABLE,   "reason": "", "domain": "derivatives", "owner": "CoinGlass", "cache_key": "cg_fr:{symbol}"},
    "cg_net_position":   {"status": CapabilityStatus.AVAILABLE,   "reason": "", "domain": "derivatives", "owner": "CoinGlass",    "cache_key": "cg_net_position:{symbol}"},
    "cg_weighted_fr":    {"status": CapabilityStatus.AVAILABLE,   "reason": "", "domain": "derivatives", "owner": "CoinGlass",    "cache_key": "cg_weighted_fr:{symbol}"},
    "cg_fr_arb":         {"status": CapabilityStatus.AVAILABLE,   "reason": "", "domain": "derivatives", "owner": "CoinGlass",    "cache_key": "cg_fr_arb:{symbol}"},
    "cg_large_orders":   {"status": CapabilityStatus.AVAILABLE,   "reason": "", "domain": "derivatives", "owner": "CoinGlass",    "cache_key": "cg_large_orders:{symbol}"},
    "cg_option_maxpain": {"status": CapabilityStatus.AVAILABLE,   "reason": "", "domain": "derivatives", "owner": "CoinGlass",    "cache_key": "cg_option_maxpain:{symbol}"},
    # ── onchain 域 · owner: GlassNode (Professional T3)（fallback: CryptoQuant / Alternative.me）
    "onchain":           {"status": CapabilityStatus.AVAILABLE,   "reason": "", "domain": "onchain",     "owner": "GlassNode",    "cache_key": "onchain:{symbol}"},
    "sentiment:fear_greed": {"status": CapabilityStatus.AVAILABLE, "reason": "", "domain": "onchain",    "owner": "Alternative.me", "cache_key": "sentiment:fear_greed"},
    # ── macro 域 · owner: FRED（主源） + CoinGecko（辅助/fallback） ──
    "fred_macro":        {"status": CapabilityStatus.AVAILABLE,   "reason": "", "domain": "macro",       "owner": "FRED",         "cache_key": "fred_snapshot"},
    "gecko_market":      {"status": CapabilityStatus.AVAILABLE,   "reason": "", "domain": "macro",       "owner": "CoinGecko",    "cache_key": "gecko_market:{symbol}"},
    "gecko_community":   {"status": CapabilityStatus.AVAILABLE,   "reason": "", "domain": "macro",       "owner": "CoinGecko",    "cache_key": "gecko_community:{symbol}"},
    "gecko_developer":   {"status": CapabilityStatus.AVAILABLE,   "reason": "", "domain": "macro",       "owner": "CoinGecko",    "cache_key": "gecko_developer:{symbol}"},
    "gecko_global":      {"status": CapabilityStatus.AVAILABLE,   "reason": "", "domain": "macro",       "owner": "CoinGecko",    "cache_key": "gecko_global"},
    "gecko_trending":    {"status": CapabilityStatus.AVAILABLE,   "reason": "", "domain": "macro",       "owner": "CoinGecko",    "cache_key": "gecko_trending"},
    # ── 辅助能力（不属于四主域，保留兼容） ──────────────────────
    "news:feed":         {"status": CapabilityStatus.AVAILABLE,   "reason": "", "domain": "auxiliary",   "owner": "Finnhub/BlockBeats", "cache_key": "news:feed:{symbol}"},
    "calendar":          {"status": CapabilityStatus.AVAILABLE,   "reason": "", "domain": "auxiliary",   "owner": "CoinMarketCal", "cache_key": "calendar_events:{symbol}"},
    "sentiment:kol":      {"status": CapabilityStatus.UNAVAILABLE, "reason": "需接入 LunarCrush/Twitter API", "domain": "auxiliary", "owner": "—", "cache_key": ""},
    "sentiment:mentions": {"status": CapabilityStatus.UNAVAILABLE, "reason": "需接入 LunarCrush/Twitter API", "domain": "auxiliary", "owner": "—", "cache_key": ""},
}

# Redis key 用于存储运行时能力状态
_CAP_STATE_KEY = "capability:state"


def get_capability_meta(capability: str) -> dict[str, Any]:
    """获取能力的静态元信息（状态 + 原因）。"""
    entry = _CAPABILITY_REGISTRY.get(capability)
    if entry is None:
        return {"status": CapabilityStatus.UNAVAILABLE, "reason": f"unknown capability: {capability}"}
    return entry


async def is_capability_available(capability: str) -> bool:
    """判断能力是否 available（优先读 Redis 运行时状态，回退到静态注册表）。"""
    status_info = await get_capability_status(capability)
    return status_info.get("status") in (CapabilityStatus.AVAILABLE, CapabilityStatus.AVAILABLE.value)


async def get_capability_status(capability: str) -> dict[str, Any]:
    """获取能力的运行时状态（优先 Redis，回退到静态注册表）。"""
    try:
        from app.core.redis import get_redis_pool
        redis = get_redis_pool()
        raw = await redis.hget(_CAP_STATE_KEY, capability)
        if raw:
            return json.loads(raw)
    except Exception:
        pass
    return get_capability_meta(capability)


async def set_capability_status(
    capability: str,
    status: CapabilityStatus,
    reason: str = "",
) -> None:
    """更新 Redis 中的运行时能力状态。"""
    try:
        from app.core.redis import get_redis_pool
        redis = get_redis_pool()
        payload = json.dumps({"status": status.value, "reason": reason})
        await redis.hset(_CAP_STATE_KEY, capability, payload)
    except Exception as exc:
        logger.warning("set_capability_status failed: %s", exc)


async def get_all_capabilities() -> dict[str, dict[str, Any]]:
    """返回所有能力的状态矩阵（合并静态注册表 + 运行时覆盖）。"""
    result: dict[str, dict[str, Any]] = {}
    for cap, meta in _CAPABILITY_REGISTRY.items():
        result[cap] = {
            "status": meta["status"].value,
            "reason": meta["reason"],
            "domain": meta.get("domain", ""),
            "owner": meta.get("owner", ""),
            "cache_key": meta.get("cache_key", ""),
        }

    try:
        from app.core.redis import get_redis_pool
        redis = get_redis_pool()
        all_states = await redis.hgetall(_CAP_STATE_KEY)
        for cap, raw in all_states.items():
            if cap in result:
                result[cap] = json.loads(raw)
    except Exception:
        pass

    return result
