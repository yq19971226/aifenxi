"""CoinGecko 数据采集器 — 市场数据、社区情绪、开发者活跃度、全局宏观。

按 CoinGeckoTierManager 的套餐能力控制采集范围和频率。
采集结果写入 Redis 缓存，供 Orchestrator 和 Agent 读取。

Redis Key 命名规范：
  - gecko_market:{symbol}     — 市场数据（市值/供应量/ATH 等）
  - gecko_community:{symbol}  — 社区情绪
  - gecko_developer:{symbol}  — 开发者活跃度
  - gecko_global               — 全局宏观
  - gecko_trending             — 热门趋势
"""

import structlog

from app.core.redis import set_with_ttl
from app.data.coingecko_client import CoinGeckoClient
from app.data.coingecko_tier import CoinGeckoTierManager
from app.models.coingecko import (
    CoinGeckoTier,
    CoinMarketData,
    CommunitySentiment,
    DeveloperActivity,
    GlobalMarketData,
    TrendingCoin,
)

logger = structlog.get_logger(__name__)

# 币种 symbol → CoinGecko coin_id 映射
# CoinGecko 用 coin_id（如 "bitcoin"）而非交易对（如 "BTCUSDT"）
SYMBOL_TO_COIN_ID: dict[str, str] = {
    "BTCUSDT": "bitcoin",
    "ETHUSDT": "ethereum",
    "BNBUSDT": "binancecoin",
    "SOLUSDT": "solana",
    "XRPUSDT": "ripple",
    "DOGEUSDT": "dogecoin",
    "ADAUSDT": "cardano",
    "AVAXUSDT": "avalanche-2",
    "DOTUSDT": "polkadot",
    "LINKUSDT": "chainlink",
    "MATICUSDT": "matic-network",
    "LTCUSDT": "litecoin",
    "UNIUSDT": "uniswap",
    "ATOMUSDT": "cosmos",
    "APTUSDT": "aptos",
    "ARBUSDT": "arbitrum",
    "OPUSDT": "optimism",
    "NEARUSDT": "near",
    "SUIUSDT": "sui",
    "PEPEUSDT": "pepe",
}

_MARKET_TTL = 1800       # 30 分钟
_COMMUNITY_TTL = 3600    # 1 小时
_GLOBAL_TTL = 1800       # 30 分钟
_TRENDING_TTL = 7200     # 2 小时


class CoinGeckoCollector:
    """CoinGecko 数据采集器。"""

    def __init__(
        self,
        client: CoinGeckoClient,
        tier_manager: CoinGeckoTierManager,
    ) -> None:
        self._client = client
        self._tier_manager = tier_manager

    # ----------------------------------------------------------
    # /coins/markets — 批量市场数据
    # ----------------------------------------------------------

    async def collect_markets(
        self, symbols: list[str],
    ) -> list[CoinMarketData]:
        """批量采集币种市场数据（单次 API 调用）。

        Args:
            symbols: 交易对列表，如 ["BTCUSDT", "ETHUSDT"]。

        Returns:
            CoinMarketData 列表。
        """
        coin_ids = [
            SYMBOL_TO_COIN_ID[s]
            for s in symbols
            if s in SYMBOL_TO_COIN_ID
        ]
        if not coin_ids:
            logger.warning("gecko_no_coin_ids_mapped", symbols=symbols)
            return []

        ids_str = ",".join(coin_ids)
        data = await self._client.get(
            path="/coins/markets",
            endpoint="coins-markets",
            params={
                "vs_currency": "usd",
                "ids": ids_str,
                "order": "market_cap_desc",
                "per_page": len(coin_ids),
                "page": 1,
                "sparkline": "false",
                "price_change_percentage": "1h,24h,7d,14d,30d,1y",
            },
        )
        if not data or not isinstance(data, list):
            return []

        results: list[CoinMarketData] = []
        # 反向映射 coin_id → symbol
        id_to_symbol = {v: k for k, v in SYMBOL_TO_COIN_ID.items()}

        for item in data:
            coin_id = item.get("id", "")
            symbol = id_to_symbol.get(coin_id, coin_id.upper() + "USDT")
            try:
                market = CoinMarketData(
                    symbol=symbol,
                    coin_id=coin_id,
                    name=item.get("name", ""),
                    current_price=item.get("current_price"),
                    market_cap=item.get("market_cap"),
                    market_cap_rank=item.get("market_cap_rank"),
                    fully_diluted_valuation=item.get("fully_diluted_valuation"),
                    total_volume=item.get("total_volume"),
                    high_24h=item.get("high_24h"),
                    low_24h=item.get("low_24h"),
                    price_change_percentage_24h=item.get("price_change_percentage_24h"),
                    price_change_percentage_7d=item.get(
                        "price_change_percentage_7d_in_currency",
                    ),
                    price_change_percentage_14d=item.get(
                        "price_change_percentage_14d_in_currency",
                    ),
                    price_change_percentage_30d=item.get(
                        "price_change_percentage_30d_in_currency",
                    ),
                    price_change_percentage_1y=item.get(
                        "price_change_percentage_1y_in_currency",
                    ),
                    market_cap_change_percentage_24h=item.get(
                        "market_cap_change_percentage_24h",
                    ),
                    circulating_supply=item.get("circulating_supply"),
                    total_supply=item.get("total_supply"),
                    max_supply=item.get("max_supply"),
                    ath=item.get("ath"),
                    ath_change_percentage=item.get("ath_change_percentage"),
                    ath_date=item.get("ath_date"),
                    atl=item.get("atl"),
                    atl_change_percentage=item.get("atl_change_percentage"),
                    atl_date=item.get("atl_date"),
                    last_updated=item.get("last_updated"),
                )
                results.append(market)

                # 写入 Redis 缓存
                await set_with_ttl(
                    f"gecko_market:{symbol}",
                    market.model_dump(mode="json"),
                    ttl_seconds=_MARKET_TTL,
                )
            except Exception as exc:
                logger.warning(
                    "gecko_parse_market_failed",
                    coin_id=coin_id,
                    error=str(exc),
                )

        logger.info("gecko_markets_collected", count=len(results))
        return results

    # ----------------------------------------------------------
    # /coins/{id} — 社区情绪 + 开发者活跃度
    # ----------------------------------------------------------

    async def collect_coin_detail(
        self, symbol: str,
    ) -> tuple[CommunitySentiment | None, DeveloperActivity | None]:
        """采集单个币种的社区情绪和开发者活跃度。

        Args:
            symbol: 交易对，如 "BTCUSDT"。

        Returns:
            (CommunitySentiment, DeveloperActivity) 元组。
        """
        coin_id = SYMBOL_TO_COIN_ID.get(symbol)
        if not coin_id:
            logger.warning("gecko_unknown_symbol", symbol=symbol)
            return None, None

        data = await self._client.get(
            path=f"/coins/{coin_id}",
            endpoint="coins-detail",
            params={
                "localization": "false",
                "tickers": "false",
                "market_data": "false",
                "community_data": "true",
                "developer_data": "true",
                "sparkline": "false",
            },
        )
        if not data or not isinstance(data, dict):
            return None, None

        community: CommunitySentiment | None = None
        developer: DeveloperActivity | None = None

        # 解析社区情绪
        try:
            cd = data.get("community_data", {}) or {}
            community = CommunitySentiment(
                symbol=symbol,
                coin_id=coin_id,
                sentiment_votes_up_percentage=data.get("sentiment_votes_up_percentage"),
                sentiment_votes_down_percentage=data.get("sentiment_votes_down_percentage"),
                reddit_subscribers=cd.get("reddit_subscribers"),
                reddit_accounts_active_48h=cd.get("reddit_accounts_active_48h"),
                reddit_average_posts_48h=cd.get("reddit_average_posts_48h"),
                reddit_average_comments_48h=cd.get("reddit_average_comments_48h"),
                telegram_channel_user_count=cd.get("telegram_channel_user_count"),
                twitter_followers=cd.get("twitter_followers"),
            )
            await set_with_ttl(
                f"gecko_community:{symbol}",
                community.model_dump(mode="json"),
                ttl_seconds=_COMMUNITY_TTL,
            )
        except Exception as exc:
            logger.warning(
                "gecko_parse_community_failed",
                symbol=symbol,
                error=str(exc),
            )

        # 解析开发者活跃度
        try:
            dd = data.get("developer_data", {}) or {}
            developer = DeveloperActivity(
                symbol=symbol,
                coin_id=coin_id,
                forks=dd.get("forks"),
                stars=dd.get("stars"),
                subscribers=dd.get("subscribers"),
                total_issues=dd.get("total_issues"),
                closed_issues=dd.get("closed_issues"),
                pull_requests_merged=dd.get("pull_requests_merged"),
                pull_request_contributors=dd.get("pull_request_contributors"),
                commit_count_4_weeks=dd.get("commit_count_4_weeks"),
            )
            await set_with_ttl(
                f"gecko_developer:{symbol}",
                developer.model_dump(mode="json"),
                ttl_seconds=_COMMUNITY_TTL,
            )
        except Exception as exc:
            logger.warning(
                "gecko_parse_developer_failed",
                symbol=symbol,
                error=str(exc),
            )

        return community, developer

    # ----------------------------------------------------------
    # /global — 全局宏观数据
    # ----------------------------------------------------------

    async def collect_global(self) -> GlobalMarketData | None:
        """采集全局加密市场宏观数据。"""
        data = await self._client.get(
            path="/global",
            endpoint="global",
        )
        if not data or not isinstance(data, dict):
            return None

        gd = data.get("data", {}) or {}
        try:
            total_mc = gd.get("total_market_cap", {})
            total_vol = gd.get("total_volume", {})
            mc_pct = gd.get("market_cap_percentage", {})

            result = GlobalMarketData(
                total_market_cap_usd=total_mc.get("usd"),
                total_volume_24h_usd=total_vol.get("usd"),
                btc_dominance=mc_pct.get("btc"),
                eth_dominance=mc_pct.get("eth"),
                active_cryptocurrencies=gd.get("active_cryptocurrencies"),
                market_cap_change_percentage_24h=gd.get(
                    "market_cap_change_percentage_24h_usd",
                ),
                last_updated=str(gd.get("updated_at", "")),
            )
            await set_with_ttl(
                "gecko_global",
                result.model_dump(mode="json"),
                ttl_seconds=_GLOBAL_TTL,
            )
            logger.info("gecko_global_collected")
            return result
        except Exception as exc:
            logger.warning("gecko_parse_global_failed", error=str(exc))
            return None

    # ----------------------------------------------------------
    # /search/trending — 热门趋势
    # ----------------------------------------------------------

    async def collect_trending(self) -> list[TrendingCoin]:
        """采集热门趋势币种。"""
        data = await self._client.get(
            path="/search/trending",
            endpoint="search-trending",
        )
        if not data or not isinstance(data, dict):
            return []

        coins_raw = data.get("coins", [])
        results: list[TrendingCoin] = []
        for item in coins_raw[:10]:
            ci = item.get("item", {})
            try:
                tc = TrendingCoin(
                    coin_id=ci.get("id", ""),
                    name=ci.get("name", ""),
                    symbol=ci.get("symbol", ""),
                    market_cap_rank=ci.get("market_cap_rank"),
                    score=ci.get("score", 0),
                )
                results.append(tc)
            except Exception:
                continue

        if results:
            await set_with_ttl(
                "gecko_trending",
                [t.model_dump(mode="json") for t in results],
                ttl_seconds=_TRENDING_TTL,
            )
            logger.info("gecko_trending_collected", count=len(results))

        return results
