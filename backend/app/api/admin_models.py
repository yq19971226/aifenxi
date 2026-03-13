"""管理员模型分配 API — 动态设置智能体使用的 AI 模型。"""

import logging
from typing import Any

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.core.deps import require_admin
from app.core.model_router import (
    AVAILABLE_MODELS,
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


# ── 动态模型增删 ─────────────────────────────────────────────


class AddModelRequest(BaseModel):
    model_key: str
    model_name: str
    display_name: str
    description: str = ""
    pricing_input: float = 0.001
    pricing_output: float = 0.004
    strengths: list[str] = []


class RemoveModelRequest(BaseModel):
    model_key: str


@router.post("/add-model")
async def add_model(body: AddModelRequest, _=Depends(require_admin)):
    """动态添加一个新模型（从 DMXAPI 可用列表中选择后添加）。"""
    from app.core.model_router import AVAILABLE_MODELS, ALL_MODEL_NAMES
    from app.core.llm_client import MODELS, MODEL_PRICING

    # 检查 model_key 是否已存在
    if body.model_key in ALL_MODEL_NAMES:
        raise HTTPException(status_code=400, detail=f"model_key '{body.model_key}' 已存在")

    # 添加到 AVAILABLE_MODELS
    new_model = {
        "model_key": body.model_key,
        "model_name": body.model_name,
        "display_name": body.display_name,
        "description": body.description,
        "pricing": {"input": body.pricing_input, "output": body.pricing_output},
        "strengths": body.strengths,
    }
    AVAILABLE_MODELS.append(new_model)
    ALL_MODEL_NAMES[body.model_key] = body.model_name

    # 同步到 llm_client 的 MODELS 映射
    MODELS[body.model_key] = body.model_name
    MODEL_PRICING[body.model_name] = (body.pricing_input, body.pricing_output)

    logger.info("Model added dynamically", extra={
        "model_key": body.model_key,
        "model_name": body.model_name,
    })

    return {"ok": True, "message": f"模型 {body.display_name} 已添加", "model": new_model}


@router.delete("/remove-model/{model_key}")
async def remove_model(model_key: str, _=Depends(require_admin)):
    """删除一个旧模型（不能删除正在被智能体使用的模型）。"""
    from app.core.model_router import AVAILABLE_MODELS, ALL_MODEL_NAMES, DEFAULT_ROUTES
    from app.core.llm_client import MODELS

    # 检查是否被默认路由使用
    agent_using = [aid for aid, mk in DEFAULT_ROUTES.items() if mk == model_key]
    # 检查是否被自定义路由使用
    assignments = await get_all_assignments()
    custom_using = [a["agent_id"] for a in assignments if a["current_model_key"] == model_key]

    if custom_using:
        raise HTTPException(
            status_code=400,
            detail=f"模型 '{model_key}' 正被以下智能体使用: {', '.join(custom_using)}，请先切换后再删除",
        )

    if model_key not in ALL_MODEL_NAMES:
        raise HTTPException(status_code=404, detail=f"模型 '{model_key}' 不存在")

    # 从列表中移除
    model_name = ALL_MODEL_NAMES.pop(model_key, None)
    AVAILABLE_MODELS[:] = [m for m in AVAILABLE_MODELS if m["model_key"] != model_key]
    MODELS.pop(model_key, None)

    logger.info("Model removed", extra={"model_key": model_key, "model_name": model_name})

    return {
        "ok": True,
        "message": f"模型 {model_key} 已删除",
        "warning": f"注意: 以下智能体的默认值使用此模型: {agent_using}" if agent_using else None,
    }


@router.put("/update-model/{model_key}")
async def update_model_name(
    model_key: str,
    body: AddModelRequest,
    _=Depends(require_admin),
):
    """更新已有模型的 model_name（用于切换到 DMXAPI 的新版本模型）。"""
    from app.core.model_router import AVAILABLE_MODELS, ALL_MODEL_NAMES
    from app.core.llm_client import MODELS, MODEL_PRICING

    if model_key not in ALL_MODEL_NAMES:
        raise HTTPException(status_code=404, detail=f"模型 '{model_key}' 不存在")

    # 更新 ALL_MODEL_NAMES
    old_name = ALL_MODEL_NAMES[model_key]
    ALL_MODEL_NAMES[model_key] = body.model_name

    # 更新 AVAILABLE_MODELS
    for m in AVAILABLE_MODELS:
        if m["model_key"] == model_key:
            m["model_name"] = body.model_name
            m["display_name"] = body.display_name
            if body.description:
                m["description"] = body.description
            m["pricing"] = {"input": body.pricing_input, "output": body.pricing_output}
            if body.strengths:
                m["strengths"] = body.strengths
            break

    # 同步 llm_client
    MODELS[model_key] = body.model_name
    MODEL_PRICING[body.model_name] = (body.pricing_input, body.pricing_output)

    logger.info("Model updated", extra={
        "model_key": model_key,
        "old_name": old_name,
        "new_name": body.model_name,
    })

    return {"ok": True, "message": f"模型 {model_key} 已更新: {old_name} → {body.model_name}"}


# ══════════════════════════════════════════════════════════════
# VPD 多因子权重管理
# ══════════════════════════════════════════════════════════════


_FACTOR_DESCRIPTIONS: dict[str, dict[str, str]] = {
    "f1_peak_divergence": {"name": "极值点背离", "desc": "find_peaks 对比相邻波峰/谷成交量"},
    "f2_volume_zscore": {"name": "量能Z-Score", "desc": "对数Z-Score统计标准化量能异常"},
    "f3_cmf_divergence": {"name": "CMF资金流", "desc": "Chaikin Money Flow 主动买卖压力"},
    "f4_macd_rsi_divergence": {"name": "MACD+RSI动量", "desc": "MACD柱背离 + RSI超买超卖增强"},
    "f5_obv_divergence": {"name": "OBV趋势", "desc": "OBV累积量能趋势背离"},
    "f6_derivatives_health": {"name": "衍生品健康度", "desc": "OI持仓量 + 资金费率拥挤度"},
    "f7_vsa_efficiency": {"name": "VSA效率", "desc": "K线穿越效率 + 影线比率 + E/R比"},
}


class FactorWeightUpdate(BaseModel):
    weights: dict[str, float]


@router.get("/vpd-factors")
async def get_vpd_factors(_=Depends(require_admin)):
    """获取当前 VPD 多因子权重及描述。"""
    from app.services.volume_price_divergence_v2 import DEFAULT_WEIGHTS
    from app.services.config_service import get_config_value
    import json

    # 读取数据库中保存的权重
    raw = await get_config_value("vpd_factor_weights", default="")
    current_weights = dict(DEFAULT_WEIGHTS)
    source = "default"
    if raw and raw.strip():
        try:
            saved = json.loads(raw)
            if isinstance(saved, dict):
                current_weights.update(saved)
                source = "database"
        except Exception:
            pass

    factors = []
    for fid, weight in current_weights.items():
        meta = _FACTOR_DESCRIPTIONS.get(fid, {"name": fid, "desc": ""})
        factors.append({
            "factor_id": fid,
            "factor_name": meta["name"],
            "description": meta["desc"],
            "weight": weight,
            "default_weight": DEFAULT_WEIGHTS.get(fid, 0.0),
        })

    return {
        "factors": factors,
        "total_weight": round(sum(current_weights.values()), 4),
        "source": source,
    }


@router.put("/vpd-factors")
async def update_vpd_factors(body: FactorWeightUpdate, _=Depends(require_admin)):
    """管理员调整 VPD 因子权重。权重合计应接近 1.0。"""
    from app.services.volume_price_divergence_v2 import DEFAULT_WEIGHTS
    from app.services.config_service import get_config_value, set_config_value
    from app.services.factor_learning import log_weight_change
    import json

    # 验证因子 ID
    for fid in body.weights:
        if fid not in DEFAULT_WEIGHTS:
            raise HTTPException(400, f"未知因子: {fid}")

    # 验证权重范围 + 单因子上限
    for fid, w in body.weights.items():
        if w < 0 or w > 1.0:
            raise HTTPException(400, f"因子 {fid} 权重需在 0~1 之间")
        if w > 0.40:
            raise HTTPException(400, f"因子 {fid} 权重 {w:.2f} 超过上限 0.40")

    total = sum(body.weights.values())
    if total < 0.8 or total > 1.2:
        raise HTTPException(400, f"权重合计 {total:.2f} 应接近 1.0 (允许 0.8~1.2)")

    # 读取旧权重用于审计
    old_raw = await get_config_value("vpd_factor_weights", default="")
    old_weights = json.loads(old_raw) if old_raw and old_raw.strip() else dict(DEFAULT_WEIGHTS)

    await set_config_value("vpd_factor_weights", json.dumps(body.weights))

    # 清除权重缓存
    try:
        import app.services.volume_price_divergence_v2 as vpd_mod
        vpd_mod._weight_cache = None
        vpd_mod._weight_cache_ts = 0.0
    except Exception:
        pass

    # 审计日志
    await log_weight_change(
        changed_by="admin", source="manual",
        old_weights=old_weights, new_weights=body.weights,
    )

    logger.info("VPD factor weights updated", extra={"weights": body.weights, "total": total})
    return {"ok": True, "message": f"因子权重已更新(合计{total:.2f})", "weights": body.weights}


@router.post("/vpd-factors/reset")
async def reset_vpd_factors(_=Depends(require_admin)):
    """重置 VPD 因子权重为默认值。"""
    from app.services.config_service import get_config_value, set_config_value
    from app.services.factor_learning import log_weight_change
    import json

    from app.services.volume_price_divergence_v2 import DEFAULT_WEIGHTS

    # 读取旧权重用于审计
    old_raw = await get_config_value("vpd_factor_weights", default="")
    old_weights = json.loads(old_raw) if old_raw and old_raw.strip() else dict(DEFAULT_WEIGHTS)

    await set_config_value("vpd_factor_weights", json.dumps(DEFAULT_WEIGHTS))

    # 清除权重缓存
    try:
        import app.services.volume_price_divergence_v2 as vpd_mod
        vpd_mod._weight_cache = None
        vpd_mod._weight_cache_ts = 0.0
    except Exception:
        pass

    # 审计日志
    await log_weight_change(
        changed_by="admin", source="reset",
        old_weights=old_weights, new_weights=DEFAULT_WEIGHTS,
    )
    return {"ok": True, "message": "因子权重已重置为默认值", "weights": DEFAULT_WEIGHTS}


# ══════════════════════════════════════════════════════════════
# 因子学习统计 & 训练
# ══════════════════════════════════════════════════════════════


@router.get("/vpd-stats")
async def get_vpd_stats(
    days: int = 7,
    symbol: str | None = None,
    mode: str | None = None,
    _=Depends(require_admin),
):
    """获取 VPD 因子命中率统计。"""
    from app.services.factor_learning import get_factor_stats
    return await get_factor_stats(days=days, symbol=symbol, mode=mode)


@router.get("/vpd-weight-history")
async def get_weight_history(_=Depends(require_admin)):
    """获取因子权重变更审计日志。"""
    import json
    from app.services.factor_learning import _ensure_tables
    from app.core.database import AsyncSessionLocal
    from sqlalchemy import text

    await _ensure_tables()
    async with AsyncSessionLocal() as session:
        rows = await session.execute(
            text("""
                SELECT id, changed_at, changed_by, source,
                       old_weights, new_weights, ai_accuracy, sample_count, notes
                FROM vpd_weight_audit_log
                ORDER BY changed_at DESC
                LIMIT 20
            """)
        )
        history = []
        for r in rows.fetchall():
            # old_weights / new_weights 可能是 dict 或 JSON 字符串，安全解析
            old_w = r[4]
            new_w = r[5]
            if isinstance(old_w, str):
                try:
                    old_w = json.loads(old_w)
                except Exception:
                    old_w = {}
            if isinstance(new_w, str):
                try:
                    new_w = json.loads(new_w)
                except Exception:
                    new_w = {}
            history.append({
                "id": r[0],
                "changed_at": r[1].isoformat() if r[1] else None,
                "changed_by": r[2],
                "source": r[3],
                "old_weights": old_w or {},
                "new_weights": new_w or {},
                "ai_accuracy": r[6],
                "sample_count": r[7],
                "notes": r[8],
            })
    return {"history": history}


@router.post("/vpd-train")
async def trigger_ai_training(
    days: int = 14,
    _=Depends(require_admin),
):
    """触发 AI 因子训练 — 调用 DeepSeek V3.2 分析因子表现并建议权重。

    返回建议权重，不会自动生效，需管理员手动确认。
    """
    from app.services.factor_ai_trainer import run_ai_training
    return await run_ai_training(days=days)


class AISuggestionApply(BaseModel):
    suggested_weights: dict[str, float]


@router.post("/vpd-train/apply")
async def apply_ai_weights(
    body: AISuggestionApply,
    _=Depends(require_admin),
):
    """管理员确认后应用 AI 建议的权重。"""
    from app.services.factor_ai_trainer import apply_ai_suggestion
    return await apply_ai_suggestion(body.suggested_weights)
