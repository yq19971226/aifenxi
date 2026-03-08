"""剧本推演智能体 — 综合技术信号+链上信号+情绪数据匹配庄家操盘剧本。

- 从知识库加载12种核心剧本模式（含反制策略模板）
- 构建 prompt 包含市场数据与剧本特征
- 调用 phase_tracker 检测阶段转换并注入上下文
- 调用 LLM 匹配最可能的剧本并给出概率
- 输出：matched_playbook, probability, stage_description, next_move, current_phase, counter_strategy
"""

import logging
from typing import Any, Literal

from app.agents.base import AgentReport, BaseAgent
from app.agents.phase_tracker import (
    PhaseTransition,
    detect_transition,
    get_current_phase,
    _PHASE_LABELS,
)
from app.agents.playbook_patterns import (
    PLAYBOOK_PATTERNS,
    PLAYBOOK_SIGNAL_MAP,
    VALID_PLAYBOOK_NAMES,
)
from app.core.llm_client import llm_client
from app.models.market_data import MarketData

logger = logging.getLogger(__name__)

_SYSTEM_PROMPT = """你是一位资深加密货币庄家行为分析师，擅长从多维数据推演庄家操盘剧本并制定反制策略。

根据提供的市场数据（技术指标、链上数据、情绪数据），从以下12种庄家操盘剧本中匹配最可能的一种，并给出各剧本的概率分布。同时，基于匹配的剧本和当前实时数据，给出具体的反制策略和交易点位建议。

【硬约束 - 反幻觉规则】
1. 剧本匹配概率必须基于输入数据中实际存在的特征计算，禁止凭空赋予概率
2. 禁止引用输入中未提供的市场事件或数据
3. 当关键数据缺失时，必须在 reasoning 中明确说明数据不足对判断的影响
4. counter_strategy 中的点位必须基于当前实际价格、支撑阻力位、ATR计算，禁止编造点位

"""


def _build_system_prompt() -> str:
    """构建包含知识库剧本定义的系统 prompt。"""
    parts: list[str] = [_SYSTEM_PROMPT, "## 庄家操盘剧本知识库\n"]

    for i, pattern in enumerate(PLAYBOOK_PATTERNS, 1):
        cs = pattern.counter_strategy
        parts.append(f"### 剧本{i}: {pattern.name}")
        parts.append(f"特征: {', '.join(pattern.features)}")
        parts.append(f"后续走势: {pattern.aftermath}")
        parts.append(f"策略类型: {pattern.strategy_type}")
        parts.append(f"反制方案: {cs.action}")
        parts.append(f"进场逻辑: {cs.entry_logic}")
        parts.append(f"止损逻辑: {cs.stop_loss_logic}")
        parts.append(f"止盈逻辑: {cs.target_logic}")
        parts.append(f"确认信号: {cs.wait_signal}")
        parts.append("")

    all_names = [p.name for p in PLAYBOOK_PATTERNS]
    prob_example = ", ".join(f'"{n}": 0.xx' for n in all_names)
    parts.append(f"""你必须以 JSON 格式回复，包含以下字段：
{{
  "matched_playbook": "最匹配的剧本名称",
  "probability": 0.0 到 1.0 之间的浮点数（最匹配剧本的概率）,
  "all_probabilities": {{{prob_example}}},
  "stage_description": "当前所处阶段的描述",
  "next_move": "预计庄家下一步行动",
  "confidence": 0.0 到 1.0 之间的浮点数,
  "reasoning": "详细分析理由",
  "counter_strategy": {{
    "action": "反制动作描述",
    "strategy_type": "策略类型（反向策略/规避策略/忍耐策略/跟随策略/顺势策略/时间策略）",
    "entry_price": "建议进场价格或区间（基于当前价格和指标计算）",
    "stop_loss": "建议止损价格",
    "take_profit_1": "第一止盈目标",
    "take_profit_2": "第二止盈目标（可选）",
    "wait_signal": "入场确认信号",
    "risk_warning": "风险提醒",
    "risk_level": "aggressive/moderate/conservative"
  }}
}}""")

    return "\n".join(parts)


def _build_user_prompt(
    data: MarketData,
    current_phase: str = "",
    transition: PhaseTransition | None = None,
) -> str:
    """从 MarketData 提取技术+链上+情绪数据构建用户 prompt。"""
    parts: list[str] = [
        f"交易对: {data.symbol}",
        f"当前价格: {data.current_price}",
    ]

    # 阶段信息
    if current_phase:
        from app.agents.phase_tracker import MarketPhase
        label = _PHASE_LABELS.get(MarketPhase(current_phase), current_phase)
        parts.append(f"\n## 当前操盘阶段: {label}({current_phase})")
        if transition:
            from_label = _PHASE_LABELS.get(transition.from_phase, transition.from_phase.value)
            to_label = _PHASE_LABELS.get(transition.to_phase, transition.to_phase.value)
            parts.append(f"阶段转换: {from_label} → {to_label}")
            if transition.reason:
                parts.append(f"转换原因: {transition.reason}")

    # 技术指标
    ind = data.indicators
    if ind:
        parts.append("\n## 技术指标")
        if ind.ema7 is not None:
            parts.append(f"EMA(7): {ind.ema7}")
        if ind.ema25 is not None:
            parts.append(f"EMA(25): {ind.ema25}")
        if ind.ema99 is not None:
            parts.append(f"EMA(99): {ind.ema99}")
        if ind.rsi is not None:
            parts.append(f"RSI(14): {ind.rsi}")
        if ind.macd is not None:
            parts.append(f"MACD: {ind.macd}, Signal: {ind.macd_signal}")
        if ind.bb_upper is not None:
            parts.append(f"布林带: Upper={ind.bb_upper}, Lower={ind.bb_lower}")
        if ind.support_levels:
            parts.append(f"支撑位: {ind.support_levels}")
        if ind.resistance_levels:
            parts.append(f"阻力位: {ind.resistance_levels}")
        # 量价指标
        if ind.obv is not None:
            parts.append(f"OBV: {ind.obv}")
        if ind.vwap is not None:
            parts.append(f"VWAP: {ind.vwap}")
        if ind.volume_ratio is not None:
            parts.append(f"量比: {ind.volume_ratio:.2f}")
        if ind.volume_price_divergence and ind.volume_price_divergence != "none":
            parts.append(f"⚠️ 量价背离: {ind.volume_price_divergence}")
    else:
        parts.append("\n技术指标: 数据缺失")

    # 链上数据
    oc = data.onchain
    if oc:
        parts.append("\n## 链上数据")
        if oc.exchange_netflow is not None:
            flow_dir = "净流入" if oc.exchange_netflow > 0 else "净流出"
            parts.append(f"交易所净流量: {oc.exchange_netflow:+.4f} ({flow_dir})")
        else:
            parts.append("交易所净流量: 数据缺失")

        if oc.whale_change_24h is not None:
            parts.append(f"巨鲸持仓24h变化: {oc.whale_change_24h:+.4f}%")
        else:
            parts.append("巨鲸持仓24h变化: 数据缺失")

        if oc.fear_greed_index is not None:
            parts.append(f"恐慌贪婪指数: {oc.fear_greed_index}/100")
        else:
            parts.append("恐慌贪婪指数: 数据缺失")

        if oc.mvrv is not None:
            parts.append(f"MVRV: {oc.mvrv:.4f}")
        else:
            parts.append("MVRV: 数据缺失")
        if oc.active_addresses is not None:
            parts.append(f"活跃地址数: {oc.active_addresses:,}")
        if oc.new_addresses is not None:
            parts.append(f"新增地址数: {oc.new_addresses:,}")
        if oc.exchange_balance is not None:
            parts.append(f"交易所余额: {oc.exchange_balance:,.2f}")
        if oc.large_tx_count is not None:
            parts.append(f"⚠️ 大额转账: {oc.large_tx_count} 笔")
            if oc.large_tx_volume is not None:
                parts.append(f"大额转账总量: {oc.large_tx_volume:,.2f}")
        if oc.miner_reserve_change is not None:
            direction = "增持" if oc.miner_reserve_change > 0 else "减持"
            parts.append(f"矿工储备变化: {oc.miner_reserve_change:+,.2f} ({direction})")
    else:
        parts.append("\n链上数据: 全部缺失")

    # 最近日线 K线摘要
    if data.klines_1d:
        recent = data.klines_1d[-5:]
        kline_summary = ", ".join(
            f"[O={k.open} H={k.high} L={k.low} C={k.close} V={k.volume}]"
            for k in recent
        )
        parts.append(f"\n最近日线: {kline_summary}")

    # 合约数据
    deriv = data.derivatives
    if deriv:
        parts.append("\n## 合约数据")
        if deriv.funding_rate is not None:
            rate_pct = deriv.funding_rate * 100
            parts.append(f"资金费率: {rate_pct:+.4f}%")
        if deriv.long_short_ratio is not None:
            parts.append(f"多空比: {deriv.long_short_ratio:.4f}")
        if deriv.liquidation_1h_usd is not None:
            parts.append(f"1h爆仓总额: ${deriv.liquidation_1h_usd:,.0f}")
        if deriv.liquidation_1h_long_pct is not None:
            parts.append(f"多头爆仓占比: {deriv.liquidation_1h_long_pct:.1f}%")

    return "\n".join(parts)


class PlaybookAgent(BaseAgent):
    """剧本推演智能体 — 单一职责：综合多维数据匹配庄家操盘剧本。"""

    AGENT_ID: str = "playbook"

    async def analyze(self, data: MarketData) -> AgentReport:
        """分析市场数据，调用 LLM 匹配庄家操盘剧本。

        流程：
        1. 调用 phase_tracker 检测阶段转换
        2. 将阶段信息注入 prompt 上下文
        3. 调用 LLM 匹配剧本
        4. 在 raw_data 中附加 current_phase 和 phase_transition
        """
        # 阶段追踪（优雅降级：失败时 phase_info 为 None）
        transition: PhaseTransition | None = None
        current_phase_str: str = ""
        try:
            transition = await detect_transition(data.symbol, data)
            phase = await get_current_phase(data.symbol)
            if phase is not None:
                current_phase_str = phase.value
        except Exception as exc:
            logger.warning(
                "Phase tracking failed, continuing without phase info",
                extra={"symbol": data.symbol, "error": str(exc)},
            )

        system_prompt = _build_system_prompt()
        user_prompt = _build_user_prompt(data, current_phase_str, transition)

        try:
            enriched_prompt = await self._enrich_prompt(system_prompt, data.symbol)
            from app.core.model_router import get_model_for_agent
            _model_key = await get_model_for_agent("playbook")
            result: dict[str, Any] = await llm_client.call_model(
                model_key=_model_key,
                system_prompt=enriched_prompt,
                user_prompt=user_prompt,
            )

            return self._parse_result(
                result, data.symbol, current_phase_str, transition
            )

        except Exception as exc:
            logger.error(
                "PlaybookAgent analyze failed",
                extra={"symbol": data.symbol, "error": str(exc)},
            )
            return self._fallback_report(data.symbol, str(exc))

    def _parse_result(
        self,
        result: dict[str, Any],
        symbol: str,
        current_phase: str = "",
        transition: PhaseTransition | None = None,
    ) -> AgentReport:
        """解析 LLM 返回结果，构建 AgentReport。"""
        # 解析 matched_playbook
        matched: str = result.get("matched_playbook", "")
        if matched not in VALID_PLAYBOOK_NAMES:
            matched = ""

        # 映射 signal：从知识库查找，未匹配则 neutral
        signal: Literal["bullish", "bearish", "neutral"] = PLAYBOOK_SIGNAL_MAP.get(
            matched, "neutral"
        )

        # 解析 probability
        probability: float = result.get("probability", 0.0)
        if not isinstance(probability, (int, float)) or not (0.0 <= probability <= 1.0):
            probability = 0.0

        # 解析 confidence
        confidence: float = result.get("confidence", 0.0)
        if not isinstance(confidence, (int, float)) or not (0.0 <= confidence <= 1.0):
            confidence = 0.0

        # 解析 all_probabilities
        all_probs: dict[str, float] = result.get("all_probabilities", {})
        if not isinstance(all_probs, dict):
            all_probs = {}

        # 解析文本字段
        stage_description: str = result.get("stage_description", "")
        if not isinstance(stage_description, str):
            stage_description = ""

        next_move: str = result.get("next_move", "")
        if not isinstance(next_move, str):
            next_move = ""

        reasoning: str = result.get("reasoning", "")
        if not isinstance(reasoning, str):
            reasoning = ""

        # 解析反制策略
        counter_strategy: dict[str, Any] = result.get("counter_strategy", {})
        if not isinstance(counter_strategy, dict):
            counter_strategy = {}

        # 构建 key_findings
        key_findings: list[str] = []
        if matched:
            key_findings.append(f"匹配剧本: {matched} (概率: {probability:.0%})")
        if stage_description:
            key_findings.append(f"当前阶段: {stage_description}")
        if next_move:
            key_findings.append(f"下一步预判: {next_move}")
        if counter_strategy.get("action"):
            key_findings.append(f"反制策略: {counter_strategy['action']}")

        return AgentReport(
            agent_id=self.AGENT_ID,
            symbol=symbol,
            signal=signal,
            confidence=confidence,
            reasoning=reasoning or f"匹配剧本: {matched}" if matched else "无明确匹配",
            key_findings=key_findings,
            raw_data={
                "matched_playbook": matched,
                "probability": probability,
                "all_probabilities": all_probs,
                "stage_description": stage_description,
                "next_move": next_move,
                "counter_strategy": counter_strategy,
                "is_fallback": result.get("is_fallback", False),
                "current_phase": current_phase,
                "phase_transition": (
                    {
                        "from": transition.from_phase.value,
                        "to": transition.to_phase.value,
                        "reason": transition.reason,
                    }
                    if transition
                    else None
                ),
            },
        )

    def _fallback_report(self, symbol: str, error: str) -> AgentReport:
        """异常降级报告 — signal 固定 neutral。"""
        return AgentReport(
            agent_id=self.AGENT_ID,
            symbol=symbol,
            signal="neutral",
            confidence=0.0,
            reasoning=f"剧本推演失败: {error}",
            key_findings=["剧本推演过程中发生异常"],
            raw_data={
                "matched_playbook": "",
                "probability": 0.0,
                "all_probabilities": {},
                "stage_description": "",
                "next_move": "",
                "error": error,
                "is_fallback": True,
                "current_phase": "",
                "phase_transition": None,
            },
        )
