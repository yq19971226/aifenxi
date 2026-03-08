"""CoinGecko 套餐管理 — 限频、端点可用性、功能矩阵。

纯数据层模块，根据 Config_Service 中的 coingecko_tier 配置控制
限频上限、端点可用性、采集频率和功能矩阵。

套餐等级（截图价格 2026-03）：
  - demo:    免费，30/min，~10K/月
  - basic:   $35/月，250/min，100K/月
  - analyst: $129/月，500/min，500K/月
  - lite:    $499/月，500/min，2M/月
"""

import time
from typing import Dict, FrozenSet

import structlog

from app.core.redis import get_redis_pool
from app.models.coingecko import CoinGeckoTier, CoinGeckoTierCapabilities
from app.services.config_service import get_config_value

logger = structlog.get_logger(__name__)


# ============================================================
# 四级套餐能力矩阵（静态常量）
# ============================================================

_TIER_CAPABILITIES: Dict[CoinGeckoTier, CoinGeckoTierCapabilities] = {
    CoinGeckoTier.DEMO: CoinGeckoTierCapabilities(
        tier=CoinGeckoTier.DEMO,
        rate_limit_per_minute=30,
        monthly_credits=10_000,
        collect_interval_seconds=1800,      # 30 分钟
        max_symbols=10,
        history_depth_years=1,
        features={
            "coins_markets": True,
            "coins_detail": True,
            "global": True,
            "trending": True,
            "derivatives_tickers": True,
            "ohlc": True,
            "market_chart": True,
            # Basic+ 独占
            "coins_markets_extended": False,
            "exchange_tickers": False,
            "asset_platforms": False,
        },
    ),
    CoinGeckoTier.BASIC: CoinGeckoTierCapabilities(
        tier=CoinGeckoTier.BASIC,
        rate_limit_per_minute=250,
        monthly_credits=100_000,
        collect_interval_seconds=600,       # 10 分钟
        max_symbols=50,
        history_depth_years=2,
        features={
            "coins_markets": True,
            "coins_detail": True,
            "global": True,
            "trending": True,
            "derivatives_tickers": True,
            "ohlc": True,
            "market_chart": True,
            "coins_markets_extended": True,
            "exchange_tickers": True,
            "asset_platforms": True,
        },
    ),
    CoinGeckoTier.ANALYST: CoinGeckoTierCapabilities(
        tier=CoinGeckoTier.ANALYST,
        rate_limit_per_minute=500,
        monthly_credits=500_000,
        collect_interval_seconds=300,       # 5 分钟
        max_symbols=100,
        history_depth_years=10,
        features={
            "coins_markets": True,
            "coins_detail": True,
            "global": True,
            "trending": True,
            "derivatives_tickers": True,
            "ohlc": True,
            "market_chart": True,
            "coins_markets_extended": True,
            "exchange_tickers": True,
            "asset_platforms": True,
        },
    ),
    CoinGeckoTier.LITE: CoinGeckoTierCapabilities(
        tier=CoinGeckoTier.LITE,
        rate_limit_per_minute=500,
        monthly_credits=2_000_000,
        collect_interval_seconds=120,       # 2 分钟
        max_symbols=200,
        history_depth_years=10,
        features={
            "coins_markets": True,
            "coins_detail": True,
            "global": True,
            "trending": True,
            "derivatives_tickers": True,
            "ohlc": True,
            "market_chart": True,
            "coins_markets_extended": True,
            "exchange_tickers": True,
            "asset_platforms": True,
        },
    ),
}


# ============================================================
# 端点可用性矩阵
# ============================================================

_DEMO_ENDPOINTS: FrozenSet[str] = frozenset({
    "coins-markets",
    "coins-detail",
    "global",
    "search-trending",
    "simple-price",
    "coins-list",
    "coins-ohlc",
    "coins-market-chart",
    "derivatives-tickers",
})

_BASIC_EXTRA_ENDPOINTS: FrozenSet[str] = frozenset({
    "coins-markets-extended",
    "exchange-tickers",
    "asset-platforms",
    "coins-categories",
    "exchanges-list",
    "nfts-list",
})

_TIER_ENDPOINTS: Dict[CoinGeckoTier, FrozenSet[str]] = {
    CoinGeckoTier.DEMO: _DEMO_ENDPOINTS,
    CoinGeckoTier.BASIC: _DEMO_ENDPOINTS | _BASIC_EXTRA_ENDPOINTS,
    CoinGeckoTier.ANALYST: _DEMO_ENDPOINTS | _BASIC_EXTRA_ENDPOINTS,
    CoinGeckoTier.LITE: _DEMO_ENDPOINTS | _BASIC_EXTRA_ENDPOINTS,
}


# ============================================================
# CoinGecko TierManager
# ============================================================

_RATE_KEY_PREFIX = "geckoRate"
_RATE_TTL = 60  # seconds
_MONTHLY_KEY_PREFIX = "geckoMonthly"


class CoinGeckoTierManager:
    """CoinGecko 套餐管理 — 限频、端点可用性、功能矩阵。"""

    # ----------------------------------------------------------
    # 套餐读取
    # ----------------------------------------------------------

    async def get_current_tier(self) -> CoinGeckoTier:
        """从 Config_Service 读取 coingecko_tier，无效值降级为 demo。"""
        try:
            tier_str = await get_config_value("coingecko_tier", "demo")
        except Exception as exc:
            logger.error("config_service_read_failed", error=str(exc))
            return CoinGeckoTier.DEMO

        try:
            return CoinGeckoTier(tier_str.lower().strip())
        except ValueError:
            logger.warning(
                "invalid_coingecko_tier",
                tier_value=tier_str,
                fallback="demo",
            )
            return CoinGeckoTier.DEMO

    # ----------------------------------------------------------
    # 能力矩阵
    # ----------------------------------------------------------

    def get_capabilities(self, tier: CoinGeckoTier) -> CoinGeckoTierCapabilities:
        """返回指定套餐的能力矩阵。"""
        return _TIER_CAPABILITIES[tier]

    # ----------------------------------------------------------
    # Redis 滑动窗口限频（分钟级）
    # ----------------------------------------------------------

    async def check_rate_limit(self) -> bool:
        """Redis 滑动窗口限频检查。True = 可请求，False = 已达上限。"""
        try:
            tier = await self.get_current_tier()
            caps = self.get_capabilities(tier)
            redis = get_redis_pool()
            minute_ts = int(time.time() // 60)
            key = f"{_RATE_KEY_PREFIX}:{minute_ts}"
            current = await redis.get(key)
            count = int(current) if current is not None else 0
            return count < caps.rate_limit_per_minute
        except RuntimeError:
            logger.warning("redis_unavailable", action="check_rate_limit")
            return True
        except Exception as exc:
            logger.warning("gecko_rate_limit_check_failed", error=str(exc))
            return True

    async def increment_rate_counter(self) -> None:
        """递增当前分钟的请求计数。"""
        try:
            redis = get_redis_pool()
            minute_ts = int(time.time() // 60)
            key = f"{_RATE_KEY_PREFIX}:{minute_ts}"
            pipe = redis.pipeline()
            pipe.incr(key)
            pipe.expire(key, _RATE_TTL)
            await pipe.execute()
        except RuntimeError:
            logger.warning("redis_unavailable", action="increment_rate_counter")
        except Exception as exc:
            logger.warning("gecko_rate_counter_increment_failed", error=str(exc))

    # ----------------------------------------------------------
    # 月度额度追踪
    # ----------------------------------------------------------

    async def check_monthly_limit(self) -> bool:
        """检查月度调用额度是否耗尽。True = 可请求。"""
        try:
            tier = await self.get_current_tier()
            caps = self.get_capabilities(tier)
            redis = get_redis_pool()
            month_key = time.strftime("%Y-%m")
            key = f"{_MONTHLY_KEY_PREFIX}:{month_key}"
            current = await redis.get(key)
            count = int(current) if current is not None else 0
            return count < caps.monthly_credits
        except RuntimeError:
            logger.warning("redis_unavailable", action="check_monthly_limit")
            return True
        except Exception as exc:
            logger.warning("gecko_monthly_check_failed", error=str(exc))
            return True

    async def increment_monthly_counter(self, calls: int = 1) -> None:
        """递增月度调用计数。"""
        try:
            redis = get_redis_pool()
            month_key = time.strftime("%Y-%m")
            key = f"{_MONTHLY_KEY_PREFIX}:{month_key}"
            pipe = redis.pipeline()
            pipe.incrby(key, calls)
            pipe.expire(key, 86400 * 35)  # 35 天自动过期
            await pipe.execute()
        except RuntimeError:
            logger.warning("redis_unavailable", action="increment_monthly_counter")
        except Exception as exc:
            logger.warning("gecko_monthly_increment_failed", error=str(exc))

    async def get_monthly_usage(self) -> dict:
        """返回当月额度使用情况。"""
        tier = await self.get_current_tier()
        caps = self.get_capabilities(tier)
        try:
            redis = get_redis_pool()
            month_key = time.strftime("%Y-%m")
            key = f"{_MONTHLY_KEY_PREFIX}:{month_key}"
            current = await redis.get(key)
            used = int(current) if current is not None else 0
        except Exception:
            used = 0
        return {
            "tier": tier.value,
            "used": used,
            "limit": caps.monthly_credits,
            "remaining": max(0, caps.monthly_credits - used),
            "usage_pct": round(used / caps.monthly_credits * 100, 1) if caps.monthly_credits > 0 else 0,
        }

    # ----------------------------------------------------------
    # 端点可用性
    # ----------------------------------------------------------

    def is_endpoint_available(self, tier: CoinGeckoTier, endpoint: str) -> bool:
        """检查指定端点在当前套餐下是否可用。"""
        return endpoint in _TIER_ENDPOINTS.get(tier, _TIER_ENDPOINTS[CoinGeckoTier.DEMO])

    # ----------------------------------------------------------
    # 功能启用检查
    # ----------------------------------------------------------

    def is_feature_enabled(self, tier: CoinGeckoTier, feature: str) -> bool:
        """检查指定功能在当前套餐下是否启用。"""
        caps = self.get_capabilities(tier)
        return caps.features.get(feature, False)

    # ----------------------------------------------------------
    # API Base URL（Demo 和付费版 URL 不同）
    # ----------------------------------------------------------

    def get_base_url(self, tier: CoinGeckoTier) -> str:
        """返回对应套餐的 API Base URL。"""
        if tier == CoinGeckoTier.DEMO:
            return "https://api.coingecko.com/api/v3"
        return "https://pro-api.coingecko.com/api/v3"
