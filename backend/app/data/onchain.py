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
        """并行采集所有数据源，组装为 OnchainSnapshot。

        任一数据源失败不影响其他，对应字段为 None。
        各子数据源受 source_gate 开关控制。

        Args:
            symbol: 交易对，如 "BTCUSDT"

        Returns:
            OnchainSnapshot（部分字段可能为 None）
        """
        from app.data.source_gate import is_enabled

        # 根据开关决定是否采集
        alt_enabled = await is_enabled("alternative_me")
        gn_enabled = await is_enabled("glassnode")

        async def _noop():
            return None

        (
            fear_greed,
            mvrv,
            nvt,
            active_addr,
            exchange_flow,
            price,
        ) = await asyncio.gather(
            SentimentCollector(timeout=self._timeout).collect_sentiment() if alt_enabled else _noop(),
            self.fetch_mvrv(symbol) if gn_enabled else _noop(),
            self.fetch_nvt(symbol) if gn_enabled else _noop(),
            self.fetch_active_addresses(symbol) if gn_enabled else _noop(),
            self.fetch_exchange_flow(symbol) if gn_enabled else _noop(),
            self.fetch_price(symbol) if gn_enabled else _noop(),
            return_exceptions=True,
        )

        # 将异常转为 None，确保不会因单个数据源崩溃整个快照
        if isinstance(fear_greed, BaseException):
            logger.error("fear_greed raised exception", extra={"error": str(fear_greed)})
            fear_greed = None
        if isinstance(mvrv, BaseException):
            logger.error("mvrv raised exception", extra={"error": str(mvrv)})
            mvrv = None
        if isinstance(nvt, BaseException):
            logger.error("nvt raised exception", extra={"error": str(nvt)})
            nvt = None
        if isinstance(active_addr, BaseException):
            logger.error("active_addresses raised exception", extra={"error": str(active_addr)})
            active_addr = None
        if isinstance(exchange_flow, BaseException):
            logger.error("exchange_flow raised exception", extra={"error": str(exchange_flow)})
            exchange_flow = None
        if isinstance(price, BaseException):
            logger.error("price raised exception", extra={"error": str(price)})
            price = None

        snapshot = OnchainSnapshot(
            time=datetime.now(timezone.utc),
            symbol=symbol.upper(),
            exchange_netflow=exchange_flow,
            fear_greed_index=fear_greed,
            mvrv=mvrv,
            active_addresses=active_addr,
        )

        logger.info(
            "Onchain snapshot collected",
            extra={
                "symbol": symbol,
                "has_fear_greed": fear_greed is not None,
                "has_mvrv": mvrv is not None,
                "has_nvt": nvt is not None,
                "has_active_addr": active_addr is not None,
                "has_exchange_flow": exchange_flow is not None,
                "has_price": price is not None,
            },
        )
        return snapshot
