"""链上数据采集客户端 — GlassNode / Alternative.me。

- GlassNode: MVRV、NVT、S2F、活跃地址等链上指标
- Alternative.me: 恐慌贪婪指数
- 使用 httpx.AsyncClient，每次调用 30s 超时
"""

import asyncio
import logging
from datetime import datetime, timezone

import httpx

from app.data.sentiment import SentimentCollector
from app.models.market_data import OnchainSnapshot

logger = logging.getLogger(__name__)

_DEFAULT_TIMEOUT = 30.0
_MAX_RETRIES = 2

_FEAR_GREED_URL = "https://api.alternative.me/fng/"


class OnchainCollector:
    """链上数据采集器，聚合 GlassNode 和 Alternative.me。"""

    def __init__(self, timeout: float = _DEFAULT_TIMEOUT) -> None:
        self._timeout = timeout

    # ── 恐慌贪婪指数（Alternative.me，免费无需 API Key）──────
    # DEPRECATED: collect_snapshot() 已改用 SentimentCollector.collect_sentiment()（多源加权）
    # 此方法仅保留向后兼容，不再在生产路径调用。

    async def fetch_fear_greed(self) -> int | None:
        """获取当前恐慌贪婪指数（0-100）。

        .. deprecated::
            请使用 SentimentCollector.collect_sentiment() 替代（多源加权平均）。

        Returns:
            int 或 None（失败时）
        """
        for attempt in range(1, _MAX_RETRIES + 1):
            try:
                async with httpx.AsyncClient(timeout=self._timeout) as client:
                    resp = await client.get(_FEAR_GREED_URL, params={"limit": 1})
                    resp.raise_for_status()
                    data = resp.json()
                    value = int(data["data"][0]["value"])
                    logger.info("Fear & Greed index fetched", extra={"value": value})
                    return value
            except (httpx.HTTPError, asyncio.TimeoutError, KeyError, IndexError, ValueError) as exc:
                logger.warning(
                    "fetch_fear_greed failed",
                    extra={"attempt": attempt, "error": str(exc)},
                )
                if attempt < _MAX_RETRIES:
                    await asyncio.sleep(2.0 * attempt)
            except Exception as exc:
                logger.error("Unexpected error in fetch_fear_greed", extra={"error": str(exc)})
                break
        return None

    # ── GlassNode 链上指标（需 API Key）───────────────────────

    async def fetch_mvrv(self, symbol: str) -> float | None:
        """获取 MVRV（Market Value to Realized Value）估值指标。

        通过 GlassNode API 获取，无 Key 时降级返回 None。

        Args:
            symbol: 交易对，如 "BTCUSDT"（自动提取基础币种）

        Returns:
            float 或 None（失败/无 Key 时）
        """
        from app.services.glassnode import fetch_onchain_data

        base_asset = symbol.upper().replace("USDT", "").replace("BUSD", "")
        try:
            data = await fetch_onchain_data(base_asset, "mvrv", "24h")
            if data and "v" in data:
                value = float(data["v"])
                logger.info("MVRV fetched", extra={"symbol": symbol, "mvrv": value})
                return value
        except Exception as exc:
            logger.warning("fetch_mvrv failed", extra={"symbol": symbol, "error": str(exc)})
        return None

    async def fetch_nvt(self, symbol: str) -> float | None:
        """获取 NVT（Network Value to Transactions）指标。

        Args:
            symbol: 交易对，如 "BTCUSDT"

        Returns:
            float 或 None（失败时）
        """
        from app.services.glassnode import fetch_onchain_data

        base_asset = symbol.upper().replace("USDT", "").replace("BUSD", "")
        try:
            data = await fetch_onchain_data(base_asset, "nvt", "24h")
            if data and "v" in data:
                value = float(data["v"])
                logger.info("NVT fetched", extra={"symbol": symbol, "nvt": value})
                return value
        except Exception as exc:
            logger.warning("fetch_nvt failed", extra={"symbol": symbol, "error": str(exc)})
        return None

    async def fetch_active_addresses(self, symbol: str) -> int | None:
        """获取链上活跃地址数。

        Args:
            symbol: 交易对，如 "BTCUSDT"

        Returns:
            int 或 None（失败时）
        """
        from app.services.glassnode import fetch_onchain_data

        base_asset = symbol.upper().replace("USDT", "").replace("BUSD", "")
        try:
            data = await fetch_onchain_data(base_asset, "active_addresses", "24h")
            if data and "v" in data:
                value = int(data["v"])
                logger.info("Active addresses fetched", extra={"symbol": symbol, "value": value})
                return value
        except Exception as exc:
            logger.warning("fetch_active_addresses failed", extra={"symbol": symbol, "error": str(exc)})
        return None

    async def fetch_exchange_flow(self, symbol: str) -> float | None:
        """获取交易所净流入/流出。

        Args:
            symbol: 交易对，如 "BTCUSDT"

        Returns:
            float 或 None（失败时）
        """
        from app.services.glassnode import fetch_onchain_data

        base_asset = symbol.upper().replace("USDT", "").replace("BUSD", "")
        try:
            data = await fetch_onchain_data(base_asset, "exchange_flow", "24h")
            if data and "v" in data:
                value = float(data["v"])
                logger.info("Exchange flow fetched", extra={"symbol": symbol, "value": value})
                return value
        except Exception as exc:
            logger.warning("fetch_exchange_flow failed", extra={"symbol": symbol, "error": str(exc)})
        return None

    async def fetch_price(self, symbol: str) -> float | None:
        """获取链上价格。

        Args:
            symbol: 交易对，如 "BTCUSDT"

        Returns:
            float 或 None（失败时）
        """
        from app.services.glassnode import fetch_onchain_data

        base_asset = symbol.upper().replace("USDT", "").replace("BUSD", "")
        try:
            data = await fetch_onchain_data(base_asset, "price", "24h")
            if data and "v" in data:
                value = float(data["v"])
                logger.info("Price fetched", extra={"symbol": symbol, "price": value})
                return value
        except Exception as exc:
            logger.warning("fetch_price failed", extra={"symbol": symbol, "error": str(exc)})
        return None

    # ── 聚合采集 ─────────────────────────────────────────────

    async def collect_snapshot(self, symbol: str) -> OnchainSnapshot:
        """采集 Alternative.me 恐慌贪婪指数（仅此一项）。

        注意：GlassNode 链上指标（MVRV, SOPR, NUPL 等）已由 glassnode_worker
        分层定时采集（15m/1h/6h/24h），本方法不再重复调用以节省 API 配额。

        Args:
            symbol: 交易对，如 "BTCUSDT"

        Returns:
            OnchainSnapshot（仅 fear_greed_index 有值）
        """
        from app.data.source_gate import is_enabled

        alt_enabled = await is_enabled("alternative_me")

        fear_greed = None
        if alt_enabled:
            try:
                fear_greed = await SentimentCollector(timeout=self._timeout).collect_sentiment()
            except Exception as exc:
                logger.error("fear_greed raised exception", extra={"error": str(exc)})

        snapshot = OnchainSnapshot(
            time=datetime.now(timezone.utc),
            symbol=symbol.upper(),
            fear_greed_index=fear_greed,
        )

        logger.info(
            "Legacy onchain snapshot collected (fear_greed only)",
            extra={"symbol": symbol, "has_fear_greed": fear_greed is not None},
        )
        return snapshot
