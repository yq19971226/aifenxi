"""Finnhub 数据自动采集调度器 — FastAPI 后台任务版。

在后端进程内定时采集 Finnhub 数据并缓存到 Redis。
无需 Celery Worker，随后端启动自动运行。

采集频率：
- 财报日历：每 6 小时
- 加密新闻：每 15 分钟
- 宏观关联报价：每 5 分钟
- 加密关联股报价：每 5 分钟
- 加密概念股新闻：每 1 小时
- 内部人情绪：每 24 小时
"""

import asyncio
import logging
from datetime import datetime, timezone

logger = logging.getLogger(__name__)

# 各数据项的采集间隔（秒）
_QUOTE_INTERVAL = 300         # 5 分钟
_NEWS_INTERVAL = 900          # 15 分钟
_COMPANY_NEWS_INTERVAL = 3600 # 1 小时
_EARNINGS_INTERVAL = 21600    # 6 小时
_INSIDER_INTERVAL = 86400     # 24 小时


class FinnhubScheduler:
    """后台 Finnhub 数据采集调度器。"""

    def __init__(self) -> None:
        self._tasks: list[asyncio.Task] = []
        self._running = False
        # 状态追踪
        self.last_collect_at: str | None = None
        self.rounds_completed: int = 0
        self.errors: int = 0

    async def start(self) -> None:
        """启动后台采集循环。"""
        if self._tasks:
            return
        self._running = True

        # 检查 Finnhub 是否启用
        try:
            from app.services.config_service import get_config_value
            api_key = await get_config_value("finnhub_api_key", "")
            if not api_key:
                logger.info("FinnhubScheduler skipped — finnhub_api_key not configured")
                return
        except Exception:
            logger.info("FinnhubScheduler skipped — config not available")
            return

        self._tasks = [
            asyncio.create_task(self._loop_quotes()),
            asyncio.create_task(self._loop_news()),
            asyncio.create_task(self._loop_company_news()),
            asyncio.create_task(self._loop_earnings()),
            asyncio.create_task(self._loop_insider()),
        ]
        logger.info("FinnhubScheduler started — 5 collection loops active")

    async def stop(self) -> None:
        """停止采集。"""
        self._running = False
        for task in self._tasks:
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass
        self._tasks = []
        logger.info("FinnhubScheduler stopped")

    # ── 报价采集（5 分钟间隔）────────────────────────────────────

    async def _loop_quotes(self) -> None:
        """宏观 + 加密关联股报价循环。"""
        await asyncio.sleep(10)  # 启动延迟
        while self._running:
            try:
                from app.data.finnhub_collector import FinnhubCollector
                collector = FinnhubCollector()
                await collector.collect_macro_quotes()
                await collector.collect_stock_quotes()
                self.last_collect_at = datetime.now(timezone.utc).isoformat()
                self.rounds_completed += 1
            except Exception as exc:
                self.errors += 1
                logger.warning("finnhub_quote_loop_error", extra={"error": str(exc)})
            await asyncio.sleep(_QUOTE_INTERVAL)

    # ── 加密新闻采集（15 分钟间隔）──────────────────────────────

    async def _loop_news(self) -> None:
        """加密分类市场新闻循环。"""
        await asyncio.sleep(15)  # 启动延迟
        while self._running:
            try:
                from app.data.finnhub_collector import FinnhubCollector
                collector = FinnhubCollector()
                await collector.collect_crypto_news()
            except Exception as exc:
                self.errors += 1
                logger.warning("finnhub_news_loop_error", extra={"error": str(exc)})
            await asyncio.sleep(_NEWS_INTERVAL)

    # ── 加密概念股公司新闻（1 小时间隔）────────────────────────

    async def _loop_company_news(self) -> None:
        """加密概念股公司新闻循环。"""
        await asyncio.sleep(30)  # 启动延迟
        while self._running:
            try:
                from app.data.finnhub_collector import FinnhubCollector
                collector = FinnhubCollector()
                await collector.collect_all_company_news()
            except Exception as exc:
                self.errors += 1
                logger.warning("finnhub_company_news_loop_error", extra={"error": str(exc)})
            await asyncio.sleep(_COMPANY_NEWS_INTERVAL)

    # ── 财报日历采集（6 小时间隔）──────────────────────────────

    async def _loop_earnings(self) -> None:
        """加密关联股财报日历循环。"""
        await asyncio.sleep(20)  # 启动延迟
        while self._running:
            try:
                from app.data.finnhub_collector import FinnhubCollector
                collector = FinnhubCollector()
                await collector.collect_crypto_earnings()
            except Exception as exc:
                self.errors += 1
                logger.warning("finnhub_earnings_loop_error", extra={"error": str(exc)})
            await asyncio.sleep(_EARNINGS_INTERVAL)

    # ── 内部人情绪采集（24 小时间隔）─────────────────────────

    async def _loop_insider(self) -> None:
        """加密概念股内部人交易情绪循环。"""
        await asyncio.sleep(60)  # 启动延迟
        while self._running:
            try:
                from app.data.finnhub_collector import FinnhubCollector
                collector = FinnhubCollector()
                await collector.collect_all_insider_sentiment()
            except Exception as exc:
                self.errors += 1
                logger.warning("finnhub_insider_loop_error", extra={"error": str(exc)})
            await asyncio.sleep(_INSIDER_INTERVAL)
