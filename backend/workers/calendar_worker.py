"""Celery 任务：定时采集币圈日历事件并写入数据库。

定时任务：
- 每天凌晨 3 点采集所有活跃币种的未来 30 天事件
- 每 6 小时更新一次高影响力事件

数据流：
CoinMarketCal API → TimescaleDB calendar_events 表 → Redis 缓存
"""

import asyncio
import logging
from datetime import datetime, timezone

import sqlalchemy as sa
from sqlalchemy import text

from app.services.symbol_registry import get_active_symbols_sync
from workers.celery_app import celery_app
from workers.db import worker_session

logger = logging.getLogger(__name__)


def _fetch_active_symbols_sync() -> list[str]:
    """从数据库读取已启用的币种，失败时回退到 DEFAULT_SYMBOLS。"""
    return get_active_symbols_sync()


async def _set_calendar_cap(status_str: str, reason: str = "") -> None:
    """写入 calendar capability 运行时状态。"""
    from app.core.capability_state import CapabilityStatus, set_capability_status
    from app.core.redis import init_redis

    await init_redis()
    status = CapabilityStatus(status_str.lower())
    await set_capability_status("calendar", status, reason=reason)


def _symbol_pipeline_ok(count: int) -> bool:
    """count >= 0 表示链路正常（0 = 无 upcoming events，仍算可用），-1 = 链路异常。"""
    return count >= 0


async def _fetch_and_store_events(symbol: str, days_ahead: int = 30) -> int:
    """采集并存储指定币种的日历事件

    Args:
        symbol: 币种符号，如 "BTC"
        days_ahead: 未来天数

    Returns:
        存储的事件数量
    """
    from app.core.config import settings
    from app.data.calendar import CoinMarketCalCollector

    if not settings.coinmarketcal_api_key:
        logger.warning("COINMARKETCAL_API_KEY not configured, skipping")
        return 0

    collector = CoinMarketCalCollector(settings.coinmarketcal_api_key)

    try:
        # 获取未来 N 天的事件
        events = await collector.fetch_upcoming_events(symbol, days_ahead)

        if not events:
            logger.info(
                "No upcoming events found",
                extra={"symbol": symbol, "days_ahead": days_ahead},
            )
            return 0

        # 存储到数据库
        async with worker_session() as session:
            async with session.begin():
                for event in events:
                    # 插入或更新事件
                    await session.execute(
                        text("""
                            INSERT INTO calendar_events (
                                event_id, symbol, title, description,
                                event_date, categories, proof_link, source,
                                vote_count, positive_vote_count, percentage,
                                can_occur_before, created_at
                            )
                            VALUES (
                                :event_id, :symbol, :title, :description,
                                :event_date, :categories, :proof_link, :source,
                                :vote_count, :positive_vote_count, :percentage,
                                :can_occur_before, :created_at
                            )
                            ON CONFLICT (event_id) DO UPDATE
                            SET vote_count = EXCLUDED.vote_count,
                                positive_vote_count = EXCLUDED.positive_vote_count,
                                percentage = EXCLUDED.percentage,
                                updated_at = NOW()
                        """),
                        {
                            "event_id": event.event_id,
                            "symbol": symbol,
                            "title": event.title,
                            "description": event.description,
                            "event_date": event.date_event,
                            "categories": ",".join(event.categories),
                            "proof_link": event.proof,
                            "source": event.source,
                            "vote_count": event.vote_count,
                            "positive_vote_count": event.positive_vote_count,
                            "percentage": event.percentage,
                            "can_occur_before": event.can_occur_before,
                            "created_at": datetime.now(timezone.utc),
                        },
                    )

        # 缓存到 Redis（供智能体快速读取）
        await _cache_events_to_redis(symbol, events)

        logger.info(
            "Calendar events stored",
            extra={"symbol": symbol, "count": len(events)},
        )
        return len(events)

    except Exception as exc:
        logger.error(
            "Failed to fetch and store calendar events",
            extra={"symbol": symbol, "error": str(exc)},
        )
        return -1


async def _cache_events_to_redis(symbol: str, events: list) -> None:
    """将事件缓存到 Redis，供智能体实时读取

    缓存键: calendar:{symbol}
    TTL: 6 小时
    """
    from app.core.redis import init_redis, set_with_ttl

    await init_redis()

    cache_key = f"calendar:{symbol}"
    data = [
        {
            "event_id": e.event_id,
            "title": e.title,
            "description": e.description,
            "event_date": e.date_event.isoformat(),
            "categories": e.categories,
            "vote_count": e.vote_count,
            "proof": e.proof,
        }
        for e in events
    ]

    await set_with_ttl(cache_key, data, ttl_seconds=21600)  # 6 小时


@celery_app.task(name="calendar_worker.collect_events")
def collect_calendar_events() -> dict:
    """定时任务：采集所有活跃币种的日历事件

    执行频率：每天凌晨 3 点
    """
    from app.core.config import settings

    # API key 缺失 → 链路不可用
    if not settings.coinmarketcal_api_key:
        asyncio.run(_set_calendar_cap("UNAVAILABLE", "COINMARKETCAL_API_KEY not configured"))
        return {}

    symbols = _fetch_active_symbols_sync()

    results = {}
    for symbol in symbols:
        try:
            count = asyncio.run(_fetch_and_store_events(symbol, days_ahead=30))
            results[symbol] = count
        except Exception as exc:
            logger.error(
                "Failed to collect calendar events",
                extra={"symbol": symbol, "error": str(exc)},
            )
            results[symbol] = -1

    total = sum(c for c in results.values() if c > 0)
    logger.info(
        "Calendar events collection completed",
        extra={"total_events": total, "symbols": len(results)},
    )

    # capability 状态：至少 1 个 symbol 链路正常 → AVAILABLE
    # count >= 0 表示链路通（含"无 upcoming events"），-1 表示异常
    pipeline_ok = any(_symbol_pipeline_ok(c) for c in results.values())
    if pipeline_ok:
        asyncio.run(_set_calendar_cap("AVAILABLE"))
    elif results:
        asyncio.run(_set_calendar_cap("UNAVAILABLE", "all symbols failed"))

    return results


@celery_app.task(name="calendar_worker.collect_high_impact_events")
def collect_high_impact_events() -> dict:
    """定时任务：采集高影响力事件（投票数 > 50）

    执行频率：每 6 小时
    """
    from app.core.config import settings
    from app.data.calendar import CoinMarketCalCollector

    if not settings.coinmarketcal_api_key:
        logger.warning("COINMARKETCAL_API_KEY not configured, skipping")
        asyncio.run(_set_calendar_cap("UNAVAILABLE", "COINMARKETCAL_API_KEY not configured"))
        return {}

    collector = CoinMarketCalCollector(settings.coinmarketcal_api_key)
    results = {}
    symbols = _fetch_active_symbols_sync()
    pipeline_ok = False
    any_failure = False

    for symbol in symbols:
        try:
            events = asyncio.run(
                collector.fetch_high_impact_events(
                    symbol, days_ahead=30, min_votes=50
                )
            )
            results[symbol] = len(events)
            pipeline_ok = True

            # 缓存高影响力事件到单独的 Redis 键
            if events:
                asyncio.run(_cache_high_impact_events(symbol, events))

        except Exception as exc:
            logger.error(
                "Failed to collect high impact events",
                extra={"symbol": symbol, "error": str(exc)},
            )
            results[symbol] = 0
            any_failure = True

    if pipeline_ok:
        asyncio.run(_set_calendar_cap("AVAILABLE"))
    elif results and any_failure:
        asyncio.run(_set_calendar_cap("UNAVAILABLE", "all symbols failed"))

    return results


async def _cache_high_impact_events(symbol: str, events: list) -> None:
    """缓存高影响力事件到 Redis

    缓存键: calendar:high_impact:{symbol}
    TTL: 6 小时
    """
    from app.core.redis import init_redis, set_with_ttl

    await init_redis()

    cache_key = f"calendar:high_impact:{symbol}"
    data = [
        {
            "event_id": e.event_id,
            "title": e.title,
            "event_date": e.date_event.isoformat(),
            "categories": e.categories,
            "vote_count": e.vote_count,
        }
        for e in events
    ]

    await set_with_ttl(cache_key, data, ttl_seconds=21600)


@celery_app.task(name="calendar_worker.cleanup_old_events")
def cleanup_old_events() -> int:
    """定时任务：清理过期事件（事件日期 < 当前日期 - 7 天）

    执行频率：每天凌晨 4 点
    """

    async def _cleanup() -> int:
        from datetime import timedelta

        cutoff_date = datetime.now(timezone.utc) - timedelta(days=7)

        async with worker_session() as session:
            async with session.begin():
                result = await session.execute(
                    text("""
                        DELETE FROM calendar_events
                        WHERE event_date < :cutoff_date
                    """),
                    {"cutoff_date": cutoff_date},
                )
                return result.rowcount

    try:
        deleted_count = asyncio.run(_cleanup())
        logger.info(
            "Old calendar events cleaned up",
            extra={"deleted_count": deleted_count},
        )
        return deleted_count
    except Exception as exc:
        logger.error("Failed to cleanup old events", extra={"error": str(exc)})
        return 0
