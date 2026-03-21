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


# ── 模型名称脱敏映射（P3-A spec §8.2）────────────────────────
# 前端和 API 响应中严禁暴露真实模型名称
_MODEL_ALIAS: dict[str, dict[str, str]] = {
    "consensus_deepseek": {"id": "analyst_alpha", "label": "Alpha 分析师"},
    "consensus_grok":     {"id": "analyst_beta",  "label": "Beta 分析师"},
    "consensus_claude":   {"id": "analyst_gamma", "label": "Gamma 分析师"},
    "consensus_qwen":     {"id": "analyst_delta", "label": "Delta 分析师"},
}

# 运行时缓存：model_key → alias_id
_ALIAS_CACHE: dict[str, str] = {}
_ALIAS_COUNTER = 0


def _get_alias(model_key: str) -> dict[str, str]:
    """将实际 model_key 映射为匿名别名 dict（id + label）。"""
    if model_key in _MODEL_ALIAS:
        return _MODEL_ALIAS[model_key]

    # 模糊匹配：model_key 可能包含前缀
    key_lower = model_key.lower()
    for real_key, alias in _MODEL_ALIAS.items():
        if real_key.split("_")[-1] in key_lower:
            _MODEL_ALIAS[model_key] = alias  # 缓存
            return alias

    # 未知模型 fallback
    global _ALIAS_COUNTER
    _ALIAS_COUNTER += 1
    fallback = {"id": f"analyst_{_ALIAS_COUNTER}", "label": f"分析师 {_ALIAS_COUNTER}"}
    _MODEL_ALIAS[model_key] = fallback
    return fallback


def _get_alias_id(model_key: str) -> str:
    """简便方法：只返回 alias_id 字符串。"""
    return _get_alias(model_key)["id"]


# 需要从 reasoning 中过滤的模型自报家门文本
_MODEL_SELF_IDS = [
    "作为 Claude", "作为Claude", "As Claude",
    "作为 DeepSeek", "作为DeepSeek", "As DeepSeek",
    "作为 Grok", "作为Grok", "As Grok",
    "作为 Qwen", "作为Qwen", "As Qwen",
    "I am Claude", "I am DeepSeek", "I am Grok", "I am Qwen",
    "我是Claude", "我是DeepSeek", "我是Grok", "我是Qwen",
]


def _anonymize_report(report: ConsensusReport) -> dict:
    """脱敏共识报告 — 将 model_key 替换为匿名代号 + 标签。"""
    data = report.model_dump(mode="json")

    # 脱敏 model_votes — 增加 label 字段
    for vote in data.get("model_votes", []):
        original_key = vote.get("model_key", "")
        alias = _get_alias(original_key)
        vote["model_key"] = alias["id"]
        vote["label"] = alias["label"]
        # P3-A: 过滤 reasoning 中的自报家门
        if "reasoning" in vote and vote["reasoning"]:
            vote["reasoning"] = _sanitize_reasoning(vote["reasoning"])

    # 脱敏 weights
    original_weights = data.get("weights", {})
    data["weights"] = {
        _get_alias_id(k): v for k, v in original_weights.items()
    }

    # 脱敏 minority_warnings 中的模型名
    warnings = data.get("minority_warnings", [])
    data["minority_warnings"] = [
        _redact_model_names(w) for w in warnings
    ]

    return data


def _sanitize_reasoning(text: str) -> str:
    """过滤 reasoning 中模型自报家门的文本。"""
    for phrase in _MODEL_SELF_IDS:
        text = text.replace(phrase, "")
    return _redact_model_names(text)


def _redact_model_names(text: str) -> str:
    """将文本中的模型原始名称替换为代号。"""
    for original, alias in _MODEL_ALIAS.items():
        text = text.replace(original, alias["id"])
    # 额外过滤裸模型名
    for name in ("DeepSeek", "Claude", "Grok", "Qwen", "deepseek", "claude", "grok", "qwen"):
        if name in text:
            text = text.replace(name, "AI分析师")
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
        return {_get_alias_id(k): v for k, v in raw_weights.items()}
    except Exception as exc:
        logger.error("get_weights failed", extra={"error": str(exc)})
        raise HTTPException(status_code=500, detail="查询模型权重失败")

