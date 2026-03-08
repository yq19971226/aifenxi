"""Binance REST API 客户端 — 历史 K 线拉取。

- 使用 httpx.AsyncClient，超时 30s
- 失败自动重试 3 次（指数退避）
- 支持 HTTP 代理（从环境变量 HTTPS_PROXY 读取）
- 返回 List[KlineData]
"""

import asyncio
import logging
import os
from datetime import datetime, timezone

import httpx

from app.models.market_data import KlineData

logger = logging.getLogger(__name__)

_BASE_URL = "https://api1.binance.com"
_KLINES_ENDPOINT = "/api/v3/klines"
_DEFAULT_TIMEOUT = 30.0
_MAX_RETRIES = 3


def _get_proxy_url() -> str | None:
    """从环境变量读取代理地址，httpx 使用 proxy 参数。"""
    return os.environ.get("HTTPS_PROXY") or os.environ.get("HTTP_PROXY") or None


def _parse_raw_kline(symbol: str, interval: str, row: list) -> KlineData:
    """将 Binance REST klines 数组行解析为 KlineData。"""
    return KlineData(
        symbol=symbol.upper(),
        interval=interval,
        open_time=datetime.fromtimestamp(row[0] / 1000, tz=timezone.utc),
        open=row[1],
        high=row[2],
        low=row[3],
        close=row[4],
        volume=row[5],
        close_time=datetime.fromtimestamp(row[6] / 1000, tz=timezone.utc),
        is_closed=True,  # REST 返回的都是已关闭 K 线
    )


class BinanceRestClient:
    """无状态 Binance REST 客户端，每次调用创建独立 httpx 会话。"""

    def __init__(self, timeout: float = _DEFAULT_TIMEOUT) -> None:
        self._timeout = timeout

    async def fetch_klines(
        self,
        symbol: str,
        interval: str,
        limit: int = 500,
        start_time: int | None = None,
        end_time: int | None = None,
    ) -> list[KlineData]:
        """拉取历史 K 线，失败重试 3 次。

        Args:
            symbol:     交易对，如 "BTCUSDT"
            interval:   周期，如 "15m", "1h", "4h", "1d"
            limit:      最多返回条数（Binance 上限 1000）
            start_time: 起始时间戳（毫秒）
            end_time:   结束时间戳（毫秒）

        Returns:
            List[KlineData]，按时间升序排列
        """
        params: dict[str, str | int] = {
            "symbol": symbol.upper(),
            "interval": interval,
            "limit": min(limit, 1000),
        }
        if start_time is not None:
            params["startTime"] = start_time
        if end_time is not None:
            params["endTime"] = end_time

        proxy_url = _get_proxy_url()
        if proxy_url:
            logger.info("Using proxy for Binance API: %s", proxy_url)

        last_exc: Exception | None = None
        for attempt in range(1, _MAX_RETRIES + 1):
            try:
                async with httpx.AsyncClient(
                    base_url=_BASE_URL,
                    timeout=self._timeout,
                    **({"proxies": proxy_url} if proxy_url else {}),
                ) as client:
                    response = await asyncio.wait_for(
                        client.get(_KLINES_ENDPOINT, params=params),
                        timeout=self._timeout,
                    )
                    response.raise_for_status()
                    raw: list[list] = response.json()
                    return [_parse_raw_kline(symbol, interval, row) for row in raw]
            except (httpx.HTTPError, asyncio.TimeoutError) as exc:
                last_exc = exc
                delay = 2.0 * (2 ** (attempt - 1))
                logger.warning(
                    "Binance REST fetch_klines failed, retrying",
                    extra={
                        "symbol": symbol,
                        "interval": interval,
                        "attempt": attempt,
                        "delay": delay,
                        "error": str(exc),
                    },
                )
                if attempt < _MAX_RETRIES:
                    await asyncio.sleep(delay)
            except Exception as exc:
                logger.error(
                    "Unexpected error in fetch_klines",
                    extra={"symbol": symbol, "interval": interval, "error": str(exc)},
                )
                raise

        logger.error(
            "fetch_klines exhausted retries",
            extra={"symbol": symbol, "interval": interval, "error": str(last_exc)},
        )
        raise RuntimeError(f"fetch_klines failed after {_MAX_RETRIES} retries: {last_exc}") from last_exc
