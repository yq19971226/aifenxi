"""CoinGecko API 统一客户端 — 限频、重试、超时、套餐感知。

数据层模块，封装所有 CoinGecko API HTTP 请求。
依赖 CoinGeckoTierManager 做限频和端点检查。

Demo 套餐使用 api.coingecko.com（无需 Key 或免费 Key）。
Basic+ 套餐使用 pro-api.coingecko.com（需 API Key）。
"""

import asyncio

import httpx
import structlog

from app.data.coingecko_tier import CoinGeckoTierManager
from app.models.coingecko import CoinGeckoTier
from app.services.config_service import get_config_value

logger = structlog.get_logger(__name__)

_TIMEOUT_SECONDS = 30
_MAX_RETRIES = 2
_DEFAULT_RETRY_AFTER = 5


class CoinGeckoClient:
    """CoinGecko API 统一客户端 — 限频、重试、超时、套餐感知。"""

    def __init__(self, tier_manager: CoinGeckoTierManager) -> None:
        self._tier_manager = tier_manager
        self._client: httpx.AsyncClient | None = None
        self._current_tier: CoinGeckoTier | None = None

    async def _ensure_client(self) -> httpx.AsyncClient:
        """延迟初始化 httpx 客户端，根据套餐选择 Base URL。"""
        tier = await self._tier_manager.get_current_tier()
        base_url = self._tier_manager.get_base_url(tier)

        if self._client is None or self._current_tier != tier:
            if self._client is not None:
                await self._client.aclose()
            self._client = httpx.AsyncClient(
                base_url=base_url,
                timeout=httpx.Timeout(_TIMEOUT_SECONDS),
            )
            self._current_tier = tier

        return self._client

    async def get(
        self,
        path: str,
        endpoint: str,
        params: dict[str, str | int] | None = None,
    ) -> dict | list | None:
        """发起 GET 请求。

        Args:
            path: API 路径，如 ``/coins/markets``。
            endpoint: TierManager 端点名称，如 ``coins-markets``。
            params: 查询参数。

        Returns:
            成功时返回 JSON 响应体（dict 或 list），失败返回 None。
        """
        # 1. 套餐与 API Key
        tier = await self._tier_manager.get_current_tier()
        api_key = await get_config_value("coingecko_api_key", "")

        # Demo 可以无 Key 使用，但有 Key 更好
        headers: dict[str, str] = {}
        if api_key:
            if tier == CoinGeckoTier.DEMO:
                # Demo 用查询参数传 Key
                if params is None:
                    params = {}
                params["x_cg_demo_api_key"] = api_key
            else:
                # 付费版用 Header 传 Key
                headers["x-cg-pro-api-key"] = api_key

        # 2. 端点可用性
        if not self._tier_manager.is_endpoint_available(tier, endpoint):
            logger.warning(
                "gecko_endpoint_not_available",
                endpoint=endpoint,
                tier=tier.value,
            )
            return None

        # 3. 限频检查
        can_proceed = await self._tier_manager.check_rate_limit()
        if not can_proceed:
            logger.warning("gecko_rate_limit_reached", endpoint=endpoint, tier=tier.value)
            return None

        # 4. 月度额度检查
        monthly_ok = await self._tier_manager.check_monthly_limit()
        if not monthly_ok:
            logger.warning("gecko_monthly_limit_reached", endpoint=endpoint, tier=tier.value)
            return None

        # 5. 发起请求（含 429 重试）
        client = await self._ensure_client()
        attempt = 0

        while attempt <= _MAX_RETRIES:
            try:
                response = await client.get(path, params=params, headers=headers)
            except httpx.TimeoutException:
                logger.error("gecko_request_timeout", path=path, timeout=_TIMEOUT_SECONDS)
                return None
            except httpx.HTTPError as exc:
                logger.error("gecko_request_error", path=path, error=str(exc))
                return None

            if response.status_code == 429:
                retry_after = int(
                    response.headers.get("Retry-After", str(_DEFAULT_RETRY_AFTER))
                )
                logger.warning(
                    "gecko_rate_limited_429",
                    path=path,
                    attempt=attempt + 1,
                    retry_after=retry_after,
                )
                attempt += 1
                if attempt > _MAX_RETRIES:
                    logger.error("gecko_max_retries_exceeded", path=path)
                    return None
                await asyncio.sleep(retry_after)
                continue

            if response.status_code < 200 or response.status_code >= 300:
                logger.error(
                    "gecko_non_2xx_response",
                    path=path,
                    status_code=response.status_code,
                    body=response.text[:500],
                )
                return None

            # 成功 — 递增计数器
            await self._tier_manager.increment_rate_counter()
            await self._tier_manager.increment_monthly_counter()
            try:
                return response.json()
            except Exception as exc:
                logger.error("gecko_json_parse_error", path=path, error=str(exc))
                return None

        return None

    async def close(self) -> None:
        """关闭 httpx.AsyncClient。"""
        if self._client is not None:
            await self._client.aclose()
            self._client = None
