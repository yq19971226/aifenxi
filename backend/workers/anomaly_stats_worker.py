"""Celery 任务：每小时计算风险指标的历史统计摘要，写入 Redis 供异常检测层使用。

从 TimescaleDB 读取近 30 天数据，计算 mean/std/p5/p95/p99，
写入 Redis 缓存键 anomaly:stats:{symbol}（TTL=2h）。
"""

import asyncio
import logging
import math
from typing import Any

import sqlalchemy

from app.agents.anomaly_detector import IndicatorStats, save_indicator_stats
from app.core.redis import init_redis
from app.services.symbol_registry import get_active_symbols_sync
from workers.celery_app import celery_app
from workers.db import worker_session

logger = logging.getLogger(__name__)

# 指标名 → (表名, 字段名, 时间字段)
# 注意：字段名必须与实际 DB schema 一致
#   - onchain_snapshots: exchange_netflow, whale_change_24h, fear_greed_index, mvrv
#   - derivatives_snapshots: funding_rate, long_short_account_ratio, long_short_position_ratio
#   - liquidation_events: 需聚合查询，不在此映射中
_INDICATOR_SOURCES: dict[str, tuple[str, str, str]] = {
    "exchange_netflow": ("onchain_snapshots", "exchange_netflow", "time"),
    "whale_change_24h": ("onchain_snapshots", "whale_change_24h", "time"),
    "mvrv": ("onchain_snapshots", "mvrv", "time"),
    "fear_greed_index": ("onchain_snapshots", "fear_greed_index", "time"),
    "funding_rate": ("derivatives_snapshots", "funding_rate", "time"),
    "long_short_ratio": ("derivatives_snapshots", "long_short_account_ratio", "time"),
}


def _compute_stats(values: list[float]) -> IndicatorStats:
    """从数值列表计算统计摘要。"""
    n = len(values)
    if n == 0:
        return IndicatorStats()

    mean = sum(values) / n
    variance = sum((v - mean) ** 2 for v in values) / max(n - 1, 1)
    std = math.sqrt(variance)

    sorted_vals = sorted(values)

    def percentile(p: float) -> float:
        idx = p / 100 * (n - 1)
        lo = int(idx)
        hi = min(lo + 1, n - 1)
        frac = idx - lo
        return sorted_vals[lo] * (1 - frac) + sorted_vals[hi] * frac

    return IndicatorStats(
        mean=round(mean, 6),
        std=round(std, 6),
        p5=round(percentile(5), 6),
        p95=round(percentile(95), 6),
        p99=round(percentile(99), 6),
        sample_count=n,
    )


async def _compute_all_stats(symbol: str) -> dict[str, IndicatorStats]:
    """从 DB 读取近 30 天数据，计算各指标统计摘要。"""
    stats_map: dict[str, IndicatorStats] = {}

    async with worker_session() as session:
        for indicator_name, (table, column, time_col) in _INDICATOR_SOURCES.items():
            try:
                sql = sqlalchemy.text(f"""
                    SELECT {column}
                    FROM {table}
                    WHERE symbol = :symbol
                      AND {time_col} >= NOW() - INTERVAL '30 days'
                      AND {column} IS NOT NULL
                    ORDER BY {time_col}
                """)
                result = await session.execute(sql, {"symbol": symbol})
                rows = result.fetchall()
                values = [float(row[0]) for row in rows if row[0] is not None]
                stats_map[indicator_name] = _compute_stats(values)
                logger.debug(
                    "Computed stats for %s:%s, n=%d",
                    symbol, indicator_name, len(values),
                )
            except Exception as exc:
                logger.warning(
                    "Failed to compute stats for %s:%s: %s",
                    symbol, indicator_name, exc,
                )

    return stats_map


async def _run_compute(symbols: list[str]) -> dict[str, str]:
    """对每个交易对计算统计摘要并写入 Redis。"""
    await init_redis()
    results: dict[str, str] = {}

    for symbol in symbols:
        try:
            stats_map = await _compute_all_stats(symbol)
            await save_indicator_stats(symbol, stats_map)
            indicator_count = sum(1 for s in stats_map.values() if s.sample_count > 0)
            results[symbol] = f"ok ({indicator_count} indicators)"
            logger.info(
                "Anomaly stats computed",
                extra={"symbol": symbol, "indicators": indicator_count},
            )
        except Exception as exc:
            logger.error(
                "compute_anomaly_stats failed",
                extra={"symbol": symbol, "error": str(exc)},
            )
            results[symbol] = f"error: {exc}"

    return results


@celery_app.task(
    name="workers.anomaly_stats_worker.compute_anomaly_stats",
    bind=True,
    max_retries=2,
)
def compute_anomaly_stats(
    self,
    symbols: list[str] | None = None,
) -> dict[str, str]:
    """每小时计算风险指标的历史统计摘要，供异常检测层使用。"""
    _symbols = symbols or get_active_symbols_sync()
    try:
        return asyncio.run(_run_compute(_symbols))
    except Exception as exc:
        logger.error("compute_anomaly_stats top-level error: %s", exc)
        raise self.retry(exc=exc, countdown=120)
