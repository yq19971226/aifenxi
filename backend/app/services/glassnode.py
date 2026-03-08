"""GlassNode API 客户端 — 链上数据查询。

文档: https://docs.glassnode.com
"""

import logging
from datetime import datetime
from typing import Any, Optional

import aiohttp

from app.services.config_service import get_config_value

logger = logging.getLogger(__name__)

# GlassNode API 基础 URL
GLASSNODE_BASE_URL = "https://api.glassnode.com/v1"

# 支持的指标
METRIC_MAPPING: dict[str, str] = {
    "price": "price",
    "market_cap": "market_cap",
    "nvt": "nvt",
    "mvrv": "mvrv",
    "stock_to_flow": "stock_to_flow",
    "exchange_flow": "exchange_flow",
    "exchange_volume": "exchange_volume",
    "active_addresses": "active_addresses",
    "transaction_count": "transaction_count",
}

# 币种符号映射 (Binance → GlassNode)
SYMBOL_MAPPING: dict[str, str] = {
    "BTCUSDT": "BTC",
    "ETHUSDT": "ETH",
    "SOLUSDT": "SOL",
    "BNBUSDT": "BNB",
    "XRPUSDT": "XRP",
    "DOGEUSDT": "DOGE",
    "ZECUSDT": "ZEC",
    "BCHUSDT": "BCH",
    "HYPEUSDT": "HYPE",
}

# 时间间隔映射
INTERVAL_MAPPING: dict[str, str] = {
    "h1": "10m",      # 10 分钟
    "h24": "24h",     # 24 小时
    "h168": "1w",     # 1 周
    "h720": "30d",    # 30 天
}


class GlassNodeError(Exception):
    """GlassNode API 错误。"""

    def __init__(self, message: str, status_code: int = 0):
        self.message = message
        self.status_code = status_code
        super().__init__(message)


class GlassNodeClient:
    """GlassNode API 客户端。"""

    def __init__(self, api_key: str):
        self._api_key = api_key
        self._session: Optional[aiohttp.ClientSession] = None

    async def _get_session(self) -> aiohttp.ClientSession:
        if self._session is None or self._session.closed:
            self._session = aiohttp.ClientSession()
        return self._session

    async def close(self) -> None:
        if self._session and not self._session.closed:
            await self._session.close()

    async def _request(
        self,
        endpoint: str,
        params: dict[str, Any],
    ) -> dict[str, Any]:
        """发送请求到 GlassNode API。"""
        url = f"{GLASSNODE_BASE_URL}{endpoint}"
        headers = {
            "Api-Key": self._api_key,
        }

        try:
            session = await self._get_session()
            async with session.get(url, headers=headers, params=params, timeout=aiohttp.ClientTimeout(total=30)) as resp:
                if resp.status != 200:
                    text = await resp.text()
                    logger.error("glassnode_api_error", status=resp.status, body=text[:200])
                    raise GlassNodeError(f"API error: {resp.status}", resp.status)

                data = await resp.json()
                return data
        except aiohttp.ClientError as exc:
            logger.error("glassnode_request_failed", error=str(exc))
            raise GlassNodeError(f"Request failed: {exc}")

    async def get_metric(
        self,
        symbol: str,
        metric: str,
        interval: str = "24h",
    ) -> list[dict[str, Any]]:
        """获取链上指标数据。

        Args:
            symbol: 币种符号 (如 BTC, ETH)
            metric: 指标名称 (如 price, market_cap)
            interval: 时间间隔 (h1, h24, h168, h720)

        Returns:
            数据点列表 [{time, value}, ...]
        """
        # 符号转换
        gn_symbol = SYMBOL_MAPPING.get(symbol.replace("USDT", ""), symbol.replace("USDT", ""))
        if gn_symbol not in ["BTC", "ETH", "SOL", "BNB", "XRP", "DOGE", "ZEC", "BCH", "HYPE"]:
            raise GlassNodeError(f"Unsupported symbol: {symbol}")

        # 指标转换
        gn_metric = METRIC_MAPPING.get(metric)
        if not gn_metric:
            raise GlassNodeError(f"Unsupported metric: {metric}")

        # 时间间隔转换
        gn_interval = INTERVAL_MAPPING.get(interval, "24h")

        params: dict[str, Any] = {
            "a": gn_symbol,
            "i": gn_interval,
        }

        endpoint = f"/metrics/{gn_metric}"
        data = await self._request(endpoint, params)

        return data

    async def get_latest(
        self,
        symbol: str,
        metric: str,
    ) -> Optional[dict[str, Any]]:
        """获取最新数据点。"""
        data = await self.get_metric(symbol, metric, "24h")
        if not data:
            return None
        return data[-1]


# ── 全局客户端实例 ─────────────────────────────────────────


async def get_glassnode_client() -> Optional[GlassNodeClient]:
    """获取 GlassNode 客户端实例。"""
    api_key = await get_config_value("glassnode_api_key", "")
    if not api_key:
        logger.warning("glassnode_api_key_not_configured")
        return None
    return GlassNodeClient(api_key)


# ── 便捷函数 ───────────────────────────────────────────────


async def fetch_onchain_data(
    symbol: str,
    metric: str,
    interval: str = "24h",
) -> Optional[dict[str, Any]]:
    """便捷函数：获取链上数据（自动处理 API Key）。"""
    client = await get_glassnode_client()
    if not client:
        return None

    try:
        return await client.get_latest(symbol, metric)
    except GlassNodeError as exc:
        logger.warning("glassnode_fetch_failed", symbol=symbol, metric=metric, error=exc.message)
        return None
    finally:
        await client.close()
