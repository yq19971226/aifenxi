"""NewsAnalystAgent — 新闻分析师智能体。

与 SentimentAgent 互补：
- SentimentAgent 偏情绪（KOL 活动、FUD/FOMO、社交提及量）
- NewsAnalystAgent 偏事实（新闻事件量化、监管含义、时间效应）

数据来源：
- Finnhub Market News（通过 app.data.news.NewsCollector，主流财经媒体）
- BlockBeats 律动 API（通过 app.data.blockbeats.BlockBeatsCollector）
- Redis 缓存的新闻数据（news:feed:{symbol}、news:blockbeats:{symbol}）

输出：AgentReport，包含事件分类、市场影响量化和监管风险评估。
使用 Grok-4 模型（实时信息整合最佳）。
"""

import logging
from datetime import datetime, timezone
from typing import Any

from app.agents.base import AgentReport, BaseAgent
from app.core.llm_client import llm_client
from app.data.blockbeats import BlockBeatsCollector
from app.data.news import NewsCollector, NewsItem
from app.models.market_data import MarketData

logger = logging.getLogger(__name__)

# ── 事件分类常量 ─────────────────────────────────────────────

EVENT_CATEGORIES: list[str] = [
    "regulatory",       # 监管政策
    "partnership",      # 合作公告
    "technical_update", # 技术升级/分叉
    "exchange_listing", # 交易所上线
    "hack_exploit",     # 黑客攻击/漏洞
    "macro_economic",   # 宏观经济
    "whale_movement",   # 巨鲸动向
    "legal_action",     # 法律诉讼
    "adoption",         # 主流采纳
    "other",            # 其他
]

# ── 系统提示词 ───────────────────────────────────────────────

_SYSTEM_PROMPT = """你是一位专业的加密货币新闻分析师，专注于从新闻事件中提取可交易的信息。

你的核心能力：
1. 事件分类：将新闻归类为 regulatory / partnership / technical_update / exchange_listing / hack_exploit / macro_economic / whale_movement / legal_action / adoption / other
2. 影响量化：评估每条新闻对价格的潜在影响（-10 到 +10）
3. 时间效应：判断影响的时间维度（immediate / short_term / long_term）
4. 监管风险：评估监管相关新闻的合规风险等级
5. 信息可信度：区分一手消息、二手转载和传闻

你必须以 JSON 格式回复：
{
  "signal": "bullish" | "bearish" | "neutral",
  "confidence": 0.0 到 1.0,
  "reasoning": "综合分析说明",
  "key_findings": ["发现1", "发现2"],
  "news_analysis": {
    "total_news_count": 数字,
    "sentiment_distribution": {
      "positive": 数字,
      "negative": 数字,
      "neutral": 数字
    },
    "top_events": [
      {
        "title": "事件标题",
        "category": "分类",
        "impact_score": -10到+10,
        "time_effect": "immediate|short_term|long_term",
        "credibility": "high|medium|low"
      }
    ],
    "regulatory_risk": "none|low|medium|high|critical",
    "market_narrative": "当前主导叙事的一句话总结"
  }
}

硬约束：
- 仅基于提供的新闻数据分析，禁止编造新闻
- 新闻数据不足时降低置信度
- 区分"已反映在价格中的旧闻"和"尚未消化的新信息"
- 重点关注监管类新闻的连锁影响
"""

# ── 新闻采集器单例 ───────────────────────────────────────────

_collector = NewsCollector()


class NewsAnalystAgent(BaseAgent):
    """新闻分析师智能体 — 量化新闻事件的市场影响。"""

    AGENT_ID: str = "news_analyst"

    async def analyze(self, data: MarketData) -> AgentReport:
        """分析最新新闻，量化事件影响并生成交易信号。"""
        # 1. 获取新闻数据
        news_items = await self._load_news(data.symbol)

        if not news_items:
            return AgentReport(
                agent_id=self.AGENT_ID,
                symbol=data.symbol,
                signal="neutral",
                confidence=0.0,
                reasoning="新闻数据不可用",
                key_findings=["无法获取新闻数据，建议配置 Finnhub API Key"],
                raw_data={},
            )

        # 2. 构建 prompt
        user_prompt = self._build_prompt(data, news_items)

        # 3. 调用 Grok-4（实时信息整合最佳）
        try:
            enriched_prompt = await self._enrich_prompt(_SYSTEM_PROMPT, data.symbol)
            from app.core.model_router import get_model_for_agent
            _model_key = await get_model_for_agent("news_analyst")
            result = await llm_client.call_model(
                model_key=_model_key,
                system_prompt=enriched_prompt,
                user_prompt=user_prompt,
            )

            signal = result.get("signal", "neutral")
            if signal not in ("bullish", "bearish", "neutral"):
                signal = "neutral"

            confidence = float(result.get("confidence", 0.0))
            confidence = min(max(confidence, 0.0), 1.0)

            return AgentReport(
                agent_id=self.AGENT_ID,
                symbol=data.symbol,
                signal=signal,
                confidence=confidence,
                reasoning=result.get("reasoning", ""),
                key_findings=result.get("key_findings", []),
                raw_data={
                    "news_analysis": result.get("news_analysis", {}),
                    "news_count": len(news_items),
                },
            )

        except Exception as exc:
            logger.error("NewsAnalystAgent analysis failed", extra={"error": str(exc)})
            return AgentReport(
                agent_id=self.AGENT_ID,
                symbol=data.symbol,
                signal="neutral",
                confidence=0.0,
                reasoning=f"新闻分析失败: {exc}",
                key_findings=[],
                raw_data={},
            )

    # ── 数据加载 ──────────────────────────────────────────────

    @staticmethod
    async def _load_news(symbol: str) -> list[NewsItem]:
        """获取指定交易对的最新新闻（合并 Finnhub + BlockBeats）。"""
        import asyncio

        async def _fh() -> list[NewsItem]:
            try:
                return await _collector.fetch_news(symbol=symbol, limit=20)
            except Exception as exc:
                logger.warning("Finnhub news load failed", extra={"error": str(exc)})
                return []

        async def _bb() -> list[NewsItem]:
            try:
                return await BlockBeatsCollector().fetch_news(symbol=symbol, limit=15)
            except Exception as exc:
                logger.warning("BlockBeats load failed", extra={"error": str(exc)})
                return []

        fh_items, bb_items = await asyncio.gather(_fh(), _bb())
        merged = fh_items + bb_items
        # 去重（按标题前20字符）
        seen: set[str] = set()
        unique: list[NewsItem] = []
        for item in merged:
            key = item.title[:20]
            if key not in seen:
                seen.add(key)
                unique.append(item)
        return unique[:30]

    # ── Prompt 构建 ───────────────────────────────────────────

    @staticmethod
    def _build_prompt(data: MarketData, news_items: list[NewsItem]) -> str:
        """构建新闻分析的用户提示词。"""
        lines: list[str] = [
            f"交易对: {data.symbol}",
            f"当前价格: {data.current_price}",
            f"新闻数量: {len(news_items)} 条",
            "",
            "── 最新新闻列表 ──",
        ]

        for i, item in enumerate(news_items, 1):
            votes_str = ""
            if item.votes:
                pos = item.votes.get("positive", 0)
                neg = item.votes.get("negative", 0)
                imp = item.votes.get("important", 0)
                votes_str = f" [👍{pos} 👎{neg} ❗{imp}]"

            lines.append(
                f"\n{i}. [{item.source}] {item.title}"
                f"\n   发布时间: {item.published_at}"
                f"\n   类型: {item.kind}{votes_str}"
            )
            if item.currencies:
                lines.append(f"   涉及币种: {', '.join(item.currencies)}")

        # 价格上下文（帮助判断新闻是否已反映在价格中）
        lines.append("\n── 价格上下文 ──")
        if data.klines_1h:
            latest = data.klines_1h[-1]
            lines.append(
                f"最近1h: O={latest.open} H={latest.high} "
                f"L={latest.low} C={latest.close} V={latest.volume}"
            )
        if data.klines_4h:
            latest = data.klines_4h[-1]
            lines.append(
                f"最近4h: O={latest.open} H={latest.high} "
                f"L={latest.low} C={latest.close} V={latest.volume}"
            )

        if data.indicators:
            ind = data.indicators
            lines.append(f"\nRSI={ind.rsi} MACD={ind.macd}")

        lines.append(
            "\n请对以上新闻进行事件分类和影响量化分析，"
            "重点关注监管类新闻和可能尚未被市场消化的新信息。"
        )

        return "\n".join(lines)
