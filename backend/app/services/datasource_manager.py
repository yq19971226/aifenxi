"""DataSource Manager — 双层开关、信号完整度、生命周期管理。"""

from __future__ import annotations

import asyncio
import json
import logging

import structlog

from app.core.redis import get_redis_pool, set_with_ttl, get_json
from app.data.datasource_registry import DataSourceRegistry
from app.data.stream_router import StreamRouter
from app.models.datasource import (
    DataSourceStatus,
    DataSourceStatusSnapshot,
    ExchangeStatusItem,
    OperationResult,
    PrimarySourceStatusItem,
)

logger = structlog.get_logger(__name__)

_COMPLETENESS_CACHE_KEY = "ds:combo:completeness_score"
_STATUS_SNAPSHOT_KEY = "ds:status_snapshot"
_COMPLETENESS_TTL = 300
_SNAPSHOT_TTL = 30


class DataSourceManager:
    """数据源管理服务 — 双层开关、信号完整度、生命周期管理。"""

    def __init__(self) -> None:
        self._registry = DataSourceRegistry()
        self._stream_router = StreamRouter()
        self._connectors: dict[str, object] = {}  # source_id → BaseConnector
        self._connector_tasks: dict[str, asyncio.Task] = {}
        self._initialized: bool = False

    # ── 初始化 ──────────────────────────────────────────────────

    async def initialize(self) -> None:
        """初始化：加载配置，构建连接器，启动已启用的数据源。"""
        try:
            await self._registry.load_from_config()
            self._build_connectors()
            await self._start_enabled_sources()
            self._initialized = True
            await self._update_status_snapshot()
            logger.info("datasource_manager_initialized")
        except Exception as exc:
            logger.error(
                "datasource_manager_init_failed",
                error=str(exc),
                fallback="using existing collectors",
            )
            # 框架初始化失败时回退到现有采集器（不阻塞系统启动）

    def _build_connectors(self) -> None:
        """为所有已注册数据源构建连接器实例。"""
        from app.data.connectors.binance import BinanceConnector
        from app.data.connectors.coinglass_adapter import CoinGlassAdapter

        self._connectors = {
            "binance_futures": BinanceConnector(),
            "coinglass": CoinGlassAdapter(),
        }

    async def _start_enabled_sources(self) -> None:
        """启动所有已启用数据源的连接器任务。"""
        combo = await self._registry.get_group("exchange_direct_combo")
        if combo and combo.enabled:
            for src in combo.sources:
                if src.enabled:
                    await self._start_connector(src.source_id)

        cg_group = await self._registry.get_group("coinglass_source")
        if cg_group and cg_group.enabled:
            await self._start_connector("coinglass")

    async def _start_connector(self, source_id: str) -> None:
        """启动单个连接器的后台任务。"""
        connector = self._connectors.get(source_id)
        if connector is None:
            logger.warning("connector_not_found", source_id=source_id)
            return

        if source_id in self._connector_tasks:
            task = self._connector_tasks[source_id]
            if not task.done():
                return  # 已在运行

        async def _run() -> None:
            try:
                await connector.run_with_reconnect()  # type: ignore[attr-defined]
            except asyncio.CancelledError:
                pass  # 正常取消，不标记 ERROR
            except Exception as exc:
                logger.error("connector_task_error", source_id=source_id, error=str(exc))
                await self._registry.update_source_status(source_id, DataSourceStatus.ERROR)

        task = asyncio.create_task(_run(), name=f"connector:{source_id}")
        self._connector_tasks[source_id] = task
        await self._registry.update_source_status(source_id, DataSourceStatus.ENABLED)
        logger.info("connector_started", source_id=source_id)

    async def _stop_connector(self, source_id: str) -> None:
        """停止单个连接器。"""
        connector = self._connectors.get(source_id)
        if connector is not None:
            await connector.close()  # type: ignore[attr-defined]

        task = self._connector_tasks.pop(source_id, None)
        if task and not task.done():
            task.cancel()
            try:
                await asyncio.wait_for(asyncio.shield(task), timeout=5.0)
            except (asyncio.CancelledError, asyncio.TimeoutError):
                pass

        await self._registry.update_source_status(source_id, DataSourceStatus.DISABLED)
        logger.info("connector_stopped", source_id=source_id)

    @staticmethod
    def _derive_primary_status(
        enabled: bool,
        ready_count: int,
        target_count: int,
        partial_ready: bool = False,
    ) -> DataSourceStatus:
        if not enabled:
            return DataSourceStatus.DISABLED
        if target_count <= 0:
            return DataSourceStatus.DISABLED
        if ready_count >= target_count:
            return DataSourceStatus.ENABLED
        if ready_count > 0 or partial_ready:
            return DataSourceStatus.STALE
        return DataSourceStatus.ERROR

    async def _build_primary_sources_snapshot(
        self,
        combo,
        cg_group,
        onchain_group,
        gecko_group,
        fred_group=None,
    ) -> tuple[list[PrimarySourceStatusItem], float, list[str]]:
        import asyncio as _aio
        from app.services.symbol_registry import get_active_symbols

        redis = get_redis_pool()
        symbols = await get_active_symbols()
        target_count = len(symbols)

        market_ready = 0
        derivatives_ready = 0
        derivatives_fallback_ready = 0
        onchain_ready = 0
        onchain_fallback_ready = 0

        async def _probe_symbol(symbol: str) -> tuple[bool, bool, bool, bool, bool]:
            """并行探测单个 symbol 的四域缓存就绪状态。"""
            price_task = redis.get(f"latest_price:{symbol}")
            kline_task = get_json(f"klines:{symbol}:15m")
            deriv_task = get_json(f"derivatives:{symbol}")
            onchain_primary_task = get_json(f"cq_onchain:{symbol}")
            onchain_fallback_task = get_json(f"onchain:{symbol}")
            cg_first_task = get_json(f"cg_cvd:{symbol}")

            price, kline, deriv, onchain_primary, onchain_fallback, cg_first = await _aio.gather(
                price_task, kline_task, deriv_task, onchain_primary_task, onchain_fallback_task, cg_first_task,
            )
            has_market = price is not None and kline is not None
            has_deriv_fallback = deriv is not None
            has_onchain_primary = onchain_primary is not None
            has_onchain_fallback = onchain_fallback is not None and onchain_primary is None

            # CoinGlass 增强：第一个 key 命中即算有，否则再探剩余
            if cg_first is not None:
                has_cg = True
            else:
                remaining = await _aio.gather(
                    get_json(f"cg_netflow:{symbol}"),
                    get_json(f"cg_orderbook:{symbol}"),
                    get_json(f"cg_large_orders:{symbol}"),
                    get_json(f"cg_option_maxpain:{symbol}"),
                    get_json(f"cg_option_info:{symbol}"),
                    get_json(f"cg_liquidation:{symbol}"),
                )
                has_cg = any(v is not None for v in remaining)

            return has_market, has_deriv_fallback, has_cg, has_onchain_primary, has_onchain_fallback

        probe_results = await _aio.gather(*[_probe_symbol(s) for s in symbols])
        for has_market, has_deriv_fallback, has_cg, has_onchain_primary, has_onchain_fallback in probe_results:
            if has_market:
                market_ready += 1
            if has_deriv_fallback:
                derivatives_fallback_ready += 1
            if has_cg:
                derivatives_ready += 1
            if has_onchain_primary:
                onchain_ready += 1
            if has_onchain_fallback:
                onchain_fallback_ready += 1

        fred_snapshot = await get_json("fred_snapshot")
        gecko_global = await get_json("gecko_global")
        combo_enabled = bool(combo and combo.enabled)
        market_enabled = combo_enabled and any(src.enabled for src in combo.sources if src.source_id == "binance_futures") if combo else False
        derivatives_enabled = bool(cg_group and cg_group.enabled)
        onchain_enabled = bool(
            onchain_group
            and onchain_group.enabled
            and any(src.enabled for src in onchain_group.sources if src.source_id == "cryptoquant")
        )
        macro_enabled = bool(
            fred_group
            and fred_group.enabled
            and any(src.enabled for src in fred_group.sources if src.source_id == "fred")
        )

        # macro 域就绪判断：FRED 主源优先，CoinGecko Global 兼容补位
        macro_has_fred = fred_snapshot is not None
        macro_has_gecko = gecko_global is not None
        macro_ready = 1 if macro_has_fred else 0
        if not macro_enabled:
            if macro_has_gecko:
                macro_detail = "FRED 主源已关闭，当前仅剩 CoinGecko Global 兼容缓存"
            else:
                macro_detail = "FRED 主源已关闭，暂无宏观缓存"
        elif macro_has_fred:
            macro_detail = f"FRED 主源就绪（{fred_snapshot.get('ok_count', 0)}/{fred_snapshot.get('total_count', 0)} 序列）"
        elif macro_has_gecko:
            macro_detail = "FRED 主源未就绪，当前由 CoinGecko Global 兼容补位"
        else:
            macro_detail = "FRED 主源未就绪，暂无宏观缓存"

        primary_sources = [
            PrimarySourceStatusItem(
                source_id="binance",
                name="Binance",
                domain="market",
                owner="Binance",
                enabled=market_enabled,
                status=self._derive_primary_status(market_enabled, market_ready, target_count),
                ready_count=market_ready,
                target_count=target_count,
                detail=f"{market_ready}/{target_count} 个启用币种具备价格与主周期K线缓存" if target_count else "暂无启用币种",
            ),
            PrimarySourceStatusItem(
                source_id="coinglass",
                name="CoinGlass",
                domain="derivatives",
                owner="CoinGlass",
                enabled=derivatives_enabled,
                status=self._derive_primary_status(
                    derivatives_enabled,
                    derivatives_ready,
                    target_count,
                    partial_ready=derivatives_fallback_ready > 0,
                ),
                ready_count=derivatives_ready,
                target_count=target_count,
                detail=f"增强缓存 {derivatives_ready}/{target_count}，Binance 基础合约回退 {derivatives_fallback_ready}/{target_count}" if target_count else "暂无启用币种",
            ),
            PrimarySourceStatusItem(
                source_id="cryptoquant",
                name="CryptoQuant",
                domain="onchain",
                owner="CryptoQuant",
                enabled=onchain_enabled,
                status=self._derive_primary_status(
                    onchain_enabled,
                    onchain_ready,
                    target_count,
                    partial_ready=onchain_fallback_ready > 0,
                ),
                ready_count=onchain_ready,
                target_count=target_count,
                detail=f"CryptoQuant 主源缓存 {onchain_ready}/{target_count}，兼容回退 {onchain_fallback_ready}/{target_count}" if target_count else "暂无启用币种",
            ),
            PrimarySourceStatusItem(
                source_id="fred",
                name="FRED",
                domain="macro",
                owner="FRED",
                enabled=macro_enabled,
                status=self._derive_primary_status(macro_enabled, macro_ready, 1, partial_ready=macro_has_gecko and not macro_has_fred),
                ready_count=macro_ready,
                target_count=1,
                detail=macro_detail,
            ),
        ]

        score_map = {
            DataSourceStatus.ENABLED: 1.0,
            DataSourceStatus.STALE: 0.5,
            DataSourceStatus.DISABLED: 0.0,
            DataSourceStatus.ERROR: 0.0,
        }
        domain_completeness = round(
            sum(score_map[item.status] for item in primary_sources) / len(primary_sources),
            4,
        ) if primary_sources else 0.0
        missing_domains = [
            item.domain
            for item in primary_sources
            if item.status in {DataSourceStatus.DISABLED, DataSourceStatus.ERROR}
        ]
        return primary_sources, domain_completeness, missing_domains

    # ── 双层开关 ─────────────────────────────────────────────────

    async def set_combo_enabled(self, enabled: bool) -> OperationResult:
        """组合级开关：启用/关闭整个 Exchange_Direct_Combo。"""
        try:
            combo = await self._registry.get_group("exchange_direct_combo")
            if combo is None:
                return OperationResult(success=False, message="交易所直连组合未注册")

            if enabled:
                # 开启组合：启动所有交易所级开关为 enabled 的交易所
                await self._registry.set_combo_enabled(True)
                started = []
                for src in combo.sources:
                    if src.enabled:
                        await self._start_connector(src.source_id)
                        started.append(src.source_id)
                score = await self.recalculate_completeness()
                await self._update_status_snapshot()
                return OperationResult(
                    success=True,
                    message=f"组合已开启，已启动: {started}",
                    completeness_score=score,
                )
            else:
                # 关闭组合：停止所有交易所
                await self._registry.set_combo_enabled(False)
                for src in combo.sources:
                    await self._stop_connector(src.source_id)
                    await self._stream_router.cleanup_source(src.source_id)
                    await self._publish_cache_cleared(src.source_id)
                score = await self.recalculate_completeness()
                await self._update_status_snapshot()
                return OperationResult(
                    success=True,
                    message="组合已关闭，所有交易所已停止",
                    completeness_score=score,
                )
        except Exception as exc:
            logger.error("set_combo_enabled_failed", enabled=enabled, error=str(exc))
            return OperationResult(
                success=False,
                message=f"操作失败: {exc}",
                errors=[str(exc)],
            )

    async def set_exchange_enabled(
        self, source_id: str, enabled: bool
    ) -> OperationResult:
        """交易所级开关：启用/关闭单个交易所。"""
        try:
            # 检查组合级开关
            combo = await self._registry.get_group("exchange_direct_combo")
            if combo is None:
                return OperationResult(success=False, message="交易所直连组合未注册")

            if not combo.enabled and enabled:
                return OperationResult(
                    success=False,
                    source_id=source_id,
                    message="组合已关闭时无法启用交易所",
                )

            src = await self._registry.get_source(source_id)
            if src is None:
                return OperationResult(
                    success=False,
                    source_id=source_id,
                    message=f"数据源 {source_id} 未找到",
                )

            await self._registry.set_source_enabled(source_id, enabled)

            if enabled:
                await self._start_connector(source_id)
            else:
                await self._stop_connector(source_id)
                deleted = await self._stream_router.cleanup_source(source_id)
                await self._publish_cache_cleared(source_id)
                logger.info(
                    "exchange_cache_cleaned",
                    source_id=source_id,
                    deleted_keys=deleted,
                )

            score = await self.recalculate_completeness()
            await self._update_status_snapshot()
            return OperationResult(
                success=True,
                source_id=source_id,
                message=f"{source_id} 已{'开启' if enabled else '关闭'}",
                completeness_score=score,
            )
        except Exception as exc:
            logger.error(
                "set_exchange_enabled_failed",
                source_id=source_id,
                enabled=enabled,
                error=str(exc),
            )
            await self._registry.update_source_status(source_id, DataSourceStatus.ERROR)
            return OperationResult(
                success=False,
                source_id=source_id,
                message=f"{'开启' if enabled else '关闭'} {source_id} 失败: {exc}",
                errors=[str(exc)],
            )

    async def set_coinglass_enabled(self, enabled: bool) -> OperationResult:
        """CoinGlass 独立开关控制。"""
        try:
            await self._registry.set_coinglass_enabled(enabled)

            if enabled:
                await self._start_connector("coinglass")
            else:
                await self._stop_connector("coinglass")
                deleted = await self._stream_router.cleanup_source("coinglass")
                await self._publish_cache_cleared("coinglass")
                logger.info("coinglass_cache_cleaned", deleted_keys=deleted)

            await self._update_status_snapshot()
            return OperationResult(
                success=True,
                source_id="coinglass",
                message=f"CoinGlass 已{'开启' if enabled else '关闭'}",
            )
        except Exception as exc:
            logger.error("set_coinglass_enabled_failed", enabled=enabled, error=str(exc))
            return OperationResult(
                success=False,
                source_id="coinglass",
                message=f"操作失败: {exc}",
                errors=[str(exc)],
            )

    # ── 信号完整度评分 ───────────────────────────────────────────

    async def get_completeness_score(self) -> float:
        """获取当前信号完整度评分（优先读缓存）。"""
        cached = await get_json(_COMPLETENESS_CACHE_KEY)
        if cached is not None:
            return float(cached.get("score", 0.0))
        return await self.recalculate_completeness()

    async def recalculate_completeness(self) -> float:
        """重新计算信号完整度评分并更新 Redis 缓存。"""
        try:
            combo = await self._registry.get_group("exchange_direct_combo")
            if combo is None or not combo.enabled:
                score = 0.0
            else:
                score = sum(
                    src.weight
                    for src in combo.sources
                    if src.enabled and src.status == DataSourceStatus.ENABLED
                )

            await set_with_ttl(
                _COMPLETENESS_CACHE_KEY,
                {"score": score},
                ttl_seconds=_COMPLETENESS_TTL,
            )

            # Pub/Sub 通知下游
            try:
                redis = get_redis_pool()
                await redis.publish(
                    "ds:score_changed", json.dumps({"score": score})
                )
            except Exception as exc:
                logger.warning("completeness_pubsub_failed", error=str(exc))

            return score
        except Exception as exc:
            logger.error("recalculate_completeness_failed", error=str(exc))
            cached = await get_json(_COMPLETENESS_CACHE_KEY)
            return float(cached.get("score", 0.0)) if cached else 0.0

    # ── 状态快照 ──────────────────────────────────────────────────

    async def get_status_snapshot(self) -> DataSourceStatusSnapshot:
        """获取所有数据源的状态快照（优先读缓存）。"""
        cached = await get_json(_STATUS_SNAPSHOT_KEY)
        if cached is not None:
            try:
                return DataSourceStatusSnapshot(**cached)
            except Exception:
                pass
        return await self._build_status_snapshot()

    async def _build_status_snapshot(self) -> DataSourceStatusSnapshot:
        """构建实时状态快照。"""
        from app.services.config_service import get_config_value
        from app.data.coinglass_tier import TierManager
        from app.data.coingecko_tier import CoinGeckoTierManager

        combo = await self._registry.get_group("exchange_direct_combo")
        cg_group = await self._registry.get_group("coinglass_source")
        onchain_group = await self._registry.get_group("onchain_sources")
        gecko_group = await self._registry.get_group("coingecko_source")
        fred_group = await self._registry.get_group("fred_source")

        score = await self.recalculate_completeness()
        primary_sources, domain_completeness, missing_domains = await self._build_primary_sources_snapshot(
            combo,
            cg_group,
            onchain_group,
            gecko_group,
            fred_group,
        )

        # 用实际数据探测结果构建 primary_status_map，校正注册表中可能过时的连接器状态
        primary_status_map: dict[str, DataSourceStatus] = {}
        for ps in primary_sources:
            if ps.source_id == "binance":
                primary_status_map["binance_futures"] = ps.status

        exchanges: list[ExchangeStatusItem] = []
        if combo:
            for src in combo.sources:
                # 如果注册表标记 stale/error 但实际数据探测显示 enabled，以探测结果为准
                effective_status = src.status
                probe_status = primary_status_map.get(src.source_id)
                if (
                    probe_status == DataSourceStatus.ENABLED
                    and effective_status in (DataSourceStatus.STALE, DataSourceStatus.ERROR)
                ):
                    effective_status = DataSourceStatus.ENABLED

                exchanges.append(
                    ExchangeStatusItem(
                        source_id=src.source_id,
                        name=src.name,
                        enabled=src.enabled,
                        status=effective_status,
                        weight=src.weight,
                    )
                )

        # 获取 CoinGlass 套餐等级
        try:
            tier_manager = TierManager()
            tier = await tier_manager.get_current_tier()
            coinglass_tier = tier.value
        except Exception:
            coinglass_tier = "unknown"

        # 获取 CoinGecko 套餐等级
        try:
            gecko_tier_manager = CoinGeckoTierManager()
            gecko_tier = await gecko_tier_manager.get_current_tier()
            coingecko_tier = gecko_tier.value
        except Exception:
            coingecko_tier = "demo"

        return DataSourceStatusSnapshot(
            combo_enabled=combo.enabled if combo else False,
            exchanges=exchanges,
            completeness_score=score,
            primary_sources=primary_sources,
            domain_completeness=domain_completeness,
            missing_domains=missing_domains,
            coinglass_enabled=cg_group.enabled if cg_group else False,
            coinglass_tier=coinglass_tier,
            coingecko_enabled=gecko_group.enabled if gecko_group else False,
            coingecko_tier=coingecko_tier,
        )

    async def _update_status_snapshot(self) -> None:
        """更新状态快照缓存。"""
        try:
            snapshot = await self._build_status_snapshot()
            await set_with_ttl(
                _STATUS_SNAPSHOT_KEY,
                snapshot.model_dump(mode="json"),
                ttl_seconds=_SNAPSHOT_TTL,
            )
        except Exception as exc:
            logger.warning("update_status_snapshot_failed", error=str(exc))

    # ── Redis 缓存清理 ────────────────────────────────────────────

    async def cleanup_redis_cache(self, source_id: str) -> int:
        """清理指定数据源的 Redis 缓存，返回删除的 key 数量。"""
        try:
            deleted = await self._stream_router.cleanup_source(source_id)
            await self._publish_cache_cleared(source_id)
            return deleted
        except Exception as exc:
            logger.error(
                "cleanup_redis_cache_failed",
                source_id=source_id,
                error=str(exc),
            )
            return 0

    async def _publish_cache_cleared(self, source_id: str) -> None:
        """通过 Pub/Sub 发布缓存清理完成事件。"""
        try:
            redis = get_redis_pool()
            await redis.publish(
                f"ds:cache_cleared:{source_id}",
                json.dumps({"source_id": source_id}),
            )
        except Exception as exc:
            logger.warning("cache_cleared_pubsub_failed", source_id=source_id, error=str(exc))

    # ── 停机清理 ──────────────────────────────────────────────────

    async def shutdown(self) -> None:
        """停止所有连接器（应用关闭时调用）。"""
        for source_id in list(self._connector_tasks.keys()):
            await self._stop_connector(source_id)
        logger.info("datasource_manager_shutdown")


# ── 全局单例 ──────────────────────────────────────────────────


_manager: DataSourceManager | None = None


def get_datasource_manager() -> DataSourceManager:
    """获取全局 DataSourceManager 实例。"""
    global _manager
    if _manager is None:
        _manager = DataSourceManager()
    return _manager


def reset_datasource_manager() -> None:
    """重置全局单例（仅用于测试和热重载场景）。"""
    global _manager
    _manager = None
