"""Finnhub 数据采集器 — 将 API 数据映射为标准快照并缓存。

Redis 缓存键：
- finnhub_earnings              — 未来 2 周加密概念股财报日历
- finnhub_news:crypto           — 加密分类主流财经新闻
- finnhub_news:company:{symbol} — 单公司新闻
- finnhub_quote:{symbol}        — 实时报价
- finnhub_insider:{symbol}      — 内部人情绪
- finnhub_macro_quotes          — 宏观关联资产报价聚合
- finnhub_snapshot              — 全量快照
"""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone
from typing import Any

from app.core.redis import set_with_ttl
from app.data.finnhub_client import (
    FinnhubClient,
    CRYPTO_RELATED_STOCKS,
    MACRO_QUOTE_SYMBOLS,
)

logger = logging.getLogger(__name__)

_EARNINGS_CACHE_TTL = 21600   # 6 小时
_NEWS_CACHE_TTL = 900         # 15 分钟
_QUOTE_CACHE_TTL = 300        # 5 分钟
_INSIDER_CACHE_TTL = 86400    # 24 小时
_SNAPSHOT_CACHE_TTL = 600     # 10 分钟


class FinnhubCollector:
    """Finnhub 数据采集器 — 财报、新闻、报价、内部人情绪。"""

    def __init__(self, client: FinnhubClient | None = None) -> None:
        self._client = client or FinnhubClient()

    # ── 财报日历（仅加密关联股）──────────────────────────────────

    async def collect_crypto_earnings(self) -> dict[str, Any]:
        """采集加密关联股票的未来财报日程。

        Returns:
            {"events": [...], "collected_at": "...", "count": N}
        """
        try:
            all_earnings = await self._client.fetch_earnings_calendar()
            if not all_earnings:
                logger.info("finnhub_earnings_empty")
                return {"events": [], "count": 0, "collected_at": datetime.now(timezone.utc).isoformat()}

            # 筛选加密关联股票
            crypto_symbols = {s["symbol"] for s in CRYPTO_RELATED_STOCKS}
            crypto_earnings = [
                e for e in all_earnings
                if e.get("symbol") in crypto_symbols
            ]

            result = {
                "events": crypto_earnings,
                "count": len(crypto_earnings),
                "total_market_events": len(all_earnings),
                "tracked_symbols": list(crypto_symbols),
                "collected_at": datetime.now(timezone.utc).isoformat(),
            }

            await set_with_ttl("finnhub_earnings", result, _EARNINGS_CACHE_TTL)
            logger.info("finnhub_earnings_collected", extra={
                "crypto_count": len(crypto_earnings),
                "total": len(all_earnings),
            })
            return result

        except Exception as exc:
            logger.error("finnhub_earnings_collect_error", extra={"error": str(exc)})
            return {"events": [], "count": 0, "error": str(exc)}

    # ── 加密分类市场新闻 ──────────────────────────────────────

    async def collect_crypto_news(self) -> list[dict[str, Any]]:
        """采集主流财经媒体的加密新闻（CNBC/Bloomberg/Reuters）。

        Returns:
            标准化新闻列表
        """
        try:
            raw_news = await self._client.fetch_market_news(category="crypto")
            if not raw_news:
                return []

            # 限制条数，避免缓存过大
            news = raw_news[:50]

            await set_with_ttl("finnhub_news:crypto", news, _NEWS_CACHE_TTL)
            logger.info("finnhub_crypto_news_collected", extra={"count": len(news)})
            return news

        except Exception as exc:
            logger.error("finnhub_crypto_news_error", extra={"error": str(exc)})
            return []

    # ── 加密概念股公司新闻 ──────────────────────────────────────

    async def collect_company_news(self, symbol: str) -> list[dict[str, Any]]:
        """采集特定加密概念股的公司新闻。"""
        try:
            news = await self._client.fetch_company_news(symbol)
            if not news:
                return []

            # 限制条数
            news = news[:30]

            await set_with_ttl(f"finnhub_news:company:{symbol}", news, _NEWS_CACHE_TTL)
            logger.info("finnhub_company_news_collected", extra={
                "symbol": symbol, "count": len(news),
            })
            return news

        except Exception as exc:
            logger.error("finnhub_company_news_error", extra={
                "symbol": symbol, "error": str(exc),
            })
            return []

    async def collect_all_company_news(self) -> dict[str, int]:
        """批量采集所有加密关联股的公司新闻。"""
        results: dict[str, int] = {}
        for stock in CRYPTO_RELATED_STOCKS:
            symbol = stock["symbol"]
            news = await self.collect_company_news(symbol)
            results[symbol] = len(news)
            # 每次请求后短暂等待，避免突发限频
            await asyncio.sleep(0.5)
        return results

    # ── 宏观关联资产报价 ──────────────────────────────────────

    async def collect_macro_quotes(self) -> dict[str, dict[str, Any]]:
        """采集 SPY/QQQ/GLD/TLT/IBIT 等宏观关联资产报价。

        Returns:
            {symbol: {"price", "change", "changePercent", "high", "low", ...}}
        """
        results: dict[str, dict[str, Any]] = {}

        for asset in MACRO_QUOTE_SYMBOLS:
            symbol = asset["symbol"]
            try:
                quote = await self._client.fetch_quote(symbol)
                if quote:
                    results[symbol] = {
                        "name": asset["name"],
                        "relation": asset["relation"],
                        "price": quote.get("c"),
                        "change": quote.get("d"),
                        "changePercent": quote.get("dp"),
                        "high": quote.get("h"),
                        "low": quote.get("l"),
                        "open": quote.get("o"),
                        "prevClose": quote.get("pc"),
                        "timestamp": quote.get("t"),
                    }
                    await set_with_ttl(f"finnhub_quote:{symbol}", results[symbol], _QUOTE_CACHE_TTL)
            except Exception as exc:
                logger.warning("finnhub_quote_error", extra={
                    "symbol": symbol, "error": str(exc),
                })
            await asyncio.sleep(0.3)

        # 聚合快照
        await set_with_ttl("finnhub_macro_quotes", results, _QUOTE_CACHE_TTL)
        logger.info("finnhub_macro_quotes_collected", extra={"count": len(results)})
        return results

    # ── 加密关联股报价 ───────────────────────────────────────

    async def collect_stock_quotes(self) -> dict[str, dict[str, Any]]:
        """采集所有加密关联股的实时报价。"""
        results: dict[str, dict[str, Any]] = {}

        for stock in CRYPTO_RELATED_STOCKS:
            symbol = stock["symbol"]
            try:
                quote = await self._client.fetch_quote(symbol)
                if quote:
                    results[symbol] = {
                        "name": stock["name"],
                        "relation": stock["relation"],
                        "price": quote.get("c"),
                        "change": quote.get("d"),
                        "changePercent": quote.get("dp"),
                        "high": quote.get("h"),
                        "low": quote.get("l"),
                        "open": quote.get("o"),
                        "prevClose": quote.get("pc"),
                        "timestamp": quote.get("t"),
                    }
                    await set_with_ttl(f"finnhub_quote:{symbol}", results[symbol], _QUOTE_CACHE_TTL)
            except Exception as exc:
                logger.warning("finnhub_stock_quote_error", extra={
                    "symbol": symbol, "error": str(exc),
                })
            await asyncio.sleep(0.3)

        await set_with_ttl("finnhub_stock_quotes", results, _QUOTE_CACHE_TTL)
        logger.info("finnhub_stock_quotes_collected", extra={"count": len(results)})
        return results

    # ── 内部人情绪 ───────────────────────────────────────────

    async def collect_insider_sentiment(self, symbol: str) -> list[dict[str, Any]]:
        """采集特定加密概念股的内部人交易情绪。"""
        try:
            data = await self._client.fetch_insider_sentiment(symbol)
            if data:
                await set_with_ttl(f"finnhub_insider:{symbol}", data, _INSIDER_CACHE_TTL)
                logger.info("finnhub_insider_collected", extra={
                    "symbol": symbol, "months": len(data),
                })
            return data

        except Exception as exc:
            logger.error("finnhub_insider_error", extra={
                "symbol": symbol, "error": str(exc),
            })
            return []

    async def collect_all_insider_sentiment(self) -> dict[str, int]:
        """批量采集关键加密概念股（MSTR/COIN/MARA）的内部人情绪。"""
        key_stocks = ["MSTR", "COIN", "MARA"]
        results: dict[str, int] = {}
        for symbol in key_stocks:
            data = await self.collect_insider_sentiment(symbol)
            results[symbol] = len(data)
            await asyncio.sleep(0.5)
        return results

    # ── 全量采集 ─────────────────────────────────────────────

    async def collect_and_cache_all(self) -> dict[str, Any]:
        """一次性采集所有 Finnhub 数据并缓存。

        供定时任务调用（建议每 15 分钟一次）。
        """
        results: dict[str, Any] = {}

        # 1. 财报日历（低频）
        earnings = await self.collect_crypto_earnings()
        results["earnings"] = {"count": earnings.get("count", 0)}

        # 2. 加密新闻
        news = await self.collect_crypto_news()
        results["crypto_news"] = {"count": len(news)}

        # 3. 宏观关联报价
        macro = await self.collect_macro_quotes()
        results["macro_quotes"] = {"count": len(macro)}

        # 4. 加密关联股报价
        stocks = await self.collect_stock_quotes()
        results["stock_quotes"] = {"count": len(stocks)}

        # 5. 全量快照
        snapshot = {
            "source_id": "finnhub",
            "collected_at": datetime.now(timezone.utc).isoformat(),
            "summary": results,
        }
        await set_with_ttl("finnhub_snapshot", snapshot, _SNAPSHOT_CACHE_TTL)

        logger.info("finnhub_full_collection_done", extra=results)
        return snapshot

    async def close(self) -> None:
        await self._client.close()
