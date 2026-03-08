"""FRED API 客户端 — 美国宏观经济数据。

Base URL: https://api.stlouisfed.org/fred/
Auth: api_key query parameter (config_key: fred_api_key)
Rate: 120 req/min (免费)
文档: https://fred.stlouisfed.org/docs/api/fred/
"""

from __future__ import annotations

import asyncio
import logging
from typing import Any

import httpx

logger = logging.getLogger(__name__)

_BASE_URL = "https://api.stlouisfed.org/fred"
_DEFAULT_TIMEOUT = 30.0
_MAX_RETRIES = 2

# ── 首阶段宏观序列白名单（基于 spec 定义） ─────────────────────
# capability_key → (series_id, 中文语义, 频率层级)
SERIES_WHITELIST: dict[str, dict[str, str]] = {
    "macro_cpi": {
        "series_id": "CPIAUCSL",
        "label": "美国 CPI",
        "frequency": "monthly",
    },
    "macro_core_cpi": {
        "series_id": "CPILFESL",
        "label": "美国核心 CPI",
        "frequency": "monthly",
    },
    "macro_unemployment": {
        "series_id": "UNRATE",
        "label": "失业率",
        "frequency": "monthly",
    },
    "macro_jobless_claims": {
        "series_id": "ICSA",
        "label": "初请失业金",
        "frequency": "weekly",
    },
    "macro_rate": {
        "series_id": "FEDFUNDS",
        "label": "联邦基金利率",
        "frequency": "monthly",
    },
    "macro_growth": {
        "series_id": "GDPC1",
        "label": "实际 GDP",
        "frequency": "quarterly",
    },
    "macro_pce": {
        "series_id": "PCEPI",
        "label": "PCE 价格指数",
        "frequency": "monthly",
    },
    "macro_payrolls": {
        "series_id": "PAYEMS",
        "label": "非农就业人数",
        "frequency": "monthly",
    },
}


class FredClient:
    """FRED REST API 客户端。"""

    def __init__(self, timeout: float = _DEFAULT_TIMEOUT) -> None:
        self._timeout = timeout
        self._api_key: str | None = None

    async def _get_api_key(self) -> str:
        if self._api_key is None:
            from app.services.config_service import get_config_value
            self._api_key = await get_config_value("fred_api_key", "")
        return self._api_key

    async def fetch_latest_observation(
        self,
        series_id: str,
    ) -> dict[str, Any] | None:
        """拉取单个 series 的最新 observation。

        Returns:
            {"date": "2024-01-01", "value": "3.1"} 或 None
        """
        api_key = await self._get_api_key()
        if not api_key:
            logger.warning("fred_api_key_missing")
            return None

        url = f"{_BASE_URL}/series/observations"
        params = {
            "series_id": series_id,
            "api_key": api_key,
            "file_type": "json",
            "sort_order": "desc",
            "limit": 1,
        }

        for attempt in range(1, _MAX_RETRIES + 1):
            try:
                async with httpx.AsyncClient(timeout=self._timeout) as client:
                    resp = await client.get(url, params=params)
                    if resp.status_code == 429:
                        logger.warning("fred_rate_limited", extra={"attempt": attempt})
                        await asyncio.sleep(10.0)
                        continue
                    resp.raise_for_status()
                    data = resp.json()
                    observations = data.get("observations", [])
                    if observations:
                        return observations[0]
                    return None
            except httpx.HTTPStatusError as exc:
                logger.warning("fred_http_error", extra={"series": series_id, "status": exc.response.status_code})
                if attempt < _MAX_RETRIES:
                    await asyncio.sleep(3.0)
            except (httpx.HTTPError, asyncio.TimeoutError) as exc:
                logger.warning("fred_request_failed", extra={"series": series_id, "error": str(exc)})
                if attempt < _MAX_RETRIES:
                    await asyncio.sleep(3.0)
            except Exception as exc:
                logger.error("fred_unexpected_error", extra={"series": series_id, "error": str(exc)})
                break
        return None

    async def close(self) -> None:
        pass
