"""Celery 任务：Glassnode T3 链上数据采集 — 分层定时采集全量指标。

调度频率：
- collect_glassnode_high: 每 15 分钟（SOPR, aSOPR, 交易所净流量/余额, 活跃地址, MVRV）
- collect_glassnode_mid:  每 1 小时（NUPL, EA-MVRV, LTH/STH-SOPR, 积累评分, 已实现盈亏, 新地址, 交易所流入）
- collect_glassnode_low:  每 6 小时（LTH/STH-NUPL, SSR, HODLer, Reserve Risk, Puell, Liveliness, NVT Signal）
- collect_glassnode_daily: 每 24 小时（Hash Ribbon, S2F, Pi Cycle, RHODL, 盈利地址%, F&G）

采集完成后自动聚合 build_onchain_snapshot 写入 onchain:{symbol} 缓存供 OnchainAgent 使用。
"""

import asyncio
import logging

from app.core.redis import init_redis
from app.data.glassnode_collector import GlassnodeCollector
from workers.celery_app import celery_app

logger = logging.getLogger(__name__)


async def _collect_tier(tier: str) -> dict[str, int]:
    """采集指定频率层的 Glassnode 指标并重建快照。"""
    await init_redis()

    from app.data.source_gate import is_enabled
    if not await is_enabled("glassnode"):
        logger.info("Glassnode 数据源已关闭，跳过 %s 层采集", tier)
        return {"success": 0, "errors": 0, "tier": tier}

    collector = GlassnodeCollector()
    try:
        if tier == "high":
            results = await collector.collect_high_for_all()
        elif tier == "mid":
            results = await collector.collect_mid_for_all()
        elif tier == "low":
            results = await collector.collect_low_for_all()
        elif tier == "daily":
            results = await collector.collect_daily_for_all()
        else:
            logger.warning("未知采集层: %s", tier)
            return {"success": 0, "errors": 0, "tier": tier}

        # 重建 onchain snapshot（聚合所有缓存层）
        snapshots = await collector.build_all_snapshots()
        ok = sum(1 for v in snapshots.values() if v is not None)

        # 更新 capability 状态
        await _set_gn_cap(
            "AVAILABLE" if ok > 0 else "UNAVAILABLE",
            f"tier={tier} symbols={ok}/{len(snapshots)}"
        )

        logger.info(
            "Glassnode %s tier collection complete: %d symbols, %d snapshots built",
            tier, len(results), ok,
        )
        return {"success": ok, "total": len(results), "tier": tier}

    except Exception as exc:
        logger.error("Glassnode %s tier collection error: %s", tier, exc)
        return {"success": 0, "errors": 1, "tier": tier}
    finally:
        await collector.close()


async def _set_gn_cap(status_str: str, reason: str = "") -> None:
    """写入 onchain capability 运行时状态。"""
    from app.core.capability_state import CapabilityStatus, set_capability_status
    await init_redis()
    status = CapabilityStatus(status_str.lower())
    await set_capability_status("onchain", status, reason=reason)


# ── Celery Tasks ─────────────────────────────────────────────

@celery_app.task(
    name="workers.glassnode_worker.collect_glassnode_high",
    bind=True,
    max_retries=2,
)
def collect_glassnode_high(self) -> dict[str, int]:
    """每 15 分钟：采集高频 T3 指标（SOPR, 交易所流量, MVRV 等）。"""
    try:
        return asyncio.run(_collect_tier("high"))
    except Exception as exc:
        logger.error("collect_glassnode_high error: %s", exc)
        raise self.retry(exc=exc, countdown=60)


@celery_app.task(
    name="workers.glassnode_worker.collect_glassnode_mid",
    bind=True,
    max_retries=2,
)
def collect_glassnode_mid(self) -> dict[str, int]:
    """每 1 小时：采集中频 T3 指标（NUPL, 积累评分, 已实现盈亏等）。"""
    try:
        return asyncio.run(_collect_tier("mid"))
    except Exception as exc:
        logger.error("collect_glassnode_mid error: %s", exc)
        raise self.retry(exc=exc, countdown=120)


@celery_app.task(
    name="workers.glassnode_worker.collect_glassnode_low",
    bind=True,
    max_retries=2,
)
def collect_glassnode_low(self) -> dict[str, int]:
    """每 6 小时：采集低频 T3 指标（LTH/STH-NUPL, SSR, Reserve Risk 等）。"""
    try:
        return asyncio.run(_collect_tier("low"))
    except Exception as exc:
        logger.error("collect_glassnode_low error: %s", exc)
        raise self.retry(exc=exc, countdown=300)


@celery_app.task(
    name="workers.glassnode_worker.collect_glassnode_daily",
    bind=True,
    max_retries=1,
)
def collect_glassnode_daily(self) -> dict[str, int]:
    """每 24 小时：采集日频指标（Hash Ribbon, S2F, Pi Cycle 等）。"""
    try:
        return asyncio.run(_collect_tier("daily"))
    except Exception as exc:
        logger.error("collect_glassnode_daily error: %s", exc)
        raise self.retry(exc=exc, countdown=600)
