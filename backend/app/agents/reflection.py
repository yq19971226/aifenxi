"""ReflectionAgent — 离线复盘智能体。

不参与实时分析，而是定期回顾历史交易决策与结果，
生成反思洞察并缓存到 Redis，供其他智能体在下次分析时注入 prompt。

核心流程：
1. 从 Redis 读取最近 N 条分析报告和策略结果
2. 调用 DeepSeek-Reasoner 进行深度复盘推理
3. 生成 ReflectionReport（含洞察列表 + 各智能体改进建议）
4. 缓存到 Redis（reflection:insights:{symbol}），TTL 24h
5. 其他智能体通过 get_reflection_context() 读取并注入 prompt
"""

import asyncio
import json
import logging
from datetime import datetime, timezone
from typing import Any, Optional

from pydantic import BaseModel, Field

from app.core.llm_client import llm_client
from app.core.redis import get_json, get_redis_pool, set_with_ttl

logger = logging.getLogger(__name__)

# ── 反思报告 TTL ─────────────────────────────────────────────
REFLECTION_TTL: int = 86400  # 24 hours
REFLECTION_KEY_PREFIX: str = "reflection:insights"

# ── 数据模型 ─────────────────────────────────────────────────


class AgentInsight(BaseModel):
    """针对单个智能体的改进建议。"""

    agent_id: str
    observation: str
    suggestion: str
    priority: str = "medium"  # high / medium / low


class ReflectionReport(BaseModel):
    """反思复盘报告。"""

    symbol: str
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    period: str = "daily"  # daily / weekly
    reports_reviewed: int = 0
    overall_accuracy: Optional[float] = None
    key_insights: list[str] = Field(default_factory=list)
    agent_insights: list[AgentInsight] = Field(default_factory=list)
    market_lessons: list[str] = Field(default_factory=list)
    prompt_injection: str = ""


# ── 系统提示词 ───────────────────────────────────────────────

_REFLECTION_SYSTEM = (
    "你是一位资深加密货币交易复盘分析师。你的任务是回顾最近的分析报告和策略结果，"
    "找出决策中的偏差、遗漏和改进空间。\n\n"
    "你的分析维度：\n"
    "1. 信号准确性：各智能体给出的 bullish/bearish/neutral 信号是否与后续行情吻合\n"
    "2. 置信度校准：高置信度信号是否确实更准确\n"
    "3. 盲区识别：是否有重要信号被遗漏（如大额转账未被关注）\n"
    "4. 矛盾处理：当智能体意见分歧时，最终决策是否正确\n"
    "5. 时机评估：进场/出场时机是否最优\n\n"
    "请输出 JSON 格式：\n"
    '{\n'
    '  "overall_accuracy": 0.0-1.0,\n'
    '  "key_insights": ["洞察1", "洞察2", ...],\n'
    '  "agent_insights": [\n'
    '    {"agent_id": "technical", "observation": "观察", '
    '"suggestion": "建议", "priority": "high|medium|low"}\n'
    '  ],\n'
    '  "market_lessons": ["教训1", "教训2"],\n'
    '  "prompt_injection": "一段简洁的总结文本（不超过200字），'
    '将注入到其他智能体的系统提示中，帮助它们避免重复错误"\n'
    '}'
)


# ── 核心类 ───────────────────────────────────────────────────


class ReflectionAgent:
    """离线复盘智能体 — 定期分析历史决策质量并生成改进建议。"""

    async def reflect(
        self,
        symbol: str,
        period: str = "daily",
        lookback_count: int = 10,
    ) -> ReflectionReport:
        """执行一次复盘分析。

        Args:
            symbol: 交易对（如 BTCUSDT）
            period: 复盘周期 daily / weekly
            lookback_count: 回顾最近 N 条报告
        """
        symbol = symbol.upper()
        logger.info(
            "ReflectionAgent starting",
            extra={"symbol": symbol, "period": period},
        )

        # 1. 收集历史数据
        historical_data = await self._gather_history(symbol, lookback_count)

        if not historical_data["reports"] and not historical_data["strategies"]:
            logger.warning("No historical data for reflection", extra={"symbol": symbol})
            return ReflectionReport(
                symbol=symbol,
                period=period,
                key_insights=["暂无足够的历史数据进行复盘"],
                prompt_injection="",
            )

        # 2. 构建复盘 prompt
        user_prompt = self._build_prompt(symbol, period, historical_data)

        # 3. 调用 DeepSeek-Reasoner 深度推理
        try:
            from app.core.model_router import call_with_fallback
            _model_key, result = await call_with_fallback(
                "reflection",
                system_prompt=_REFLECTION_SYSTEM,
                user_prompt=user_prompt,
                temperature=0.2,
            )
        except Exception as exc:
            logger.error("ReflectionAgent LLM call failed", extra={"error": str(exc)})
            return ReflectionReport(
                symbol=symbol,
                period=period,
                key_insights=[f"复盘分析调用失败: {exc}"],
                prompt_injection="",
            )

        # 4. 解析结果
        report = self._parse_result(symbol, period, historical_data, result)

        # 5. 缓存反思洞察到 Redis
        await self._cache_insights(symbol, report)

        logger.info(
            "ReflectionAgent completed",
            extra={
                "symbol": symbol,
                "insights_count": len(report.key_insights),
                "agent_insights_count": len(report.agent_insights),
            },
        )
        return report

    # ── 内部方法 ─────────────────────────────────────────────

    async def _gather_history(
        self, symbol: str, count: int
    ) -> dict[str, Any]:
        """从 Redis 收集历史分析报告、策略和 AI 检测结果。"""
        reports: list[dict] = []
        strategies: list[dict] = []
        ai_detections: list[dict] = []

        try:
            redis = get_redis_pool()

            # 分析报告（三种模式）
            for mode in ("scalping", "intraday", "trend"):
                keys = await redis.keys(f"analysis:{symbol}:{mode}:*")
                for key in keys[:count]:
                    data = await get_json(key)
                    if data:
                        reports.append(data)

            # 策略结果
            strategy = await get_json(f"strategy:latest:{symbol}")
            if strategy:
                strategies.append(strategy)

            # AI 检测结果
            ai_data = await get_json(f"ai_detect:{symbol}")
            if ai_data:
                ai_detections.append(ai_data)

            # 历史反思报告（用于连续改进）
            prev_reflection = await get_json(f"{REFLECTION_KEY_PREFIX}:{symbol}")

        except Exception as exc:
            logger.warning("Failed to gather history", extra={"error": str(exc)})
            prev_reflection = None

        return {
            "reports": reports,
            "strategies": strategies,
            "ai_detections": ai_detections,
            "prev_reflection": prev_reflection,
        }

    def _build_prompt(
        self, symbol: str, period: str, data: dict[str, Any]
    ) -> str:
        """构建复盘分析的用户提示词。"""
        parts: list[str] = [
            f"## 复盘任务：{symbol} — {period}",
            f"回顾时间: {datetime.now(timezone.utc).isoformat()}",
            f"报告数量: {len(data['reports'])} 条分析报告",
            f"策略数量: {len(data['strategies'])} 条策略",
        ]

        # 分析报告摘要
        if data["reports"]:
            parts.append("\n### 历史分析报告")
            for i, rpt in enumerate(data["reports"][:5], 1):
                signal = rpt.get("signal", "unknown")
                confidence = rpt.get("confidence", 0)
                mode = rpt.get("mode", "unknown")
                ts = rpt.get("timestamp", "unknown")
                sections = rpt.get("sections", [])
                agent_summaries = []
                for sec in sections:
                    if isinstance(sec, dict):
                        title = sec.get("title", "")
                        sec_data = sec.get("data", {})
                        if isinstance(sec_data, dict):
                            sec_signal = sec_data.get("signal", "")
                            sec_conf = sec_data.get("confidence", "")
                            if sec_signal:
                                agent_summaries.append(
                                    f"{title}: {sec_signal}({sec_conf})"
                                )
                parts.append(
                    f"\n报告 {i} [{mode}] {ts}:\n"
                    f"  综合信号: {signal} (置信度: {confidence})\n"
                    f"  各智能体: {'; '.join(agent_summaries) if agent_summaries else '无详情'}"
                )

        # 策略摘要
        if data["strategies"]:
            parts.append("\n### 策略建议")
            for s in data["strategies"]:
                direction = s.get("direction", "unknown")
                entry = s.get("entry_price", "N/A")
                sl = s.get("stop_loss", "N/A")
                tp = s.get("take_profit", "N/A")
                parts.append(
                    f"  方向: {direction}, 进场: {entry}, 止损: {sl}, 止盈: {tp}"
                )

        # AI 检测摘要
        if data["ai_detections"]:
            parts.append("\n### AI 操盘检测")
            for ai in data["ai_detections"]:
                prob = ai.get("ai_probability", 0)
                mode = ai.get("operation_mode", "unknown")
                parts.append(f"  AI概率: {prob}%, 模式: {mode}")

        # 上次反思（连续改进）
        if data.get("prev_reflection"):
            prev = data["prev_reflection"]
            prev_insights = prev.get("key_insights", [])
            if prev_insights:
                parts.append("\n### 上次反思洞察（检查是否已改进）")
                for ins in prev_insights[:3]:
                    parts.append(f"  - {ins}")

        parts.append(
            "\n\n请根据以上数据进行深度复盘分析，"
            "找出决策偏差和改进空间，输出 JSON 格式结果。"
        )
        return "\n".join(parts)

    def _parse_result(
        self,
        symbol: str,
        period: str,
        historical_data: dict,
        result: dict[str, Any],
    ) -> ReflectionReport:
        """解析 LLM 返回结果为 ReflectionReport。"""
        agent_insights: list[AgentInsight] = []
        for item in result.get("agent_insights", []):
            if isinstance(item, dict):
                agent_insights.append(
                    AgentInsight(
                        agent_id=item.get("agent_id", "unknown"),
                        observation=item.get("observation", ""),
                        suggestion=item.get("suggestion", ""),
                        priority=item.get("priority", "medium"),
                    )
                )

        return ReflectionReport(
            symbol=symbol,
            period=period,
            reports_reviewed=len(historical_data["reports"]),
            overall_accuracy=result.get("overall_accuracy"),
            key_insights=result.get("key_insights", []),
            agent_insights=agent_insights,
            market_lessons=result.get("market_lessons", []),
            prompt_injection=result.get("prompt_injection", ""),
        )

    async def _cache_insights(
        self, symbol: str, report: ReflectionReport
    ) -> None:
        """将反思洞察缓存到 Redis，供其他智能体读取。"""
        try:
            cache_data = report.model_dump(mode="json")
            await set_with_ttl(
                f"{REFLECTION_KEY_PREFIX}:{symbol}",
                cache_data,
                REFLECTION_TTL,
            )
            logger.info("Reflection insights cached", extra={"symbol": symbol})
        except Exception as exc:
            logger.warning(
                "Failed to cache reflection insights",
                extra={"symbol": symbol, "error": str(exc)},
            )


# ── 公共辅助函数 — 供其他智能体调用 ──────────────────────────


async def get_reflection_context(symbol: str) -> str:
    """获取该交易对的最新反思洞察文本，用于注入其他智能体的 prompt。

    如果没有缓存的反思数据，返回空字符串（不影响原有逻辑）。
    """
    try:
        data = await get_json(f"{REFLECTION_KEY_PREFIX}:{symbol.upper()}")
        if data and data.get("prompt_injection"):
            return (
                "\n\n【近期复盘洞察 — 请参考以下反思结论避免重复错误】\n"
                f"{data['prompt_injection']}\n"
            )
    except Exception:
        pass
    return ""
