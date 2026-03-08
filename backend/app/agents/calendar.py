"""日历事件分析智能体 — 评估即将到来的事件对价格的影响。

数据来源：
- TimescaleDB calendar_events 表
- Redis 缓存 calendar:{symbol}

分析维度：
1. 事件类型影响评估（Exchange Listing/Partnership/Token Unlock 等）
2. 事件时间距离（越近影响越大）
3. 社区关注度（投票数）
4. 事件可信度（是否有 proof）

输出：AgentReport，包含事件影响评分和交易信号
"""

import logging
from datetime import datetime, timedelta, timezone

from app.agents.base import AgentReport, BaseAgent
from app.core.llm_client import llm_client
from app.models.market_data import MarketData

logger = logging.getLogger(__name__)

# ── 事件影响评分映射 ──────────────────────────────────────────

EVENT_IMPACT_SCORES = {
    # 强利好事件
    "Exchange Listing": 8,
    "Mainnet Launch": 7,
    "Partnership": 6,
    "Burn": 6,
    "Airdrop": 5,
    "Halving": 9,
    # 中性偏利好
    "Release": 4,
    "Update": 3,
    "Conference": 2,
    "AMA": 1,
    "Meetup": 1,
    # 利空事件
    "Token Unlock": -7,
    "Hard Fork": -2,  # 不确定性
    "Soft Fork": -1,
    # 其他
    "Token Swap": 0,
    "Rebrand": 0,
    "Hackathon": 1,
    "Other": 0,
}

_SYSTEM_PROMPT = """你是一位专业的加密货币事件分析师，擅长评估日历事件对价格的影响。

事件影响评估规则：
1. Exchange Listing（交易所上线）：强利好，短期影响 +7 到 +9
   - Top 10 交易所（Binance/Coinbase/OKX）：+9
   - Top 50 交易所：+7
   - 其他交易所：+5

2. Partnership（合作公告）：中期利好，影响 +4 到 +7
   - 与知名企业合作：+7
   - 与其他项目合作：+5
   - 战略合作：+6

3. Mainnet Launch（主网上线）：长期利好，影响 +6 到 +8
   - 首次主网上线：+8
   - 主网升级：+6

4. Token Unlock（代币解锁）：短期利空，影响 -5 到 -9
   - 大额解锁（>10% 流通量）：-9
   - 中等解锁（5-10%）：-7
   - 小额解锁（<5%）：-5

5. Hard Fork（硬分叉）：不确定性，影响 -3 到 +5
   - 有争议的分叉：-3
   - 技术升级分叉：+3

6. Halving（减半）：长期利好，影响 +8 到 +10
   - 比特币减半：+10
   - 其他币种减半：+8

7. Conference/AMA（会议/问答）：中性偏利好，影响 +1 到 +3

时间衰减规则：
- 0-3 天内：影响系数 × 1.5（即将发生，市场高度关注）
- 4-7 天内：影响系数 × 1.2
- 8-14 天内：影响系数 × 1.0
- 15-30 天内：影响系数 × 0.7（较远，市场关注度低）

社区关注度加成：
- 投票数 > 100：影响系数 × 1.3
- 投票数 50-100：影响系数 × 1.1
- 投票数 < 50：影响系数 × 1.0

可信度评估：
- 有 proof 链接：可信度 high
- 无 proof 但投票数 > 50：可信度 medium
- 无 proof 且投票数 < 50：可信度 low

你必须以 JSON 格式回复：
{
  "signal": "bullish" | "bearish" | "neutral",
  "confidence": 0.0 到 1.0,
  "reasoning": "综合分析说明",
  "key_findings": ["发现1", "发现2"],
  "upcoming_events": [
    {
      "title": "事件标题",
      "date": "YYYY-MM-DD",
      "days_to_event": 天数,
      "category": "分类",
      "impact_score": -10到+10,
      "credibility": "high|medium|low",
      "vote_count": 投票数
    }
  ],
  "total_impact_score": -100到+100,
  "high_impact_count": 高影响力事件数量
}

硬约束：
- 仅基于提供的事件数据分析，禁止编造事件
- 事件数据不足时降低置信度
- 重点关注 3 天内的高影响力事件
- Token Unlock 事件必须标注为利空
"""


class CalendarAgent(BaseAgent):
    """日历事件分析智能体"""

    AGENT_ID: str = "calendar"

    async def analyze(self, data: MarketData) -> AgentReport:
        """分析即将到来的日历事件"""
        # 1. 加载未来 30 天的事件
        events = await self._load_upcoming_events(data.symbol)

        if not events:
            return AgentReport(
                agent_id=self.AGENT_ID,
                symbol=data.symbol,
                signal="neutral",
                confidence=0.0,
                reasoning="未来30天无重要事件",
                key_findings=["无即将到来的日历事件"],
                raw_data={"events_count": 0},
            )

        # 2. 构建 prompt
        user_prompt = self._build_prompt(data, events)

        # 3. 调用 LLM 分析
        try:
            enriched_prompt = await self._enrich_prompt(_SYSTEM_PROMPT, data.symbol)
            from app.core.model_router import get_model_for_agent

            _model_key = await get_model_for_agent("calendar")
            result = await llm_client.call_model(
                model_key=_model_key,
                system_prompt=enriched_prompt,
                user_prompt=user_prompt,
                temperature=0.3,
            )

            signal = result.get("signal", "neutral")
            if signal not in ("bullish", "bearish", "neutral"):
                signal = "neutral"

            confidence = float(result.get("confidence", 0.0))
            confidence = min(max(confidence, 0.0), 1.0)

            key_findings = result.get("key_findings", [])
            upcoming_events = result.get("upcoming_events", [])
            total_impact = result.get("total_impact_score", 0)
            high_impact_count = result.get("high_impact_count", 0)

            # 构建 key_findings
            if not key_findings:
                key_findings = [f"未来30天有 {len(events)} 个事件"]
                if high_impact_count > 0:
                    key_findings.append(f"其中 {high_impact_count} 个高影响力事件")
                if total_impact > 5:
                    key_findings.append(f"总体影响偏利好 (+{total_impact})")
                elif total_impact < -5:
                    key_findings.append(f"总体影响偏利空 ({total_impact})")

            return AgentReport(
                agent_id=self.AGENT_ID,
                symbol=data.symbol,
                signal=signal,
                confidence=confidence,
                reasoning=result.get("reasoning", ""),
                key_findings=key_findings,
                raw_data={
                    "upcoming_events": upcoming_events,
                    "events_count": len(events),
                    "total_impact_score": total_impact,
                    "high_impact_count": high_impact_count,
                },
            )

        except Exception as exc:
            logger.error(
                "CalendarAgent analysis failed",
                extra={"symbol": data.symbol, "error": str(exc)},
            )
            return AgentReport(
                agent_id=self.AGENT_ID,
                symbol=data.symbol,
                signal="neutral",
                confidence=0.0,
                reasoning=f"日历分析失败: {exc}",
                key_findings=[f"未来30天有 {len(events)} 个事件（分析失败）"],
                raw_data={"events_count": len(events), "error": str(exc)},
            )

    @staticmethod
    async def _load_upcoming_events(symbol: str) -> list[dict]:
        """从 Redis 缓存或数据库加载未来 30 天的事件"""
        # 1. 优先从 Redis 读取
        try:
            from app.core.redis import get_json

            cached = await get_json(f"calendar:{symbol}")
            if cached and isinstance(cached, list):
                logger.info(
                    "Calendar events loaded from Redis",
                    extra={"symbol": symbol, "count": len(cached)},
                )
                return cached
        except Exception as exc:
            logger.warning(
                "Failed to load calendar events from Redis",
                extra={"error": str(exc)},
            )

        # 2. 从数据库读取
        try:
            from app.core.database import AsyncSessionLocal
            from sqlalchemy import text

            now = datetime.now(timezone.utc)
            end = now + timedelta(days=30)

            async with AsyncSessionLocal() as session:
                result = await session.execute(
                    text("""
                        SELECT event_id, title, description, event_date,
                               categories, proof_link, source, vote_count,
                               positive_vote_count, percentage, can_occur_before
                        FROM calendar_events
                        WHERE symbol = :symbol
                          AND event_date BETWEEN :start AND :end
                        ORDER BY event_date ASC
                    """),
                    {"symbol": symbol, "start": now, "end": end},
                )

                events = []
                for row in result.fetchall():
                    events.append(
                        {
                            "event_id": row[0],
                            "title": row[1],
                            "description": row[2],
                            "event_date": row[3].isoformat(),
                            "categories": row[4].split(",") if row[4] else [],
                            "proof_link": row[5],
                            "source": row[6],
                            "vote_count": row[7],
                            "positive_vote_count": row[8],
                            "percentage": row[9],
                            "can_occur_before": row[10],
                        }
                    )

                logger.info(
                    "Calendar events loaded from DB",
                    extra={"symbol": symbol, "count": len(events)},
                )
                return events

        except Exception as exc:
            logger.error(
                "Failed to load calendar events from DB",
                extra={"symbol": symbol, "error": str(exc)},
            )
            return []

    @staticmethod
    def _build_prompt(data: MarketData, events: list[dict]) -> str:
        """构建分析 prompt"""
        lines = [
            f"交易对: {data.symbol}",
            f"当前价格: {data.current_price}",
            f"未来30天事件数: {len(events)}",
            "",
            "── 即将到来的事件 ──",
        ]

        now = datetime.now(timezone.utc)
        for event in events:
            event_date = datetime.fromisoformat(event["event_date"])
            days_to_event = (event_date - now).days

            # 计算基础影响分
            categories = event.get("categories", [])
            base_impact = 0
            if categories:
                base_impact = EVENT_IMPACT_SCORES.get(categories[0], 0)

            # 时间衰减
            if days_to_event <= 3:
                time_factor = 1.5
            elif days_to_event <= 7:
                time_factor = 1.2
            elif days_to_event <= 14:
                time_factor = 1.0
            else:
                time_factor = 0.7

            # 社区关注度加成
            vote_count = event.get("vote_count", 0)
            if vote_count > 100:
                vote_factor = 1.3
            elif vote_count > 50:
                vote_factor = 1.1
            else:
                vote_factor = 1.0

            final_impact = round(base_impact * time_factor * vote_factor, 1)

            # 可信度
            credibility = "high" if event.get("proof_link") else (
                "medium" if vote_count > 50 else "low"
            )

            lines.append(
                f"\n[{', '.join(categories)}] {event['title']}"
                f"\n  日期: {event_date.strftime('%Y-%m-%d')} ({days_to_event}天后)"
                f"\n  投票数: {vote_count}"
                f"\n  预估影响: {final_impact:+.1f}"
                f"\n  可信度: {credibility}"
            )

            if event.get("proof_link"):
                lines.append(f"  证据: {event['proof_link']}")

            if event.get("description"):
                desc = event["description"][:150]
                lines.append(f"  描述: {desc}...")

        # 价格上下文（帮助判断事件是否已反映在价格中）
        if data.klines_1d:
            latest = data.klines_1d[-1]
            lines.append(
                f"\n── 价格上下文 ──"
                f"\n最近1日: O={latest.open} H={latest.high} "
                f"L={latest.low} C={latest.close} V={latest.volume}"
            )

        if data.indicators:
            ind = data.indicators
            lines.append(f"RSI={ind.rsi} MACD={ind.macd}")

        lines.append(
            "\n请综合评估这些事件对价格的影响，"
            "重点关注 3 天内的高影响力事件和 Token Unlock 利空事件。"
        )

        return "\n".join(lines)
