"""Celery 任务：CoinGlass 数据采集与点杀预警调度。

- collect_coinglass_data: 按 TierManager 频率采集 OI → Taker → 热力图 → 多空比 → 资金费率
- evaluate_kill_zone: 每 60 秒调用 KillDetector.evaluate_all()
"""

import asyncio
import logging

from app.core.redis import init_redis, set_with_ttl
from app.data.coinglass_client import CoinGlassClient
from app.data.coinglass_flow import FlowCollector
from app.data.coinglass_heatmap import HeatmapCollector
from app.data.coinglass_oi import OIMonitor
from app.data.coinglass_options import OptionsCollector
from app.data.coinglass_orderbook import OrderBookCollector
from app.data.coinglass_taker import TakerAnalyzer
from app.data.coinglass_tier import TierManager
from app.services.kill_detector import KillDetector
from app.services.symbol_registry import SymbolRegistry
from workers.celery_app import celery_app
from workers.db import worker_engine

logger = logging.getLogger(__name__)

# 采集优先级（限频不足时按此顺序跳过低优先级端点）
_COLLECT_PRIORITY: list[str] = [
    "oi",
    "long_short_ratio",
    "heatmap",
    "taker",
    "funding_rate",
    "cvd_netflow",
    "orderbook",
    "options",
]

# capability → 主要 CoinGlass endpoint（用于 tier-limited / V4-removed 判断）
_CAP_ENDPOINTS: dict[str, str] = {
    "cg_oi": "oi-ohlc-history",              # V4 已移除
    "cg_net_position": "net-position",
    "cg_weighted_fr": "oi-weight-ohlc-history",
    "cg_fr_arb": "fr-arbitrage",
    "cg_fr": "fr-ohlc-history",               # V4 已移除
    "cg_cvd": "futures-cvd-history",
    "cg_netflow": "futures-netflow-list",
    "cg_orderbook": "futures-orderbook-history",
    "cg_large_orders": "large-orderbook",
    "cg_option_maxpain": "option-max-pain",
}

# V4 API 已移除的端点（任何套餐均不可达）
_V4_REMOVED_ENDPOINTS: frozenset[str] = frozenset()


async def _collect_for_symbol(symbol: str) -> dict[str, int]:
    """对单个交易对按优先级顺序采集 CoinGlass 数据。

    单个端点失败继续采集剩余端点。
    """
    await init_redis()
    tier_manager = TierManager()
    client = CoinGlassClient(tier_manager)
    success = 0
    errors = 0
    cap_ok: dict[str, bool] = {k: False for k in _CAP_ENDPOINTS}

    try:
        async with worker_engine() as (_eng, _factory):
          async with _factory() as session:
            oi_monitor = OIMonitor(client, tier_manager, session)
            taker_analyzer = TakerAnalyzer(client, tier_manager, session)
            heatmap_collector = HeatmapCollector(client, tier_manager, session)

            # 1. OI 采集（最高优先级）
            try:
                snapshots = await oi_monitor.collect_oi_ohlc(symbol)
                if snapshots:
                    await oi_monitor.cache_latest(symbol, snapshots)
                    success += 1
                    cap_ok["cg_oi"] = True
                    try:
                        await oi_monitor.write_snapshots(snapshots)
                    except Exception as persist_exc:
                        errors += 1
                        logger.error("cg_persist_oi_failed", extra={"symbol": symbol, "error": str(persist_exc)})
                # OI 突增检测
                await oi_monitor.detect_oi_surge(symbol)
            except Exception as exc:
                errors += 1
                logger.error("cg_collect_oi_failed", extra={"symbol": symbol, "error": str(exc)})

            # 1.5 净持仓采集 → cg_net_position
            try:
                net_pos = await oi_monitor.collect_net_position(symbol)
                if net_pos:
                    await set_with_ttl(
                        f"cg_net_position:{symbol}",
                        [s.model_dump(mode="json") for s in net_pos[-20:]],
                        ttl_seconds=600,
                    )
                    success += 1
                    cap_ok["cg_net_position"] = True
            except Exception as exc:
                errors += 1
                logger.error("cg_collect_net_position_failed", extra={"symbol": symbol, "error": str(exc)})

            # 2. 多空比采集
            try:
                ls_ratios = []
                global_ls = await oi_monitor.collect_global_long_short_ratio(symbol)
                if global_ls:
                    ls_ratios.extend(global_ls)
                    success += 1
                top_account = await oi_monitor.collect_top_long_short_account_ratio(symbol)
                if top_account:
                    ls_ratios.extend(top_account)
                    success += 1
                top_position = await oi_monitor.collect_top_long_short_position_ratio(symbol)
                if top_position:
                    ls_ratios.extend(top_position)
                    success += 1
                if ls_ratios:
                    await oi_monitor.write_derivatives_snapshots(symbol, ls_ratios)
            except Exception as exc:
                errors += 1
                logger.error("cg_collect_ls_ratio_failed", extra={"symbol": symbol, "error": str(exc)})

            # 3. 爆仓热力图采集
            try:
                zones = await heatmap_collector.collect_heatmap_model1(symbol)
                if zones:
                    await heatmap_collector.write_heatmap(zones)
                    await heatmap_collector.cache_latest(symbol, zones)
                    success += 1
                basic_liq = await heatmap_collector.collect_basic_liquidation(symbol)
                if basic_liq:
                    await heatmap_collector.cache_basic_liquidation(symbol, basic_liq)
                    success += 1
            except Exception as exc:
                errors += 1
                logger.error("cg_collect_heatmap_failed", extra={"symbol": symbol, "error": str(exc)})

            # 4. Taker Volume 采集
            try:
                taker_snaps = await taker_analyzer.collect_taker_volume(symbol)
                if taker_snaps:
                    await taker_analyzer.cache_latest(symbol, taker_snaps)
                    success += 1
                    try:
                        await taker_analyzer.write_snapshots(taker_snaps)
                    except Exception as persist_exc:
                        errors += 1
                        logger.error("cg_persist_taker_failed", extra={"symbol": symbol, "error": str(persist_exc)})
                await taker_analyzer.detect_imbalance(symbol)
            except Exception as exc:
                errors += 1
                logger.error("cg_collect_taker_failed", extra={"symbol": symbol, "error": str(exc)})

            # 5. 加权资金费率采集 → cg_fr + cg_weighted_fr + cg_fr_arb
            try:
                oi_wfr = await oi_monitor.collect_oi_weighted_funding_rate(symbol)
                vol_wfr = await oi_monitor.collect_vol_weighted_funding_rate(symbol)
                # 合并 OI/Volume 加权费率 → cg_weighted_fr
                if oi_wfr or vol_wfr:
                    wfr_data: dict = {}
                    if oi_wfr and len(oi_wfr) > 0:
                        wfr_data["oi_weighted_rate"] = oi_wfr[-1].model_dump(mode="json").get("oi_weighted_rate", 0)
                    if vol_wfr and len(vol_wfr) > 0:
                        wfr_data["vol_weighted_rate"] = vol_wfr[-1].model_dump(mode="json").get("vol_weighted_rate", 0)
                    if wfr_data:
                        await set_with_ttl(f"cg_weighted_fr:{symbol}", wfr_data, ttl_seconds=600)
                        cap_ok["cg_weighted_fr"] = True

                # 资金费率套利 → cg_fr_arb
                fr_arb = await oi_monitor.collect_funding_rate_arbitrage(symbol)
                if fr_arb:
                    # 计算 anomaly_score: 交易所间费率标准差
                    rates = [float(x.get("rate", 0) or 0) for x in fr_arb if "rate" in x]
                    anomaly_score = 0.0
                    if len(rates) >= 2:
                        mean_r = sum(rates) / len(rates)
                        anomaly_score = (sum((r - mean_r) ** 2 for r in rates) / len(rates)) ** 0.5
                    await set_with_ttl(
                        f"cg_fr_arb:{symbol}",
                        {"anomaly_score": round(anomaly_score, 6), "exchanges": len(rates)},
                        ttl_seconds=600,
                    )
                    cap_ok["cg_fr_arb"] = True

                fr_snaps = await oi_monitor.collect_funding_rate_history(symbol)
                if fr_snaps:
                    await set_with_ttl(
                        f"cg_fr:{symbol}",
                        [s.model_dump(mode="json") for s in fr_snaps[-20:]],
                        ttl_seconds=600,
                    )
                    cap_ok["cg_fr"] = True
                success += 1
            except Exception as exc:
                errors += 1
                logger.error("cg_collect_fr_failed", extra={"symbol": symbol, "error": str(exc)})

            # 6. CVD + 净流入采集
            flow_collector = FlowCollector(client, tier_manager)
            try:
                cvd_snaps = await flow_collector.collect_cvd_history(symbol)
                if cvd_snaps:
                    await flow_collector.cache_cvd(symbol, cvd_snaps)
                    success += 1
                    cap_ok["cg_cvd"] = True
                netflow_snaps = await flow_collector.collect_netflow(symbol)
                if netflow_snaps:
                    await flow_collector.cache_netflow(symbol, netflow_snaps)
                    success += 1
                    cap_ok["cg_netflow"] = True
            except Exception as exc:
                errors += 1
                logger.error("cg_collect_flow_failed", extra={"symbol": symbol, "error": str(exc)})

            # 7. 订单簿 + 大单采集
            ob_collector = OrderBookCollector(client, tier_manager)
            try:
                ob_levels = await ob_collector.collect_orderbook_history(symbol)
                if ob_levels:
                    await ob_collector.cache_orderbook(symbol, ob_levels)
                    success += 1
                    cap_ok["cg_orderbook"] = True
                large_orders = await ob_collector.collect_large_orders(symbol)
                if large_orders:
                    await ob_collector.cache_large_orders(symbol, large_orders)
                    success += 1
                    cap_ok["cg_large_orders"] = True
            except Exception as exc:
                errors += 1
                logger.error("cg_collect_orderbook_failed", extra={"symbol": symbol, "error": str(exc)})

            # 8. 期权采集
            opt_collector = OptionsCollector(client, tier_manager)
            try:
                mp = await opt_collector.collect_max_pain(symbol)
                if mp:
                    await opt_collector.cache_max_pain(symbol, mp)
                    success += 1
                    cap_ok["cg_option_maxpain"] = True
                opt_info = await opt_collector.collect_options_info(symbol)
                if opt_info:
                    await opt_collector.cache_options_info(symbol, opt_info)
                    success += 1
            except Exception as exc:
                errors += 1
                logger.error("cg_collect_options_failed", extra={"symbol": symbol, "error": str(exc)})

            # ── 按端点实际结果注册运行时能力状态 ──
            from app.core.capability_state import set_capability_status, CapabilityStatus
            tier = await tier_manager.get_current_tier()
            for cap, endpoint in _CAP_ENDPOINTS.items():
                if cap_ok.get(cap):
                    await set_capability_status(cap, CapabilityStatus.AVAILABLE)
                elif endpoint in _V4_REMOVED_ENDPOINTS:
                    await set_capability_status(
                        cap, CapabilityStatus.UNAVAILABLE,
                        reason=f"V4 API removed {endpoint}",
                    )
                elif not tier_manager.is_endpoint_available(tier, endpoint):
                    await set_capability_status(
                        cap, CapabilityStatus.TIER_LIMITED,
                        reason=f"{endpoint} not available for {tier.value}",
                    )
                else:
                    await set_capability_status(
                        cap, CapabilityStatus.DEGRADED,
                        reason=f"{endpoint} collection returned no fresh data",
                    )

    finally:
        await client.close()  # worker_engine context disposes DB engine

    return {"success": success, "errors": errors}


async def _collect_all() -> dict[str, int]:
    """遍历所有已启用交易对，逐个采集 CoinGlass 数据。"""
    await init_redis()

    # 检查数据源开关 — 与其他采集器保持一致
    from app.data.source_gate import is_enabled
    if not await is_enabled("coinglass_ws") and not await is_enabled("coinglass_rest"):
        logger.info("CoinGlass 数据源已关闭，跳过采集")
        from app.core.capability_state import set_capability_status, CapabilityStatus
        for cap in _CAP_ENDPOINTS:
            await set_capability_status(
                cap, CapabilityStatus.DISABLED,
                reason="datasource disabled by admin",
            )
        return {"success": 0, "errors": 0, "total": 0}

    total_success = 0
    total_errors = 0

    async with worker_engine() as (_eng, _factory):
        async with _factory() as session:
            async with session.begin():
                registry = SymbolRegistry(session)
                symbols = await registry.list_symbols(enabled_only=True)

    targets = [s.symbol for s in symbols if s.has_derivatives]

    if not targets:
        return {"success": 0, "errors": 0, "total": 0}

    for symbol in targets:
        result = await _collect_for_symbol(symbol)
        total_success += result["success"]
        total_errors += result["errors"]

    logger.info(
        "CoinGlass 数据采集完成: total=%d, success=%d, errors=%d",
        len(targets),
        total_success,
        total_errors,
    )
    return {"success": total_success, "errors": total_errors, "total": len(targets)}


async def _evaluate_all_kill_zones() -> dict[str, int]:
    """对所有已启用交易对执行点杀检测。"""
    await init_redis()
    tier_manager = TierManager()

    async with worker_engine() as (_eng, _factory):
        async with _factory() as session:
            async with session.begin():
                registry = SymbolRegistry(session)
                symbols = await registry.list_symbols(enabled_only=True)

        targets = [s.symbol for s in symbols if s.has_derivatives]

        if not targets:
            return {"alerts": 0, "total": 0}

        async with _factory() as session:
            detector = KillDetector(tier_manager, session)
            alerts = await detector.evaluate_all(targets)

    logger.info(
        "点杀检测完成: total=%d, alerts=%d",
        len(targets),
        len(alerts),
    )
    return {"alerts": len(alerts), "total": len(targets)}


@celery_app.task(
    name="workers.coinglass_worker.collect_coinglass_data",
    bind=True,
    max_retries=2,
)
def collect_coinglass_data(self) -> dict[str, int]:
    """Celery Beat 定时触发，采集 CoinGlass 数据。频率由 TierManager 决定。"""
    try:
        result = asyncio.run(_collect_all())
        return result
    except Exception as exc:
        logger.error("collect_coinglass_data error: %s", exc)
        raise self.retry(exc=exc, countdown=30)


@celery_app.task(
    name="workers.coinglass_worker.evaluate_kill_zone",
    bind=True,
    max_retries=2,
)
def evaluate_kill_zone(self) -> dict[str, int]:
    """Celery Beat 每 60 秒触发，执行点杀检测。"""
    try:
        result = asyncio.run(_evaluate_all_kill_zones())
        return result
    except Exception as exc:
        logger.error("evaluate_kill_zone error: %s", exc)
        raise self.retry(exc=exc, countdown=15)


# ── T7.3 定时主动恢复 ─────────────────────────────────────────


async def _scheduled_probe_proxy() -> dict:
    """当 official 活跃时，主动探测 proxy 是否恢复并自动切回。"""
    await init_redis()
    tier_manager = TierManager()
    client = CoinGlassClient(tier_manager)
    try:
        return await client.scheduled_probe_proxy()
    finally:
        await client.close()


@celery_app.task(
    name="workers.coinglass_worker.probe_proxy_recovery",
    bind=True,
    max_retries=0,
)
def probe_proxy_recovery(self) -> dict:
    """Celery Beat 每 5 分钟触发，定时探测 proxy 恢复（T7.3）。"""
    try:
        result = asyncio.run(_scheduled_probe_proxy())
        logger.info("probe_proxy_recovery result: %s", result)
        return result
    except Exception as exc:
        logger.error("probe_proxy_recovery error: %s", exc)
        return {"action": "error", "reason": str(exc)}
