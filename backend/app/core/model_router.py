"""动态模型路由 — 智能体和共识分析器的模型分配从配置读取，支持后台实时切换。

用法：
    from app.core.model_router import get_model_for_agent

    model_key = await get_model_for_agent("technical")
    result = await llm_client.call_model(model_key=model_key, ...)

配置键格式：
    model_route:{agent_id} → model_key（如 "deepseek", "grok", "claude" 等）

未配置时回退到 DEFAULT_ROUTES 中的默认值。
"""

import logging
from typing import Any

logger = logging.getLogger(__name__)

# ── 默认路由（回退值，与当前硬编码一致）────────────────────────

DEFAULT_ROUTES: dict[str, str] = {
    # 核心层智能体
    "technical": "claude-sonnet",          # 首选 Claude Sonnet 4.5，备选 qwen3-max
    "onchain": "deepseek-v3.2-thinking",   # 首选 DeepSeek V3.2 Thinking，备选 claude-sonnet
    "sentiment": "grok-fast",              # 首选 Grok-4 Fast，备选 grok-code-fast
    "orderbook": "qwen3-max",              # 首选 Qwen3 Max，备选 qwen3-next-thinking
    "playbook_dealer": "deepseek-r1",        # 剧本L2: 庄家推演
    "playbook_defense": "claude-sonnet",     # 剧本L3: 防御反制
    "playbook_judge": "claude-haiku",          # 剧本L4: 裁判采纳（原 grok-fast，分散限频风险）
    "risk": "claude-haiku",                # 首选 Claude Haiku 4.5，备选 claude-sonnet
    # 增强层
    "news_analyst": "grok-fast",           # Grok-4 Fast 实时信息
    "calendar": "qwen3-next-thinking",      # 日历事件分析（原 grok-fast，分散限频风险）
    "reflection": "deepseek-r1",           # 首选 DeepSeek R1-671B，备选 qwen3-next-thinking
    # 对抗层
    "adversarial": "deepseek-r1",          # 深度博弈推理
    "collusion_detector": "claude-sonnet", # 逻辑一致性
    # 共识引擎 4 分析器
    "consensus_deepseek": "deepseek-v3.2-thinking",
    "consensus_grok": "grok-fast",
    "consensus_claude": "claude-sonnet",
    "consensus_qwen": "qwen3-max",
}

# ── 各模型超时配置（秒）────────────────────────────────────────
# Thinking/Reasoning 模型需要更长超时，普通模型维持 30s
MODEL_TIMEOUTS: dict[str, float] = {
    "deepseek-r1": 90.0,              # 深度推理，需要更多思考时间
    "deepseek-v3.2-thinking": 90.0,   # 思维链模型，响应较慢
    "qwen3-next-thinking": 60.0,      # 推理增强版
}
DEFAULT_TIMEOUT: float = 30.0         # 普通模型默认超时


def get_timeout_for_model(model_key: str) -> float:
    """根据模型类型返回适配的超时时间。"""
    return MODEL_TIMEOUTS.get(model_key, DEFAULT_TIMEOUT)

# ── 可用模型列表（DMXAPI 网关支持的文本分析模型）────────────────

AVAILABLE_MODELS: list[dict[str, Any]] = [
    # ── 精选首选模型 ──────────────────────────────────
    {
        "model_key": "deepseek-r1",
        "model_name": "deepseek-reasoner",
        "display_name": "DeepSeek R1-671B",
        "description": "深度推理模型，适合复杂博弈、反思复盘、剧本推演",
        "pricing": {"input": 0.004, "output": 0.016},
        "strengths": ["剧本推演", "反思复盘", "对抗推演"],
    },
    {
        "model_key": "deepseek-v3.2-thinking",
        "model_name": "deepseek-v3.2-exp-thinking",
        "display_name": "DeepSeek V3.2 Thinking",
        "description": "思考推理增强版，性能持平 V3.1，价格大幅下降",
        "pricing": {"input": 0.0003, "output": 0.0004},
        "strengths": ["链上分析", "通用推理", "性价比"],
    },
    {
        "model_key": "claude-sonnet",
        "model_name": "claude-sonnet-4-5-20250929",
        "display_name": "Claude Sonnet 4.5",
        "description": "逻辑推理最强，适合技术分析、合谋检测",
        "pricing": {"input": 0.003, "output": 0.015},
        "strengths": ["技术分析", "合谋检测", "逻辑推理"],
    },
    {
        "model_key": "grok-fast",
        "model_name": "grok-4-fast",
        "display_name": "Grok-4 Fast",
        "description": "高性价比，价格仅为竞品 1/25，Token 消耗更少",
        "pricing": {"input": 0.001, "output": 0.004},
        "strengths": ["舆情分析", "新闻分析", "实时信息"],
    },
    {
        "model_key": "grok-code-fast",
        "model_name": "grok-code-fast-1",
        "display_name": "Grok Code Fast",
        "description": "轻量级快速推理，256K 上下文，代理编码优化",
        "pricing": {"input": 0.001, "output": 0.004},
        "strengths": ["舆情备选", "快速推理", "低成本"],
    },
    {
        "model_key": "qwen3-max",
        "model_name": "qwen3-max",
        "display_name": "Qwen3 Max",
        "description": "通义千问最强版，复杂多步骤任务专优",
        "pricing": {"input": 0.001, "output": 0.004},
        "strengths": ["订单簿分析", "模式匹配", "高频信号"],
    },
    {
        "model_key": "qwen3-next-thinking",
        "model_name": "Qwen3-Next-80B-A3B-Thinking",
        "display_name": "Qwen3 Next Thinking",
        "description": "推理增强版，多项基准超 Gemini-2.5-Flash-Thinking",
        "pricing": {"input": 0.001, "output": 0.004},
        "strengths": ["订单簿备选", "反思备选", "推理增强"],
    },
    {
        "model_key": "claude-haiku",
        "model_name": "claude-haiku-4-5-ssvip",
        "display_name": "Claude Haiku 4.5",
        "description": "低成本快速模型，性能对齐 GPT-5，金融分析专优",
        "pricing": {"input": 0.001, "output": 0.005},
        "strengths": ["风险评估", "快速分析", "低成本"],
    },
    # ── 备用模型 ────────────────────────────────────
    {
        "model_key": "deepseek",
        "model_name": "deepseek-chat",
        "display_name": "DeepSeek V3 通用",
        "description": "旧版通用模型，性价比高",
        "pricing": {"input": 0.0014, "output": 0.0028},
        "strengths": ["通用分析"],
    },
    {
        "model_key": "grok",
        "model_name": "grok-4",
        "display_name": "Grok-4 标准",
        "description": "旧版 Grok 标准模型",
        "pricing": {"input": 0.003, "output": 0.015},
        "strengths": ["实时信息"],
    },
    {
        "model_key": "gpt4o",
        "model_name": "gpt-4o",
        "display_name": "GPT-4o",
        "description": "OpenAI 通用模型（实盘-26.2%，供备用）",
        "pricing": {"input": 0.0025, "output": 0.01},
        "strengths": ["通用分析"],
    },
    {
        "model_key": "gemini",
        "model_name": "gemini-2.5-pro",
        "display_name": "Gemini 2.5 Pro",
        "description": "Google 最新模型",
        "pricing": {"input": 0.00125, "output": 0.005},
        "strengths": ["通用分析", "长上下文"],
    },
    {
        "model_key": "o3",
        "model_name": "o3",
        "display_name": "OpenAI o3",
        "description": "OpenAI 推理模型",
        "pricing": {"input": 0.002, "output": 0.008},
        "strengths": ["复杂推理"],
    },
]

# model_key → model_name 映射（含所有可选模型）
ALL_MODEL_NAMES: dict[str, str] = {
    m["model_key"]: m["model_name"] for m in AVAILABLE_MODELS
}

# ── 智能体元信息（供前端展示）──────────────────────────────────

AGENT_META: list[dict[str, str]] = [
    {"agent_id": "technical", "name": "技术分析", "desc": "K线形态、指标信号、支撑压力位", "phase": "核心层"},
    {"agent_id": "onchain", "name": "链上数据", "desc": "巨鲸动向、交易所流入流出", "phase": "核心层"},
    {"agent_id": "sentiment", "name": "舆情分析", "desc": "恐慌贪婪指数、社交热度", "phase": "核心层"},
    {"agent_id": "orderbook", "name": "订单簿", "desc": "买卖盘深度、大单检测", "phase": "核心层"},
    {"agent_id": "playbook_dealer", "name": "庄家AI", "desc": "站庄家视角推演操盘计划", "phase": "剧本对抗"},
    {"agent_id": "playbook_defense", "name": "防御AI", "desc": "散户视角生成反制策略", "phase": "剧本对抗"},
    {"agent_id": "playbook_judge", "name": "裁判AI", "desc": "综合两方输出最终建议", "phase": "剧本对抗"},
    {"agent_id": "risk", "name": "风险评估", "desc": "仓位风险、止损建议", "phase": "核心层"},
    {"agent_id": "news_analyst", "name": "新闻分析", "desc": "全球加密新闻解读", "phase": "增强层"},
    {"agent_id": "calendar", "name": "日历事件", "desc": "代币解锁、减半等事件影响评估", "phase": "增强层"},
    {"agent_id": "reflection", "name": "反思复盘", "desc": "历史判断准确率回顾", "phase": "增强层"},
    {"agent_id": "adversarial", "name": "对抗推演", "desc": "庄家视角反向推演", "phase": "对抗层"},
    {"agent_id": "collusion_detector", "name": "合谋检测", "desc": "对倒交易、协同拉砸检测", "phase": "对抗层"},
    {"agent_id": "consensus_deepseek", "name": "共识·链上解读", "desc": "共识引擎 DeepSeek 分析器", "phase": "共识引擎"},
    {"agent_id": "consensus_grok", "name": "共识·宏观叙事", "desc": "共识引擎 Grok 分析器", "phase": "共识引擎"},
    {"agent_id": "consensus_claude", "name": "共识·风险识别", "desc": "共识引擎 Claude 分析器", "phase": "共识引擎"},
    {"agent_id": "consensus_qwen", "name": "共识·模式匹配", "desc": "共识引擎 Qwen 分析器", "phase": "共识引擎"},
]

# ── 内存缓存 ──────────────────────────────────────────────────

_cache: dict[str, str] = {}
_cache_loaded = False


async def _load_all_routes() -> None:
    """从 ConfigService 加载所有 model_route:* 配置到内存缓存。"""
    global _cache, _cache_loaded
    try:
        from app.services.config_service import get_config_value
        for agent_id in DEFAULT_ROUTES:
            val = await get_config_value(f"model_route:{agent_id}", default=None)
            if val and val in ALL_MODEL_NAMES:  # noqa: E501
                _cache[agent_id] = val
        _cache_loaded = True
    except Exception as exc:
        logger.warning("model_router: load routes failed, using defaults", extra={"error": str(exc)})
        _cache_loaded = True


async def get_model_for_agent(agent_id: str) -> str:
    """获取指定智能体应使用的 model_key。

    优先级：ConfigService 配置 > 内存缓存 > DEFAULT_ROUTES 默认值。
    """
    global _cache_loaded
    if not _cache_loaded:
        await _load_all_routes()

    if agent_id in _cache:
        return _cache[agent_id]

    return DEFAULT_ROUTES.get(agent_id, "deepseek")


async def set_model_for_agent(agent_id: str, model_key: str) -> bool:
    """设置指定智能体使用的模型，持久化到 ConfigService。

    Returns:
        True 设置成功，False 参数无效
    """
    if agent_id not in DEFAULT_ROUTES:
        logger.warning("Unknown agent_id", extra={"agent_id": agent_id})
        return False
    if model_key not in ALL_MODEL_NAMES:
        # 也检查 llm_client 的动态 MODELS 字典
        from app.core.llm_client import MODELS as _LLM_MODELS
        if model_key not in _LLM_MODELS:
            logger.warning("Unknown model_key", extra={"model_key": model_key})
            return False

    try:
        from app.services.config_service import set_config_value
        await set_config_value(
            f"model_route:{agent_id}",
            model_key,
            category="model_route",
            description=f"智能体 {agent_id} 使用的模型",
            is_secret=False,
        )
        _cache[agent_id] = model_key
        logger.info("Model route updated", extra={"agent_id": agent_id, "model_key": model_key})
        return True
    except Exception as exc:
        logger.error("Failed to set model route", extra={"agent_id": agent_id, "error": str(exc)})
        return False


async def get_all_assignments() -> list[dict[str, Any]]:
    """获取所有智能体的模型分配列表（供 API/前端使用）。"""
    global _cache_loaded
    if not _cache_loaded:
        await _load_all_routes()

    result = []
    for meta in AGENT_META:
        agent_id = meta["agent_id"]
        current_model_key = _cache.get(agent_id, DEFAULT_ROUTES.get(agent_id, "deepseek"))
        default_model_key = DEFAULT_ROUTES.get(agent_id, "deepseek")
        is_custom = agent_id in _cache and _cache[agent_id] != default_model_key

        # 找到模型元信息
        model_info = next((m for m in AVAILABLE_MODELS if m["model_key"] == current_model_key), None)

        result.append({
            "agent_id": agent_id,
            "agent_name": meta["name"],
            "agent_desc": meta["desc"],
            "phase": meta["phase"],
            "current_model_key": current_model_key,
            "current_model_name": ALL_MODEL_NAMES.get(current_model_key, current_model_key),
            "current_model_display": model_info["display_name"] if model_info else current_model_key,
            "default_model_key": default_model_key,
            "is_custom": is_custom,
        })

    return result


def invalidate_cache() -> None:
    """清除内存缓存，下次调用 get_model_for_agent 时重新加载。"""
    global _cache, _cache_loaded
    _cache = {}
    _cache_loaded = False
