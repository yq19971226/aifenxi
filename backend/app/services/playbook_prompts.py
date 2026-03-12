"""剧本推演 LLM 提示词与调用 — 从 playbook_sim_service.py 提取。

包含 3AI 对抗推演的 LLM 调用逻辑：
- L2: _llm_dealer_prediction（庄家AI推演）
- L3: _llm_defense_strategy（防御AI反制）
- L4: _llm_judge_adoption（裁判AI采纳）
"""

import logging

from app.core.llm_client import llm_client

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# 辅助函数
# ---------------------------------------------------------------------------


def _build_stages_text(pattern: dict) -> str:
    """构建剧本阶段描述文本。"""
    if not pattern.get("stages"):
        return "无阶段信息"
    lines = []
    for idx, s in enumerate(pattern["stages"]):
        marker = " ← 当前" if idx == pattern.get("current_stage_idx", -1) else ""
        lines.append(f"  阶段{idx+1}: {s['name']} ({s['phase']}) — {s['typical_duration']}{marker}")
    return "\n".join(lines)


def _build_market_summary(report: dict) -> str:
    """从报告/快照中提取关键市场数据摘要。"""
    parts = []
    price = report.get("current_price")
    if price:
        parts.append(f"当前价格: {price}")
    indicators = report.get("indicators", {})
    if isinstance(indicators, dict):
        for k in ("rsi", "rsi_14", "ema_7", "ema_25", "ema_99", "atr"):
            v = indicators.get(k)
            if v is not None:
                parts.append(f"{k}: {v}")
    deriv = report.get("derivatives", {})
    if isinstance(deriv, dict):
        for k in ("funding_rate", "fundingRate", "open_interest", "long_short_ratio"):
            v = deriv.get(k)
            if v is not None:
                parts.append(f"{k}: {v}")
    descs = report.get("signal_descriptions", [])
    if descs:
        parts.append(f"信号描述: {', '.join(descs[:10])}")
    return "\n".join(parts) if parts else "市场数据有限"


def _normalize_str_list(value: object) -> list[str]:
    if not isinstance(value, list):
        return []
    return [str(item) for item in value if item is not None and str(item).strip()]


def _normalize_dealer_prediction(result: dict) -> dict:
    normalized = dict(result) if isinstance(result, dict) else {}
    normalized["tactics"] = _normalize_str_list(normalized.get("tactics"))
    normalized["key_observations"] = _normalize_str_list(
        normalized.get("key_observations")
    )
    target_range = normalized.get("target_price_range")
    if not isinstance(target_range, dict):
        normalized["target_price_range"] = {"low": 0, "high": 0}
    return normalized


# ---------------------------------------------------------------------------
# L2: 庄家AI推演
# ---------------------------------------------------------------------------


async def llm_dealer_prediction(
    symbol: str,
    pattern: dict,
    report: dict,
    current_phase: str,
) -> dict:
    """L2 庄家AI推演 — 站庄家视角推演下一步操盘计划。"""
    stages_text = _build_stages_text(pattern)
    market_summary = _build_market_summary(report)

    prompt = f"""你是一位资深庄家操盘手。当前交易对 {symbol}，市场阶段: {current_phase}。

最匹配的操盘剧本: {pattern['name']}（匹配度 {pattern['match_pct']}%）
剧本信号: {pattern['signal']}

剧本阶段:
{stages_text}

当前市场数据:
{market_summary}

请站在庄家的视角分析：
1. 当前处于剧本的哪个阶段（序号，从1开始）
2. 你（庄家）下一步的操盘计划是什么
3. 目标价位区间（具体数字）
4. 预计执行时间窗口
5. 你会利用哪些手段（如假突破、洗盘、诱多/诱空等）
6. 下一阶段转换概率（0~1）

以 JSON 格式回复:
{{"current_stage": 1, "next_stage_probability": 0.7, "estimated_transition": "4-8小时", "dealer_plan": "描述庄家操盘计划", "target_price_range": {{"low": 0, "high": 0}}, "tactics": ["手段1", "手段2"], "key_observations": ["观察点1", "观察点2"]}}"""

    try:
        from app.core.model_router import get_model_for_agent
        model_key = await get_model_for_agent("playbook_dealer")
        result = await llm_client.call_model(
            model_key=model_key,
            system_prompt="你是庄家操盘推演专家。你的任务是站在庄家/主力的视角，推演他们的操盘意图和下一步计划。输出严格 JSON 格式。",
            user_prompt=prompt,
            timeout_s=60.0,
        )
        if isinstance(result, dict):
            normalized = _normalize_dealer_prediction(result)
            dp = normalized.get("dealer_plan")
            if isinstance(dp, str) and dp.strip():
                return normalized
        return {}
    except Exception as exc:
        logger.error("L2 庄家推演失败: %s", exc)
        return {}


# ---------------------------------------------------------------------------
# L3: 防御AI反制
# ---------------------------------------------------------------------------


async def llm_defense_strategy(
    symbol: str,
    pattern: dict,
    dealer_prediction: dict,
    report: dict,
    current_phase: str,
) -> dict:
    """L3 防御AI反制 — 看到庄家推演后生成散户反制策略。"""
    market_summary = _build_market_summary(report)
    dealer_plan = dealer_prediction.get("dealer_plan", "未知")
    tactics = ", ".join(dealer_prediction.get("tactics", []))
    target_range = dealer_prediction.get("target_price_range", {})
    transition_time = dealer_prediction.get("estimated_transition", "未知")

    counter = pattern.get("counter_strategy", {})

    prompt = f"""你是散户防御策略专家。当前交易对 {symbol}，市场阶段: {current_phase}。

庄家AI的推演结果（L2输出）:
- 识别剧本: {pattern['name']}
- 庄家计划: {dealer_plan}
- 庄家手段: {tactics}
- 目标价位: {target_range.get('low', '?')} ~ {target_range.get('high', '?')}
- 预计时间: {transition_time}

剧本模板反制策略（参考）:
- 反制动作: {counter.get('action', '无')}
- 进场逻辑: {counter.get('entry_logic', '无')}
- 确认信号: {counter.get('wait_signal', '无')}

当前市场数据:
{market_summary}

请站在散户/交易者的角度，针对庄家的操盘计划生成防御策略：
1. 核心反制思路（一句话总结）
2. 具体进场点位和条件
3. 止损设置（具体价位或逻辑）
4. 止盈目标（分批）
5. 必须等待的确认信号（防止被二次骗线）
6. 风险等级和警告
7. 防御置信度（0~1）

以 JSON 格式回复:
{{"defense_summary": "一句话反制思路", "entry": {{"price": 0, "condition": "入场条件"}}, "stop_loss": {{"price": 0, "logic": "止损逻辑"}}, "take_profit": [{{"price": 0, "ratio": "20%"}}], "confirmation_signals": ["确认信号1"], "risk_level": "moderate", "risk_warning": "风险警告", "confidence": 0.7}}"""

    try:
        from app.core.model_router import get_model_for_agent
        model_key = await get_model_for_agent("playbook_defense")
        result = await llm_client.call_model(
            model_key=model_key,
            system_prompt="你是散户防御策略专家。你已经看到了庄家AI的操盘推演，现在需要生成针对性的反制策略来保护交易者。输出严格 JSON 格式。",
            user_prompt=prompt,
            timeout_s=60.0,
        )
        if isinstance(result, dict) and not result.get("is_fallback"):
            return result
        return {}
    except Exception as exc:
        logger.error("L3 防御反制失败: %s", exc)
        return {}


# ---------------------------------------------------------------------------
# L4: 裁判AI采纳
# ---------------------------------------------------------------------------


async def llm_judge_adoption(
    symbol: str,
    pattern: dict,
    dealer_prediction: dict,
    defense_strategy: dict,
    report: dict,
    current_phase: str,
) -> dict:
    """L4 裁判AI采纳 — 综合庄家推演和防御策略，输出最终建议。"""
    market_summary = _build_market_summary(report)
    dealer_plan = dealer_prediction.get("dealer_plan", "未知")
    dealer_prob = dealer_prediction.get("next_stage_probability", 0)
    defense_summary = defense_strategy.get("defense_summary", "未知")
    defense_conf = defense_strategy.get("confidence", 0)
    risk_level = defense_strategy.get("risk_level", "未知")

    prompt = f"""你是独立裁判分析师。当前交易对 {symbol}，市场阶段: {current_phase}。
识别剧本: {pattern['name']}（匹配度 {pattern['match_pct']}%）

你需要审阅两方 AI 的输出，做出最终采纳决定。

【庄家AI (L2)】
- 操盘计划: {dealer_plan}
- 阶段转换概率: {dealer_prob}
- 庄家手段: {', '.join(dealer_prediction.get('tactics', []))}

【防御AI (L3)】
- 反制思路: {defense_summary}
- 风险等级: {risk_level}
- 防御置信度: {defense_conf}
- 止损逻辑: {defense_strategy.get('stop_loss', {}).get('logic', '未知')}

当前市场数据:
{market_summary}

请作为裁判：
1. 评估庄家推演的可信度（0~1）
2. 评估防御策略的可行性（0~1）
3. 做出最终采纳决定：采纳防御策略 / 部分采纳 / 建议观望
4. 最终操作建议（一句话）
5. 关键风险提醒
6. 用最通俗的大白话（像跟朋友聊天一样），30字内总结：现在市场在玩什么把戏，普通人应该怎么做。不要用任何专业术语。
7. 综合判断信心等级：high（高度确信此剧本正在上演）/ medium（有一定可能性）/ low（仅供参考）/ none（证据不足）

以 JSON 格式回复:
{{"dealer_credibility": 0.7, "defense_feasibility": 0.8, "adoption": "adopt|partial|wait", "final_recommendation": "最终一句话建议", "next_move": "具体下一步操作", "risk_alerts": ["风险提醒1"], "reasoning": "裁判推理过程", "plain_summary": "大白话总结，如：大户在故意砸盘吓你卖，别慌，等跌到xx再考虑接", "confidence_level": "high|medium|low|none"}}"""

    try:
        from app.core.model_router import get_model_for_agent
        model_key = await get_model_for_agent("playbook_judge")
        result = await llm_client.call_model(
            model_key=model_key,
            system_prompt="你是独立裁判分析师，负责综合庄家AI和防御AI的输出，做出最终采纳决定。你必须客观公正，不偏向任何一方。特别注意：你的 plain_summary 字段必须用最通俗易懂的大白话写，像朋友之间聊天一样，绝对不能出现任何专业术语。输出严格 JSON 格式。",
            user_prompt=prompt,
            timeout_s=60.0,
        )
        if isinstance(result, dict) and not result.get("is_fallback"):
            return result
        return {}
    except Exception as exc:
        logger.error("L4 裁判采纳失败: %s", exc)
        return {}

