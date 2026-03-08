"""AdversarialAgent — 对抗推演智能体。

站在庄家AI的视角进行反向推演：
1. 读取当前市场状态 + PlaybookAgent 输出 + AIDetector 检测结果
2. 模拟庄家AI的决策逻辑，推演其下一步操作
3. 输出反制预警和建议的防御策略

核心理念：
- "要打败AI，先要像AI一样思考"
- 利用 PlaybookAgent 的剧本匹配结果，推演剧本下一阶段
- 利用 AIDetector 的战术识别，预测庄家的下一个动作
- 使用 deepseek-reasoner（深度推理）进行博弈分析
"""

import logging
from datetime import datetime, timezone
from typing import Any, Literal

from pydantic import BaseModel, Field

from app.agents.base import AgentReport, BaseAgent
from app.core.llm_client import llm_client
from app.core.redis import get_json
from app.models.market_data import MarketData

logger = logging.getLogger(__name__)


# ── 数据模型 ─────────────────────────────────────────────────


class AdversarialMove(BaseModel):
    """庄家AI预测的单步操作。"""

    action: str                                      # 操作描述
    probability: float = Field(ge=0.0, le=1.0)       # 发生概率
    timeframe: str = "unknown"                       # 时间窗口
    target_price: str = ""                           # 目标价位
    trap_type: str = ""                              # 陷阱类型


class AdversarialReport(BaseModel):
    """对抗推演完整报告。"""

    symbol: str
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    dealer_intent: str = ""                          # 庄家当前意图
    predicted_moves: list[AdversarialMove] = Field(default_factory=list)
    danger_zones: list[str] = Field(default_factory=list)   # 危险价位区间
    safe_zones: list[str] = Field(default_factory=list)     # 相对安全区间
    defense_plan: list[str] = Field(default_factory=list)   # 防御计划


# ── 系统提示词 ───────────────────────────────────────────────

_SYSTEM_PROMPT = """你是一个加密货币庄家AI的模拟器。你的任务是站在庄家/做市商的角度，
基于当前市场数据推演庄家接下来最可能采取的操纵策略。

你必须像一个追求利润最大化的庄家AI一样思考：
1. 分析当前散户的持仓分布和止损位置
2. 识别最容易收割的流动性区域
3. 推演最优的操纵路径（如何用最小成本引发最大恐慌/贪婪）
4. 预测庄家的时间窗口偏好（结算时间、低流动性时段等）

你的推演维度：
- 流动性猎杀：散户止损密集区在哪里？庄家会如何扫损？
- 情绪操控：当前市场情绪如何？庄家会利用还是逆转它？
- 假信号制造：庄家可能制造哪些假突破/假跌破来诱导散户？
- 时机选择：庄家最可能在什么时间段操作？（低流动性/结算前后）
- 多阶段陷阱：庄家是否在布局多步陷阱？

请以 JSON 格式回复：
{
  "signal": "bullish" | "bearish" | "neutral",
  "confidence": 0.0-1.0,
  "reasoning": "从庄家视角的综合推演",
  "key_findings": ["发现1", "发现2"],
  "adversarial_analysis": {
    "dealer_intent": "庄家当前最可能的意图（一句话）",
    "predicted_moves": [
      {
        "action": "操作描述",
        "probability": 0.0-1.0,
        "timeframe": "1h/4h/1d",
        "target_price": "目标价位或区间",
        "trap_type": "stop_hunt/fake_breakout/squeeze/grind/none"
      }
    ],
    "danger_zones": ["危险价位1", "危险价位2"],
    "safe_zones": ["相对安全区间1"],
    "defense_plan": ["防御建议1", "防御建议2"]
  }
}

硬约束：
- 你是在模拟庄家思维，但最终目的是帮助散户防御
- signal 应该表示散户应该采取的方向（与庄家意图相反）
- 必须给出具体可操作的防御建议
- 推测必须基于数据，不能凭空编造价位
"""


class AdversarialAgent(BaseAgent):
    """对抗推演智能体 — 模拟庄家AI进行反向博弈推演。"""

    AGENT_ID: str = "adversarial"

    async def analyze(self, data: MarketData) -> AgentReport:
        """从庄家视角推演下一步操作，生成防御建议。"""
        # 1. 收集上下文（PlaybookAgent + AIDetector 的缓存结果）
        context = await self._gather_context(data.symbol)

        # 2. 构建 prompt
        user_prompt = self._build_prompt(data, context)

        # 3. 调用 deepseek-reasoner 进行深度博弈推理
        try:
            enriched_prompt = await self._enrich_prompt(_SYSTEM_PROMPT, data.symbol)
            from app.core.model_router import get_model_for_agent
            _model_key = await get_model_for_agent("adversarial")
            result = await llm_client.call_model(
                model_key=_model_key,
                system_prompt=enriched_prompt,
                user_prompt=user_prompt,
                temperature=0.3,
                timeout_s=110.0,
            )

            signal = result.get("signal", "neutral")
            if signal not in ("bullish", "bearish", "neutral"):
                signal = "neutral"

            confidence = float(result.get("confidence", 0.0))
            confidence = min(max(confidence, 0.0), 1.0)

            adv = result.get("adversarial_analysis", {})

            return AgentReport(
                agent_id=self.AGENT_ID,
                symbol=data.symbol,
                signal=signal,
                confidence=confidence,
                reasoning=result.get("reasoning", ""),
                key_findings=result.get("key_findings", []),
                raw_data={
                    "dealer_intent": adv.get("dealer_intent", ""),
                    "predicted_moves": adv.get("predicted_moves", []),
                    "danger_zones": adv.get("danger_zones", []),
                    "safe_zones": adv.get("safe_zones", []),
                    "defense_plan": adv.get("defense_plan", []),
                },
            )

        except Exception as exc:
            logger.error("AdversarialAgent failed", extra={"error": str(exc)})
            return AgentReport(
                agent_id=self.AGENT_ID,
                symbol=data.symbol,
                signal="neutral",
                confidence=0.0,
                reasoning=f"对抗推演失败: {exc}",
                key_findings=[],
                raw_data={},
            )

    # ── 上下文收集 ────────────────────────────────────────────

    @staticmethod
    async def _gather_context(symbol: str) -> dict[str, Any]:
        """从 Redis 读取 PlaybookAgent 和 AIDetector 的缓存结果。"""
        context: dict[str, Any] = {}
        symbol = symbol.upper()

        try:
            # AI 操盘检测结果
            ai_data = await get_json(f"ai_detect:{symbol}")
            if ai_data:
                context["ai_detection"] = ai_data

            # 策略缓存（包含 PlaybookAgent 的剧本匹配）
            strategy = await get_json(f"strategy:latest:{symbol}")
            if strategy:
                context["latest_strategy"] = strategy

            # 反思洞察（如有）
            reflection = await get_json(f"reflection:insights:{symbol}")
            if reflection:
                context["reflection"] = reflection

        except Exception as exc:
            logger.warning("Failed to gather adversarial context", extra={"error": str(exc)})

        return context

    # ── Prompt 构建 ───────────────────────────────────────────

    @staticmethod
    def _build_prompt(data: MarketData, context: dict[str, Any]) -> str:
        """构建对抗推演的用户提示词。"""
        parts: list[str] = [
            f"## 对抗推演任务：{data.symbol}",
            f"当前价格: {data.current_price}",
        ]

        # 价格结构（庄家关注的关键位）
        parts.append("\n### 价格结构")
        if data.indicators:
            ind = data.indicators
            parts.append(f"EMA7={ind.ema7} EMA25={ind.ema25} EMA99={ind.ema99}")
            parts.append(f"RSI={ind.rsi} MACD={ind.macd}")
            parts.append(f"布林带: Upper={ind.bb_upper} Lower={ind.bb_lower}")
            if ind.support_levels:
                parts.append(f"支撑位: {ind.support_levels}")
            if ind.resistance_levels:
                parts.append(f"阻力位: {ind.resistance_levels}")
            if ind.volume_ratio is not None:
                parts.append(f"量比: {ind.volume_ratio:.2f}")

        # 多周期K线（庄家需要看趋势）
        for label, klines in [("1h", data.klines_1h), ("4h", data.klines_4h), ("1d", data.klines_1d)]:
            if klines and len(klines) >= 3:
                recent = klines[-3:]
                parts.append(f"\n{label} 最近3根:")
                for k in recent:
                    parts.append(f"  O={k.open} H={k.high} L={k.low} C={k.close} V={k.volume}")

        # 链上数据（庄家资金流向）
        if data.onchain:
            oc = data.onchain
            parts.append("\n### 链上数据（庄家资金线索）")
            parts.append(f"交易所净流入: {oc.exchange_netflow}")
            parts.append(f"巨鲸24h变化: {oc.whale_change_24h}")
            parts.append(f"恐慌贪婪: {oc.fear_greed_index}")
            if oc.large_tx_count is not None:
                parts.append(f"大额转账: {oc.large_tx_count} 笔")

        # AI 操盘检测结果
        ai = context.get("ai_detection")
        if ai:
            parts.append("\n### AI操盘检测结果")
            parts.append(f"AI概率: {ai.get('ai_probability', '?')}%")
            parts.append(f"操作模式: {ai.get('operation_mode', '?')}")
            tactics = ai.get("tactics_detected", [])
            if tactics:
                parts.append(f"已识别战术: {', '.join(tactics)}")
            evidence = ai.get("evidence", [])
            if evidence:
                parts.append(f"证据: {'; '.join(evidence[:5])}")

        # 最新策略（散户可能的持仓方向）
        strat = context.get("latest_strategy")
        if strat:
            parts.append("\n### 当前策略建议（散户视角）")
            parts.append(f"方向: {strat.get('direction', '?')}")
            parts.append(f"进场: {strat.get('entry_price', '?')}")
            parts.append(f"止损: {strat.get('stop_loss', '?')}")
            parts.append(f"止盈: {strat.get('take_profit', '?')}")

        # 合约数据（庄家的杠杆操控线索）
        if data.derivatives:
            d = data.derivatives
            parts.append("\n### 合约数据（杠杆操控线索）")
            if d.funding_rate is not None:
                parts.append(f"资金费率: {d.funding_rate}")
            if d.predicted_funding_rate is not None:
                parts.append(f"预测资金费率: {d.predicted_funding_rate}")
            if d.long_short_ratio is not None:
                parts.append(f"多空比: {d.long_short_ratio}")
            if d.liquidation_1h_usd is not None:
                parts.append(f"1h爆仓(USD): {d.liquidation_1h_usd:,.0f}")
                if d.liquidation_1h_long_pct is not None:
                    parts.append(f"多头爆仓占比: {d.liquidation_1h_long_pct:.1%}")

        # CoinGlass 衍生品数据（庄家行为核心线索）
        cg = data.coinglass
        if cg:
            parts.append("\n### CoinGlass 衍生品（庄家深层线索）")
            if cg.oi_snapshots:
                latest = cg.oi_snapshots[-1]
                parts.append(f"OI持仓量: {latest.get('oi', 'N/A')} 变化: {latest.get('oi_change_pct', 'N/A')}%")
            if cg.cvd_snapshots:
                latest = cg.cvd_snapshots[-1]
                parts.append(f"CVD(累计成交量差): {latest.get('cvd', 'N/A')}")
            if cg.netflow_snapshots:
                latest = cg.netflow_snapshots[-1]
                parts.append(f"期货净流入: {latest.get('netflow', 'N/A')}")
            if cg.large_orders:
                parts.append(f"大单挂单数: {len(cg.large_orders)}")
                for order in cg.large_orders[:5]:
                    parts.append(
                        f"  价格={order.get('price', '?')} "
                        f"量={order.get('quantity', '?')} "
                        f"方向={order.get('side', '?')}"
                    )
            if cg.option_max_pain:
                parts.append(f"期权Max Pain: {cg.option_max_pain.get('max_pain_price', 'N/A')}")

        parts.append(
            "\n\n请站在庄家AI的角度，推演接下来最可能的操纵策略，"
            "并给出散户应采取的防御措施。"
        )

        return "\n".join(parts)
