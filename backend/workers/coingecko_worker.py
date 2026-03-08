"""Celery 任务：CoinGecko 数据采集调度。

- collect_coingecko_data: 按 TierManager 频率采集市场数据 → 社区情绪 → 全局宏观 → 热门趋势
"""

import asyncio
import logging

from app.core.redis import init_redis
from app.data.coingecko_client import CoinGeckoClient
from app.data.coingecko_collector import CoinGeckoCollector
from app.data.coingecko_tier import CoinGeckoTierManager
from app.services.symbol_registry import SymbolRegistry
from workers.celery_app import celery_app
from workers.db import worker_engine

logger = logging.getLogger(__name__)


async def _collect_all() -> dict[str, int]:
    """遍历所有已启用交易对，采集 CoinGecko 数据。"""
    await init_redis()

    # 检查数据源开关
    from app.data.source_gate import is_enabled
    if not await is_enabled("coingecko"):
        logger.info("CoinGecko 数据源已关闭，跳过采集")
        from app.core.capability_state import set_capability_status, CapabilityStatus
        for cap in ("gecko_market", "gecko_community", "gecko_developer", "gecko_global", "gecko_trending"):
            await set_capability_status(cap, CapabilityStatus.DISABLED, reason="datasource disabled by admin")
        return {"success": 0, "errors": 0, "total": 0}

    tier_manager = CoinGeckoTierManager()
    client = CoinGeckoClient(tier_manager)
    collector = CoinGeckoCollector(client, tier_manager)

    success = 0
    errors = 0

    try:
        # 获取已启用交易对
        async with worker_engine() as (_eng, _factory):
            async with _factory() as session:
                async with session.begin():
                    registry = SymbolRegistry(session)
                    symbols_db = await registry.list_symbols(enabled_only=True)

        targets = [s.symbol for s in symbols_db]
        if not targets:
            return {"success": 0, "errors": 0, "total": 0}

        # 1. 批量市场数据（单次 API 调用）
        try:
            markets = await collector.collect_markets(targets)
            if markets:
                success += 1
            logger.info("gecko_markets_done", count=len(markets))
        except Exception as exc:
            errors += 1
            logger.error("gecko_collect_markets_failed", extra={"error": str(exc)})

        # 2. 逐个币种采集社区情绪 + 开发者活跃度
        tier = await tier_manager.get_current_tier()
        caps = tier_manager.get_capabilities(tier)

        # 控制采集数量，避免超额
        max_detail = min(len(targets), caps.max_symbols)
        for symbol in targets[:max_detail]:
            try:
                community, developer = await collector.collect_coin_detail(symbol)
                if community or developer:
                    success += 1
            except Exception as exc:
                errors += 1
                logger.error(
                    "gecko_collect_detail_failed",
                    extra={"symbol": symbol, "error": str(exc)},
                )

        # 3. 全局宏观数据
        try:
            global_data = await collector.collect_global()
            if global_data:
                success += 1
            logger.info("gecko_global_done")
        except Exception as exc:
            errors += 1
            logger.error("gecko_collect_global_failed", extra={"error": str(exc)})

        # 4. 热门趋势
        try:
            trending = await collector.collect_trending()
            if trending:
                success += 1
            logger.info("gecko_trending_done", count=len(trending))
        except Exception as exc:
            errors += 1
            logger.error("gecko_collect_trending_failed", extra={"error": str(exc)})

    finally:
        await client.close()

    logger.info(
        "CoinGecko 数据采集完成: success=%d, errors=%d",
        success,
        errors,
    )
    return {"success": success, "errors": errors, "total": len(targets)}


@celery_app.task(
    name="workers.coingecko_worker.collect_coingecko_data",
    bind=True,
    max_retries=2,
)
def collect_coingecko_data(self) -> dict[str, int]:
    """Celery Beat 定时触发，采集 CoinGecko 数据。频率由 TierManager 决定。"""
    try:
        result = asyncio.run(_collect_all())
        asyncio.run(_set_gecko_caps(
            "AVAILABLE" if result.get("success", 0) > 0 else "UNAVAILABLE",
            "" if result.get("success", 0) > 0 else "all endpoints failed",
        ))
        return result
    except Exception as exc:
        logger.error("collect_coingecko_data error: %s", exc)
        asyncio.run(_set_gecko_caps("UNAVAILABLE", f"task exception: {exc}"))
        raise self.retry(exc=exc, countdown=60)


async def _set_gecko_caps(status_str: str, reason: str = "") -> None:
    """批量写入 gecko_* capability 运行时状态。"""
    from app.core.capability_state import CapabilityStatus, set_capability_status

    await init_redis()
    status = CapabilityStatus(status_str.lower())
    for cap in ("gecko_market", "gecko_community", "gecko_developer", "gecko_global", "gecko_trending"):
        await set_capability_status(cap, status, reason=reason)
