"""通知历史记录业务逻辑 — 写入日志、分页查询。

Service 层包含业务逻辑，使用 sqlalchemy text() 参数化查询。
"""

import logging
from datetime import datetime

from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)


# ── Pydantic 模型 ─────────────────────────────────────────────


class NotificationLogInfo(BaseModel):
    """通知日志响应模型。"""

    id: str
    user_email: str | None
    recipient: str
    channel: str
    event_type: str
    subject: str | None
    status: str
    error_message: str | None
    created_at: datetime


class NotificationLogListResponse(BaseModel):
    """通知日志分页响应模型。"""

    items: list[NotificationLogInfo]
    total: int
    page: int
    page_size: int


# ── 写入函数 ──────────────────────────────────────────────────


async def record_notification(
    session: AsyncSession,
    *,
    user_id: str | None,
    recipient: str,
    channel: str,
    event_type: str,
    subject: str | None = None,
    status: str = "sent",
    error_message: str | None = None,
) -> None:
    """写入一条通知日志记录。"""
    try:
        await session.execute(
            text(
                """
                INSERT INTO notification_log
                    (user_id, recipient, channel, event_type, subject, status, error_message)
                VALUES
                    (:user_id, :recipient, :channel, :event_type, :subject, :status, :error_message)
                """
            ),
            {
                "user_id": user_id,
                "recipient": recipient,
                "channel": channel,
                "event_type": event_type,
                "subject": subject,
                "status": status,
                "error_message": error_message,
            },
        )
        await session.flush()
    except Exception as exc:
        logger.error("record_notification DB error: %s", exc)


async def record_notification_standalone(
    *,
    user_id: str | None,
    recipient: str,
    channel: str,
    event_type: str,
    subject: str | None = None,
    status: str = "sent",
    error_message: str | None = None,
) -> None:
    """独立写入通知日志（自带 session，供 worker 使用）。"""
    from app.core.database import AsyncSessionLocal

    try:
        async with AsyncSessionLocal() as session:
            await session.execute(
                text(
                    """
                    INSERT INTO notification_log
                        (user_id, recipient, channel, event_type, subject, status, error_message)
                    VALUES
                        (:user_id, :recipient, :channel, :event_type, :subject, :status, :error_message)
                    """
                ),
                {
                    "user_id": user_id,
                    "recipient": recipient,
                    "channel": channel,
                    "event_type": event_type,
                    "subject": subject,
                    "status": status,
                    "error_message": error_message,
                },
            )
            await session.commit()
    except Exception as exc:
        logger.error("record_notification_standalone DB error: %s", exc)


# ── 查询函数 ──────────────────────────────────────────────────


async def query_notifications(
    session: AsyncSession,
    search: str | None = None,
    channel: str | None = None,
    status: str | None = None,
    page: int = 1,
    page_size: int = 20,
) -> NotificationLogListResponse:
    """分页查询通知历史。

    - search: ILIKE 模糊匹配 recipient 或 subject
    - channel: 精确匹配渠道 (email/telegram)
    - status: 精确匹配状态 (sent/failed)
    """
    where_clauses: list[str] = []
    params: dict = {}

    if search:
        where_clauses.append(
            "(n.recipient ILIKE :search OR n.subject ILIKE :search)"
        )
        params["search"] = f"%{search}%"

    if channel:
        where_clauses.append("n.channel = :channel")
        params["channel"] = channel

    if status:
        where_clauses.append("n.status = :status")
        params["status"] = status

    where_sql = ""
    if where_clauses:
        where_sql = "WHERE " + " AND ".join(where_clauses)

    count_sql = f"""
        SELECT COUNT(*) AS total
        FROM notification_log n
        {where_sql}
    """
    try:
        result = await session.execute(text(count_sql), params)
        total = result.scalar() or 0
    except Exception as exc:
        logger.error("query_notifications count error: %s", exc)
        raise

    offset = (page - 1) * page_size
    params["page_size"] = page_size
    params["offset"] = offset

    data_sql = f"""
        SELECT n.id, u.email AS user_email, n.recipient, n.channel,
               n.event_type, n.subject, n.status, n.error_message, n.created_at
        FROM notification_log n
        LEFT JOIN users u ON u.id = n.user_id
        {where_sql}
        ORDER BY n.created_at DESC
        LIMIT :page_size OFFSET :offset
    """
    try:
        result = await session.execute(text(data_sql), params)
        rows = result.mappings().all()
    except Exception as exc:
        logger.error("query_notifications data error: %s", exc)
        raise

    items = [
        NotificationLogInfo(
            id=str(row["id"]),
            user_email=row["user_email"],
            recipient=row["recipient"],
            channel=row["channel"],
            event_type=row["event_type"],
            subject=row["subject"],
            status=row["status"],
            error_message=row["error_message"],
            created_at=row["created_at"],
        )
        for row in rows
    ]

    return NotificationLogListResponse(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
    )
