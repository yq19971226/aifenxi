"""舆情分析智能体 — 监控社交媒体、KOL活动、新闻事件，识别信息操纵。

数据来源：
- Redis 缓存的社交情绪数据（由 sentiment_worker 写入）
- 恐慌贪婪指数（sentiment:fear_greed）
- KOL 活动追踪（sentiment:kol:{symbol}，需接入 LunarCrush / Twitter API）

输出：AgentReport，包含舆情异常信号和 FUD/FOMO 识别结果
"""

import logging
from datetime import datetime, timezone
from typing import Any

from app.agents.base import AgentReport, BaseAgent
from app.core.llm_client import llm_client
from app.models.market_data import MarketData

logger = logging.getLogger(__name__)

# ── 检测阈值 ─────────────────────────────────────────────────

# KOL 同时喊单数 > 此值视为协同喊单
KOL_COORDINATED_THRESHOLD: int = 3
# 社交提及量激增倍数 > 此值视为异常
MENTION_SURGE_MULTIPLIER: float = 3.0
# 情绪极性急剧反转幅度 > 此值视为操纵
SENTIMENT_FLIP_THRESHOLD: float = 0.5


_SYSTEM_PROMPT = """你是一位专业的加密货币舆情分析师，擅长从社交媒体信号中识别以下操纵行为：
1. FUD 制造（Fear, Uncertainty, Doubt）：散布虚假负面消息配合洗盘
2. FOMO 制造（Fear Of Missing Out）：KOL协同喊单配合拉盘出货
3. 协同喊单：多个KOL在短时间内推荐同一币种，可能是庄家付费推广
4. 虚假新闻：不实的合作公告、上线消息等配合价格操纵

你必须以 JSON 格式回复：
{
  "signal": "bullish" | "bearish" | "neutral",
  "confidence": 0.0 到 1.0,
  "manipulation_detected": true | false,
  "manipulation_type": "fud" | "fomo" | "coordinated_shilling" | "fake_news" | "none",
  "reasoning": "分析说明",
  "key_findings": ["发现1", "发现2"],
  "sentiment_summary": {
    "overall_sentiment": "positive" | "negative" | "neutral",
    "fear_greed_index": 数值或null,
    "mention_volume_change": 数值或null,
    "kol_activity_level": "normal" | "elevated" | "extreme"
  }
}

硬约束：
- 仅基于提供的舆情数据分析，禁止编造数据
- 数据缺失时对应字段标注 null
- manipulation_detected 必须有具体证据支撑
- 区分"正常市场情绪"与"被操纵的情绪"
"""


class SentimentAgent(BaseAgent):
    """舆情分析智能体 — 识别社交媒体操纵行为。"""

    async def analyze(self, data: MarketData) -> AgentReport:
        """分析舆情数据，检测信息操纵行为。"""
        sentiment_data = await self._load_sentiment_data(data.symbol)

        if not sentiment_data:
            return AgentReport(
                agent_id="sentiment",
                symbol=data.symbol,
                signal="neutral",
                confidence=0.0,
                reasoning="舆情数据不可用",
                key_findings=["社交媒体数据缺失，无法进行舆情分析"],
                raw_data={},
            )

        # 构建 prompt
        user_prompt = self._build_prompt(data, sentiment_data)

        try:
            enriched_prompt = await self._enrich_prompt(_SYSTEM_PROMPT, data.symbol)
            from app.core.model_router import get_model_for_agent
            _model_key = await get_model_for_agent("sentiment")
            result = await llm_client.call_model(
                model_key=_model_key,
                system_prompt=enriched_prompt,
                user_prompt=user_prompt,
            )

            signal = result.get("signal", "neutral")
            confidence = float(result.get("confidence", 0.0))
            manipulation_detected = result.get("manipulation_detected", False)

            key_findings = result.get("key_findings", [])
            if manipulation_detected:
                m_type = result.get("manipulation_type", "unknown")
                key_findings.insert(0, f"检测到舆情操纵: {m_type}")

            return AgentReport(
                agent_id="sentiment",
                symbol=data.symbol,
                signal=signal,
                confidence=min(max(confidence, 0.0), 1.0),
                reasoning=result.get("reasoning", ""),
                key_findings=key_findings,
                raw_data={
                    "manipulation_detected": manipulation_detected,
                    "manipulation_type": result.get("manipulation_type", "none"),
                    "sentiment_summary": result.get("sentiment_summary", {}),
                },
            )

        except Exception as exc:
            logger.error("SentimentAgent analysis failed", extra={"error": str(exc)})
            return AgentReport(
                agent_id="sentiment",
                symbol=data.symbol,
                signal="neutral",
                confidence=0.0,
                reasoning=f"舆情分析失败: {exc}",
                key_findings=[],
                raw_data={},
            )

    # ── 数据加载 ──────────────────────────────────────────────

    @staticmethod
    async def _load_sentiment_data(symbol: str) -> dict[str, Any]:
        """从 Redis 聚合所有舆情数据源。"""
        from app.core.capability_state import is_capability_available, get_capability_status

        result: dict[str, Any] = {}
        try:
            from app.core.redis import get_json

            # 恐慌贪婪指数
            fg = await get_json("sentiment:fear_greed")
            if fg:
                result["fear_greed"] = fg

            # KOL 活动追踪
            if await is_capability_available("sentiment:kol"):
                kol_data = await get_json(f"sentiment:kol:{symbol}")
                if kol_data:
                    result["kol_activity"] = kol_data
            else:
                rt = await get_capability_status("sentiment:kol")
                status_val = rt.get("status")
                logger.debug("sentiment:kol skip: %s (%s)", status_val.value if hasattr(status_val, 'value') else status_val, rt.get("reason", ""))

            # 社交提及量
            if await is_capability_available("sentiment:mentions"):
                mentions = await get_json(f"sentiment:mentions:{symbol}")
                if mentions:
                    result["mentions"] = mentions
            else:
                rt = await get_capability_status("sentiment:mentions")
                status_val = rt.get("status")
                logger.debug("sentiment:mentions skip: %s (%s)", status_val.value if hasattr(status_val, 'value') else status_val, rt.get("reason", ""))

            # 新闻事件
            news = await get_json(f"news:feed:{symbol}")
            if news:
                result["news"] = news

        except Exception as exc:
            logger.warning("Failed to load sentiment data", extra={"error": str(exc)})

        return result

    # ── Prompt 构建 ───────────────────────────────────────────

    @staticmethod
    def _build_prompt(data: MarketData, sentiment_data: dict[str, Any]) -> str:
        """构建 LLM 分析 prompt。"""
        lines = [
            f"交易对: {data.symbol}",
            f"当前价格: {data.current_price}",
            "",
            "── 舆情数据 ──",
        ]

        # 恐慌贪婪指数
        fg = sentiment_data.get("fear_greed")
        if fg:
            lines.append(f"恐慌贪婪指数: {fg.get('value', 'N/A')} ({fg.get('value_classification', 'N/A')})")
        else:
            lines.append("恐慌贪婪指数: 不可用")

        # KOL 活动
        kol = sentiment_data.get("kol_activity")
        if kol and isinstance(kol, dict):
            active_count = kol.get("active_kol_count", 0)
            recent_posts = kol.get("recent_posts", [])
            lines.append(f"\nKOL 活跃数: {active_count}")
            if active_count >= KOL_COORDINATED_THRESHOLD:
                lines.append(f"⚠️ KOL活跃数 >= {KOL_COORDINATED_THRESHOLD}，疑似协同喊单")
            for post in recent_posts[:10]:
                lines.append(f"  - [{post.get('kol_name', '?')}] {post.get('content', '')[:100]}")
        else:
            lines.append("\nKOL 活动: 数据不可用")

        # 社交提及量
        mentions = sentiment_data.get("mentions")
        if mentions and isinstance(mentions, dict):
            current = mentions.get("current_1h", 0)
            avg = mentions.get("avg_1h", 1)
            ratio = current / avg if avg > 0 else 0
            lines.append(f"\n社交提及量(1h): {current} (平均: {avg}, 倍率: {ratio:.1f}x)")
            if ratio > MENTION_SURGE_MULTIPLIER:
                lines.append(f"⚠️ 提及量激增 {ratio:.1f}x，超过正常 {MENTION_SURGE_MULTIPLIER}x")
        else:
            lines.append("\n社交提及量: 数据不可用")

        # 新闻事件
        news = sentiment_data.get("news")
        if news and isinstance(news, list):
            lines.append(f"\n最近新闻 ({len(news)} 条):")
            for n in news[:5]:
                lines.append(f"  - [{n.get('source', '?')}] {n.get('title', '')[:80]}")
        else:
            lines.append("\n新闻事件: 数据不可用")

        # 链上数据交叉参考
        if data.onchain:
            lines.append("\n── 链上交叉验证 ──")
            if data.onchain.exchange_netflow is not None:
                direction = "流入" if data.onchain.exchange_netflow > 0 else "流出"
                lines.append(f"交易所净{direction}: {abs(data.onchain.exchange_netflow):.4f}")
            if data.onchain.whale_change_24h is not None:
                lines.append(f"巨鲸24h持仓变化: {data.onchain.whale_change_24h:.2f}%")

        return "\n".join(lines)
