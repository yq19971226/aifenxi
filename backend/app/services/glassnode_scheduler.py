"""Glassnode 数据自动采集调度器 — FastAPI 后台任务版。

在后端进程内定时采集 Glassnode T3 链上数据并缓存到 Redis。
四个采集循环对应四个频率层：

- high  loop:  每 15 分钟 — SOPR, aSOPR, 交易所流量, 活跃地址, MVRV
- mid   loop:  每 1 小时 — NUPL, EA-MVRV, LTH/STH-SOPR, 积累评分, 净已实现盈亏
- low   loop:  每 6 小时 — LTH/STH-NUPL, SSR, HODLer, Reserve Risk, Puell, Liveliness
- daily loop:  每 24 小时 — Hash Ribbon, Difficulty Ribbon, S2F, Pi Cycle, RHODL

每次高频采集结束后自动聚合快照（build_all_snapshots），
确保 onchain:{symbol} 始终是最新聚合数据。
"""

from __future__ import annotations

import asyncio
import logging
from typing import Any

logger = logging.getLogger(__name__)

_INTERVAL_HIGH = 15 * 60    # 15 分钟
_INTERVAL_MID = 60 * 60     # 1 小时
_INTERVAL_LOW = 6 * 3600    # 6 小时
_INTERVAL_DAILY = 24 * 3600 # 24 小时


class GlassnodeScheduler:
    """后台 Glassnode 数据采集调度器。"""

    def __init__(self) -> None:
        self._tasks: list[asyncio.Task] = []
        self._running = False

    async def _should_run(self) -> bool:
        """检查 Glassnode API Key 是否已配置。"""
        try:
            from app.services.config_service import get_config_value
            api_key = await get_config_value("glassnode_api_key", "")
            if not api_key:
                logger.info("GlassnodeScheduler skipped — glassnode_api_key not configured")
                return False
            return True
        except Exception:
            logger.info("GlassnodeScheduler skipped — config not available")
            return False

    async def start(self) -> None:
        """启动所有采集循环。"""
        if not await self._should_run():
            return

        self._running = True
        self._tasks = [
            asyncio.create_task(self._high_loop(), name="gn_high_loop"),
            asyncio.create_task(self._mid_loop(), name="gn_mid_loop"),
            asyncio.create_task(self._low_loop(), name="gn_low_loop"),
            asyncio.create_task(self._daily_loop(), name="gn_daily_loop"),
        ]
        logger.info("GlassnodeScheduler started — 4 collection loops active")

    async def stop(self) -> None:
        """停止所有采集循环。"""
        self._running = False
        for task in self._tasks:
            task.cancel()
        if self._tasks:
            await asyncio.gather(*self._tasks, return_exceptions=True)
        self._tasks.clear()
        logger.info("GlassnodeScheduler stopped")

    # ── 高频循环 (15 分钟) ────────────────────────────────────

    async def _high_loop(self) -> None:
        await asyncio.sleep(5)  # 启动延迟，错开 Finnhub
        while self._running:
            try:
                from app.data.glassnode_collector import GlassnodeCollector
                collector = GlassnodeCollector()
                try:
                    results = await collector.collect_high_for_all()
                    ok_total = sum(
                        sum(1 for v in m.values() if v is not None)
                        for m in results.values()
                    )
                    logger.info("gn_high_loop_done", extra={
                        "symbols": len(results),
                        "metrics_ok": ok_total,
                    })
                    # 高频采集后聚合快照
                    await collector.build_all_snapshots()
                finally:
                    await collector.close()
            except Exception as exc:
                logger.warning("gn_high_loop_error", extra={"error": str(exc)})
            await asyncio.sleep(_INTERVAL_HIGH)

    # ── 中频循环 (1 小时) ─────────────────────────────────────

    async def _mid_loop(self) -> None:
        await asyncio.sleep(30)  # 错开启动
        while self._running:
            try:
                from app.data.glassnode_collector import GlassnodeCollector
                collector = GlassnodeCollector()
                try:
                    results = await collector.collect_mid_for_all()
                    ok_total = sum(
                        sum(1 for v in m.values() if v is not None)
                        for m in results.values()
                    )
                    logger.info("gn_mid_loop_done", extra={
                        "symbols": len(results),
                        "metrics_ok": ok_total,
                    })
                    await collector.build_all_snapshots()
                finally:
                    await collector.close()
            except Exception as exc:
                logger.warning("gn_mid_loop_error", extra={"error": str(exc)})
            await asyncio.sleep(_INTERVAL_MID)

    # ── 低频循环 (6 小时) ─────────────────────────────────────

    async def _low_loop(self) -> None:
        await asyncio.sleep(60)
        while self._running:
            try:
                from app.data.glassnode_collector import GlassnodeCollector
                collector = GlassnodeCollector()
                try:
                    results = await collector.collect_low_for_all()
                    ok_total = sum(
                        sum(1 for v in m.values() if v is not None)
                        for m in results.values()
                    )
                    logger.info("gn_low_loop_done", extra={
                        "symbols": len(results),
                        "metrics_ok": ok_total,
                    })
                    await collector.build_all_snapshots()
                finally:
                    await collector.close()
            except Exception as exc:
                logger.warning("gn_low_loop_error", extra={"error": str(exc)})
            await asyncio.sleep(_INTERVAL_LOW)

    # ── 日频循环 (24 小时) ────────────────────────────────────

    async def _daily_loop(self) -> None:
        await asyncio.sleep(120)
        while self._running:
            try:
                from app.data.glassnode_collector import GlassnodeCollector
                collector = GlassnodeCollector()
                try:
                    results = await collector.collect_daily_for_all()
                    ok_total = sum(
                        sum(1 for v in m.values() if v is not None)
                        for m in results.values()
                    )
                    logger.info("gn_daily_loop_done", extra={
                        "symbols": len(results),
                        "metrics_ok": ok_total,
                    })
                    await collector.build_all_snapshots()
                finally:
                    await collector.close()
            except Exception as exc:
                logger.warning("gn_daily_loop_error", extra={"error": str(exc)})
            await asyncio.sleep(_INTERVAL_DAILY)
