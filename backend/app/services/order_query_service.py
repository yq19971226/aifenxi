"""平台订单查询业务逻辑 — 分页查询、搜索、筛选。

Service 层包含业务逻辑，使用 sqlalchemy text() 参数化查询。
SQL JOIN users 获取 user_email，按 created_at DESC 排序。
搜索使用 ILIKE 模糊匹配邮箱和 payment_id。
"""

import logging
from datetime import datetime

from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)


# ── Pydantic 模型 ─────────────────────────────────────────────


class AdminOrderInfo(BaseModel):
    """单条订单信息响应模型。"""

    id: str
    payment_id: str
    user_email: str
    plan: int
    amount_usd: float
    network: str | None
    status: str
    created_at: datetime


class AdminOrderListResponse(BaseModel):
    """订单列表分页响应模型。"""

    items: list[AdminOrderInfo]
    total: int
    page: int
    page_size: int


# ── 服务函数 ──────────────────────────────────────────────────


async def query_orders(
    session: AsyncSession,
    search: str | None = None,
    status: str | None = None,
    plan: int | None = None,
    page: int = 1,
    page_size: int = 20,
) -> AdminOrderListResponse:
    """分页查询全平台订单。

    - search: ILIKE 模糊匹配 user email 和 payment_id
    - status: 精确匹配订单状态 (pending/confirmed/failed)
    - plan: 精确匹配套餐类型 (1=专业/2=旗舰)
    - page: 页码，从 1 开始
    - page_size: 每页条数
    """
    where_clauses: list[str] = []
    params: dict = {}

    if search:
        where_clauses.append(
            "(u.email ILIKE :search OR p.payment_id ILIKE :search)"
        )
        params["search"] = f"%{search}%"

    if status:
        where_clauses.append("p.status = :status")
        params["status"] = status

    if plan is not None:
        where_clauses.append("p.plan = :plan")
        params["plan"] = plan

    where_sql = ""
    if where_clauses:
        where_sql = "WHERE " + " AND ".join(where_clauses)

    # ── 查询总数 ──
    count_sql = f"""
        SELECT COUNT(*) AS total
        FROM payments p
        JOIN users u ON u.id = p.user_id
        {where_sql}
    """
    try:
        result = await session.execute(text(count_sql), params)
        total = result.scalar() or 0
    except Exception as exc:
        logger.error("query_orders count error: %s", exc)
        raise

    # ── 查询分页数据 ──
    offset = (page - 1) * page_size
    params["page_size"] = page_size
    params["offset"] = offset

    data_sql = f"""
        SELECT p.id, p.payment_id, u.email AS user_email, p.plan,
               p.amount_usd, p.network, p.status, p.created_at
        FROM payments p
        JOIN users u ON u.id = p.user_id
        {where_sql}
        ORDER BY p.created_at DESC
        LIMIT :page_size OFFSET :offset
    """
    try:
        result = await session.execute(text(data_sql), params)
        rows = result.mappings().all()
    except Exception as exc:
        logger.error("query_orders data error: %s", exc)
        raise

    items = [
        AdminOrderInfo(
            id=str(row["id"]),
            payment_id=row["payment_id"],
            user_email=row["user_email"],
            plan=row["plan"],
            amount_usd=float(row["amount_usd"]),
            network=row["network"],
            status=row["status"],
            created_at=row["created_at"],
        )
        for row in rows
    ]

    return AdminOrderListResponse(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
    )
