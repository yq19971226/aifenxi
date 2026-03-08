"""CoinMarketCal 日历事件采集器 — 官方 API 集成。

官方文档: https://developers.coinmarketcal.com/
API 端点: https://developers.coinmarketcal.com/v1

主要功能：
- 获取币种事件列表
- 按日期范围筛选
- 按事件分类筛选
- 支持分页查询
"""

import logging
from datetime import datetime, timedelta, timezone
from typing import Any

import httpx
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)


class CalendarEvent(BaseModel):
    """日历事件数据模型"""

    event_id: str
    title: str
    description: str = ""
    coins: list[str] = Field(default_factory=list)
    date_event: datetime
    date_created: datetime
    categories: list[str] = Field(default_factory=list)
    proof: str | None = None
    source: str | None = None
    vote_count: int = 0
    positive_vote_count: int = 0
    percentage: int = 0
    can_occur_before: bool = False


class CoinMarketCalCollector:
    """CoinMarketCal 官方 API 采集器"""

    def __init__(self, api_key: str):
        """初始化采集器

        Args:
            api_key: CoinMarketCal API Key (从 https://coinmarketcal.com/en/api 获取)
        """
        self.api_key = api_key
        self.base_url = "https://developers.coinmarketcal.com/v1"
        self.headers = {
            "x-api-key": api_key,
            "Accept": "application/json",
        }

    async def fetch_events(
        self,
        coins: list[str] | None = None,
        categories: list[str] | None = None,
        date_range_start: datetime | None = None,
        date_range_end: datetime | None = None,
        page: int = 1,
        max_results: int = 50,
        show_only_top_coins: bool = False,
    ) -> list[CalendarEvent]:
        """获取事件列表

        Args:
            coins: 币种列表，如 ["BTC", "ETH"]
            categories: 事件分类列表，如 ["Partnership", "Exchange Listing"]
            date_range_start: 开始日期
            date_range_end: 结束日期
            page: 页码（从 1 开始）
            max_results: 每页结果数（最大 150）
            show_only_top_coins: 是否只显示 Top 币种

        Returns:
            CalendarEvent 列表
        """
        params: dict[str, Any] = {
            "page": page,
            "max": min(max_results, 150),
        }

        if coins:
            params["coins"] = ",".join(coins)

        if categories:
            params["categories"] = ",".join(categories)

        if date_range_start:
            params["dateRangeStart"] = date_range_start.strftime("%m/%d/%Y")

        if date_range_end:
            params["dateRangeEnd"] = date_range_end.strftime("%m/%d/%Y")

        if show_only_top_coins:
            params["showOnly"] = "top_coins"

        try:
            async with httpx.AsyncClient() as client:
                response = await client.get(
                    f"{self.base_url}/events",
                    headers=self.headers,
                    params=params,
                    timeout=30.0,
                )
                response.raise_for_status()
                data = response.json()

                if not data.get("body"):
                    logger.warning("CoinMarketCal API returned empty body")
                    return []

                events = []
                for item in data["body"]:
                    try:
                        event = self._parse_event(item)
                        events.append(event)
                    except Exception as exc:
                        logger.warning(
                            "Failed to parse event",
                            extra={"event_id": item.get("id"), "error": str(exc)},
                        )
                        continue

                logger.info(
                    "CoinMarketCal events fetched",
                    extra={
                        "count": len(events),
                        "coins": coins,
                        "page": page,
                    },
                )
                return events

        except httpx.HTTPStatusError as exc:
            logger.error(
                "CoinMarketCal API HTTP error",
                extra={
                    "status_code": exc.response.status_code,
                    "response": exc.response.text[:500],
                },
            )
            raise
        except Exception as exc:
            logger.error(
                "CoinMarketCal API request failed",
                extra={"error": str(exc)},
            )
            raise

    async def fetch_upcoming_events(
        self,
        symbol: str,
        days_ahead: int = 30,
        categories: list[str] | None = None,
    ) -> list[CalendarEvent]:
        """获取指定币种未来 N 天的事件

        Args:
            symbol: 币种符号，如 "BTC"
            days_ahead: 未来天数
            categories: 事件分类筛选（可选）

        Returns:
            CalendarEvent 列表
        """
        now = datetime.now(timezone.utc)
        end = now + timedelta(days=days_ahead)

        events = await self.fetch_events(
            coins=[symbol],
            categories=categories,
            date_range_start=now,
            date_range_end=end,
            max_results=100,
        )

        return events

    async def fetch_high_impact_events(
        self,
        symbol: str,
        days_ahead: int = 30,
        min_votes: int = 50,
    ) -> list[CalendarEvent]:
        """获取高影响力事件（投票数 > 阈值）

        Args:
            symbol: 币种符号
            days_ahead: 未来天数
            min_votes: 最小投票数阈值

        Returns:
            高影响力事件列表
        """
        all_events = await self.fetch_upcoming_events(symbol, days_ahead)

        # 筛选高投票数事件
        high_impact = [e for e in all_events if e.vote_count >= min_votes]

        logger.info(
            "High impact events filtered",
            extra={
                "symbol": symbol,
                "total": len(all_events),
                "high_impact": len(high_impact),
                "min_votes": min_votes,
            },
        )

        return high_impact

    async def fetch_categories(self) -> list[dict[str, Any]]:
        """获取所有事件分类

        Returns:
            分类列表，每个分类包含 id 和 name
        """
        try:
            async with httpx.AsyncClient() as client:
                response = await client.get(
                    f"{self.base_url}/categories",
                    headers=self.headers,
                    timeout=30.0,
                )
                response.raise_for_status()
                data = response.json()
                return data.get("body", [])

        except Exception as exc:
            logger.error(
                "Failed to fetch categories",
                extra={"error": str(exc)},
            )
            return []

    async def fetch_coins(self) -> list[dict[str, Any]]:
        """获取所有支持的币种

        Returns:
            币种列表，每个币种包含 id, name, symbol
        """
        try:
            async with httpx.AsyncClient() as client:
                response = await client.get(
                    f"{self.base_url}/coins",
                    headers=self.headers,
                    timeout=30.0,
                )
                response.raise_for_status()
                data = response.json()
                return data.get("body", [])

        except Exception as exc:
            logger.error(
                "Failed to fetch coins",
                extra={"error": str(exc)},
            )
            return []

    @staticmethod
    def _parse_event(raw: dict[str, Any]) -> CalendarEvent:
        """解析原始事件数据为 CalendarEvent 对象"""
        # 解析币种列表
        coins = []
        if raw.get("coins"):
            for coin in raw["coins"]:
                if isinstance(coin, dict):
                    coins.append(coin.get("symbol", ""))
                elif isinstance(coin, str):
                    coins.append(coin)

        # 解析分类列表
        categories = []
        if raw.get("categories"):
            for cat in raw["categories"]:
                if isinstance(cat, dict):
                    categories.append(cat.get("name", ""))
                elif isinstance(cat, str):
                    categories.append(cat)

        # 解析日期
        date_event = datetime.fromisoformat(
            raw["date_event"].replace("Z", "+00:00")
        )
        date_created = datetime.fromisoformat(
            raw["created_date"].replace("Z", "+00:00")
        )

        # 解析标题和描述（支持多语言，优先英文）
        title = ""
        description = ""

        if isinstance(raw.get("title"), dict):
            title = raw["title"].get("en", "") or list(raw["title"].values())[0]
        else:
            title = str(raw.get("title", ""))

        if isinstance(raw.get("description"), dict):
            description = (
                raw["description"].get("en", "")
                or list(raw["description"].values())[0]
            )
        else:
            description = str(raw.get("description", ""))

        return CalendarEvent(
            event_id=str(raw["id"]),
            title=title,
            description=description,
            coins=coins,
            date_event=date_event,
            date_created=date_created,
            categories=categories,
            proof=raw.get("proof"),
            source=raw.get("source"),
            vote_count=raw.get("vote_count", 0),
            positive_vote_count=raw.get("positive_vote_count", 0),
            percentage=raw.get("percentage", 0),
            can_occur_before=raw.get("can_occur_before", False),
        )


# ── 事件分类常量 ──────────────────────────────────────────────

# 常见事件分类（从 API 获取的完整列表）
EVENT_CATEGORIES = [
    "Partnership",
    "Exchange Listing",
    "Airdrop",
    "Burn",
    "Conference",
    "AMA",
    "Mainnet Launch",
    "Hard Fork",
    "Soft Fork",
    "Token Swap",
    "Token Unlock",
    "Halving",
    "Release",
    "Update",
    "Rebrand",
    "Hackathon",
    "Meetup",
    "Other",
]

# 高影响力事件分类
HIGH_IMPACT_CATEGORIES = [
    "Exchange Listing",
    "Mainnet Launch",
    "Hard Fork",
    "Token Unlock",
    "Halving",
    "Partnership",
]

# 利好事件分类
BULLISH_CATEGORIES = [
    "Exchange Listing",
    "Partnership",
    "Mainnet Launch",
    "Burn",
    "Airdrop",
]

# 利空事件分类
BEARISH_CATEGORIES = [
    "Token Unlock",
    "Hard Fork",  # 不确定性
]
