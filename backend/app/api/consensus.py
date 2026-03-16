"""共识引擎 API 路由 — 只做参数校验和响应格式化。

数据查询通过 Redis 缓存完成，路由层不直接调用数据库。
模型名称在返回给用户前脱敏为内部代号，防止泄露供应商信息。
"""

import logging

from fastapi import APIRouter, HTTPException, Query

from app.consensus.engine import ConsensusReport
from app.consensus.weights import get_current_weights
from app.core.redis import get_json

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["consensus"])


# ── 模型名称脱敏映射 ──────────────────────────────────────────
# 规则：按模型厂商系列映射到匿名代号，防止用户看到 DeepSeek/Qwen/Claude/Grok 等
_MODEL_ALIAS: dict[str, str] = {}


def _get_alias(model_key: str) -> str:
    """将实际 model_key 映射为匿名代号。"""
    if model_key in _MODEL_ALIAS:
        return _MODEL_ALIAS[model_key]

    key_lower = model_key.lower()
    if "deepseek" in key_lower:
        alias = "axiom-alpha"
    elif "claude" in key_lower:
        alias = "axiom-beta"
    elif "grok" in key_lower:
        alias = "axiom-gamma"
    elif "qwen" in key_lower:
        alias = "axiom-delta"
    else:
        alias = f"axiom-{len(_MODEL_ALIAS) + 1}"

    _MODEL_ALIAS[model_key] = alias
    return alias


def _anonymize_report(report: ConsensusReport) -> dict:
    """脱敏共识报告 — 将 model_key 替换为匿名代号。"""
    data = report.model_dump(mode="json")

    # 脱敏 model_votes
    for vote in data.get("model_votes", []):
        original_key = vote.get("model_key", "")
        vote["model_key"] = _get_alias(original_key)

    # 脱敏 weights
    original_weights = data.get("weights", {})
    data["weights"] = {
        _get_alias(k): v for k, v in original_weights.items()
    }

    # 脱敏 minority_warnings 中的模型名
    warnings = data.get("minority_warnings", [])
    data["minority_warnings"] = [
        _redact_model_names(w) for w in warnings
    ]

    return data


def _redact_model_names(text: str) -> str:
    """将文本中的模型原始名称替换为代号。"""
    for original, alias in _MODEL_ALIAS.items():
        text = text.replace(original, alias)
    return text


def _normalize_symbol(s: str) -> str:
    """去掉 :杠杆 等后缀，与缓存键一致。"""
    base = (s or "").strip().split(":")[0].strip()
    return base or "BTCUSDT"


@router.get("/consensus/latest")
async def get_latest_consensus(
    symbol: str = Query(
        "BTCUSDT",
        min_length=1,
        max_length=20,
        description="交易对，如 BTCUSDT",
    ),
) -> dict:
    """获取最新共识报告（Redis 缓存）— 公开端点，模型名称已脱敏。"""
    symbol = _normalize_symbol(symbol)
    try:
        cache_key = f"consensus:latest:{symbol}"
        cached = await get_json(cache_key)
        if cached is None:
            raise HTTPException(status_code=404, detail="暂无共识报告")
        report = ConsensusReport.model_validate(cached)
        return _anonymize_report(report)
    except HTTPException:
        raise
    except Exception as exc:
        logger.error(
            "get_latest_consensus failed",
            extra={"symbol": symbol, "error": str(exc)},
        )
        raise HTTPException(status_code=500, detail="查询共识报告失败")


@router.get("/consensus/weights")
async def get_weights() -> dict[str, float]:
    """获取当前各模型权重分布（模型名称已脱敏）。"""
    try:
        raw_weights = await get_current_weights()
        return {_get_alias(k): v for k, v in raw_weights.items()}
    except Exception as exc:
        logger.error("get_weights failed", extra={"error": str(exc)})
        raise HTTPException(status_code=500, detail="查询模型权重失败")

