"""管理员模型分配 API — 动态设置智能体使用的 AI 模型。"""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.core.deps import require_admin
from app.core.model_router import (
    AVAILABLE_MODELS,
    get_all_assignments,
    set_model_for_agent,
    invalidate_cache,
)

router = APIRouter(prefix="/api/admin/models", tags=["admin-models"])


# ── 请求模型 ──────────────────────────────────────────────────


class UpdateAssignmentRequest(BaseModel):
    model_key: str


class BatchUpdateRequest(BaseModel):
    assignments: dict[str, str]  # {agent_id: model_key}


# ── 端点 ──────────────────────────────────────────────────────


@router.get("/available")
async def list_available_models(_=Depends(require_admin)):
    """列出所有可用的 AI 模型（供下拉选择）。"""
    return {"models": AVAILABLE_MODELS}


@router.get("/assignments")
async def list_assignments(_=Depends(require_admin)):
    """列出所有智能体的当前模型分配。"""
    assignments = await get_all_assignments()
    return {"assignments": assignments}


@router.put("/assignments/{agent_id}")
async def update_assignment(
    agent_id: str,
    body: UpdateAssignmentRequest,
    _=Depends(require_admin),
):
    """更新单个智能体的模型分配。"""
    ok = await set_model_for_agent(agent_id, body.model_key)
    if not ok:
        raise HTTPException(status_code=400, detail="无效的智能体 ID 或模型 Key")
    return {"ok": True, "agent_id": agent_id, "model_key": body.model_key}


@router.put("/assignments")
async def batch_update_assignments(
    body: BatchUpdateRequest,
    _=Depends(require_admin),
):
    """批量更新模型分配。"""
    results = []
    for agent_id, model_key in body.assignments.items():
        ok = await set_model_for_agent(agent_id, model_key)
        results.append({"agent_id": agent_id, "model_key": model_key, "ok": ok})
    return {"results": results}


@router.post("/reset/{agent_id}")
async def reset_assignment(agent_id: str, _=Depends(require_admin)):
    """重置单个智能体的模型分配为默认值。"""
    from app.core.model_router import DEFAULT_ROUTES
    default_key = DEFAULT_ROUTES.get(agent_id)
    if not default_key:
        raise HTTPException(status_code=400, detail="无效的智能体 ID")
    ok = await set_model_for_agent(agent_id, default_key)
    if not ok:
        raise HTTPException(status_code=500, detail="重置失败")
    return {"ok": True, "agent_id": agent_id, "model_key": default_key}


@router.post("/reset")
async def reset_all_assignments(_=Depends(require_admin)):
    """重置所有智能体的模型分配为默认值。"""
    from app.core.model_router import DEFAULT_ROUTES
    results = []
    for agent_id, default_key in DEFAULT_ROUTES.items():
        ok = await set_model_for_agent(agent_id, default_key)
        results.append({"agent_id": agent_id, "model_key": default_key, "ok": ok})
    invalidate_cache()
    return {"results": results}
