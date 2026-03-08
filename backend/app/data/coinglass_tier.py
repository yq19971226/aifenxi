"""CoinGlass 套餐管理 — 限频、端点可用性、功能矩阵。

纯数据层模块，根据 Config_Service 中的 coinglass_tier 配置控制
限频上限、端点可用性、采集频率和功能矩阵。
"""

import time
from typing import Dict, FrozenSet

import structlog

from app.core.redis import get_redis_pool
from app.models.coinglass import CoinGlassTier, TierCapabilities
from app.services.config_service import get_config_value

logger = structlog.get_logger(__name__)


# ============================================================
# 四级套餐能力矩阵（静态常量）
# ============================================================

_TIER_CAPABILITIES: Dict[CoinGlassTier, TierCapabilities] = {
    CoinGlassTier.HOBBYIST: TierCapabilities(
        tier=CoinGlassTier.HOBBYIST,
        rate_limit_per_minute=30,
        collect_interval_seconds=300,
        max_symbols=50,
        history_depth_days=90,
        websocket_enabled=False,
        features={
            "basic_oi": True,
            "net_position": False,
            "top_longshort": False,
            "weighted_funding_rate": False,
            "taker_volume": False,
            "heatmap_model1": False,
            "heatmap_model2_3": False,
            "liquidation_order": False,
            "liquidation_max_pain": False,
            "fr_arbitrage": False,
            "stablecoin_coin_margin_oi": False,
            "options": False,
            "kill_basic": False,
            "kill_enhanced": False,
            "kill_full": False,
            "websocket": False,
        },
    ),
    CoinGlassTier.STARTUP: TierCapabilities(
        tier=CoinGlassTier.STARTUP,
        rate_limit_per_minute=80,
        collect_interval_seconds=120,
        max_symbols=100,
        history_depth_days=180,
        websocket_enabled=False,
        features={
            "basic_oi": True,
            "net_position": True,
            "top_longshort": True,
            "weighted_funding_rate": True,
            "taker_volume": True,
            "heatmap_model1": True,
            "heatmap_model2_3": False,
            "liquidation_order": False,
            "liquidation_max_pain": False,
            "fr_arbitrage": True,
            "stablecoin_coin_margin_oi": True,
            "options": True,
            "kill_basic": True,
            "kill_enhanced": False,
            "kill_full": False,
            "websocket": False,
        },
    ),
    CoinGlassTier.STANDARD: TierCapabilities(
        tier=CoinGlassTier.STANDARD,
        rate_limit_per_minute=300,
        collect_interval_seconds=60,
        max_symbols=300,
        history_depth_days=730,
        websocket_enabled=True,
        features={
            "basic_oi": True,
            "net_position": True,
            "top_longshort": True,
            "weighted_funding_rate": True,
            "taker_volume": True,
            "heatmap_model1": True,
            "heatmap_model2_3": True,
            "liquidation_order": True,
            "liquidation_max_pain": True,
            "fr_arbitrage": True,
            "stablecoin_coin_margin_oi": True,
            "options": True,
            "kill_basic": True,
            "kill_enhanced": True,
            "kill_full": False,
            "websocket": True,
        },
    ),
    CoinGlassTier.PROFESSIONAL: TierCapabilities(
        tier=CoinGlassTier.PROFESSIONAL,
        rate_limit_per_minute=1200,
        collect_interval_seconds=30,
        max_symbols=7000,
        history_depth_days=1095,
        websocket_enabled=True,
        features={
            "basic_oi": True,
            "net_position": True,
            "top_longshort": True,
            "weighted_funding_rate": True,
            "taker_volume": True,
            "heatmap_model1": True,
            "heatmap_model2_3": True,
            "liquidation_order": True,
            "liquidation_max_pain": True,
            "fr_arbitrage": True,
            "stablecoin_coin_margin_oi": True,
            "options": True,
            "kill_basic": True,
            "kill_enhanced": True,
            "kill_full": True,
            "websocket": True,
        },
    ),
}


# ============================================================
# 端点可用性矩阵（按套餐等级累积）
# ============================================================

# ── V4 API 实际可用端点（2026-03 验证） ──────────────────────
# 注意：V4 已移除大量 openInterest/*, fundingRate/* 路径

_HOBBYIST_ENDPOINTS: FrozenSet[str] = frozenset({
    # 爆仓聚合
    "liquidation-coin-list",          # /api/futures/liquidation/coin-list
    "liquidation-exchange-list",      # /api/futures/liquidation/exchange-list
    # 期权概览
    "option-info",                    # /api/option/info
    # 恐慌贪婪指数
    "fear-greed-history",             # /api/index/fear-greed-history
})

_STARTUP_EXTRA_ENDPOINTS: FrozenSet[str] = frozenset({
    "oi-ohlc-history",
    "oi-ohlc-aggregated-history",
    "oi-exchange-list",
    "oi-exchange-history-chart",
    # 净持仓
    "net-position",                      # /api/futures/openInterest/net-position
    "net-position-v2",                   # /api/futures/openInterest/net-position-v2
    # Top 多空比
    "global-longshort-account-ratio",
    "top-longshort-account-ratio",       # /api/futures/top-long-short-account-ratio
    "top-longshort-position-ratio",      # /api/futures/top-long-short-position-ratio
    # 加权资金费率
    "fr-ohlc-history",
    "fr-exchange-list",
    "cumulative-exchange-list",
    "oi-weight-ohlc-history",            # /api/futures/fundingRate/oi-weight-ohlc-history
    "vol-weight-ohlc-history",           # /api/futures/fundingRate/vol-weight-ohlc-history
    "fr-arbitrage",
    "taker-buysell-volume",
    "aggregated-taker-buysell-volume-history",
    "futures-cvd-history",
    "futures-aggregated-cvd-history",
    "futures-footprint",
    "futures-netflow-list",
    "oi-ohlc-aggregated-stablecoin-margin-history",
    "oi-ohlc-aggregated-coin-margin-history",
    "option-max-pain",
    "option-exchange-open-interest-history",
})

_STANDARD_EXTRA_ENDPOINTS: FrozenSet[str] = frozenset({
    # 全网多空比
    "global-longshort-account-ratio", # /api/futures/global-long-short-account-ratio/history
    # 爆仓历史
    "liquidation-history",            # /api/futures/liquidation/history
    # Taker Buy/Sell
    "taker-buysell-volume",           # /api/futures/taker-buy-sell-volume/history
    # CVD
    "futures-cvd-history",            # /api/futures/cvd/history
    "futures-aggregated-cvd-history", # /api/futures/aggregated-cvd/history
    "futures-footprint",              # /api/futures/footprint/history
    # 资金净流入
    "futures-netflow-list",           # /api/futures/netflow/list
    # 资金费率套利
    "fr-arbitrage",                   # /api/futures/fundingRate/fr-arbitrage
    # 订单簿
    "futures-orderbook-history",      # /api/futures/orderbook/history
    "futures-aggregated-orderbook-history",  # /api/futures/aggregated-orderbook/history
    "orderbook-heatmap",              # /api/futures/orderbook/heatmap
    "large-orderbook",                # /api/futures/orderbook/large
    "large-orderbook-history",        # /api/futures/orderbook/large-history
    # OI 稳定币/币本位保证金
    "oi-ohlc-aggregated-stablecoin-margin-history",  # /api/futures/openInterest/aggregated-stablecoin-margin-history
    "oi-ohlc-aggregated-coin-margin-history",        # /api/futures/openInterest/aggregated-coin-margin-history
    # 期权
    "option-max-pain",                # /api/option/max-pain
    "option-exchange-open-interest-history",  # /api/option/exchange-open-interest-history
})

_TIER_ENDPOINTS: Dict[CoinGlassTier, FrozenSet[str]] = {
    CoinGlassTier.HOBBYIST: _HOBBYIST_ENDPOINTS,
    CoinGlassTier.STARTUP: _HOBBYIST_ENDPOINTS | _STARTUP_EXTRA_ENDPOINTS,
    CoinGlassTier.STANDARD: (
        _HOBBYIST_ENDPOINTS | _STARTUP_EXTRA_ENDPOINTS | _STANDARD_EXTRA_ENDPOINTS
    ),
    # Professional: 所有端点可用
    CoinGlassTier.PROFESSIONAL: (
        _HOBBYIST_ENDPOINTS
        | _STARTUP_EXTRA_ENDPOINTS
        | _STANDARD_EXTRA_ENDPOINTS
    ),
}


# ============================================================
# TierManager
# ============================================================

_RATE_KEY_PREFIX = "cg_rate"
_RATE_TTL = 60  # seconds

# proxy 通道限频映射（AlphaNode Standard = 50 次/分）
_PROXY_RATE_LIMITS: dict[CoinGlassTier, int] = {
    CoinGlassTier.HOBBYIST: 30,
    CoinGlassTier.STARTUP: 50,
    CoinGlassTier.STANDARD: 50,
    CoinGlassTier.PROFESSIONAL: 50,
}


class TierManager:
    """CoinGlass 套餐管理 — 限频、端点可用性、功能矩阵。"""

    # ----------------------------------------------------------
    # 套餐读取
    # ----------------------------------------------------------

    async def get_current_tier(self) -> CoinGlassTier:
        """从 Config_Service 读取 coinglass_tier，无效值降级为 hobbyist。"""
        try:
            tier_str = await get_config_value("coinglass_tier", "hobbyist")
        except Exception as exc:
            logger.error("config_service_read_failed", error=str(exc))
            return CoinGlassTier.HOBBYIST

        try:
            return CoinGlassTier(tier_str.lower().strip())
        except ValueError:
            logger.warning(
                "invalid_coinglass_tier",
                tier_value=tier_str,
                fallback="hobbyist",
            )
            return CoinGlassTier.HOBBYIST

    # ----------------------------------------------------------
    # 能力矩阵
    # ----------------------------------------------------------

    def get_capabilities(self, tier: CoinGlassTier) -> TierCapabilities:
        """返回指定套餐的能力矩阵。"""
        return _TIER_CAPABILITIES[tier]

    # ----------------------------------------------------------
    # Redis 滑动窗口限频
    # ----------------------------------------------------------

    async def check_rate_limit(self, channel: str = "official") -> bool:
        """Redis 滑动窗口限频检查。True = 可请求，False = 已达上限。

        Args:
            channel: 通道 ID（"proxy" 或 "official"），按通道隔离限频。

        Redis 不可用时返回 True（fail-open）。
        """
        try:
            tier = await self.get_current_tier()
            if channel == "proxy":
                limit = _PROXY_RATE_LIMITS.get(tier, 50)
            else:
                caps = self.get_capabilities(tier)
                limit = caps.rate_limit_per_minute
            redis = get_redis_pool()
            minute_ts = int(time.time() // 60)
            key = f"{_RATE_KEY_PREFIX}:{channel}:{minute_ts}"
            current = await redis.get(key)
            count = int(current) if current is not None else 0
            return count < limit
        except RuntimeError:
            logger.warning("redis_unavailable", action="check_rate_limit")
            return True
        except Exception as exc:
            logger.warning("rate_limit_check_failed", error=str(exc))
            return True

    async def increment_rate_counter(self, channel: str = "official") -> None:
        """递增当前分钟的请求计数。

        Args:
            channel: 通道 ID（"proxy" 或 "official"），按通道隔离计数。
        """
        try:
            redis = get_redis_pool()
            minute_ts = int(time.time() // 60)
            key = f"{_RATE_KEY_PREFIX}:{channel}:{minute_ts}"
            pipe = redis.pipeline()
            pipe.incr(key)
            pipe.expire(key, _RATE_TTL)
            await pipe.execute()
        except RuntimeError:
            logger.warning("redis_unavailable", action="increment_rate_counter")
        except Exception as exc:
            logger.warning("rate_counter_increment_failed", error=str(exc))

    async def reserve_rate_slot(self, channel: str = "official") -> bool:
        """原子预留一个限频 slot（跨 worker 保证）。

        使用 Redis INCR 原子操作：预留成功返回 True，已达上限返回 False。
        超限时自动 DECR 回退，计数器不会虚高。
        Redis 不可用时 fail-open（返回 True）。
        """
        try:
            tier = await self.get_current_tier()
            if channel == "proxy":
                limit = _PROXY_RATE_LIMITS.get(tier, 50)
            else:
                caps = self.get_capabilities(tier)
                limit = caps.rate_limit_per_minute
            redis = get_redis_pool()
            minute_ts = int(time.time() // 60)
            key = f"{_RATE_KEY_PREFIX}:{channel}:{minute_ts}"
            new_count = await redis.incr(key)
            if new_count == 1:
                await redis.expire(key, _RATE_TTL)
            if new_count > limit:
                await redis.decr(key)
                return False
            return True
        except RuntimeError:
            logger.warning("redis_unavailable", action="reserve_rate_slot")
            return True
        except Exception as exc:
            logger.warning("reserve_rate_slot_failed", error=str(exc))
            return True

    # ----------------------------------------------------------
    # 端点可用性
    # ----------------------------------------------------------

    def is_endpoint_available(self, tier: CoinGlassTier, endpoint: str) -> bool:
        """检查指定端点在当前套餐下是否可用。

        Professional 套餐所有端点均可用。
        """
        if tier == CoinGlassTier.PROFESSIONAL:
            return True
        return endpoint in _TIER_ENDPOINTS.get(tier, _TIER_ENDPOINTS[CoinGlassTier.HOBBYIST])

    # ----------------------------------------------------------
    # 功能启用检查
    # ----------------------------------------------------------

    def is_feature_enabled(self, tier: CoinGlassTier, feature: str) -> bool:
        """检查指定功能在当前套餐下是否启用。"""
        caps = self.get_capabilities(tier)
        return caps.features.get(feature, False)
