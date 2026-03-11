"""NSED 多模型共识引擎 — 三轮结构化评估与辩论。

Round 1: 4 模型并行独立分析（各有专责）
Round 2: 4 模型并行交叉审查（审阅其他 3 家观点后可调整）
Round 3: 加权聚合 + 少数派检测

所有 LLM 调用经 UnifiedLLMClient，并行使用 asyncio.gather。
"""

import asyncio
import logging
import statistics
from datetime import datetime, timezone
from typing import Literal

from pydantic import BaseModel, Field

from app.core.llm_client import llm_client
from app.core.redis import get_json, set_with_ttl
from app.models.market_data import MarketData

logger = logging.getLogger(__name__)

# ── 信号数值映射 ──────────────────────────────────────────────

SIGNAL_MAP: dict[str, float] = {
    "bullish": 1.0,
    "neutral": 0.0,
    "bearish": -1.0,
}

# ── Pydantic 模型 ─────────────────────────────────────────────


class ModelVote(BaseModel):
    """单个模型的分析结果。"""

    model_key: str
    signal: Literal["bullish", "bearish", "neutral"]
    confidence: float = Field(ge=0.0, le=1.0)
    reasoning: str = ""
    key_findings: list[str] = Field(default_factory=list)


class ConsensusReport(BaseModel):
    """NSED 共识引擎最终输出。"""

    symbol: str
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    consensus_signal: Literal["bullish", "bearish", "neutral"]
    consensus_confidence: float = Field(ge=0.0, le=1.0)
    model_votes: list[ModelVote]
    weights: dict[str, float]
    divergence: float = Field(ge=0.0, le=100.0)
    minority_warnings: list[str] = Field(default_factory=list)


# ── 辅助函数 ──────────────────────────────────────────────────


def _build_market_summary(data: MarketData) -> str:
    """将 MarketData 序列化为 LLM 可读的文本摘要。"""
    parts: list[str] = [
        f"交易对: {data.symbol}",
        f"当前价格: {data.current_price}",
    ]

    # 各周期最新 K 线
    for label, klines in [
        ("15m", data.klines_15m),
        ("1h", data.klines_1h),
        ("4h", data.klines_4h),
        ("1d", data.klines_1d),
    ]:
        if klines:
            latest = klines[-1]
            parts.append(
                f"{label} 最新K线: O={latest.open} H={latest.high} "
                f"L={latest.low} C={latest.close} V={latest.volume}"
            )

    # 技术指标
    if data.indicators:
        ind = data.indicators
        parts.append(
            f"技术指标({ind.interval}): "
            f"EMA7={ind.ema7} EMA25={ind.ema25} EMA99={ind.ema99} "
            f"RSI={ind.rsi} MACD={ind.macd} MACD_Signal={ind.macd_signal} "
            f"BB_Upper={ind.bb_upper} BB_Lower={ind.bb_lower}"
        )
        if ind.support_levels:
            parts.append(f"支撑位: {ind.support_levels}")
        if ind.resistance_levels:
            parts.append(f"阻力位: {ind.resistance_levels}")

    # 链上数据
    if data.onchain:
        oc = data.onchain
        parts.append(
            f"链上数据: 交易所净流入={oc.exchange_netflow} "
            f"巨鲸24h变化={oc.whale_change_24h} "
            f"恐慌贪婪指数={oc.fear_greed_index} MVRV={oc.mvrv}"
        )

    return "\n".join(parts)


def _parse_model_vote(model_key: str, raw: dict) -> ModelVote:
    """将 LLM 原始 JSON 响应解析为 ModelVote，缺失字段优雅降级。"""
    signal_raw = str(raw.get("signal", "neutral")).lower().strip()
    if signal_raw not in ("bullish", "bearish", "neutral"):
        logger.warning(
            "Invalid signal from model, defaulting to neutral",
            extra={"model_key": model_key, "raw_signal": signal_raw},
        )
        signal_raw = "neutral"

    try:
        confidence = float(raw.get("confidence", 0.0))
        confidence = max(0.0, min(1.0, confidence))
    except (TypeError, ValueError):
        confidence = 0.0

    reasoning = str(raw.get("reasoning", ""))
    key_findings_raw = raw.get("key_findings", [])
    if not isinstance(key_findings_raw, list):
        key_findings_raw = []
    key_findings = [str(f) for f in key_findings_raw]

    return ModelVote(
        model_key=model_key,
        signal=signal_raw,  # type: ignore[arg-type]
        confidence=confidence,
        reasoning=reasoning,
        key_findings=key_findings,
    )


# ── Round 1: 独立分析 ────────────────────────────────────────


async def _round1_analyze(market_data: MarketData) -> list[ModelVote]:
    """4 模型并行独立分析，各自使用专责分析器。"""
    from app.consensus.analyzers import (
        deepseek_analyze,
        grok_analyze,
        claude_analyze,
        qwen_analyze,
    )

    results = await asyncio.gather(
        deepseek_analyze(market_data),
        grok_analyze(market_data),
        claude_analyze(market_data),
        qwen_analyze(market_data),
    )
    return list(results)



# ── Round 2: 交叉审查 ────────────────────────────────────────


async def _round2_cross_review(
    votes: list[ModelVote],
    market_data: MarketData,
) -> list[ModelVote]:
    """每个模型审阅其他 3 家观点，可调整自己的判断。"""
    market_summary = _build_market_summary(market_data)

    async def _review_one(vote: ModelVote) -> ModelVote:
        others = [v for v in votes if v.model_key != vote.model_key]
        others_text = "\n".join(
            f"- {v.model_key}: signal={v.signal}, confidence={v.confidence}, "
            f"reasoning={v.reasoning}"
            for v in others
        )

        system_prompt = (
            "你是加密货币分析专家。你已经给出了初步分析，现在需要审阅其他分析师的观点，"
            "综合考虑后给出你的最终判断。你可以维持原判或调整。"
        )
        user_prompt = (
            f"市场数据摘要:\n{market_summary}\n\n"
            f"你的初步分析:\n"
            f"signal={vote.signal}, confidence={vote.confidence}\n"
            f"reasoning: {vote.reasoning}\n\n"
            f"其他分析师观点:\n{others_text}\n\n"
            "请综合考虑后给出你的最终判断。\n"
            '以 JSON 格式回复：\n'
            '{"signal": "bullish|bearish|neutral", '
            '"confidence": 0.0-1.0, '
            '"reasoning": "最终分析理由", '
            '"key_findings": ["发现1", "发现2"]}'
        )

        try:
            raw = await llm_client.call_model(
                model_key=vote.model_key,
                system_prompt=system_prompt,
                user_prompt=user_prompt,
                temperature=0.3,
            )
            return _parse_model_vote(vote.model_key, raw)
        except Exception as exc:
            logger.error(
                "Round2 cross review failed",
                extra={"model_key": vote.model_key, "error": str(exc)},
            )
            # 审查失败则保留 Round1 原始投票
            return vote

    results = await asyncio.gather(*[_review_one(v) for v in votes])
    return list(results)


# ── Round 3: 加权聚合 + 少数派检测 ───────────────────────────


async def _get_dynamic_weights() -> dict[str, float]:
    """从 Redis 获取动态权重，不存在则返回等权。"""
    cached = await get_json("consensus:weights")
    if cached and isinstance(cached, dict):
        logger.info("Loaded dynamic weights from Redis", extra={"weights": cached})
        return {str(k): float(v) for k, v in cached.items()}

    # 默认等权 — 基于当前共识引擎实际使用的 4 个 model_key
    from app.core.model_router import get_model_for_agent
    consensus_ids = ["consensus_deepseek", "consensus_grok", "consensus_claude", "consensus_qwen"]
    all_mk = await asyncio.gather(*[get_model_for_agent(cid) for cid in consensus_ids])
    keys: list[str] = list(dict.fromkeys(all_mk))  # 去重保序
    default_weights = {k: round(1.0 / len(keys), 4) for k in keys} if keys else {}
    logger.info("Using default equal weights", extra={"keys": keys})
    return default_weights


def _weighted_aggregate(
    votes: list[ModelVote],
    weights: dict[str, float],
    signal_threshold: float = 0.35,
    min_agreement: int = 2,
) -> tuple[Literal["bullish", "bearish", "neutral"], float]:
    """加权聚合信号，返回 (consensus_signal, consensus_confidence)。

    score = Σ(signal_value × confidence × weight)
    score > signal_threshold 且 bullish_count >= min_agreement → bullish
    score < -signal_threshold 且 bearish_count >= min_agreement → bearish
    否则 → neutral
    """
    weighted_score = 0.0
    total_weight = 0.0

    for vote in votes:
        w = weights.get(vote.model_key, 0.25)
        signal_val = SIGNAL_MAP.get(vote.signal, 0.0)
        weighted_score += signal_val * vote.confidence * w
        total_weight += w

    # 归一化置信度：取加权平均置信度
    weighted_confidence = sum(
        vote.confidence * weights.get(vote.model_key, 0.25) for vote in votes
    ) / total_weight if total_weight > 0 else 0.0

    # 至少 min_agreement 个模型方向一致才可判定 bullish/bearish
    bullish_count = sum(1 for v in votes if v.signal == "bullish")
    bearish_count = sum(1 for v in votes if v.signal == "bearish")

    if weighted_score > signal_threshold and bullish_count >= min_agreement:
        consensus_signal: Literal["bullish", "bearish", "neutral"] = "bullish"
    elif weighted_score < -signal_threshold and bearish_count >= min_agreement:
        consensus_signal = "bearish"
    else:
        consensus_signal = "neutral"

    return consensus_signal, round(max(0.0, min(0.95, weighted_confidence)), 4)


def _calculate_divergence(votes: list[ModelVote]) -> float:
    """计算分歧度 = 信号值标准差 × 100，上限 100。"""
    if len(votes) < 2:
        return 0.0
    signal_values = [SIGNAL_MAP.get(v.signal, 0.0) for v in votes]
    stdev = statistics.stdev(signal_values)
    return round(min(stdev * 100, 100.0), 2)


def _detect_minority(
    votes: list[ModelVote],
    consensus_signal: str,
) -> list[str]:
    """检测少数派：信号与共识不同且置信度 > 0.5 的模型。"""
    warnings: list[str] = []
    for vote in votes:
        if vote.signal != consensus_signal and vote.confidence > 0.5:
            warnings.append(
                f"⚠️ {vote.model_key} 持 {vote.signal} 观点 "
                f"(置信度 {vote.confidence:.0%})，与共识 {consensus_signal} 不同。"
                f"理由: {vote.reasoning[:120]}"
            )
    return warnings


def _round3_aggregate(
    votes: list[ModelVote],
    weights: dict[str, float],
    symbol: str,
    signal_threshold: float = 0.35,
    min_agreement: int = 2,
) -> ConsensusReport:
    """Round 3: 加权聚合 + 分歧度 + 少数派检测，生成最终报告。"""
    consensus_signal, consensus_confidence = _weighted_aggregate(
        votes, weights, signal_threshold, min_agreement,
    )
    divergence = _calculate_divergence(votes)
    minority_warnings = _detect_minority(votes, consensus_signal)

    return ConsensusReport(
        symbol=symbol,
        consensus_signal=consensus_signal,
        consensus_confidence=consensus_confidence,
        model_votes=votes,
        weights=weights,
        divergence=divergence,
        minority_warnings=minority_warnings,
    )


# ── 情绪数据覆盖 ──────────────────────────────────────────────


async def _enrich_sentiment(market_data: MarketData) -> MarketData:
    """优先从 Redis 读取 sentiment_worker 采集的恐慌贪婪指数覆盖 onchain 数据。

    深拷贝后修改，不影响调用方持有的原始对象。
    读取失败或无数据时保持原值不变（降级兼容）。
    """
    data = market_data.model_copy(deep=True)
    try:
        cached = await get_json("sentiment:fear_greed")
        if cached is not None and isinstance(cached, dict):
            value = cached.get("value")
            if value is not None and data.onchain is not None:
                data.onchain.fear_greed_index = int(value)
                logger.info(
                    "Sentiment fear_greed_index enriched from Redis",
                    extra={"value": value},
                )
    except Exception as exc:
        logger.warning(
            "Failed to enrich sentiment data, using original value",
            extra={"error": str(exc)},
        )
    return data



# ── 主入口 ────────────────────────────────────────────────────


async def run_nsed(market_data: MarketData) -> ConsensusReport:
    """NSED 共识引擎主入口 — 三轮结构化评估与辩论。

    1. 情绪数据覆盖：优先从 Redis 读取 sentiment_worker 采集的恐慌贪婪指数
    2. Round 1: 4 模型并行独立分析
    3. Round 2: 4 模型并行交叉审查
    4. Round 3: 加权聚合 + 少数派检测
    """
    logger.info("NSED consensus started", extra={"symbol": market_data.symbol})

    # 情绪数据覆盖：优先从 Redis 读取 sentiment_worker 采集的数据
    market_data = await _enrich_sentiment(market_data)

    # Round 1 — 独立分析
    r1_votes = await _round1_analyze(market_data)
    logger.info(
        "Round 1 complete",
        extra={"votes": [(v.model_key, v.signal) for v in r1_votes]},
    )

    # Round 2 — 交叉审查
    r2_votes = await _round2_cross_review(r1_votes, market_data)
    logger.info(
        "Round 2 complete",
        extra={"votes": [(v.model_key, v.signal) for v in r2_votes]},
    )

    # Round 3 — 加权聚合（从动态配置读取校准参数）
    weights = await _get_dynamic_weights()
    try:
        from app.services.config_service import get_config_value
        _sig_thr = float(await get_config_value("consensus_signal_threshold", "0.35"))
        _min_agr = int(await get_config_value("consensus_min_agreement", "2"))
    except Exception:
        _sig_thr, _min_agr = 0.35, 2
    report = _round3_aggregate(r2_votes, weights, market_data.symbol, _sig_thr, _min_agr)
    logger.info(
        "Round 3 complete — consensus reached",
        extra={
            "signal": report.consensus_signal,
            "confidence": report.consensus_confidence,
            "divergence": report.divergence,
            "minority_count": len(report.minority_warnings),
        },
    )

    # 缓存到 Redis（TTL=15 分钟）
    try:
        cache_key = f"consensus:latest:{market_data.symbol}"
        await set_with_ttl(cache_key, report.model_dump(mode="json"), ttl_seconds=900)
    except Exception as exc:
        logger.error("Failed to cache consensus report", extra={"error": str(exc)})

    return report
