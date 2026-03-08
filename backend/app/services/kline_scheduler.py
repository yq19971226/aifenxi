"""K 线数据自动采集调度器 — FastAPI 后台任务版。

替代 Celery kline_collector，在后端进程内定时拉取 Binance K 线并缓存到 Redis。
无需 Redis 服务器或 Celery Worker，随后端启动自动运行。
"""

import asyncio
import logging
from datetime import datetime, timezone

from app.core.mode_contract import ALL_MODE_KLINE_INTERVALS
from app.core.redis import set_with_ttl
from app.data.binance_rest import BinanceRestClient
from app.data.indicators import IndicatorCalculator
from app.services.symbol_registry import get_active_symbols

logger = logging.getLogger(__name__)

# 采集配置
INTERVALS = list(ALL_MODE_KLINE_INTERVALS)
KLINE_LIMIT = 200
CACHE_TTL = 600          # 缓存 10 分钟
COLLECT_CYCLE_SEC = 300  # 每 5 分钟采集一轮


class KlineScheduler:
    """后台 K 线采集调度器。"""

    def __init__(self) -> None:
        self._client = BinanceRestClient()
        self._indicator_calc = IndicatorCalculator()
        self._task: asyncio.Task | None = None
        self._running = False
        # 状态追踪
        self.last_collect_at: str | None = None
        self.last_total: int = 0
        self.last_failed: int = 0
        self.last_elapsed_s: float = 0
        self.rounds_completed: int = 0

    async def start(self) -> None:
        """启动后台采集循环。"""
        if self._task is not None:
            return
        self._running = True
        self._task = asyncio.create_task(self._loop())
        logger.info("KlineScheduler started — intervals=%d cycle=%ds",
                     len(INTERVALS), COLLECT_CYCLE_SEC)

    async def stop(self) -> None:
        """停止采集。"""
        self._running = False
        if self._task is not None:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
            self._task = None
        logger.info("KlineScheduler stopped")

    async def _loop(self) -> None:
        """主循环：每轮采集所有币种所有周期。"""
        # 首次启动延迟 5 秒，等 Redis 等服务就绪
        await asyncio.sleep(5)

        while self._running:
            t0 = datetime.now(timezone.utc)
            total, failed = 0, 0

            symbols = await get_active_symbols()
            for symbol in symbols:
                for interval in INTERVALS:
                    total += 1
                    try:
                        klines = await self._client.fetch_klines(
                            symbol, interval, limit=KLINE_LIMIT,
                        )
                        if klines:
                            cache_key = f"klines:{symbol}:{interval}"
                            data = [k.model_dump(mode="json") for k in klines]
                            await set_with_ttl(cache_key, data, ttl_seconds=CACHE_TTL)

                            # 计算技术指标并缓存
                            try:
                                indicators = self._indicator_calc.calculate_all(klines)
                                ind_key = f"indicators:{symbol}:{interval}"
                                await set_with_ttl(
                                    ind_key,
                                    indicators.model_dump(mode="json"),
                                    ttl_seconds=CACHE_TTL,
                                )
                            except Exception as ind_exc:
                                logger.warning(
                                    "indicator_calc_failed symbol=%s interval=%s: %s",
                                    symbol, interval, ind_exc,
                                )

                            # 更新最新价格
                            if interval == "5m" and klines:
                                await set_with_ttl(
                                    f"latest_price:{symbol}",
                                    klines[-1].close,
                                    ttl_seconds=CACHE_TTL,
                                )
                    except Exception as exc:
                        failed += 1
                        logger.warning("kline_collect_failed symbol=%s interval=%s: %s",
                                       symbol, interval, exc)

                    # 每个请求间隔 200ms，避免触发 Binance 限频
                    await asyncio.sleep(0.2)

            elapsed = (datetime.now(timezone.utc) - t0).total_seconds()
            self.last_collect_at = datetime.now(timezone.utc).isoformat()
            self.last_total = total
            self.last_failed = failed
            self.last_elapsed_s = round(elapsed, 1)
            self.rounds_completed += 1
            logger.info(
                "kline_collect_round_done total=%d failed=%d elapsed=%.1fs",
                total, failed, elapsed,
            )

            # 等待到下一轮
            wait = max(0, COLLECT_CYCLE_SEC - elapsed)
            await asyncio.sleep(wait)
