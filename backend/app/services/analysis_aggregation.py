"""信号聚合与闸门函数 — 从 analysis_orchestrator.py 提取。

包含：
- _sse: SSE 事件序列化
- _weighted_average_fallback: NSED 失败时的加权平均回退
- _intraday_aggregate: 日内模式信号聚合
- _compute_reliability_weight: 可靠度权重映射
- _extract_weekly_bias: 周线 bias 提取
- _evaluate_defense_risk: 防御风险等级评估
- _is_comprehensive_mode: 趋势模式判定
"""

from __future__ import annotations

from app.agents.base import AgentReport
from app.models.analysis import AnalysisMode


# ---------------------------------------------------------------------------
# SSE 辅助
# ---------------------------------------------------------------------------


def _sse(event_obj: object) -> str:
    """将 pydantic 事件对象序列化为 SSE data 行。"""
    return f"data: {event_obj.model_dump_json()}\n\n"  # type: ignore[union-attr]


# ---------------------------------------------------------------------------
# 加权平均回退（NSED 失败时）
# ---------------------------------------------------------------------------


def _weighted_average_fallback(
    reports: list[AgentReport],
) -> tuple[str, float]:
    """从多个 AgentReport 计算加权平均信号和置信度。"""
    weights: dict[str, float] = {
        "technical": 0.25,
        "onchain": 0.25,
        "risk": 0.15,
        "orderbook": 0.10,
        "sentiment": 0.10,
        "news_analyst": 0.08,
        "adversarial": 0.05,
        "collusion_detector": 0.05,
        "calendar": 0.05,
    }
    signal_scores: dict[str, float] = {
        "bullish": 1.0,
        "neutral": 0.0,
        "bearish": -1.0,
    }
    total_weight = 0.0
    weighted_score = 0.0
    weighted_confidence = 0.0
    for r in reports:
        w = weights.get(r.agent_id, 0.25)
        weighted_score += signal_scores.get(r.signal, 0.0) * w
        weighted_confidence += r.confidence * w
        total_weight += w
    if total_weight > 0:
        avg_score = weighted_score / total_weight
        avg_confidence = weighted_confidence / total_weight
    else:
        return "neutral", 0.0
    if avg_score > 0.3:
        return "bullish", avg_confidence
    elif avg_score < -0.3:
        return "bearish", avg_confidence
    else:
        return "neutral", avg_confidence


# ---------------------------------------------------------------------------
# intraday 聚合：signal × confidence × agent_weight × reliability_weight
# ---------------------------------------------------------------------------

# V1 agent 权重（可由 mode_contract 或 config 未来覆盖）
_INTRADAY_AGENT_WEIGHTS: dict[str, float] = {
    "technical": 0.25,
    "onchain": 0.20,
    "risk": 0.15,
    "orderbook": 0.15,
    "news_analyst": 0.15,
    "calendar": 0.10,
}


def _compute_reliability_weight(report: AgentReport | None) -> float:
    """V1 可靠度权重 — 基于可解释规则映射，不允许黑盒自学习。

    规则:
    - report is None → 0.0（agent 失败/超时/熔断）
    - confidence < 0.2 → 0.3（极低置信度 → 大幅降权）
    - confidence < 0.4 → 0.6（低置信度 → 中等降权）
    - 否则 → 1.0（正常）
    """
    if report is None:
        return 0.0
    if report.confidence < 0.2:
        return 0.3
    if report.confidence < 0.4:
        return 0.6
    return 1.0


def _intraday_aggregate(
    reports: list[AgentReport | None],
    agent_ids: list[str],
) -> tuple[str, float]:
    """intraday 聚合：signal_value × confidence × agent_weight × reliability_weight。

    Args:
        reports: agent 结果列表（可能含 None）
        agent_ids: 与 reports 一一对应的 agent_id 列表

    Returns:
        (signal, confidence) 元组
    """
    signal_scores: dict[str, float] = {
        "bullish": 1.0,
        "neutral": 0.0,
        "bearish": -1.0,
    }

    weighted_score = 0.0
    weighted_confidence = 0.0
    total_effective_weight = 0.0

    for report, agent_id in zip(reports, agent_ids):
        agent_weight = _INTRADAY_AGENT_WEIGHTS.get(agent_id, 0.10)
        reliability = _compute_reliability_weight(report)

        if report is None or reliability == 0.0:
            continue

        signal_val = signal_scores.get(report.signal, 0.0)
        effective_weight = agent_weight * reliability

        weighted_score += signal_val * report.confidence * effective_weight
        weighted_confidence += report.confidence * effective_weight
        total_effective_weight += effective_weight

    if total_effective_weight <= 0:
        return "neutral", 0.0

    avg_score = weighted_score / total_effective_weight
    avg_confidence = weighted_confidence / total_effective_weight

    if avg_score > 0.3:
        return "bullish", round(min(avg_confidence, 1.0), 4)
    elif avg_score < -0.3:
        return "bearish", round(min(avg_confidence, 1.0), 4)
    else:
        return "neutral", round(min(avg_confidence, 1.0), 4)


# ---------------------------------------------------------------------------
# trend 闸门：1w bias + defense gate + divergence
# ---------------------------------------------------------------------------


def _extract_weekly_bias(klines_1w: list) -> str | None:
    """从周线 K 线提取 bias 方向（bullish / bearish / None）。

    V1 规则（可解释，非黑盒）:
    - 需要至少 4 根周线
    - 计算 EMA3 和 EMA7，EMA3 > EMA7 → bullish，反之 → bearish
    - 数据不足返回 None（不参与闸门）
    """
    if not klines_1w or len(klines_1w) < 4:
        return None

    closes = [k.close for k in klines_1w]

    def _ema(data: list[float], period: int) -> float:
        if len(data) < period:
            return data[-1]
        multiplier = 2.0 / (period + 1)
        ema = sum(data[:period]) / period
        for val in data[period:]:
            ema = (val - ema) * multiplier + ema
        return ema

    ema3 = _ema(closes, 3)
    ema7 = _ema(closes, min(7, len(closes)))

    if ema3 > ema7:
        return "bullish"
    elif ema3 < ema7:
        return "bearish"
    return None


def _evaluate_defense_risk(
    adversarial_report: AgentReport | None,
    collusion_report: AgentReport | None,
) -> int:
    """评估防御风险等级。返回 0-4（0=none, 1=low, 2=medium, 3=high, 4=critical）。"""
    level = 0

    if collusion_report and collusion_report.raw_data:
        raw = collusion_report.raw_data
        if raw.get("collusion_detected"):
            level = max(level, 2)
        risk = raw.get("risk_level", "none")
        risk_map = {"none": 0, "low": 1, "medium": 2, "high": 3, "critical": 4}
        level = max(level, risk_map.get(risk, 0))

    if adversarial_report and adversarial_report.raw_data:
        raw = adversarial_report.raw_data
        for move in raw.get("predicted_moves", []):
            prob = move.get("probability", 0)
            trap = move.get("trap_type", "none")
            if prob >= 0.7 and trap != "none":
                level = max(level, 3)
            elif prob >= 0.5 and trap != "none":
                level = max(level, 2)

    return level


def _is_comprehensive_mode(mode: AnalysisMode) -> bool:
    """判断是否为趋势模式（最全面），用于决定是否刷新 analysis:latest 缓存。"""
    return mode == AnalysisMode.TREND
