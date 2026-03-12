"""DataSource Registry — 数据源注册中心。

管理所有数据源组和子数据源的元信息、状态和配置。
系统启动时从 ConfigService 加载配置，运行时维护内存状态并同步到 Redis 缓存。
"""

from __future__ import annotations

import logging

import structlog

from app.models.datasource import (
    DataSourceGroup,
    DataSourceInfo,
    DataSourceStatus,
    DataSourceType,
    GroupType,
)

logger = structlog.get_logger(__name__)

# ── 静态元信息（source_id、端点、频道、权重） ─────────────────

_EXCHANGE_SOURCES: list[dict] = [
    {
        "source_id": "binance_futures",
        "name": "Binance Futures",
        "source_type": DataSourceType.WEBSOCKET,
        "base_url": "wss://fstream.binance.com/ws",
        "channels": ["aggTrade", "markPrice", "forceOrder", "depth", "ticker", "kline"],
        "auth_method": "none",
        "weight": 1.0,
    },
]

# ── 新闻数据源 ──────────────────────────────────────────────────

_NEWS_SOURCES: list[dict] = [
    {
        "source_id": "finnhub_news",
        "name": "Finnhub News",
        "source_type": DataSourceType.REST,
        "base_url": "https://finnhub.io/api/v1",
        "channels": ["crypto", "general", "company"],
        "auth_method": "api_key",
        "weight": 0.40,
    },
    {
        "source_id": "blockbeats",
        "name": "BlockBeats",
        "source_type": DataSourceType.REST,
        "base_url": "https://api.theblockbeats.news",
        "channels": ["flash", "article"],
        "auth_method": "none",
        "weight": 0.30,
    },
]

# ── 链上数据源 ────────────────────────────────────────────────────
# 主源: GlassNode（Professional $999，T3 全量，140k req/month）
# 备源/fallback: CryptoQuant（降级备源，Professional $109）
# 辅助: Alternative.me（免费恐慌贪婪指数）

_ONCHAIN_SOURCES: list[dict] = [
    {
        "source_id": "glassnode",
        "name": "GlassNode (Primary)",
        "source_type": DataSourceType.REST,
        "base_url": "https://api.glassnode.com/v1",
        "channels": [
            "sopr", "asopr", "nupl", "mvrv", "mvrv_entity_adj",
            "lth_sopr", "sth_sopr", "lth_nupl", "sth_nupl",
            "accumulation_score", "reserve_risk", "puell_multiple",
            "hash_ribbon", "difficulty_ribbon", "s2f_ratio", "pi_cycle_top",
            "rhodl_ratio", "nvt_signal", "liveliness", "ssr",
            "exchange_netflow", "exchange_balance", "exchange_inflow",
            "active_addresses", "new_addresses", "addresses_in_profit_pct",
            "hodler_net_change", "net_realized_pl", "velocity", "fear_greed",
        ],
        "auth_method": "api_key",
        "weight": 0.70,
    },
    {
        "source_id": "cryptoquant",
        "name": "CryptoQuant (Fallback)",
        "source_type": DataSourceType.REST,
        "base_url": "https://api.cryptoquant.com/v1",
        "channels": ["exchange_flows", "miner_flows", "flow_indicator", "market_indicator", "network_data"],
        "auth_method": "api_key",
        "weight": 0.30,
    },
    {
        "source_id": "alternative_me",
        "name": "Alternative.me 恐慌贪婪",
        "source_type": DataSourceType.REST,
        "base_url": "https://api.alternative.me/fng/",
        "channels": ["fear_greed_index"],
        "auth_method": "none",
        "weight": 0.15,
    },
]

# ── 情绪/社交数据源 ────────────────────────────────────────────

_SENTIMENT_SOURCES: list[dict] = []

_COINGLASS_WS_SOURCE: dict = {
    "source_id": "coinglass_ws",
    "name": "CoinGlass WebSocket",
    "source_type": DataSourceType.WEBSOCKET,
    "base_url": "wss://open-api-v4.coinglass.com/ws",
    "channels": ["liquidation", "oi_change", "funding_rate", "taker_volume"],
    "auth_method": "api_key",
    "weight": 0.0,
}

_COINGLASS_REST_SOURCE: dict = {
    "source_id": "coinglass_rest",
    "name": "CoinGlass REST",
    "source_type": DataSourceType.REST,
    "base_url": "runtime://dual-channel(proxy|official)",  # 运行时由 CoinGlassClient 双通道动态选择
    "channels": [
        "oi", "long_short_ratio", "heatmap", "taker",
        "funding_rate", "cvd", "netflow", "orderbook", "options",
    ],
    "auth_method": "api_key",
    "weight": 0.60,
}

# 向后兼容：保留 _COINGLASS_SOURCE 别名指向 WS
_COINGLASS_SOURCE = _COINGLASS_WS_SOURCE

# ── CoinGecko 数据源 ─────────────────────────────────────────

_COINGECKO_SOURCE: dict = {
    "source_id": "coingecko",
    "name": "CoinGecko",
    "source_type": DataSourceType.REST,
    "base_url": "https://api.coingecko.com/api/v3",
    "channels": [
        "markets", "coin_detail", "global", "trending",
    ],
    "auth_method": "api_key",
    "weight": 0.40,
}


# ── FRED 宏观数据源（主源） ──────────────────────────────────

_FRED_SOURCE: dict = {
    "source_id": "fred",
    "name": "FRED (Federal Reserve)",
    "source_type": DataSourceType.REST,
    "base_url": "https://api.stlouisfed.org/fred",
    "channels": [
        "cpi", "core_cpi", "unemployment", "jobless_claims",
        "fed_funds_rate", "gdp", "pce", "payrolls",
    ],
    "auth_method": "api_key",
    "weight": 0.60,
}

# ── Finnhub 美股 + 加密市场数据源 ──────────────────────────────

_FINNHUB_SOURCE: dict = {
    "source_id": "finnhub",
    "name": "Finnhub",
    "source_type": DataSourceType.REST,
    "base_url": "https://finnhub.io/api/v1",
    "channels": [
        "earnings_calendar", "market_news", "company_news",
        "quote", "insider_sentiment", "basic_financials",
        "crypto_candles", "ipo_calendar",
    ],
    "auth_method": "api_key",
    "weight": 0.50,
}


class DataSourceRegistry:
    """数据源注册中心 — 管理所有数据源组和子数据源的元信息。"""

    def __init__(self) -> None:
        self._groups: dict[str, DataSourceGroup] = {}
        self._sources: dict[str, DataSourceInfo] = {}
        self._initialized: bool = False

    async def load_from_config(self) -> None:
        """系统启动时从 ConfigService 加载所有数据源配置（开关状态）。"""
        from app.services.config_service import get_config_value

        # 加载 Exchange_Direct_Combo 组合级开关
        combo_enabled_str = await get_config_value("ds:combo:enabled", "true")
        combo_enabled = combo_enabled_str.lower() == "true"

        # 构建 Exchange_Direct_Combo 组
        exchange_sources: list[DataSourceInfo] = []
        for src_def in _EXCHANGE_SOURCES:
            enabled_str = await get_config_value(
                f"ds:exchange:{src_def['source_id']}:enabled", "true"
            )
            enabled = enabled_str.lower() == "true"
            src = DataSourceInfo(
                **src_def,
                enabled=enabled,
                status=DataSourceStatus.DISABLED,
            )
            exchange_sources.append(src)
            self._sources[src.source_id] = src

        combo_group = DataSourceGroup(
            group_id="exchange_direct_combo",
            name="Exchange Direct Combo",
            group_type=GroupType.FREE,
            enabled=combo_enabled,
            sources=exchange_sources,
        )
        self._groups["exchange_direct_combo"] = combo_group

        # 加载 CoinGlass_Source 开关（WS + REST）
        cg_enabled_str = await get_config_value("ds:coinglass:enabled", "true")
        cg_enabled = cg_enabled_str.lower() == "true"
        cg_ws_src = DataSourceInfo(
            **_COINGLASS_WS_SOURCE,
            enabled=cg_enabled,
            status=DataSourceStatus.DISABLED,
        )
        cg_rest_src = DataSourceInfo(
            **_COINGLASS_REST_SOURCE,
            enabled=cg_enabled,
            status=DataSourceStatus.DISABLED,
        )
        self._sources["coinglass_ws"] = cg_ws_src
        self._sources["coinglass_rest"] = cg_rest_src
        # 向后兼容
        self._sources["coinglass"] = cg_ws_src

        cg_group = DataSourceGroup(
            group_id="coinglass_source",
            name="CoinGlass Source",
            group_type=GroupType.PAID,
            enabled=cg_enabled,
            sources=[cg_ws_src, cg_rest_src],
        )
        self._groups["coinglass_source"] = cg_group

        # 加载 CoinGecko_Source 开关
        gecko_enabled_str = await get_config_value("ds:coingecko:enabled", "true")
        gecko_enabled = gecko_enabled_str.lower() == "true"
        gecko_src = DataSourceInfo(
            **_COINGECKO_SOURCE,
            enabled=gecko_enabled,
            status=DataSourceStatus.DISABLED,
        )
        self._sources["coingecko"] = gecko_src

        gecko_group = DataSourceGroup(
            group_id="coingecko_source",
            name="CoinGecko Source",
            group_type=GroupType.PAID,
            enabled=gecko_enabled,
            sources=[gecko_src],
        )
        self._groups["coingecko_source"] = gecko_group

        # ── 加载新闻数据源组 ──────────────────────────────────
        news_enabled_str = await get_config_value("ds:news:enabled", "true")
        news_enabled = news_enabled_str.lower() == "true"
        news_sources: list[DataSourceInfo] = []
        for src_def in _NEWS_SOURCES:
            enabled_str = await get_config_value(
                f"ds:news:{src_def['source_id']}:enabled", "true"
            )
            enabled = enabled_str.lower() == "true"
            src = DataSourceInfo(
                **src_def,
                enabled=enabled,
                status=DataSourceStatus.DISABLED,
            )
            news_sources.append(src)
            self._sources[src.source_id] = src

        news_group = DataSourceGroup(
            group_id="news_sources",
            name="新闻数据源",
            group_type=GroupType.FREE,
            enabled=news_enabled,
            sources=news_sources,
        )
        self._groups["news_sources"] = news_group

        # ── 加载链上数据源组 ──────────────────────────────────
        onchain_enabled_str = await get_config_value("ds:onchain:enabled", "true")
        onchain_enabled = onchain_enabled_str.lower() == "true"
        onchain_sources: list[DataSourceInfo] = []
        for src_def in _ONCHAIN_SOURCES:
            enabled_str = await get_config_value(
                f"ds:onchain:{src_def['source_id']}:enabled", "true"
            )
            enabled = enabled_str.lower() == "true"
            src = DataSourceInfo(
                **src_def,
                enabled=enabled,
                status=DataSourceStatus.DISABLED,
            )
            onchain_sources.append(src)
            self._sources[src.source_id] = src

        onchain_group = DataSourceGroup(
            group_id="onchain_sources",
            name="链上数据源",
            group_type=GroupType.FREE,
            enabled=onchain_enabled,
            sources=onchain_sources,
        )
        self._groups["onchain_sources"] = onchain_group

        # ── 加载 FRED 宏观数据源 ───────────────────────────────
        fred_enabled_str = await get_config_value("ds:fred:enabled", "true")
        fred_enabled = fred_enabled_str.lower() == "true"
        fred_src = DataSourceInfo(
            **_FRED_SOURCE,
            enabled=fred_enabled,
            status=DataSourceStatus.DISABLED,
        )
        self._sources["fred"] = fred_src

        fred_group = DataSourceGroup(
            group_id="fred_source",
            name="FRED Macro Source",
            group_type=GroupType.FREE,
            enabled=fred_enabled,
            sources=[fred_src],
        )
        self._groups["fred_source"] = fred_group

        # ── 加载 Finnhub 数据源 ────────────────────────────────
        finnhub_enabled_str = await get_config_value("ds:finnhub:enabled", "true")
        finnhub_enabled = finnhub_enabled_str.lower() == "true"
        finnhub_src = DataSourceInfo(
            **_FINNHUB_SOURCE,
            enabled=finnhub_enabled,
            status=DataSourceStatus.DISABLED,
        )
        self._sources["finnhub"] = finnhub_src

        finnhub_group = DataSourceGroup(
            group_id="finnhub_source",
            name="Finnhub US Stock & Crypto",
            group_type=GroupType.FREE,
            enabled=finnhub_enabled,
            sources=[finnhub_src],
        )
        self._groups["finnhub_source"] = finnhub_group

        self._initialized = True
        logger.info(
            "datasource_registry_loaded",
            combo_enabled=combo_enabled,
            coinglass_enabled=cg_enabled,
            coingecko_enabled=gecko_enabled,
            onchain_enabled=onchain_enabled,
            news_enabled=news_enabled,
            fred_enabled=fred_enabled,
            finnhub_enabled=finnhub_enabled,
            exchange_count=len(exchange_sources),
            news_count=len(news_sources),
        )

    async def get_all_groups(self) -> list[DataSourceGroup]:
        """返回所有数据源组的元信息和实时状态。"""
        return list(self._groups.values())

    async def get_group(self, group_id: str) -> DataSourceGroup | None:
        """返回指定数据源组的详情。"""
        return self._groups.get(group_id)

    async def get_source(self, source_id: str) -> DataSourceInfo | None:
        """返回指定子数据源的元信息。"""
        return self._sources.get(source_id)

    async def update_source_status(
        self, source_id: str, status: DataSourceStatus
    ) -> None:
        """更新子数据源状态并同步到 Redis 缓存。"""
        from app.core.redis import set_with_ttl

        src = self._sources.get(source_id)
        if src is None:
            logger.warning("update_source_status_not_found", source_id=source_id)
            return

        src.status = status
        logger.info(
            "datasource_status_updated",
            source_id=source_id,
            status=status.value,
        )

        # 同步到 Redis（TTL 60s，供健康监控读取）
        try:
            await set_with_ttl(
                f"ds:health:{source_id}",
                {"source_id": source_id, "status": status.value},
                ttl_seconds=60,
            )
        except Exception as exc:
            logger.warning(
                "update_source_status_redis_failed",
                source_id=source_id,
                error=str(exc),
            )

    async def set_source_enabled(self, source_id: str, enabled: bool) -> None:
        """更新子数据源的 enabled 标志（内存 + ConfigService 持久化）。"""
        from app.core.database import AsyncSessionLocal
        from app.services.config_service import ConfigService, ConfigCreate, ConfigUpdate

        src = self._sources.get(source_id)
        if src is None:
            logger.warning("set_source_enabled_not_found", source_id=source_id)
            return

        src.enabled = enabled

        # 持久化到 ConfigService
        config_key = f"ds:exchange:{source_id}:enabled"
        async with AsyncSessionLocal() as session:
            svc = ConfigService(session)
            existing = await svc.get_config_detail(config_key)
            if existing is None:
                await svc.create_config(
                    ConfigCreate(
                        config_key=config_key,
                        value=str(enabled).lower(),
                        category="datasource",
                        description=f"{source_id} 交易所级开关",
                        is_secret=False,
                    ),
                    admin_user_id="system",
                )
            else:
                await svc.update_config(
                    config_key,
                    ConfigUpdate(value=str(enabled).lower()),
                    admin_user_id="system",
                )
            await session.commit()

    async def set_combo_enabled(self, enabled: bool) -> None:
        """更新 Exchange_Direct_Combo 组合级开关（内存 + ConfigService 持久化）。"""
        from app.core.database import AsyncSessionLocal
        from app.services.config_service import ConfigService, ConfigCreate, ConfigUpdate

        combo = self._groups.get("exchange_direct_combo")
        if combo:
            combo.enabled = enabled

        async with AsyncSessionLocal() as session:
            svc = ConfigService(session)
            config_key = "ds:combo:enabled"
            existing = await svc.get_config_detail(config_key)
            if existing is None:
                await svc.create_config(
                    ConfigCreate(
                        config_key=config_key,
                        value=str(enabled).lower(),
                        category="datasource",
                        description="Exchange Direct Combo 组合级开关",
                        is_secret=False,
                    ),
                    admin_user_id="system",
                )
            else:
                await svc.update_config(
                    config_key,
                    ConfigUpdate(value=str(enabled).lower()),
                    admin_user_id="system",
                )
            await session.commit()

    async def set_coinglass_enabled(self, enabled: bool) -> None:
        """更新 CoinGlass 开关（内存 + ConfigService 持久化）。"""
        from app.core.database import AsyncSessionLocal
        from app.services.config_service import ConfigService, ConfigCreate, ConfigUpdate

        cg = self._groups.get("coinglass_source")
        if cg:
            cg.enabled = enabled
        # 同步所有 CoinGlass 子源（WS + REST + 向后兼容别名）
        for sid in ("coinglass", "coinglass_ws", "coinglass_rest"):
            src = self._sources.get(sid)
            if src:
                src.enabled = enabled

        async with AsyncSessionLocal() as session:
            svc = ConfigService(session)
            config_key = "ds:coinglass:enabled"
            existing = await svc.get_config_detail(config_key)
            if existing is None:
                await svc.create_config(
                    ConfigCreate(
                        config_key=config_key,
                        value=str(enabled).lower(),
                        category="datasource",
                        description="CoinGlass 数据源开关",
                        is_secret=False,
                    ),
                    admin_user_id="system",
                )
            else:
                await svc.update_config(
                    config_key,
                    ConfigUpdate(value=str(enabled).lower()),
                    admin_user_id="system",
                )
            await session.commit()

    async def set_group_enabled(self, group_id: str, enabled: bool) -> None:
        """通用组级开关 — 更新组和子数据源的 enabled 标志并持久化。"""
        from app.core.database import AsyncSessionLocal
        from app.services.config_service import ConfigService, ConfigCreate, ConfigUpdate

        group = self._groups.get(group_id)
        if group is None:
            logger.warning("set_group_enabled_not_found", group_id=group_id)
            return

        group.enabled = enabled
        # 映射 group_id → config_key 前缀
        prefix_map = {
            "onchain_sources": "ds:onchain",
            "news_sources": "ds:news",
            "coingecko_source": "ds:coingecko",
            "fred_source": "ds:fred",
            "finnhub_source": "ds:finnhub",
        }
        prefix = prefix_map.get(group_id)
        if prefix is None:
            return

        config_key = f"{prefix}:enabled"
        async with AsyncSessionLocal() as session:
            svc = ConfigService(session)
            existing = await svc.get_config_detail(config_key)
            if existing is None:
                await svc.create_config(
                    ConfigCreate(
                        config_key=config_key,
                        value=str(enabled).lower(),
                        category="datasource",
                        description=f"{group.name} 组级开关",
                        is_secret=False,
                    ),
                    admin_user_id="system",
                )
            else:
                await svc.update_config(
                    config_key,
                    ConfigUpdate(value=str(enabled).lower()),
                    admin_user_id="system",
                )
            await session.commit()

    async def set_collector_enabled(self, group_id: str, source_id: str, enabled: bool) -> None:
        """通用子数据源级开关 — 更新子数据源 enabled 标志并持久化。"""
        from app.core.database import AsyncSessionLocal
        from app.services.config_service import ConfigService, ConfigCreate, ConfigUpdate

        src = self._sources.get(source_id)
        if src is None:
            logger.warning("set_collector_enabled_not_found", source_id=source_id)
            return

        src.enabled = enabled

        prefix_map = {
            "onchain_sources": "ds:onchain",
            "news_sources": "ds:news",
            "coingecko_source": "ds:coingecko",
        }
        prefix = prefix_map.get(group_id, "ds:ext")
        config_key = f"{prefix}:{source_id}:enabled"

        async with AsyncSessionLocal() as session:
            svc = ConfigService(session)
            existing = await svc.get_config_detail(config_key)
            if existing is None:
                await svc.create_config(
                    ConfigCreate(
                        config_key=config_key,
                        value=str(enabled).lower(),
                        category="datasource",
                        description=f"{src.name} 子数据源开关",
                        is_secret=False,
                    ),
                    admin_user_id="system",
                )
            else:
                await svc.update_config(
                    config_key,
                    ConfigUpdate(value=str(enabled).lower()),
                    admin_user_id="system",
                )
            await session.commit()

    async def is_source_enabled(self, source_id: str) -> bool:
        """检查指定数据源是否启用（组级 + 子级都必须 enabled）。"""
        src = self._sources.get(source_id)
        if src is None or not src.enabled:
            return False
        # 查找所属组
        for group in self._groups.values():
            for s in group.sources:
                if s.source_id == source_id:
                    return group.enabled and s.enabled
        return src.enabled

    def get_exchange_sources(self) -> list[DataSourceInfo]:
        """返回 Exchange_Direct_Combo 内所有交易所子数据源。"""
        combo = self._groups.get("exchange_direct_combo")
        if combo is None:
            return []
        return list(combo.sources)

    def is_initialized(self) -> bool:
        return self._initialized
