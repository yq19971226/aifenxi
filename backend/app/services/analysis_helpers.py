"""分析编排器辅助方法 — 从 analysis_orchestrator.py 提取。

包含：
- build_agent_section: AgentReport → ReportSection
- compute_atr: K 线 ATR 计算
- aggregate_signal: 多 agent 信号聚合
- extract_whale_data: 巨鲸数据提取
- log_analysis: 分析日志写入 Redis
- push_high_confidence: 高置信信号推送
- run_post_complete_tasks: 后置任务编排
"""

import asyncio
import json
import logging
from datetime import datetime, timezone
from uuid import UUID

from app.agents.base import AgentReport
from app.core.redis import get_redis_pool, publish_stream
from app.models.analysis import AnalysisMode, AnalysisReport, ReportSection
from app.services.analysis_aggregation import _weighted_average_fallback
from app.services.push_dispatcher import dispatch_fire_and_forget

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# 静态辅助
# ---------------------------------------------------------------------------


def build_agent_section(
    title: str, report: AgentReport | None,
) -> ReportSection:
    """从 AgentReport 构建 ReportSection，None 时标记 failed。"""
    if report is not None:
        return ReportSection(
            title=title,
            data={
                "signal": report.signal,
                "confidence": report.confidence,
                "reasoning": report.reasoning,
                "key_findings": report.key_findings,
                "raw_data": report.raw_data,
            },
        )
    return ReportSection(
        title=title,
        status="failed",
        data={},
        note="该维度分析不可用",
    )


def compute_atr(klines: list, period: int = 14) -> float | None:
    """从 K 线计算 ATR。"""
    if not klines or len(klines) < period + 1:
        return None
    trs: list[float] = []
    for i in range(1, len(klines)):
        high = klines[i].high
        low = klines[i].low
        prev_close = klines[i - 1].close
        tr = max(high - low, abs(high - prev_close), abs(low - prev_close))
        trs.append(tr)
    if len(trs) < period:
        return None
    return sum(trs[-period:]) / period


def aggregate_signal(
    reports: list[AgentReport | None],
) -> tuple[str, float]:
    """从多个 AgentReport 聚合信号。全部失败时返回 neutral/0.0。"""
    valid = [r for r in reports if r is not None]
    if not valid:
        return "neutral", 0.0
    return _weighted_average_fallback(valid)


def extract_whale_data(
    onchain_report: AgentReport | None,
) -> dict | None:
    """从 OnchainAgent 报告中提取巨鲸数据用于 OB 交叉验证。"""
    if onchain_report is None:
        return None
    raw = onchain_report.raw_data
    whale_buy_zones = raw.get("whale_buy_zones", [])
    whale_sell_zones = raw.get("whale_sell_zones", [])
    if not whale_buy_zones and not whale_sell_zones:
        return None
    return {
        "whale_buy_zones": whale_buy_zones,
        "whale_sell_zones": whale_sell_zones,
    }


# ---------------------------------------------------------------------------
# 后置任务
# ---------------------------------------------------------------------------

_HIGH_CONFIDENCE_THRESHOLD_DEFAULT = 0.7


async def log_analysis(
    user_id: UUID,
    symbol: str,
    mode: AnalysisMode,
    report: AnalysisReport,
) -> None:
    """记录分析日志到 Redis List（TTL 7 天）。"""
    try:
        redis = get_redis_pool()
        today = datetime.now(timezone.utc).date().isoformat()
        log_key = f"analysis:log:{user_id}:{today}"
        log_entry = json.dumps({
            "symbol": symbol,
            "mode": mode.value,
            "signal": report.signal,
            "confidence": report.confidence,
            "is_partial": report.is_partial,
            "execution_time_ms": report.execution_time_ms,
            "sections_count": len(report.sections),
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }, ensure_ascii=False)
        await redis.rpush(log_key, log_entry)
        await redis.expire(log_key, 7 * 24 * 3600)
    except Exception as exc:
        logger.warning("分析日志记录失败: %s", exc)


async def _get_signal_push_threshold() -> float:
    """从 ConfigService 动态读取推送阈值，失败时返回默认值。"""
    try:
        from app.core.database import AsyncSessionLocal
        from app.services.config_service import ConfigService
        async with AsyncSessionLocal() as session:
            svc = ConfigService(session)
            val = await svc.get_config("signal_push_threshold", str(_HIGH_CONFIDENCE_THRESHOLD_DEFAULT))
            return float(val)
    except Exception:
        return _HIGH_CONFIDENCE_THRESHOLD_DEFAULT


async def push_high_confidence(
    user_id: UUID,
    symbol: str,
    mode: AnalysisMode,
    report: AnalysisReport,
) -> None:
    """高置信信号推送（F2）— 置信度超过阈值时触发推送。"""
    if report.is_partial or report.signal == "neutral":
        return

    threshold = await _get_signal_push_threshold()
    if report.confidence < threshold:
        return

    signal_labels = {"bullish": "看多 📈", "bearish": "看空 📉"}
    try:
        await dispatch_fire_and_forget(
            user_id=str(user_id),
            event_type="high_confidence_signal",
            data={
                "symbol": symbol,
                "signal": report.signal,
                "signal_label": signal_labels.get(report.signal, report.signal),
                "confidence_pct": f"{report.confidence * 100:.0f}%",
                "mode": mode.value,
            },
        )
    except Exception as exc:
        logger.warning("高置信推送失败: %s", exc)


async def _persist_strategy(
    user_id: UUID,
    symbol: str,
    mode: AnalysisMode,
    report: AnalysisReport,
) -> None:
    """将策略写入 DB 并触发排行榜发布判断（fire-and-forget）。"""
    if not report.strategy:
        return
    try:
        from app.core.database import AsyncSessionLocal
        from app.services.strategy import StrategyResult, StrategyService

        strategy = StrategyResult.model_validate(report.strategy)
        svc = StrategyService()
        async with AsyncSessionLocal() as session:
            await svc.save_strategy(
                session=session,
                strategy=strategy,
                user_id=user_id,
                analysis_mode=mode.value,
                skip_cache=True,
            )
            await session.commit()
    except Exception as exc:
        logger.warning("策略持久化失败（不影响分析结果）: %s", exc)


async def run_post_complete_tasks(
    user_id: UUID,
    symbol: str,
    mode: AnalysisMode,
    report: AnalysisReport,
) -> None:
    """完成事件后的后置任务，异步后台执行且带超时保护。"""
    try:
        await asyncio.wait_for(
            log_analysis(user_id, symbol, mode, report),
            timeout=3.0,
        )
    except Exception as exc:
        logger.warning("分析后置任务日志写入失败或超时: %s", exc)

    try:
        await asyncio.wait_for(
            push_high_confidence(user_id, symbol, mode, report),
            timeout=8.0,
        )
    except Exception as exc:
        logger.warning("分析后置任务推送失败或超时: %s", exc)

    try:
        await asyncio.wait_for(
            _persist_strategy(user_id, symbol, mode, report),
            timeout=5.0,
        )
    except Exception as exc:
        logger.warning("策略持久化后置任务失败或超时: %s", exc)

    try:
        await asyncio.wait_for(
            _publish_signal_to_alert_stream(symbol, mode, report),
            timeout=3.0,
        )
    except Exception as exc:
        logger.warning("AI 信号发布到预警流失败或超时: %s", exc)


async def _publish_signal_to_alert_stream(
    symbol: str,
    mode: AnalysisMode,
    report: AnalysisReport,
) -> None:
    """将分析信号写入 ai_signal_updates Stream，供 alert_eval_worker 消费。

    这是 Autopilot 功能的关键链路：
    Autopilot 部署时创建的 AlertRule 使用 AI_CONSENSUS / SCALPING_SIGNAL 指标，
    只有将分析置信度 publish 到 Stream，评估 Worker 才能匹配到这些规则并触发通知。
    """
    if report.is_partial or report.signal == "neutral":
        return

    from app.models.alert import MetricType

    if mode == AnalysisMode.SCALPING:
        metric = MetricType.SCALPING_SIGNAL.value
    else:
        metric = MetricType.AI_CONSENSUS.value

    try:
        await publish_stream("ai_signal_updates", {
            "symbol": json.dumps(symbol),
            "metric_type": json.dumps(metric),
            "current_value": json.dumps(report.confidence),
        })
        logger.debug(
            "AI 信号已发布: symbol=%s metric=%s confidence=%.2f",
            symbol, metric, report.confidence,
        )
    except Exception as exc:
        logger.error("AI 信号发布失败: %s", exc)
