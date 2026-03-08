"""剧本演练 API 路由 — 剧本匹配推演 + 广场 + 统计。"""

import logging

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import bindparam, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from pydantic import BaseModel

from app.core.deps import UserInfo, get_current_user, require_admin
from app.core.sql_compat import cast_int, count_filter, avg_filter
from starlette.responses import StreamingResponse

from app.services.playbook_sim_service import simulate, simulate_stream, save_prediction
from app.services.subscription import get_membership

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/playbook-sim", tags=["playbook-sim"])
admin_router = APIRouter(prefix="/api/admin/playbook-sim", tags=["admin-playbook-sim"])


@router.get("/simulate/{symbol}")
async def playbook_simulate(
    symbol: str,
    user: UserInfo = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> dict:
    """剧本演练 — 匹配剧本 + LLM推演。"""
    if user.is_admin:
        user_level = 2
    else:
        try:
            membership = await get_membership(session, str(user.id))
            user_level = membership.level
        except Exception:
            user_level = 0

    try:
        result = await simulate(symbol, user_level=user_level)

        # 持久化（D5）
        if not result.get("error") and not result.get("is_masked"):
            try:
                await save_prediction(session, symbol.upper(), result)
            except Exception as exc:
                logger.warning("持久化剧本预测失败: %s", exc)

        return result
    except Exception as exc:
        logger.error("剧本演练失败: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="剧本演练失败",
        )


@router.get("/simulate/{symbol}/stream")
async def playbook_simulate_stream(
    symbol: str,
    user: UserInfo = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> StreamingResponse:
    """剧本演练 SSE 流式接口 — 逐步推送 L1~L5 进度和结果。"""
    if user.is_admin:
        user_level = 2
    else:
        try:
            membership = await get_membership(session, str(user.id))
            user_level = membership.level
        except Exception:
            user_level = 0

    return StreamingResponse(
        simulate_stream(symbol, user_level=user_level),
        media_type="text/event-stream",
    )


# ── 剧本广场 (D6) ────────────────────────────────────────────


@router.get("/plaza/feed")
async def plaza_feed(
    symbol: str | None = Query(None),
    playbook: str | None = Query(None),
    status_filter: str | None = Query(None, alias="status"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    user: UserInfo = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> dict:
    """剧本广场 — 分页列表。"""
    if user.is_admin:
        user_level = 2
    else:
        try:
            membership = await get_membership(session, str(user.id))
            user_level = membership.level
        except Exception:
            user_level = 0

    # 防线3: 广场只展示已发布（质量达标）的预测
    conditions = ["published = TRUE"]
    params: dict = {"limit": page_size, "offset": (page - 1) * page_size}

    if symbol:
        conditions.append("symbol = :symbol")
        params["symbol"] = symbol.upper()
    if playbook:
        conditions.append("playbook_name = :playbook")
        params["playbook"] = playbook
    _VALID_STATUSES = {"active", "completed", "failed", "expired"}
    if status_filter:
        if status_filter not in _VALID_STATUSES:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"无效的状态筛选: {status_filter}，允许值: {', '.join(sorted(_VALID_STATUSES))}",
            )
        conditions.append("status = :status")
        params["status"] = status_filter

    where = " AND ".join(conditions)

    try:
        # 获取总数
        count_result = await session.execute(
            text(f"SELECT {cast_int('COUNT(*)')} AS cnt FROM playbook_predictions WHERE {where}"),
            params,
        )
        total = count_result.scalar() or 0

        # 获取列表
        result = await session.execute(
            text(f"""
                SELECT id, symbol, playbook_name, match_pct, current_stage_idx,
                       stages_json, status, final_accuracy, verified_stages,
                       created_at, signal, snapshot_price, stage_entry_price,
                       failure_reason, risk_flag, risk_note
                FROM playbook_predictions
                WHERE {where}
                ORDER BY created_at DESC
                LIMIT :limit OFFSET :offset
            """),
            params,
        )
        rows = result.mappings().all()

        items = []
        for row in rows:
            item: dict = {
                "id": str(row["id"]),
                "symbol": row["symbol"],
                "playbook_name": row["playbook_name"],
                "match_pct": float(row["match_pct"]) if row["match_pct"] else 0,
                "status": row["status"],
                "created_at": (row["created_at"].isoformat() if hasattr(row["created_at"], "isoformat") else str(row["created_at"])) if row["created_at"] else None,
            }

            # 免费用户只能看标题+匹配度
            if user_level >= 1:
                import json as _json
                item["current_stage_idx"] = row["current_stage_idx"]
                item["final_accuracy"] = float(row["final_accuracy"]) if row["final_accuracy"] else None
                item["verified_stages"] = row["verified_stages"]
                item["signal"] = row["signal"] or "neutral"
                item["snapshot_price"] = float(row["snapshot_price"]) if row["snapshot_price"] else None
                item["stage_entry_price"] = float(row["stage_entry_price"]) if row["stage_entry_price"] else None
                item["failure_reason"] = row["failure_reason"]
                item["risk_flag"] = bool(row["risk_flag"]) if row["risk_flag"] is not None else False
                item["risk_note"] = row["risk_note"]
                try:
                    item["stages"] = _json.loads(row["stages_json"]) if row["stages_json"] else []
                except Exception:
                    item["stages"] = []
            else:
                item["current_stage_idx"] = None
                item["final_accuracy"] = None
                item["stages"] = None

            items.append(item)

        return {
            "items": items,
            "total": total,
            "page": page,
            "page_size": page_size,
        }
    except Exception as exc:
        logger.error("剧本广场查询失败: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="剧本广场查询失败",
        )


@router.get("/plaza/stats")
async def plaza_stats(
    user: UserInfo = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> dict:
    """剧本广场统计 — 总预测数/准确率/热门剧本。"""
    _ci = cast_int
    _cf = count_filter
    _af = avg_filter
    try:
        result = await session.execute(text(f"""
            SELECT
                {_ci('COUNT(*)')} AS total_predictions,
                {_ci(_cf("status = 'active'"))} AS active_count,
                {_ci(_cf("status = 'completed'"))} AS completed_count,
                COALESCE({_af('final_accuracy', "status = 'completed'")}, 0) AS avg_accuracy
            FROM playbook_predictions
            WHERE published = TRUE
        """))
        row = result.mappings().first()

        # 热门剧本排名
        top_result = await session.execute(text(f"""
            SELECT playbook_name, {_ci('COUNT(*)')} AS cnt,
                   COALESCE({_af('final_accuracy', "status = 'completed'")}, 0) AS avg_acc
            FROM playbook_predictions
            WHERE published = TRUE
            GROUP BY playbook_name
            ORDER BY cnt DESC
            LIMIT 10
        """))
        top_rows = top_result.mappings().all()

        return {
            "total_predictions": row["total_predictions"] if row else 0,
            "active_count": row["active_count"] if row else 0,
            "completed_count": row["completed_count"] if row else 0,
            "avg_accuracy": round(float(row["avg_accuracy"]), 4) if row else 0,
            "top_playbooks": [
                {
                    "name": r["playbook_name"],
                    "count": r["cnt"],
                    "avg_accuracy": round(float(r["avg_acc"]), 4),
                }
                for r in top_rows
            ],
        }
    except Exception as exc:
        logger.error("剧本广场统计失败: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="剧本广场统计失败",
        )


# ── 管理后台：剧本广场审核 ───────────────────────────────────


class PublishToggleRequest(BaseModel):
    published: bool


@admin_router.get("/predictions")
async def admin_list_predictions(
    symbol: str | None = Query(None),
    playbook: str | None = Query(None),
    published: bool | None = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    _admin: UserInfo = Depends(require_admin),
    session: AsyncSession = Depends(get_db),
) -> dict:
    """管理员查看所有预测（含未发布）。"""
    conditions = ["1=1"]
    params: dict = {"limit": page_size, "offset": (page - 1) * page_size}

    if symbol:
        conditions.append("symbol = :symbol")
        params["symbol"] = symbol.upper()
    if playbook:
        conditions.append("playbook_name = :playbook")
        params["playbook"] = playbook
    if published is not None:
        conditions.append("published = :published")
        params["published"] = published

    where = " AND ".join(conditions)

    try:
        count_result = await session.execute(
            text(f"SELECT {cast_int('COUNT(*)')} AS cnt FROM playbook_predictions WHERE {where}"),
            params,
        )
        total = count_result.scalar() or 0

        result = await session.execute(
            text(f"""
                SELECT id, symbol, playbook_name, match_pct, current_stage_idx,
                       stages_json, status, final_accuracy, verified_stages,
                       published, created_at
                FROM playbook_predictions
                WHERE {where}
                ORDER BY created_at DESC
                LIMIT :limit OFFSET :offset
            """),
            params,
        )
        rows = result.mappings().all()

        import json as _json
        items = []
        for row in rows:
            items.append({
                "id": str(row["id"]),
                "symbol": row["symbol"],
                "playbook_name": row["playbook_name"],
                "match_pct": float(row["match_pct"]) if row["match_pct"] else 0,
                "current_stage_idx": row["current_stage_idx"],
                "status": row["status"],
                "published": row["published"],
                "final_accuracy": float(row["final_accuracy"]) if row["final_accuracy"] else None,
                "verified_stages": row["verified_stages"],
                "stages": _json.loads(row["stages_json"]) if row["stages_json"] else [],
                "created_at": (row["created_at"].isoformat() if hasattr(row["created_at"], "isoformat") else str(row["created_at"])) if row["created_at"] else None,
            })

        return {"items": items, "total": total, "page": page, "page_size": page_size}
    except Exception as exc:
        logger.error("管理员查询预测失败: %s", exc)
        raise HTTPException(status_code=500, detail="查询失败")


@admin_router.put("/predictions/{prediction_id}/publish")
async def admin_toggle_publish(
    prediction_id: int,
    body: PublishToggleRequest,
    _admin: UserInfo = Depends(require_admin),
    session: AsyncSession = Depends(get_db),
) -> dict:
    """管理员手动发布/下架预测。"""
    try:
        current = await session.execute(
            text("""
                SELECT id, symbol, playbook_name, match_pct, published
                FROM playbook_predictions
                WHERE id = :id
                LIMIT 1
            """),
            {"id": prediction_id},
        )
        row = current.mappings().first()
        if not row:
            raise HTTPException(status_code=404, detail="预测记录不存在")

        await session.execute(
            text("""
                UPDATE playbook_predictions
                SET published = :published
                WHERE id = :id
            """),
            {"id": prediction_id, "published": body.published},
        )
        await session.flush()
        action = "发布" if body.published else "下架"
        logger.info(
            "管理员%s预测: id=%s %s %s",
            action, prediction_id, row["symbol"], row["playbook_name"],
        )
        return {
            "id": str(row["id"]),
            "symbol": row["symbol"],
            "playbook_name": row["playbook_name"],
            "match_pct": float(row["match_pct"] or 0),
            "published": body.published,
            "message": f"已{action}",
        }
    except HTTPException:
        raise
    except Exception as exc:
        await session.rollback()
        logger.error("切换发布状态失败: %s", exc)
        raise HTTPException(status_code=500, detail="操作失败")


@admin_router.delete("/predictions/{prediction_id}")
async def admin_delete_prediction(
    prediction_id: int,
    _admin: UserInfo = Depends(require_admin),
    session: AsyncSession = Depends(get_db),
) -> dict:
    """管理员删除预测记录。"""
    try:
        exists = await session.execute(
            text("SELECT id FROM playbook_predictions WHERE id = :id LIMIT 1"),
            {"id": prediction_id},
        )
        row = exists.first()
        if not row:
            raise HTTPException(status_code=404, detail="预测记录不存在")

        await session.execute(
            text("DELETE FROM playbook_predictions WHERE id = :id"),
            {"id": prediction_id},
        )
        await session.flush()
        return {"message": "已删除", "id": str(prediction_id)}
    except HTTPException:
        raise
    except Exception as exc:
        await session.rollback()
        logger.error("删除预测失败: %s", exc)
        raise HTTPException(status_code=500, detail="删除失败")


@admin_router.post("/predictions/batch-publish")
async def admin_batch_publish(
    ids: list[int],
    _admin: UserInfo = Depends(require_admin),
    session: AsyncSession = Depends(get_db),
) -> dict:
    """管理员批量发布预测。"""
    if not ids:
        raise HTTPException(status_code=400, detail="ID 列表不能为空")
    try:
        stmt = text("""
            UPDATE playbook_predictions
            SET published = TRUE
            WHERE id IN :ids
        """).bindparams(bindparam("ids", expanding=True))
        result = await session.execute(
            stmt,
            {"ids": ids},
        )
        await session.flush()
        updated = int(result.rowcount or 0)
        return {"message": f"已批量发布 {updated} 条记录", "count": updated}
    except Exception as exc:
        await session.rollback()
        logger.error("批量发布失败: %s", exc)
        raise HTTPException(status_code=500, detail="批量发布失败")
