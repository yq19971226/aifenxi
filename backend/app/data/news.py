"""新闻数据采集模块 — Finnhub + 缓存。

数据源：
- Finnhub Market News (category=crypto)（免费层可用，主流财经媒体来源）
- Redis 缓存（news:feed:{symbol}，TTL 15min）

输出：标准化的新闻条目列表，每条包含标题、来源、发布时间、
投票数据和原始 URL。
"""

import asyncio
import logging
from datetime import datetime, timezone
from typing import Any, Optional

from pydantic import BaseModel, Field

from app.core.redis import get_json, set_with_ttl

logger = logging.getLogger(__name__)

_CACHE_PREFIX = "news:feed"
_CACHE_TTL = 900  # 15 minutes
_REQUEST_TIMEOUT = 20.0

# 币种符号映射（Binance 对 → 通用符号）
_SYMBOL_MAP: dict[str, str] = {
    "BTCUSDT": "BTC",
    "ETHUSDT": "ETH",
    "BNBUSDT": "BNB",
    "SOLUSDT": "SOL",
    "XRPUSDT": "XRP",
}


class NewsItem(BaseModel):
    """标准化新闻条目。"""

    title: str
    source: str = ""
    published_at: str = ""
    url: str = ""
    kind: str = "news"  # news / media
    currencies: list[str] = Field(default_factory=list)
    votes: dict[str, int] = Field(default_factory=dict)
    domain: str = ""


class NewsCollector:
    """新闻数据采集器 — Finnhub Market News + Redis 缓存。"""

    def __init__(self) -> None:
        pass

    async def fetch_news(
        self,
        symbol: str = "BTCUSDT",
        limit: int = 20,
    ) -> list[NewsItem]:
        """获取指定交易对的最新新闻。

        优先从 Redis 缓存读取，缓存未命中时调用 Finnhub API。
        """
        symbol = symbol.upper()
        cache_key = f"{_CACHE_PREFIX}:{symbol}"

        # 0. 检查数据源开关
        from app.data.source_gate import is_enabled
        if not await is_enabled("finnhub"):
            logger.debug("Finnhub source disabled, skipping", extra={"symbol": symbol})
            return []

        # 1. 尝试读取缓存
        try:
            cached = await get_json(cache_key)
            if cached and isinstance(cached, list):
                logger.debug("News cache hit", extra={"symbol": symbol})
                return [NewsItem(**item) for item in cached]
        except Exception:
            pass

        # 2. 调用 Finnhub API
        items = await self._fetch_from_finnhub(symbol, limit)

        # 3. 缓存结果
        if items:
            try:
                cache_data = [item.model_dump() for item in items]
                await set_with_ttl(cache_key, cache_data, _CACHE_TTL)
            except Exception as exc:
                logger.warning("News cache write failed", extra={"error": str(exc)})

        return items

    async def _fetch_from_finnhub(
        self,
        symbol: str,
        limit: int,
    ) -> list[NewsItem]:
        """从 Finnhub Market News API 获取新闻。"""
        try:
            from app.data.finnhub_client import FinnhubClient
            client = FinnhubClient()
            raw_news = await client.fetch_market_news(category="crypto")

            if not raw_news:
                logger.info("Finnhub returned no crypto news")
                return []

            currency = _SYMBOL_MAP.get(symbol, symbol.replace("USDT", ""))
            items: list[NewsItem] = []

            for entry in raw_news[:limit]:
                # 按币种过滤（相关字段匹配）
                related = str(entry.get("related", "")).upper()
                headline = str(entry.get("headline", "")).upper()
                summary = str(entry.get("summary", "")).upper()

                # 如果有 related 字段，优先使用；否则模糊匹配标题/摘要
                is_relevant = (
                    currency in related
                    or currency in headline
                    or currency in summary
                    or symbol == "BTCUSDT"  # BTC 新闻默认全部相关
                )

                if not is_relevant and symbol != "BTCUSDT":
                    continue

                # 转换时间戳
                ts = entry.get("datetime", 0)
                published_at = ""
                if ts:
                    try:
                        published_at = datetime.fromtimestamp(ts, tz=timezone.utc).isoformat()
                    except Exception:
                        published_at = str(ts)

                items.append(
                    NewsItem(
                        title=entry.get("headline", ""),
                        source=entry.get("source", ""),
                        published_at=published_at,
                        url=entry.get("url", ""),
                        kind="news",
                        currencies=[currency] if is_relevant else [],
                        votes={},
                        domain=entry.get("source", ""),
                    )
                )

            logger.info(
                "Finnhub crypto news fetched",
                extra={"symbol": symbol, "count": len(items)},
            )
            return items

        except Exception:
            logger.warning("Finnhub news API request failed", exc_info=True)
            return []
