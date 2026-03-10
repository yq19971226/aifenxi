"""链上解读智能体 — 基于链上数据调用 LLM 解读庄家行为阶段。

- 从 MarketData 提取链上快照（交易所净流入、巨鲸变化、恐慌贪婪、MVRV）
- 构建 prompt 要求模型输出 JSON（phase, confidence, evidence, warning, next_likely_move）
- 解析响应构建 AgentReport
"""

import json
import logging
from datetime import datetime, timezone
from typing import Literal

from app.agents.base import AgentReport, BaseAgent
from app.agents.i18n_prompts import get_system_prompt
from app.agents.language_detect import check_language_mismatch
from app.core.llm_client import llm_client
from app.models.market_data import MarketData

logger = logging.getLogger(__name__)

# 合法庄家行为阶段
VALID_PHASES: set[str] = {"吸筹", "洗盘", "拉盘", "派发", "出逃", "观望"}

# 阶段 → 信号映射
_PHASE_SIGNAL_MAP: dict[str, Literal["bullish", "bearish", "neutral"]] = {
    "吸筹": "bullish",
    "拉盘": "bullish",
    "派发": "bearish",
    "出逃": "bearish",
    "洗盘": "neutral",
    "观望": "neutral",
}

_SYSTEM_PROMPT = """你是一位专业的加密货币链上数据分析师，擅长从庄家视角解读链上行为。
根据提供的链上数据，判断当前庄家所处的操盘阶段。

庄家操盘阶段定义：
- 吸筹：交易所净流出增加，巨鲸悄悄增仓，市场情绪低迷，MVRV偏低
- 洗盘：短期急跌制造恐慌，交易所流入激增但巨鲸未减仓，恐慌贪婪指数骤降
- 拉盘：交易所余额持续下降，巨鲸持仓稳定或增加，MVRV适中，情绪回暖
- 派发：交易所流入激增，巨鲸开始减仓，MVRV偏高，情绪极度贪婪
- 出逃：大量筹码涌入交易所，巨鲸大幅减仓，MVRV极高，市场狂热
- 观望：数据无明显方向性，各指标中性

扩展链上指标解读规则：
- 活跃地址数：上升表示市场参与度增加，吸筹/拉盘阶段常见；骤降可能是洗盘信号
- 新增地址数：持续增长表示新资金入场，配合价格上涨为拉盘确认
- 交易所余额：持续下降 → 筹码被提走（吸筹/拉盘）；急剧上升 → 大量充值准备抛售（派发/出逃）
- 大额转账：频繁大额转账 → 庄家在调仓；配合交易所流入 → 可能准备派发
- 矿工储备变化：矿工增持 → 看好后市；矿工减持 → 可能准备抛压

你必须以 JSON 格式回复，包含以下字段：
{
  "phase": "吸筹" | "洗盘" | "拉盘" | "派发" | "出逃" | "观望",
  "confidence": 0.0 到 1.0 之间的浮点数,
  "evidence": ["证据1", "证据2", ...],
  "warning": "风险提示字符串，无则为 null",
  "next_likely_move": "对庄家下一步行动的预判"
}

【硬约束 - 反幻觉规则】
1. 禁止编造链上指标数值，所有输出数据必须来自输入
2. 当输入数据标注为"数据缺失"时，对应分析字段必须标注为"数据不足，无法判断"，禁止给出推测值
3. evidence 列表中每条证据必须引用输入中的具体数值"""


def _build_user_prompt(data: MarketData) -> str:
    """从 MarketData 提取链上数据构建用户 prompt。"""
    parts: list[str] = [
        f"交易对: {data.symbol}",
        f"当前价格: {data.current_price}",
    ]

    oc = data.onchain
    if oc:
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

        # 扩展链上指标
        if oc.active_addresses is not None:
            parts.append(f"活跃地址数: {oc.active_addresses:,}")
        else:
            parts.append("活跃地址数: 数据缺失")

        if oc.new_addresses is not None:
            parts.append(f"新增地址数: {oc.new_addresses:,}")
        else:
            parts.append("新增地址数: 数据缺失")

        if oc.exchange_balance is not None:
            parts.append(f"交易所余额: {oc.exchange_balance:,.2f}")
        else:
            parts.append("交易所余额: 数据缺失")

        if oc.large_tx_count is not None:
            parts.append(f"⚠️ 大额转账活跃: {oc.large_tx_count} 笔")
            if oc.large_tx_volume is not None:
                parts.append(f"大额转账总量: {oc.large_tx_volume:,.2f}")
        else:
            parts.append("大额转账: 数据缺失")

        if oc.miner_reserve_change is not None:
            direction = "增持" if oc.miner_reserve_change > 0 else "减持"
            parts.append(f"矿工储备变化: {oc.miner_reserve_change:+,.2f} ({direction})")
        else:
            parts.append("矿工储备变化: 数据缺失")
    else:
        parts.append("链上数据: 全部缺失，请基于有限信息给出观望判断")

    # 补充价格趋势上下文（最近5根1d K线）
    if data.klines_1d:
        recent = data.klines_1d[-5:]
        kline_summary = ", ".join(
            f"[O={k.open} H={k.high} L={k.low} C={k.close} V={k.volume}]"
            for k in recent
        )
        parts.append(f"最近日线: {kline_summary}")

    return "\n".join(parts)


class OnchainAgent(BaseAgent):
    """链上解读智能体 — 单一职责：基于链上数据解读庄家行为阶段。"""

    AGENT_ID: str = "onchain"

    async def analyze(self, data: MarketData) -> AgentReport:
        """分析链上数据，调用 LLM 生成庄家行为解读报告。"""
        user_prompt = _build_user_prompt(data)

        try:
            locale = getattr(data, "locale", "zh-CN")
            system_prompt = get_system_prompt("onchain", locale)
            enriched_prompt = await self._enrich_prompt(system_prompt, data.symbol)
            from app.core.model_router import get_model_for_agent
            _model_key = await get_model_for_agent("onchain")
            result = await llm_client.call_model(
                model_key=_model_key,
                system_prompt=enriched_prompt,
                user_prompt=user_prompt,
            )

            # 解析 phase
            phase: str = result.get("phase", "观望")
            if phase not in VALID_PHASES:
                phase = "观望"

            # 映射 signal
            signal = _PHASE_SIGNAL_MAP.get(phase, "neutral")

            # 解析 confidence
            confidence = result.get("confidence", 0.0)
            if not isinstance(confidence, (int, float)) or not (0.0 <= confidence <= 1.0):
                confidence = 0.0

            # 解析 evidence
            evidence: list[str] = result.get("evidence", [])
            if not isinstance(evidence, list):
                evidence = []

            # 解析 warning
            warning: str | None = result.get("warning")
            if not isinstance(warning, str):
                warning = None

            # 解析 next_likely_move
            next_likely_move: str = result.get("next_likely_move", "")
            if not isinstance(next_likely_move, str):
                next_likely_move = ""

            # 构建 key_findings
            key_findings: list[str] = [f"庄家阶段: {phase}"]
            key_findings.extend(evidence)
            if warning:
                key_findings.append(f"⚠️ {warning}")
            if next_likely_move:
                key_findings.append(f"下一步预判: {next_likely_move}")

            reasoning_text = result.get("reasoning", f"当前判断庄家处于{phase}阶段")
            content_locale, lang_mismatch = check_language_mismatch(
                reasoning_text, locale,
            )

            return AgentReport(
                agent_id=self.AGENT_ID,
                symbol=data.symbol,
                signal=signal,
                confidence=confidence,
                reasoning=reasoning_text,
                key_findings=key_findings,
                raw_data={
                    "phase": phase,
                    "confidence": confidence,
                    "evidence": evidence,
                    "warning": warning,
                    "next_likely_move": next_likely_move,
                    "is_fallback": result.get("is_fallback", False),
                },
                content_locale=content_locale,
                language_mismatch=lang_mismatch,
            )

        except Exception as exc:
            logger.error(
                "OnchainAgent analyze failed",
                extra={"symbol": data.symbol, "error": str(exc)},
            )
            return AgentReport(
                agent_id=self.AGENT_ID,
                symbol=data.symbol,
                signal="neutral",
                confidence=0.0,
                reasoning=f"链上分析失败: {exc}",
                key_findings=["链上分析过程中发生异常"],
                raw_data={
                    "phase": "观望",
                    "confidence": 0.0,
                    "evidence": [],
                    "warning": None,
                    "next_likely_move": "",
                    "error": str(exc),
                    "is_fallback": True,
                },
            )
