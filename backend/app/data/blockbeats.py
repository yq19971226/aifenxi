"""BlockBeats 律动新闻采集模块 — 免费 API，无需 API Key。

数据源：
- BlockBeats RESTful API（https://api.theblockbeats.news/v1/）
- Redis 缓存（news:blockbeats:{symbol}，TTL 10min）

端点：
- open-api/open-flash: 快讯列表
- open-api/open-information: 深度文章列表

输出：标准化的新闻条目列表，复用 news.py 中的 NewsItem 模型。
"""

import asyncio
import logging
from typing import Optional

import httpx

from app.core.redis import get_json, set_with_ttl
from app.data.news import NewsItem

logger = logging.getLogger(__name__)

_BLOCKBEATS_API = "https://api.theblockbeats.news/v1/"
_CACHE_PREFIX = "news:blockbeats"
_CACHE_TTL = 600  # 10 minutes
_REQUEST_TIMEOUT = 20.0


class BlockBeatsCollector:
    """BlockBeats 新闻采集器 — 免费 API，中文原生。"""

    async def fetch_news(
        self,
        symbol: str = "BTCUSDT",
        limit: int = 20,
    ) -> list[NewsItem]:
        """获取 BlockBeats 最新快讯。

        优先从 Redis 缓存读取，缓存未命中时调用 API。
        """
        from app.data.source_gate import is_enabled
        if not await is_enabled("blockbeats"):
            logger.debug("BlockBeats source disabled, skipping")
            return []

        symbol = symbol.upper()
        cache_key = f"{_CACHE_PREFIX}:{symbol}"

        # 1. 尝试读取缓存
        try:
            cached = await get_json(cache_key)
            if cached and isinstance(cached, list):
                logger.debug("BlockBeats cache hit", extra={"symbol": symbol})
                return [NewsItem(**item) for item in cached]
        except Exception:
            pass

        # 2. 并行获取快讯和文章
        flash_items, article_items = await asyncio.gather(
            self._fetch_flash(limit=limit),
            self._fetch_articles(limit=limit // 2),
            return_exceptions=True,
        )

        items: list[NewsItem] = []
        if isinstance(flash_items, list):
            items.extend(flash_items)
        else:
            logger.warning("BlockBeats flash fetch failed", extra={"error": str(flash_items)})

        if isinstance(article_items, list):
            items.extend(article_items)
        else:
            logger.warning("BlockBeats articles fetch failed", extra={"error": str(article_items)})

        # 3. 按币种过滤（基于标题关键词匹配）
        currency = symbol.replace("USDT", "")
        filtered = [
            item for item in items
            if currency.upper() in item.title.upper()
            or currency.lower() in item.title.lower()
        ]
        # 如果过滤后为空，返回所有快讯（通用市场新闻也有价值）
        result = filtered if filtered else items[:limit]

        # 4. 缓存结果
        if result:
            try:
                cache_data = [item.model_dump() for item in result[:limit]]
                await set_with_ttl(cache_key, cache_data, _CACHE_TTL)
            except Exception as exc:
                logger.warning("BlockBeats cache write failed", extra={"error": str(exc)})

        return result[:limit]

    async def _fetch_flash(self, limit: int = 20) -> list[NewsItem]:
        """从 BlockBeats 获取快讯列表。"""
        url = f"{_BLOCKBEATS_API}open-api/open-flash"
        params = {"size": str(min(limit, 50)), "page": "1", "lang": "cn"}

        try:
            async with httpx.AsyncClient(timeout=_REQUEST_TIMEOUT) as client:
                resp = await asyncio.wait_for(
                    client.get(url, params=params),
                    timeout=_REQUEST_TIMEOUT,
                )
                resp.raise_for_status()
                data = resp.json()

            if data.get("status") != 0:
                logger.warning("BlockBeats flash API error", extra={"response": data})
                return []

            entries = data.get("data", {}).get("data", [])
            items: list[NewsItem] = []
            for entry in entries[:limit]:
                items.append(
                    NewsItem(
                        title=entry.get("title", ""),
                        source="BlockBeats",
                        published_at=self._ts_to_iso(entry.get("create_time", "")),
                        url=entry.get("link", ""),
                        kind="flash",
                        currencies=[],
                        votes={},
                        domain="theblockbeats.info",
                    )
                )

            logger.info("BlockBeats flash fetched", extra={"count": len(items)})
            return items

        except Exception:
            logger.warning("BlockBeats flash API request failed", exc_info=True)
            return []

    async def _fetch_articles(self, limit: int = 10) -> list[NewsItem]:
        """从 BlockBeats 获取深度文章列表。"""
        url = f"{_BLOCKBEATS_API}open-api/open-information"
        params = {"size": str(min(limit, 20)), "page": "1", "lang": "cn"}

        try:
            async with httpx.AsyncClient(timeout=_REQUEST_TIMEOUT) as client:
                resp = await asyncio.wait_for(
                    client.get(url, params=params),
                    timeout=_REQUEST_TIMEOUT,
                )
                resp.raise_for_status()
                data = resp.json()

            if data.get("status") != 0:
                logger.warning("BlockBeats articles API error", extra={"response": data})
                return []

            entries = data.get("data", {}).get("data", [])
            items: list[NewsItem] = []
            for entry in entries[:limit]:
                items.append(
                    NewsItem(
                        title=entry.get("title", ""),
                        source="BlockBeats",
                        published_at=self._ts_to_iso(entry.get("create_time", "")),
                        url=entry.get("link", ""),
                        kind="article",
                        currencies=[],
                        votes={},
                        domain="theblockbeats.info",
                    )
                )

            logger.info("BlockBeats articles fetched", extra={"count": len(items)})
            return items

        except Exception:
            logger.warning("BlockBeats articles API request failed", exc_info=True)
            return []

    @staticmethod
    def _ts_to_iso(ts: str | int) -> str:
        """将 Unix 时间戳转为 ISO 格式字符串。"""
        try:
            from datetime import datetime, timezone
            return datetime.fromtimestamp(int(ts), tz=timezone.utc).isoformat()
        except (ValueError, TypeError, OSError):
            return str(ts)
