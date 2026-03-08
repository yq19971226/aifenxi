"""日历事件 API 路由 — 查询和管理币圈日历事件。

端点：
- GET /api/calendar/events              — 获取事件列表
- GET /api/calendar/events/upcoming     — 获取即将到来的事件
- GET /api/calendar/events/high-impact  — 获取高影响力事件
- POST /api/calendar/sync               — 手动触发同步（管理员）
"""

import logging
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import UserInfo, get_current_user, require_admin

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/calendar", tags=["calendar"])


@router.get("/events")
async def get_calendar_events(
    symbol: str = Query(..., min_length=1, max_length=20, description="交易对"),
    days_ahead: int = Query(30, ge=1, le=90, description="未来天数"),
    min_votes: int = Query(0, ge=0, description="最小投票数筛选"),
    session: AsyncSession = Depends(get_db),
    _user: UserInfo = Depends(get_current_user),
) -> dict:
    """获取指定币种的日历事件列表"""
    try:
        now = datetime.now(timezone.utc)
        end = now + timedelta(days=days_ahead)

        result = await session.execute(
            text("""
                SELECT event_id, title, description, event_date,
                       categories, proof_link, source, vote_count,
                       positive_vote_count, percentage
                FROM calendar_events
                WHERE symbol = :symbol
                  AND event_date BETWEEN :start AND :end
                  AND vote_count >= :min_votes
                ORDER BY event_date ASC
            """),
            {"symbol": symbol.upper(), "start": now, "end": end, "min_votes": min_votes},
        )

        events = []
        for row in result.fetchall():
            events.append({
                "event_id": row[0],
                "title": row[1],
                "description": row[2],
                "event_date": row[3].isoformat(),
                "categories": row[4].split(",") if row[4] else [],
                "proof_link": row[5],
                "source": row[6],
                "vote_count": row[7],
                "positive_vote_count": row[8],
                "percentage": row[9],
            })

        return {
            "symbol": symbol.upper(),
            "events": events,
            "total_count": len(events),
            "date_range": {
                "start": now.isoformat(),
                "end": end.isoformat(),
            },
        }

    except Exception as exc:
        logger.error("Failed to get calendar events", extra={"error": str(exc)})
        raise HTTPException(status_code=500, detail="查询日历事件失败")


@router.get("/events/upcoming")
async def get_upcoming_events(
    symbol: str = Query(..., min_length=1, max_length=20, description="交易对"),
    days: int = Query(7, ge=1, le=30, description="未来天数"),
    session: AsyncSession = Depends(get_db),
    _user: UserInfo = Depends(get_current_user),
) -> dict:
    """获取即将到来的事件（未来 N 天）"""
    try:
        now = datetime.now(timezone.utc)
        end = now + timedelta(days=days)

        result = await session.execute(
            text("""
                SELECT event_id, title, event_date, categories, vote_count
                FROM calendar_events
                WHERE symbol = :symbol
                  AND event_date BETWEEN :start AND :end
                ORDER BY event_date ASC
                LIMIT 10
            """),
            {"symbol": symbol.upper(), "start": now, "end": end},
        )

        events = []
        for row in result.fetchall():
            event_date = row[2]
            days_to_event = (event_date - now).days

            events.append({
                "event_id": row[0],
                "title": row[1],
                "event_date": event_date.isoformat(),
                "days_to_event": days_to_event,
                "categories": row[3].split(",") if row[3] else [],
                "vote_count": row[4],
            })

        return {
            "symbol": symbol.upper(),
            "upcoming_events": events,
            "count": len(events),
        }

    except Exception as exc:
        logger.error("Failed to get upcoming events", extra={"error": str(exc)})
        raise HTTPException(status_code=500, detail="查询即将到来的事件失败")


@router.get("/events/high-impact")
async def get_high_impact_events(
    symbol: str = Query(..., min_length=1, max_length=20, description="交易对"),
    min_votes: int = Query(50, ge=10, description="最小投票数阈值"),
    days_ahead: int = Query(30, ge=1, le=90, description="未来天数"),
    session: AsyncSession = Depends(get_db),
    _user: UserInfo = Depends(get_current_user),
) -> dict:
    """获取高影响力事件（投票数 > 阈值）"""
    try:
        now = datetime.now(timezone.utc)
        end = now + timedelta(days=days_ahead)

        result = await session.execute(
            text("""
                SELECT event_id, title, event_date, categories, 
                       vote_count, proof_link
                FROM calendar_events
                WHERE symbol = :symbol
                  AND event_date BETWEEN :start AND :end
                  AND vote_count >= :min_votes
                ORDER BY vote_count DESC, event_date ASC
            """),
            {"symbol": symbol.upper(), "start": now, "end": end, "min_votes": min_votes},
        )

        events = []
        for row in result.fetchall():
            events.append({
                "event_id": row[0],
                "title": row[1],
                "event_date": row[2].isoformat(),
                "categories": row[3].split(",") if row[3] else [],
                "vote_count": row[4],
                "has_proof": bool(row[5]),
            })

        return {
            "symbol": symbol.upper(),
            "high_impact_events": events,
            "count": len(events),
            "min_votes_threshold": min_votes,
        }

    except Exception as exc:
        logger.error("Failed to get high impact events", extra={"error": str(exc)})
        raise HTTPException(status_code=500, detail="查询高影响力事件失败")


@router.post("/sync")
async def sync_calendar_events(
    symbol: str = Query(..., min_length=1, max_length=20, description="交易对"),
    _admin: UserInfo = Depends(require_admin),
) -> dict:
    """手动触发日历事件同步（管理员）"""
    try:
        from app.core.config import settings
        from app.data.calendar import CoinMarketCalCollector

        if not settings.coinmarketcal_api_key:
            raise HTTPException(
                status_code=503,
                detail="CoinMarketCal API Key 未配置",
            )

        collector = CoinMarketCalCollector(settings.coinmarketcal_api_key)
        events = await collector.fetch_upcoming_events(symbol.upper(), days_ahead=30)

        logger.info(
            "Manual calendar sync triggered",
            extra={"symbol": symbol, "events_count": len(events), "admin": _admin.email},
        )

        return {
            "success": True,
            "symbol": symbol.upper(),
            "events_synced": len(events),
            "message": f"成功同步 {len(events)} 个事件",
        }

    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Failed to sync calendar events", extra={"error": str(exc)})
        raise HTTPException(status_code=500, detail=f"同步失败: {str(exc)}")
