"""CoinGecko 数据采集层 Pydantic 数据模型。

定义套餐管理、市场数据、社区情绪、开发者活跃度等业务数据模型。
所有模型使用完整类型注解，禁止裸字典传递业务数据。
"""

from datetime import datetime
from enum import Enum
from typing import Dict, List, Optional

from pydantic import BaseModel, Field


# ============================================================
# 套餐管理
# ============================================================


class CoinGeckoTier(str, Enum):
    """CoinGecko API 四级订阅等级。"""

    DEMO = "demo"
    BASIC = "basic"
    ANALYST = "analyst"
    LITE = "lite"


class CoinGeckoTierCapabilities(BaseModel):
    """套餐能力矩阵，描述当前套餐的限频、覆盖范围和功能开关。"""

    tier: CoinGeckoTier
    rate_limit_per_minute: int
    monthly_credits: int
    collect_interval_seconds: int
    max_symbols: int
    history_depth_years: int
    features: Dict[str, bool]


# ============================================================
# 市场数据（/coins/markets 批量返回）
# ============================================================


class CoinMarketData(BaseModel):
    """单个币种的市场概览数据 — 来自 /coins/markets。"""

    symbol: str
    coin_id: str
    name: str
    current_price: Optional[float] = None
    market_cap: Optional[float] = None
    market_cap_rank: Optional[int] = None
    fully_diluted_valuation: Optional[float] = None
    total_volume: Optional[float] = None
    high_24h: Optional[float] = None
    low_24h: Optional[float] = None
    price_change_percentage_24h: Optional[float] = None
    price_change_percentage_7d: Optional[float] = None
    price_change_percentage_14d: Optional[float] = None
    price_change_percentage_30d: Optional[float] = None
    price_change_percentage_1y: Optional[float] = None
    market_cap_change_percentage_24h: Optional[float] = None
    circulating_supply: Optional[float] = None
    total_supply: Optional[float] = None
    max_supply: Optional[float] = None
    ath: Optional[float] = None
    ath_change_percentage: Optional[float] = None
    ath_date: Optional[str] = None
    atl: Optional[float] = None
    atl_change_percentage: Optional[float] = None
    atl_date: Optional[str] = None
    last_updated: Optional[str] = None


# ============================================================
# 社区情绪（/coins/{id} 返回）
# ============================================================


class CommunitySentiment(BaseModel):
    """社区情绪数据 — 来自 /coins/{id}。"""

    symbol: str
    coin_id: str
    sentiment_votes_up_percentage: Optional[float] = None
    sentiment_votes_down_percentage: Optional[float] = None
    # Reddit
    reddit_subscribers: Optional[int] = None
    reddit_accounts_active_48h: Optional[int] = None
    reddit_average_posts_48h: Optional[float] = None
    reddit_average_comments_48h: Optional[float] = None
    # Telegram
    telegram_channel_user_count: Optional[int] = None
    # Twitter/X
    twitter_followers: Optional[int] = None


class DeveloperActivity(BaseModel):
    """开发者活跃度数据 — 来自 /coins/{id} → developer_data。"""

    symbol: str
    coin_id: str
    forks: Optional[int] = None
    stars: Optional[int] = None
    subscribers: Optional[int] = None
    total_issues: Optional[int] = None
    closed_issues: Optional[int] = None
    pull_requests_merged: Optional[int] = None
    pull_request_contributors: Optional[int] = None
    commit_count_4_weeks: Optional[int] = None


# ============================================================
# 全局宏观（/global 返回）
# ============================================================


class GlobalMarketData(BaseModel):
    """全局加密市场宏观数据 — 来自 /global。"""

    total_market_cap_usd: Optional[float] = None
    total_volume_24h_usd: Optional[float] = None
    btc_dominance: Optional[float] = None
    eth_dominance: Optional[float] = None
    active_cryptocurrencies: Optional[int] = None
    market_cap_change_percentage_24h: Optional[float] = None
    defi_market_cap: Optional[float] = None
    stablecoin_volume_24h: Optional[float] = None
    last_updated: Optional[str] = None


# ============================================================
# 热门趋势（/search/trending 返回）
# ============================================================


class TrendingCoin(BaseModel):
    """热门币种 — 来自 /search/trending。"""

    coin_id: str
    name: str
    symbol: str
    market_cap_rank: Optional[int] = None
    score: int = 0


# ============================================================
# 聚合视图（注入 MarketData）
# ============================================================


class CoinGeckoData(BaseModel):
    """CoinGecko 基本面数据 — 注入智能体 prompt 的聚合视图。"""

    # 市场数据（/coins/markets）
    market: Optional[CoinMarketData] = None
    # 社区情绪（/coins/{id}）
    community: Optional[CommunitySentiment] = None
    # 开发者活跃度（/coins/{id}）
    developer: Optional[DeveloperActivity] = None
    # 全局宏观（/global）
    global_data: Optional[GlobalMarketData] = None
    # 热门趋势（/search/trending）
    trending: list[TrendingCoin] = []
