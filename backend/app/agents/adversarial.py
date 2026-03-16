"""AdversarialAgent — 对抗推演智能体（多策略版）。

站在庄家AI的视角进行博弈推演：
1. 读取当前市场状态 + PlaybookAgent 输出 + AIDetector 检测结果
2. 模拟庄家AI的决策逻辑，推演其下一步操作
3. 根据庄家所处阶段，选择最优应对策略：跟随/防御/逆向/观望

核心理念：
- "要打败AI，先要像AI一样思考"
- 庄家不是永远的敌人 — 吸筹期跟随，派发期防御，猎杀后逆向
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
    strategy_type: str = "defend"                    # follow/defend/contra/wait
    predicted_moves: list[AdversarialMove] = Field(default_factory=list)
    danger_zones: list[str] = Field(default_factory=list)   # 危险价位区间
    safe_zones: list[str] = Field(default_factory=list)     # 相对安全区间
    opportunity_zones: list[str] = Field(default_factory=list)  # 机会区间
    action_plan: list[str] = Field(default_factory=list)    # 行动计划


# ── 系统提示词 ───────────────────────────────────────────────

_SYSTEM_PROMPT = """你是一个加密货币庄家AI的模拟器兼博弈策略师。
你的任务分两步：
1. 站在庄家/做市商的角度，推演其下一步操作
2. 基于庄家所处阶段，为散户选择最优应对策略

## 第一步：模拟庄家思维
像一个追求利润最大化的庄家AI一样思考：
- 分析当前散户的持仓分布和止损位置
- 识别最容易收割的流动性区域
- 推演最优的操纵路径
- 预测时间窗口偏好（结算时间、低流动性时段等）

## 第二步：选择应对策略
庄家不是永远的敌人。根据庄家所处阶段选择最优策略：

1. 吸筹期（低位建仓、链上净流出、恐慌指数低）→ strategy_type=follow, signal=bullish — 跟随庄家买入
2. 拉升期（庄家拉升前半段、量增价涨）→ strategy_type=follow, signal=bullish — 顺势做多但设好止盈
3. 试盘/洗盘（假跌破、量缩价跌、CVD不跟随下跌）→ strategy_type=contra, signal=bullish — 识别陷阱，等洗盘结束后低吸
4. 派发期（高位放量、巨鲸转入交易所、OI持续攀升）→ strategy_type=defend, signal=bearish — 减仓离场
5. 猎杀止损（快速砸盘扫止损、短时间价格暴跌后收回）→ strategy_type=contra, signal=bullish — 不追空，等猎杀结束后逆向接
6. 假拉升诱多（快速拉升制造FOMO、量价背离、巨鲸同时出货）→ strategy_type=contra, signal=bearish — 假突破不追多，等回落做空
7. 砸盘出货（真实出货、链上大额卖出、CVD持续下降）→ strategy_type=defend, signal=bearish — 严格止损，防御为主
8. 震荡不明（无明确方向、数据矛盾、多空力量均衡）→ strategy_type=wait, signal=neutral — 观望等待明确信号

判断依据：
- 链上数据：巨鲸净流出=吸筹, 净流入=出货
- CVD趋势：CVD上升+价格横盘=隐性吸筹, CVD持续下降=真实抛压
- 恐慌贪婪指数：极度恐慌+庄家买=经典反转窗口
- AI操盘检测：概率高=庄家深度控盘
- 成交量：缩量下跌=洗盘, 放量下跌=真跌, 放量拉升但巨鲸出货=假拉升
- 大单方向：大单买入集中=真金白银建仓
- 猎杀结束信号：价格回升至猎杀前水平50%以上 + CVD反转 + 成交量放大
- 洗盘结束信号：跌幅收窄 + 成交量极度萎缩 + 出现止跌K线（下影线）

请以 JSON 格式回复：
{
  "signal": "bullish" | "bearish" | "neutral",
  "confidence": 0.0-1.0,
  "reasoning": "从庄家视角的综合推演+策略选择理由",
  "key_findings": ["发现1", "发现2"],
  "adversarial_analysis": {
    "dealer_intent": "庄家当前最可能的意图（一句话）",
    "dealer_phase": "accumulation/markup/distribution/markdown/shakeout/hunt/unclear",
    "strategy_type": "follow/defend/contra/wait",
    "strategy_reason": "为什么选择这个策略（一句话）",
    "predicted_moves": [
      {
        "action": "操作描述",
        "probability": 0.0-1.0,
        "timeframe": "1h/4h/1d",
        "target_price": "目标价位或区间",
        "trap_type": "stop_hunt/fake_breakout/squeeze/grind/none"
      }
    ],
    "danger_zones": ["危险价位1"],
    "safe_zones": ["相对安全区间1"],
    "opportunity_zones": ["机会区间1（如洗盘后的低吸区）"],
    "action_plan": ["行动建议1", "行动建议2"]
  }
}

硬约束：
- signal 表示散户当前最优操作方向，不是简单地与庄家相反
- strategy_type 必须与 signal 和 reasoning 逻辑一致
- 推测必须基于数据，不能凭空编造价位
- 当数据不足以判断庄家阶段时，strategy_type 应为 wait
- follow 策略必须至少有2个维度的数据交叉确认（如链上净流出+大单买入、CVD上升+恐慌指数低），单一指标不足以支持 follow
- follow 策略的 action_plan 必须包含止损位（基于近期低点或支撑位）和止盈区间（基于阻力位）
- contra 策略的 action_plan 必须说明入场确认信号（不能盲目抄底/摸顶）和止损位
- defend 策略的 action_plan 必须包含减仓比例建议和严格止损位
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
                    "dealer_phase": adv.get("dealer_phase", "unclear"),
                    "strategy_type": adv.get("strategy_type", "wait"),
                    "strategy_reason": adv.get("strategy_reason", ""),
                    "predicted_moves": adv.get("predicted_moves", []),
                    "danger_zones": adv.get("danger_zones", []),
                    "safe_zones": adv.get("safe_zones", []),
                    "opportunity_zones": adv.get("opportunity_zones", []),
                    "action_plan": adv.get("action_plan", adv.get("defense_plan", [])),
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
                # 过滤：只保留距当前价±15%以内的有效大单
                current = data.current_price or 0
                relevant = []
                if current > 0:
                    for o in cg.large_orders:
                        try:
                            p = float(o.get('price', 0) or 0)
                            if p > 0 and abs(p - current) / current <= 0.15:
                                relevant.append(o)
                        except (ValueError, TypeError):
                            continue
                else:
                    relevant = cg.large_orders
                parts.append(f"大单挂单数: {len(cg.large_orders)}（有效范围内: {len(relevant)}）")
                for order in relevant[:5]:
                    parts.append(
                        f"  价格={order.get('price', '?')} "
                        f"量={order.get('amount', '?')} "
                        f"USD={order.get('usd_value', '?')} "
                        f"方向={order.get('side', '?')}"
                    )
            if cg.option_max_pain:
                parts.append(f"期权Max Pain: {cg.option_max_pain.get('max_pain_price', 'N/A')}")

        parts.append(
            "\n\n请站在庄家AI的角度，推演接下来最可能的操纵策略，"
            "判断庄家当前所处阶段，并为散户选择最优应对策略（跟随/防御/逆向/观望）。"
        )

        return "\n".join(parts)
