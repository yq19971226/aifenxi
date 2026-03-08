"""CryptoQuant API 客户端 — Professional ($109) 套餐。

限额：20 req/min、仅按天分辨率、最长1天API历史、1年数据保留、仅限个人使用。
Base URL: https://api.cryptoquant.com/v1
Auth: Bearer token via config_service (config_key: cryptoquant_api_key)
"""

from __future__ import annotations

import asyncio
import logging
import time
from typing import Any

import httpx

logger = logging.getLogger(__name__)

_BASE_URL = "https://api.cryptoquant.com/v1"
_DEFAULT_TIMEOUT = 30.0
_MAX_RETRIES = 2
_RATE_LIMIT_PER_MIN = 20

# ── 首阶段指标白名单（基于官方 API v1.3.0 文档确认） ──────────
# capability_key → API 路径与参数
# 路径中 {asset} 替换为 btc/eth（官方缩写）
# value_key: 响应 result.data[].{key} 中的取值字段名
METRIC_REGISTRY: dict[str, dict[str, Any]] = {
    "exchange_netflow": {
        "path": "/{asset}/exchange-flows/netflow",
        "params": {"exchange": "all_exchange", "window": "day", "limit": 1},
        "value_key": "netflow_total",
        "assets": ["btc", "eth"],
        "priority": 0,
        "description": "交易所净流量",
    },
    "exchange_inflow": {
        "path": "/{asset}/exchange-flows/inflow",
        "params": {"exchange": "all_exchange", "window": "day", "limit": 1},
        "value_key": "inflow_total",
        "assets": ["btc", "eth"],
        "priority": 0,
        "description": "交易所流入总量",
    },
    "exchange_outflow": {
        "path": "/{asset}/exchange-flows/outflow",
        "params": {"exchange": "all_exchange", "window": "day", "limit": 1},
        "value_key": "outflow_total",
        "assets": ["btc", "eth"],
        "priority": 0,
        "description": "交易所流出总量",
    },
    "exchange_reserve": {
        "path": "/{asset}/exchange-flows/reserve",
        "params": {"exchange": "all_exchange", "window": "day", "limit": 1},
        "value_key": "reserve",
        "assets": ["btc", "eth"],
        "priority": 0,
        "description": "交易所储备/余额",
    },
    "miner_reserve": {
        "path": "/{asset}/miner-flows/reserve",
        "params": {"miner": "all_miner", "window": "day", "limit": 1},
        "value_key": "reserve",
        "assets": ["btc"],
        "priority": 1,
        "description": "矿工储备（仅BTC）",
    },
    "exchange_whale_ratio": {
        "path": "/{asset}/flow-indicator/exchange-whale-ratio",
        "params": {"exchange": "all_exchange", "window": "day", "limit": 1},
        "value_key": "exchange_whale_ratio",
        "assets": ["btc"],
        "priority": 1,
        "description": "交易所鲸鱼比率",
    },
    "mvrv": {
        "path": "/{asset}/market-indicator/mvrv",
        "params": {"window": "day", "limit": 1},
        "value_key": "mvrv",
        "assets": ["btc"],
        "priority": 1,
        "description": "MVRV（市值/已实现市值）",
    },
    "active_addresses": {
        "path": "/{asset}/network-data/addresses-count",
        "params": {"window": "day", "limit": 1},
        "value_key": "addresses_count_active",
        "assets": ["btc", "eth"],
        "priority": 2,
        "description": "活跃地址数",
    },
    "transactions_count": {
        "path": "/{asset}/network-data/transactions-count",
        "params": {"window": "day", "limit": 1},
        "value_key": "transactions_count_total",
        "assets": ["btc", "eth"],
        "priority": 2,
        "description": "交易笔数",
    },
}

# 系统币种 → CryptoQuant asset 映射（官方用缩写）
SYMBOL_TO_ASSET: dict[str, str] = {
    "BTCUSDT": "btc",
    "ETHUSDT": "eth",
}


class CryptoQuantClient:
    """CryptoQuant REST API 客户端（节流式、20 req/min）。"""

    def __init__(self, timeout: float = _DEFAULT_TIMEOUT) -> None:
        self._timeout = timeout
        self._api_key: str | None = None
        self._request_count = 0
        self._window_start = time.monotonic()

    async def _get_api_key(self) -> str:
        """从 config_service 读取 API key。"""
        if self._api_key is None:
            from app.services.config_service import get_config_value
            self._api_key = await get_config_value("cryptoquant_api_key", "")
        return self._api_key

    async def _throttle(self) -> None:
        """滑动窗口限流：20 req/min。"""
        now = time.monotonic()
        elapsed = now - self._window_start
        if elapsed >= 60.0:
            self._request_count = 0
            self._window_start = now
        elif self._request_count >= _RATE_LIMIT_PER_MIN:
            wait = 60.0 - elapsed + 0.5
            logger.info("cryptoquant_throttle", extra={"wait_seconds": round(wait, 1)})
            await asyncio.sleep(wait)
            self._request_count = 0
            self._window_start = time.monotonic()

    async def fetch_metric(
        self,
        asset: str,
        metric_key: str,
    ) -> dict[str, Any] | None:
        """拉取单个指标的最新值。

        Args:
            asset: CryptoQuant 资产标识，如 "btc", "eth"
            metric_key: METRIC_REGISTRY 中的 capability_key

        Returns:
            解析后的 JSON 响应 dict，失败返回 None
        """
        metric = METRIC_REGISTRY.get(metric_key)
        if metric is None:
            logger.warning("unknown_metric", extra={"metric_key": metric_key})
            return None

        if asset not in metric["assets"]:
            return None

        api_key = await self._get_api_key()
        if not api_key:
            logger.warning("cryptoquant_api_key_missing")
            return None

        path = metric["path"].format(asset=asset)
        url = f"{_BASE_URL}{path}"
        params = dict(metric.get("params", {}))
        headers = {
            "Authorization": f"Bearer {api_key}",
            "Accept": "application/json",
        }

        for attempt in range(1, _MAX_RETRIES + 1):
            await self._throttle()
            self._request_count += 1
            try:
                async with httpx.AsyncClient(timeout=self._timeout) as client:
                    resp = await client.get(url, params=params, headers=headers)
                    if resp.status_code == 429:
                        logger.warning("cryptoquant_rate_limited", extra={"attempt": attempt})
                        await asyncio.sleep(30.0)
                        continue
                    resp.raise_for_status()
                    data = resp.json()
                    return data
            except httpx.HTTPStatusError as exc:
                logger.warning(
                    "cryptoquant_http_error",
                    extra={"metric": metric_key, "asset": asset, "status": exc.response.status_code, "attempt": attempt},
                )
                if attempt < _MAX_RETRIES:
                    await asyncio.sleep(3.0 * attempt)
            except (httpx.HTTPError, asyncio.TimeoutError) as exc:
                logger.warning(
                    "cryptoquant_request_failed",
                    extra={"metric": metric_key, "asset": asset, "error": str(exc), "attempt": attempt},
                )
                if attempt < _MAX_RETRIES:
                    await asyncio.sleep(3.0 * attempt)
            except Exception as exc:
                logger.error(
                    "cryptoquant_unexpected_error",
                    extra={"metric": metric_key, "asset": asset, "error": str(exc)},
                )
                break
        return None

    async def close(self) -> None:
        """清理资源（当前无持久连接，预留接口）。"""
        pass
