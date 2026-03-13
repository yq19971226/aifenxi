"""GlassNode API 客户端 — Professional ($999) T3 全量链上数据。

文档: https://docs.glassnode.com
API Base: https://api.glassnode.com/v1/metrics
Auth: Api-Key header
Rate Limit: 140,000 req/month (shared)

覆盖 30 个核心指标，分 4 个频率层采集：
- 高频(15m): SOPR, aSOPR, 交易所净流量/余额, 活跃地址, MVRV
- 中频(1h):  NUPL, EA-MVRV, LTH/STH-SOPR, 积累评分, 已实现盈亏, 新地址, 交易所流入
- 低频(6h):  LTH/STH-NUPL, SSR, HODLer变化, Reserve Risk, Puell, Liveliness, NVT Signal
- 日频(24h): Hash Ribbon, Difficulty Ribbon, S2F, Pi Cycle, RHODL, 盈利地址%, Velocity, F&G
"""

import asyncio
import logging
import time
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

import aiohttp

from app.services.config_service import get_config_value

logger = logging.getLogger(__name__)

GLASSNODE_BASE_URL = "https://api.glassnode.com/v1/metrics"

# ── 指标注册表 ─────────────────────────────────────────────────
# key: 内部指标名
# path: API 路径 (相对于 /v1/metrics)
# tier: 采集频率层 — high(15m), mid(1h), low(6h), daily(24h)
# assets: 支持的资产列表 (None = 全部)
# value_field: 响应 JSON 中取值字段 (默认 "v")

METRIC_REGISTRY: dict[str, dict[str, Any]] = {
    # ── 🔴 高频 (15 分钟) ─────────────────────────────────────
    "sopr": {
        "path": "/indicators/sopr",
        "tier": "high",
        "assets": ["BTC", "ETH"],
        "description": "已实现盈亏比 — 短线顶底核心",
    },
    "asopr": {
        "path": "/indicators/sopr_adjusted",
        "tier": "high",
        "assets": ["BTC"],
        "description": "调整版 SOPR — 去除寿命<1h UTXO",
    },
    "exchange_netflow": {
        "path": "/transactions/transfers_volume_exchanges_net",
        "tier": "high",
        "assets": ["BTC", "ETH"],
        "description": "交易所净流量",
    },
    "exchange_balance": {
        "path": "/distribution/balance_exchanges",
        "tier": "high",
        "assets": ["BTC", "ETH"],
        "description": "交易所余额/储备",
    },
    "active_addresses": {
        "path": "/addresses/active_count",
        "tier": "high",
        "assets": None,  # all
        "description": "活跃地址数",
    },
    "mvrv": {
        "path": "/market/mvrv",
        "tier": "high",
        "assets": ["BTC", "ETH"],
        "description": "MVRV 估值比",
    },

    # ── 🟠 中频 (1 小时) ──────────────────────────────────────
    "nupl": {
        "path": "/indicators/net_unrealized_profit_loss",
        "tier": "mid",
        "assets": ["BTC", "ETH"],
        "description": "净未实现盈亏 — 周期阶段核心",
    },
    "mvrv_entity_adj": {
        "path": "/indicators/mvrv_account_based",
        "tier": "mid",
        "assets": ["BTC", "ETH"],
        "description": "Entity-Adjusted MVRV (T3独占)",
    },
    "lth_sopr": {
        "path": "/indicators/sopr_more_155",
        "tier": "mid",
        "assets": ["BTC"],
        "description": "长期持有者 SOPR",
    },
    "sth_sopr": {
        "path": "/indicators/sopr_less_155",
        "tier": "mid",
        "assets": ["BTC"],
        "description": "短期持有者 SOPR",
    },
    "accumulation_score": {
        "path": "/indicators/accumulation_trend_score",
        "tier": "mid",
        "assets": ["BTC"],
        "description": "积累趋势评分 (T3独占)",
    },
    "net_realized_pl": {
        "path": "/indicators/net_realized_profit_loss",
        "tier": "mid",
        "assets": ["BTC", "ETH"],
        "description": "净已实现盈亏",
    },
    "new_addresses": {
        "path": "/addresses/new_non_zero_count",
        "tier": "mid",
        "assets": None,
        "description": "新增非零余额地址",
    },
    "exchange_inflow": {
        "path": "/transactions/transfers_volume_to_exchanges_sum",
        "tier": "mid",
        "assets": ["BTC", "ETH"],
        "description": "交易所流入总量 — 抛压信号",
    },

    # ── 🟡 低频 (6 小时) ──────────────────────────────────────
    "lth_nupl": {
        "path": "/indicators/nupl_more_155",
        "tier": "low",
        "assets": ["BTC"],
        "description": "长期持有者 NUPL",
    },
    "sth_nupl": {
        "path": "/indicators/nupl_less_155",
        "tier": "low",
        "assets": ["BTC"],
        "description": "短期持有者 NUPL",
    },
    "ssr": {
        "path": "/indicators/ssr",
        "tier": "low",
        "assets": ["BTC"],
        "description": "稳定币供应比 — 购买力指标",
    },
    "hodler_net_change": {
        "path": "/indicators/hodler_net_position_change",
        "tier": "low",
        "assets": ["BTC"],
        "description": "HODLer 净仓位变化",
    },
    "reserve_risk": {
        "path": "/indicators/reserve_risk",
        "tier": "low",
        "assets": ["BTC"],
        "description": "持有者信心/价格比",
    },
    "puell_multiple": {
        "path": "/indicators/puell_multiple",
        "tier": "low",
        "assets": ["BTC"],
        "description": "矿工收入估值",
    },
    "liveliness": {
        "path": "/indicators/liveliness",
        "tier": "low",
        "assets": ["BTC"],
        "description": "持有 vs 消费倾向",
    },
    "nvt_signal": {
        "path": "/indicators/nvts",
        "tier": "low",
        "assets": ["BTC", "ETH"],
        "description": "NVT Signal — NVT 改进版",
    },

    # ── 🟢 日频 (24 小时) ─────────────────────────────────────
    "hash_ribbon": {
        "path": "/indicators/hash_ribbon",
        "tier": "daily",
        "assets": ["BTC"],
        "description": "矿工投降/复苏信号 (T3独占)",
    },
    "difficulty_ribbon": {
        "path": "/indicators/difficulty_ribbon",
        "tier": "daily",
        "assets": ["BTC"],
        "description": "难度带 — 矿工压力",
    },
    "s2f_ratio": {
        "path": "/indicators/stock_to_flow_ratio",
        "tier": "daily",
        "assets": ["BTC"],
        "description": "库存流量比",
    },
    "pi_cycle_top": {
        "path": "/indicators/pi_cycle_top",
        "tier": "daily",
        "assets": ["BTC"],
        "description": "Pi Cycle 顶部指标 (T3独占)",
    },
    "rhodl_ratio": {
        "path": "/indicators/rhodl_ratio",
        "tier": "daily",
        "assets": ["BTC"],
        "description": "RHODL 长短期持有者比 (T3独占)",
    },
    "addresses_in_profit_pct": {
        "path": "/addresses/profit_relative",
        "tier": "daily",
        "assets": ["BTC", "ETH"],
        "description": "盈利地址占比",
    },
    "velocity": {
        "path": "/indicators/velocity",
        "tier": "daily",
        "assets": ["BTC"],
        "description": "资金流转速度",
    },
    "fear_greed": {
        "path": "/indicators/fear_greed",
        "tier": "daily",
        "assets": ["BTC"],
        "description": "恐慌贪婪指数 (Glassnode版)",
    },
}

# 币种符号映射 (Binance 交易对 → Glassnode 资产标识)
SYMBOL_TO_ASSET: dict[str, str] = {
    "BTCUSDT": "BTC",
    "ETHUSDT": "ETH",
    "SOLUSDT": "SOL",
    "BNBUSDT": "BNB",
    "XRPUSDT": "XRP",
    "DOGEUSDT": "DOGE",
    "ZECUSDT": "ZEC",
    "BCHUSDT": "BCH",
    "HYPEUSDT": "HYPE",
    "LTCUSDT": "LTC",
    "AVAXUSDT": "AVAX",
    "ADAUSDT": "ADA",
    "LINKUSDT": "LINK",
    "DOTUSDT": "DOT",
    "MATICUSDT": "MATIC",
    "UNIUSDT": "UNI",
    "AAVEUSDT": "AAVE",
}

# 分辨率映射（Professional 支持 10m 和 1h 高分辨率）
RESOLUTION_MAPPING: dict[str, str] = {
    "high": "10m",    # 高频
    "mid": "1h",      # 中频
    "low": "1h",      # 低频（1h 分辨率足够）
    "daily": "24h",   # 日频
}


class GlassNodeError(Exception):
    """GlassNode API 错误。"""

    def __init__(self, message: str, status_code: int = 0):
        self.message = message
        self.status_code = status_code
        super().__init__(message)


class GlassNodeClient:
    """GlassNode API 客户端 — Professional T3 全量版。

    - 自动从 config_service 获取 API Key
    - 内置滑动窗口限流
    - 支持按 tier 获取指标列表
    """

    def __init__(self) -> None:
        self._api_key: str | None = None
        self._session: Optional[aiohttp.ClientSession] = None
        self._request_count = 0
        self._window_start = time.monotonic()

    async def _get_api_key(self) -> str:
        if self._api_key is None:
            self._api_key = await get_config_value("glassnode_api_key", "")
        return self._api_key

    async def _get_session(self) -> aiohttp.ClientSession:
        if self._session is None or self._session.closed:
            self._session = aiohttp.ClientSession()
        return self._session

    def _get_proxy(self) -> str | None:
        """从环境变量读取代理地址。"""
        import os
        return (
            os.environ.get("HTTPS_PROXY")
            or os.environ.get("https_proxy")
            or os.environ.get("HTTP_PROXY")
            or os.environ.get("http_proxy")
        )

    async def close(self) -> None:
        if self._session and not self._session.closed:
            await self._session.close()

    async def _throttle(self) -> None:
        """简单滑动窗口限流 — 避免突发请求。"""
        now = time.monotonic()
        elapsed = now - self._window_start
        if elapsed >= 60.0:
            self._request_count = 0
            self._window_start = now
        elif self._request_count >= 25:
            # Professional 没有明确官方 per-minute limit，保守估 25/min
            wait = 60.0 - elapsed + 1.0
            logger.info("glassnode_throttle", extra={"wait_seconds": round(wait, 1)})
            await asyncio.sleep(wait)
            self._request_count = 0
            self._window_start = time.monotonic()

    async def _request(
        self,
        path: str,
        asset: str,
        resolution: str = "24h",
    ) -> list[dict[str, Any]] | None:
        """通用 GET 请求 — 返回数据点列表。"""
        api_key = await self._get_api_key()
        if not api_key:
            logger.warning("glassnode_api_key_missing")
            return None

        url = f"{GLASSNODE_BASE_URL}{path}"
        params = {
            "a": asset,
            "i": resolution,
            "f": "JSON",
            "api_key": api_key,
        }

        for attempt in range(1, 3):
            await self._throttle()
            self._request_count += 1
            try:
                session = await self._get_session()
                proxy = self._get_proxy()
                async with session.get(
                    url,
                    params=params,
                    timeout=aiohttp.ClientTimeout(total=30),
                    proxy=proxy,
                ) as resp:
                    if resp.status == 429:
                        logger.warning("glassnode_rate_limited", extra={"attempt": attempt, "path": path})
                        await asyncio.sleep(30.0)
                        continue
                    if resp.status in (401, 403):
                        text = await resp.text()
                        logger.warning("glassnode_auth_error", extra={"status": resp.status, "path": path, "body": text[:200]})
                        return None
                    if resp.status != 200:
                        text = await resp.text()
                        logger.warning("glassnode_api_error", extra={"status": resp.status, "path": path, "body": text[:200]})
                        if attempt < 2:
                            await asyncio.sleep(3.0)
                            continue
                        return None

                    data = await resp.json()
                    return data

            except (aiohttp.ClientError, asyncio.TimeoutError) as exc:
                logger.warning("glassnode_request_failed", extra={"path": path, "error": str(exc), "attempt": attempt})
                if attempt < 2:
                    await asyncio.sleep(3.0)
            except Exception as exc:
                logger.error("glassnode_unexpected_error", extra={"path": path, "error": str(exc)})
                break
        return None

    # ── 核心采集方法 ──────────────────────────────────────────

    async def fetch_metric(
        self,
        metric_key: str,
        asset: str,
        resolution: str | None = None,
    ) -> float | None:
        """获取单个指标的最新值。

        Args:
            metric_key: METRIC_REGISTRY 中的指标名
            asset: Glassnode 资产标识 (如 BTC, ETH)
            resolution: 覆盖默认分辨率

        Returns:
            最新数据点的值，或 None
        """
        meta = METRIC_REGISTRY.get(metric_key)
        if meta is None:
            logger.warning("glassnode_unknown_metric", extra={"metric": metric_key})
            return None

        # 检查资产兼容性
        supported = meta.get("assets")
        if supported is not None and asset not in supported:
            return None

        if resolution is None:
            resolution = RESOLUTION_MAPPING.get(meta["tier"], "24h")

        data = await self._request(meta["path"], asset, resolution)
        if not data:
            return None

        # 取最后一个数据点
        try:
            latest = data[-1]
            value = latest.get("v")
            if value is not None:
                return float(value)
            # 某些指标返回 o (dict) 结构
            if isinstance(latest.get("o"), dict):
                return latest["o"]
        except (IndexError, TypeError, ValueError) as exc:
            logger.warning("glassnode_parse_error", extra={"metric": metric_key, "error": str(exc)})
        return None

    async def fetch_metric_raw(
        self,
        metric_key: str,
        asset: str,
        resolution: str | None = None,
    ) -> Any:
        """获取单个指标的最新原始值（可能是 float 或 dict）。"""
        meta = METRIC_REGISTRY.get(metric_key)
        if meta is None:
            return None

        supported = meta.get("assets")
        if supported is not None and asset not in supported:
            return None

        if resolution is None:
            resolution = RESOLUTION_MAPPING.get(meta["tier"], "24h")

        data = await self._request(meta["path"], asset, resolution)
        if not data:
            return None

        try:
            latest = data[-1]
            return latest.get("v", latest.get("o"))
        except (IndexError, TypeError):
            return None

    async def fetch_tier_metrics(
        self,
        tier: str,
        asset: str,
    ) -> dict[str, float | None]:
        """批量采集某个频率层的所有适用指标。

        Args:
            tier: "high", "mid", "low", "daily"
            asset: Glassnode 资产标识

        Returns:
            {metric_key: value, ...}
        """
        results: dict[str, float | None] = {}
        tier_metrics = [
            (k, v) for k, v in METRIC_REGISTRY.items()
            if v["tier"] == tier
        ]

        for metric_key, meta in tier_metrics:
            supported = meta.get("assets")
            if supported is not None and asset not in supported:
                continue

            try:
                value = await self.fetch_metric(metric_key, asset)
                results[metric_key] = value
            except Exception as exc:
                logger.warning("glassnode_tier_metric_error", extra={
                    "metric": metric_key, "asset": asset, "error": str(exc),
                })
                results[metric_key] = None

            # 请求间短暂等待
            await asyncio.sleep(0.5)

        return results

    async def fetch_all_metrics(self, asset: str) -> dict[str, float | None]:
        """采集所有适用指标（全量，供初始化或手动触发用）。"""
        results: dict[str, float | None] = {}
        for tier in ("high", "mid", "low", "daily"):
            tier_data = await self.fetch_tier_metrics(tier, asset)
            results.update(tier_data)
        return results

    @staticmethod
    def get_metrics_for_tier(tier: str) -> list[str]:
        """获取某个频率层的指标列表。"""
        return [k for k, v in METRIC_REGISTRY.items() if v["tier"] == tier]

    @staticmethod
    def get_supported_assets(metric_key: str) -> list[str] | None:
        """获取某指标支持的资产列表，None 表示全部。"""
        meta = METRIC_REGISTRY.get(metric_key)
        if meta is None:
            return []
        return meta.get("assets")

    @staticmethod
    def resolve_asset(symbol: str) -> str | None:
        """Binance 交易对 → Glassnode 资产。"""
        asset = SYMBOL_TO_ASSET.get(symbol.upper())
        if asset:
            return asset
        # 尝试去掉 USDT/BUSD 后缀
        base = symbol.upper().replace("USDT", "").replace("BUSD", "")
        return base if base else None


# ── 便捷函数 ───────────────────────────────────────────────


async def get_glassnode_client() -> Optional[GlassNodeClient]:
    """获取 GlassNode 客户端实例。"""
    api_key = await get_config_value("glassnode_api_key", "")
    if not api_key:
        logger.warning("glassnode_api_key_not_configured")
        return None
    client = GlassNodeClient()
    client._api_key = api_key
    return client


async def fetch_onchain_data(
    symbol: str,
    metric: str,
    interval: str = "24h",
) -> Optional[dict[str, Any]]:
    """便捷函数：获取链上数据（向后兼容旧接口）。"""
    client = GlassNodeClient()
    try:
        asset = GlassNodeClient.resolve_asset(symbol)
        if not asset:
            return None
        value = await client.fetch_metric(metric, asset, interval)
        if value is not None:
            return {"v": value}
        return None
    except GlassNodeError as exc:
        logger.warning("glassnode_fetch_failed", extra={"symbol": symbol, "metric": metric, "error": exc.message})
        return None
    finally:
        await client.close()


# ── 向后兼容别名 ────────────────────────────────────────────
# onchain.py 等模块仍使用旧名字导入
METRIC_MAPPING = METRIC_REGISTRY
SYMBOL_MAPPING = SYMBOL_TO_ASSET

