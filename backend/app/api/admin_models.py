"""管理员模型分配 API — 动态设置智能体使用的 AI 模型。"""

import logging
from typing import Any

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.core.deps import require_admin
from app.core.model_router import (
    AVAILABLE_MODELS,
    ALL_MODEL_NAMES,
    get_all_assignments,
    set_model_for_agent,
    invalidate_cache,
)

logger = logging.getLogger(__name__)

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


# ── DMXAPI 实时模型同步 ──────────────────────────────────────

_DMXAPI_CACHE_TTL = 600  # 10 分钟缓存
_DMXAPI_CACHE_KEY = "dmxapi:model_list"


async def _fetch_dmxapi_models() -> list[str]:
    """从 DMXAPI 网关拉取当前可用模型 ID 列表，结果缓存到 Redis。"""
    from app.core.redis import get_json, set_with_ttl

    # 先查 Redis 缓存
    cached = await get_json(_DMXAPI_CACHE_KEY)
    if cached and isinstance(cached, list):
        return cached

    # 从 ConfigService 获取 API 配置
    from app.services.config_service import get_config_value
    api_key = await get_config_value("dmx_api_key", "")
    base_url = await get_config_value("dmx_base_url", "https://www.dmxapi.cn/v1")

    if not api_key:
        raise HTTPException(status_code=500, detail="DMXAPI 密钥未配置")

    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.get(
                f"{base_url}/models",
                headers={"Authorization": f"Bearer {api_key}"},
            )
            resp.raise_for_status()
            data = resp.json()
            model_ids = [m["id"] for m in data.get("data", []) if "id" in m]

            # 缓存到 Redis
            await set_with_ttl(_DMXAPI_CACHE_KEY, model_ids, ttl_seconds=_DMXAPI_CACHE_TTL)
            logger.info("Fetched DMXAPI model list", extra={"count": len(model_ids)})
            return model_ids
    except httpx.HTTPStatusError as exc:
        logger.error("DMXAPI models request failed", extra={"status": exc.response.status_code})
        raise HTTPException(status_code=502, detail=f"DMXAPI 请求失败: HTTP {exc.response.status_code}")
    except Exception as exc:
        logger.error("DMXAPI models fetch error", extra={"error": str(exc)})
        raise HTTPException(status_code=502, detail=f"DMXAPI 连接失败: {exc}")


@router.get("/dmxapi-sync")
async def dmxapi_sync(_=Depends(require_admin)):
    """从 DMXAPI 实时拉取模型列表，对比系统配置的模型可用性。"""
    dmxapi_models = await _fetch_dmxapi_models()
    dmxapi_set = set(dmxapi_models)

    # 对比系统中使用的每个模型
    sync_results: list[dict[str, Any]] = []
    for model in AVAILABLE_MODELS:
        model_key = model["model_key"]
        model_name = model["model_name"]
        is_available = model_name in dmxapi_set

        # 如果不可用，尝试查找相似替代
        suggestions: list[str] = []
        if not is_available:
            # 按前缀匹配查找类似模型
            prefix = model_name.split("-")[0]  # e.g. "grok", "claude", "deepseek"
            suggestions = sorted([
                m for m in dmxapi_models
                if m.lower().startswith(prefix.lower()) and "chat" not in m.lower()
            ])[:8]  # 最多返回 8 个建议

        sync_results.append({
            "model_key": model_key,
            "model_name": model_name,
            "display_name": model["display_name"],
            "available": is_available,
            "suggestions": suggestions,
        })

    # 统计
    available_count = sum(1 for r in sync_results if r["available"])
    total = len(sync_results)

    return {
        "dmxapi_total_models": len(dmxapi_models),
        "system_total": total,
        "system_available": available_count,
        "system_unavailable": total - available_count,
        "results": sync_results,
    }


@router.post("/dmxapi-sync/refresh")
async def dmxapi_sync_refresh(_=Depends(require_admin)):
    """强制刷新 DMXAPI 模型缓存。"""
    from app.core.redis import get_redis_pool
    redis = get_redis_pool()
    await redis.delete(_DMXAPI_CACHE_KEY)
    return await dmxapi_sync(_)
