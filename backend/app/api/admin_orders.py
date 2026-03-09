"""平台订单查询 API 路由 — 分页查询全平台订单。

路由层只做参数校验和响应格式化，业务逻辑委托 order_query_service。
端点需要 admin 或 operator 角色权限。
"""

import logging

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import UserInfo, require_admin, require_operator_or_admin
from app.services.payment import reconcile_payment_status
from app.services.order_query_service import (
    AdminOrderListResponse,
    query_orders,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/admin", tags=["admin-orders"])


# ── 路由 ──────────────────────────────────────────────────────


@router.get("/orders", response_model=AdminOrderListResponse)
async def list_orders_route(
    search: str | None = Query(None, description="邮箱/订单ID模糊搜索"),
    status: str | None = Query(None, description="订单状态: pending/confirmed/failed"),
    plan: int | None = Query(None, description="套餐类型: 1=专业 / 2=旗舰"),
    page: int = Query(1, ge=1, description="页码"),
    page_size: int = Query(20, ge=10, le=50, description="每页条数"),
    user: UserInfo = Depends(require_operator_or_admin),
    session: AsyncSession = Depends(get_db),
) -> AdminOrderListResponse:
    """分页查询全平台订单。"""
    try:
        return await query_orders(
            session,
            search=search,
            status=status,
            plan=plan,
            page=page,
            page_size=page_size,
        )
    except Exception as exc:
        logger.error("list_orders_route error: %s", exc)
        raise HTTPException(status_code=500, detail="查询订单失败")


@router.post("/orders/{payment_id}/sync")
async def sync_order_route(
    payment_id: str,
    user: UserInfo = Depends(require_admin),
    session: AsyncSession = Depends(get_db),
) -> dict[str, str]:
    try:
        await reconcile_payment_status(session, payment_id)
        return {"status": "ok"}
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc))
    except Exception as exc:
        logger.error("sync_order_route error: %s", exc)
        raise HTTPException(status_code=500, detail="同步订单状态失败")
