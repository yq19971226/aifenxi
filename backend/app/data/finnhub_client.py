"""Finnhub API 客户端 — 美股 + 加密市场数据。

免费版：60 req/min, 30 req/sec
Base URL: https://finnhub.io/api/v1
Auth: token query param 或 X-Finnhub-Token header
Config Key: finnhub_api_key

覆盖：
- Earnings Calendar（财报日历）
- Market News（主流财经新闻，支持 crypto 分类）
- Company News（加密概念股新闻）
- Quote（美股 / 外汇 / 加密实时报价）
- Insider Sentiment（内部人情绪）
- Basic Financials（基本面指标）
- Crypto Candles（加密 K 线，Binance fallback）
"""

from __future__ import annotations

import asyncio
import logging
import time
from datetime import datetime, timedelta, timezone
from typing import Any

import httpx

logger = logging.getLogger(__name__)

_BASE_URL = "https://finnhub.io/api/v1"
_DEFAULT_TIMEOUT = 30.0
_MAX_RETRIES = 2
_RATE_LIMIT_PER_MIN = 60

# ── 加密关联美股白名单 ─────────────────────────────────────────
CRYPTO_RELATED_STOCKS: list[dict[str, str]] = [
    {"symbol": "MSTR", "name": "MicroStrategy", "relation": "BTC 最大持仓公司（~214k BTC）"},
    {"symbol": "COIN", "name": "Coinbase", "relation": "最大加密交易所"},
    {"symbol": "MARA", "name": "Marathon Digital", "relation": "BTC 矿企"},
    {"symbol": "RIOT", "name": "Riot Platforms", "relation": "BTC 矿企"},
    {"symbol": "CLSK", "name": "CleanSpark", "relation": "BTC 矿企"},
    {"symbol": "SQ", "name": "Block (Square)", "relation": "Cash App 加密服务"},
    {"symbol": "HOOD", "name": "Robinhood", "relation": "加密交易平台"},
    {"symbol": "NVDA", "name": "NVIDIA", "relation": "GPU / AI 芯片，挖矿 + AI 概念"},
]

# ── 宏观关联资产报价 ──────────────────────────────────────────
MACRO_QUOTE_SYMBOLS: list[dict[str, str]] = [
    {"symbol": "SPY",  "name": "S&P 500 ETF",  "relation": "风险偏好指标"},
    {"symbol": "QQQ",  "name": "Nasdaq 100 ETF", "relation": "科技/成长股风险偏好"},
    {"symbol": "GLD",  "name": "黄金 ETF",       "relation": "避险资产对标"},
    {"symbol": "TLT",  "name": "20年国债 ETF",   "relation": "利率预期"},
    {"symbol": "IBIT", "name": "iShares BTC ETF", "relation": "BTC 现货 ETF 资金流"},
]


class FinnhubClient:
    """Finnhub REST API 客户端 — 节流式，60 req/min。"""

    def __init__(self, timeout: float = _DEFAULT_TIMEOUT) -> None:
        self._timeout = timeout
        self._api_key: str | None = None
        self._request_count = 0
        self._window_start = time.monotonic()

    async def _get_api_key(self) -> str:
        """从 config_service 读取 API key。"""
        if self._api_key is None:
            from app.services.config_service import get_config_value
            self._api_key = await get_config_value("finnhub_api_key", "")
        return self._api_key

    async def _throttle(self) -> None:
        """滑动窗口限流：60 req/min。"""
        now = time.monotonic()
        elapsed = now - self._window_start
        if elapsed >= 60.0:
            self._request_count = 0
            self._window_start = now
        elif self._request_count >= _RATE_LIMIT_PER_MIN:
            wait = 60.0 - elapsed + 0.5
            logger.info("finnhub_throttle", extra={"wait_seconds": round(wait, 1)})
            await asyncio.sleep(wait)
            self._request_count = 0
            self._window_start = time.monotonic()

    async def _request(
        self,
        path: str,
        params: dict[str, Any] | None = None,
    ) -> dict | list | None:
        """通用 GET 请求，含限流和重试。"""
        api_key = await self._get_api_key()
        if not api_key:
            logger.warning("finnhub_api_key_missing")
            return None

        url = f"{_BASE_URL}{path}"
        if params is None:
            params = {}
        params["token"] = api_key

        for attempt in range(1, _MAX_RETRIES + 1):
            await self._throttle()
            self._request_count += 1
            try:
                async with httpx.AsyncClient(timeout=self._timeout) as client:
                    resp = await client.get(url, params=params)
                    if resp.status_code == 429:
                        logger.warning("finnhub_rate_limited", extra={"attempt": attempt, "path": path})
                        await asyncio.sleep(15.0)
                        continue
                    if resp.status_code == 403:
                        logger.warning("finnhub_premium_required", extra={"path": path})
                        return None
                    resp.raise_for_status()
                    return resp.json()
            except httpx.HTTPStatusError as exc:
                logger.warning(
                    "finnhub_http_error",
                    extra={"path": path, "status": exc.response.status_code, "attempt": attempt},
                )
                if attempt < _MAX_RETRIES:
                    await asyncio.sleep(3.0 * attempt)
            except (httpx.HTTPError, asyncio.TimeoutError) as exc:
                logger.warning(
                    "finnhub_request_failed",
                    extra={"path": path, "error": str(exc), "attempt": attempt},
                )
                if attempt < _MAX_RETRIES:
                    await asyncio.sleep(3.0 * attempt)
            except Exception as exc:
                logger.error("finnhub_unexpected_error", extra={"path": path, "error": str(exc)})
                break
        return None

    # ── Earnings Calendar ──────────────────────────────────────

    async def fetch_earnings_calendar(
        self,
        from_date: str | None = None,
        to_date: str | None = None,
        symbol: str | None = None,
    ) -> list[dict[str, Any]]:
        """获取财报日历。

        Args:
            from_date: 开始日期 (YYYY-MM-DD)，默认本周开始
            to_date: 结束日期 (YYYY-MM-DD)，默认本周结束
            symbol: 特定股票代码（可选）

        Returns:
            财报条目列表:
            [{"date", "epsActual", "epsEstimate", "hour", "quarter",
              "revenueActual", "revenueEstimate", "symbol", "year"}, ...]
        """
        if from_date is None:
            today = datetime.now(timezone.utc).date()
            from_date = (today - timedelta(days=today.weekday())).isoformat()
        if to_date is None:
            today = datetime.now(timezone.utc).date()
            to_date = (today + timedelta(days=14)).isoformat()

        params: dict[str, Any] = {"from": from_date, "to": to_date}
        if symbol:
            params["symbol"] = symbol

        data = await self._request("/calendar/earnings", params)
        if data and isinstance(data, dict):
            return data.get("earningsCalendar", [])
        return []

    # ── Market News ────────────────────────────────────────────

    async def fetch_market_news(
        self,
        category: str = "crypto",
        min_id: int = 0,
    ) -> list[dict[str, Any]]:
        """获取市场新闻。

        Args:
            category: 分类 — general, forex, crypto, merger
            min_id: 仅返回 ID 大于此值的新闻（用于增量拉取）

        Returns:
            新闻列表:
            [{"category", "datetime", "headline", "id", "image",
              "related", "source", "summary", "url"}, ...]
        """
        params: dict[str, Any] = {"category": category}
        if min_id > 0:
            params["minId"] = min_id

        data = await self._request("/news", params)
        if data and isinstance(data, list):
            return data
        return []

    # ── Company News ───────────────────────────────────────────

    async def fetch_company_news(
        self,
        symbol: str,
        from_date: str | None = None,
        to_date: str | None = None,
    ) -> list[dict[str, Any]]:
        """获取特定公司的新闻。

        Args:
            symbol: 股票代码，如 "COIN"
            from_date: 开始日期 (YYYY-MM-DD)
            to_date: 结束日期 (YYYY-MM-DD)

        Returns:
            新闻列表（同 Market News 格式）
        """
        today = datetime.now(timezone.utc).date()
        if from_date is None:
            from_date = (today - timedelta(days=7)).isoformat()
        if to_date is None:
            to_date = today.isoformat()

        params: dict[str, Any] = {
            "symbol": symbol,
            "from": from_date,
            "to": to_date,
        }

        data = await self._request("/company-news", params)
        if data and isinstance(data, list):
            return data
        return []

    # ── Quote（实时报价）────────────────────────────────────────

    async def fetch_quote(self, symbol: str) -> dict[str, Any] | None:
        """获取实时报价（美股/ETF/外汇/加密）。

        Args:
            symbol: 代码，如 "AAPL", "SPY", "BINANCE:BTCUSDT"

        Returns:
            {"c": 当前价, "d": 涨跌额, "dp": 涨跌幅%, "h": 最高, "l": 最低,
             "o": 开盘, "pc": 前收盘, "t": 时间戳}
        """
        data = await self._request("/quote", {"symbol": symbol})
        if data and isinstance(data, dict) and data.get("c"):
            return data
        return None

    # ── Insider Sentiment ──────────────────────────────────────

    async def fetch_insider_sentiment(
        self,
        symbol: str,
        from_date: str | None = None,
        to_date: str | None = None,
    ) -> list[dict[str, Any]]:
        """获取内部人情绪（月度汇总）。

        Returns:
            [{"symbol", "year", "month", "change", "mspr"}, ...]
            change: 内部人净买卖股数
            mspr: Monthly Share Purchase Ratio（正=净买入，负=净卖出）
        """
        today = datetime.now(timezone.utc).date()
        if from_date is None:
            from_date = (today - timedelta(days=180)).isoformat()
        if to_date is None:
            to_date = today.isoformat()

        params: dict[str, Any] = {
            "symbol": symbol,
            "from": from_date,
            "to": to_date,
        }

        data = await self._request("/stock/insider-sentiment", params)
        if data and isinstance(data, dict):
            return data.get("data", [])
        return []

    # ── Basic Financials ───────────────────────────────────────

    async def fetch_basic_financials(self, symbol: str) -> dict[str, Any] | None:
        """获取基本面指标。

        Returns:
            {"metric": {"52WeekHigh", "52WeekLow", "marketCapitalization",
                        "peBasicTTM", "dividendYieldIndicatedAnnual", ...}, ...}
        """
        data = await self._request("/stock/metric", {"symbol": symbol, "metric": "all"})
        if data and isinstance(data, dict):
            return data.get("metric")
        return None

    # ── Crypto Candles ─────────────────────────────────────────

    async def fetch_crypto_candles(
        self,
        symbol: str,
        resolution: str = "D",
        from_ts: int | None = None,
        to_ts: int | None = None,
    ) -> dict[str, Any] | None:
        """获取加密货币 K 线。

        Args:
            symbol: 交易所:交易对，如 "BINANCE:BTCUSDT"
            resolution: 分辨率 — 1, 5, 15, 30, 60, D, W, M
            from_ts: 起始 UNIX 时间戳
            to_ts: 结束 UNIX 时间戳

        Returns:
            {"c": [close], "h": [high], "l": [low], "o": [open],
             "s": "ok", "t": [timestamp], "v": [volume]}
        """
        now = int(datetime.now(timezone.utc).timestamp())
        if to_ts is None:
            to_ts = now
        if from_ts is None:
            from_ts = now - 86400 * 30  # 默认 30 天

        params: dict[str, Any] = {
            "symbol": symbol,
            "resolution": resolution,
            "from": from_ts,
            "to": to_ts,
        }

        data = await self._request("/crypto/candle", params)
        if data and isinstance(data, dict) and data.get("s") == "ok":
            return data
        return None

    # ── IPO Calendar ───────────────────────────────────────────

    async def fetch_ipo_calendar(
        self,
        from_date: str | None = None,
        to_date: str | None = None,
    ) -> list[dict[str, Any]]:
        """获取 IPO 日历。

        Returns:
            [{"date", "exchange", "name", "numberOfShares",
              "price", "status", "symbol", "totalSharesValue"}, ...]
        """
        today = datetime.now(timezone.utc).date()
        if from_date is None:
            from_date = today.isoformat()
        if to_date is None:
            to_date = (today + timedelta(days=30)).isoformat()

        params: dict[str, Any] = {"from": from_date, "to": to_date}

        data = await self._request("/calendar/ipo", params)
        if data and isinstance(data, dict):
            return data.get("ipoCalendar", [])
        return []

    async def close(self) -> None:
        """清理资源。"""
        pass
