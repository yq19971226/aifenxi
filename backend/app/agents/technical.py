"""技术分析智能体 — 基于指标数据调用 LLM 生成交易信号。

- 从 MarketData 提取指标摘要
- 构建 prompt 要求模型输出 JSON
- 解析响应构建 AgentReport
"""

import logging
from datetime import datetime, timezone

from app.agents.base import AgentReport, BaseAgent
from app.agents.i18n_prompts import get_system_prompt
from app.agents.language_detect import check_language_mismatch
from app.models.market_data import MarketData

logger = logging.getLogger(__name__)

VALID_TRENDS = ("uptrend", "downtrend", "sideways")

_SYSTEM_PROMPT = """你是一位专业的加密货币技术分析师。
根据提供的多周期技术指标数据，分析支撑阻力位并判断趋势方向，给出交易信号。

分析步骤：
1. 综合输入中已提供的多周期指标（可能包含 5m/15m/1h/4h/1d/1w）判断趋势
2. 识别关键支撑位和阻力位
3. 结合 EMA、RSI、MACD、布林带给出综合信号
4. 量价关系验证：结合 OBV、VWAP、量比判断趋势真假
   - OBV 与价格同向 → 趋势确认；OBV 与价格背离 → 趋势可能反转
   - VWAP 之上为多头区域，之下为空头区域
   - 量比 > 1.5 表示放量，< 0.5 表示缩量
   - 量价背离信号需重点关注，可能预示趋势反转

你必须以 JSON 格式回复，包含以下字段：
{
  "signal": "bullish" | "bearish" | "neutral",
  "confidence": 0.0 到 1.0 之间的浮点数,
  "support_levels": [价格数组],
  "resistance_levels": [价格数组],
  "trend": "uptrend" | "downtrend" | "sideways",
  "reasoning": "详细分析理由"
}

【硬约束 - 反幻觉规则】
1. 禁止编造输入数据中不存在的支撑位或阻力位数值，所有输出价格点位必须可追溯到输入的 K 线或指标数据
2. 当输入数据中某项指标标注为"数据缺失"时，对应分析字段必须标注为"数据不足，无法判断"
3. evidence 或 reasoning 中必须明确引用输入数据中的具体数值作为依据"""


def _format_klines(klines: list, label: str, count: int = 5) -> str:
    """格式化最近 N 根 K 线为摘要字符串。"""
    if not klines:
        return f"{label}: 数据缺失"
    recent = klines[-count:]
    summary = ", ".join(
        f"[O={k.open} H={k.high} L={k.low} C={k.close} V={k.volume}]"
        for k in recent
    )
    return f"{label}: {summary}"


def _build_user_prompt(data: MarketData) -> str:
    """从 MarketData 构建多周期用户 prompt。"""
    ind = data.indicators
    parts: list[str] = [
        f"交易对: {data.symbol}",
        f"当前价格: {data.current_price}",
    ]

    # 技术指标
    if ind:
        parts.append("\n--- 技术指标 ---")
        parts.extend([
            f"EMA(7): {ind.ema7}",
            f"EMA(25): {ind.ema25}",
            f"EMA(99): {ind.ema99}",
            f"RSI(14): {ind.rsi}",
            f"MACD: {ind.macd}, Signal: {ind.macd_signal}, Histogram: {ind.macd_histogram}",
            f"布林带: Upper={ind.bb_upper}, Middle={ind.bb_middle}, Lower={ind.bb_lower}",
            f"支撑位: {ind.support_levels}",
            f"阻力位: {ind.resistance_levels}",
        ])
    else:
        parts.append("\n技术指标: 数据缺失")

    # 量价指标
    if ind:
        vp_parts: list[str] = []
        if ind.obv is not None:
            vp_parts.append(f"OBV: {ind.obv}")
        if ind.vwap is not None:
            vp_parts.append(f"VWAP: {ind.vwap}")
        if ind.volume_ratio is not None:
            vp_parts.append(f"量比: {ind.volume_ratio:.2f}")
        if ind.volume_price_divergence and ind.volume_price_divergence != "none":
            vp_parts.append(f"⚠️ 量价背离信号: {ind.volume_price_divergence}")
        if vp_parts:
            parts.append("\n--- 量价指标 ---")
            parts.extend(vp_parts)

    # 多周期K线摘要（仅展示当前输入中实际可用的周期，避免无关模式误判）
    parts.append("\n--- 多周期K线 ---")
    kline_sections = [
        ("5m", data.klines_5m),
        ("15m", data.klines_15m),
        ("1h", data.klines_1h),
        ("4h", data.klines_4h),
        ("1d", data.klines_1d),
        ("1w", data.klines_1w),
    ]
    available_sections = [(label, klines) for label, klines in kline_sections if klines]
    if available_sections:
        for label, klines in available_sections:
            parts.append(_format_klines(klines, f"{label} K线"))
    else:
        parts.append("多周期K线: 数据缺失")

    # 合约数据
    deriv = data.derivatives
    if deriv:
        parts.append("\n--- 合约数据 ---")
        if deriv.funding_rate is not None:
            parts.append(f"资金费率: {deriv.funding_rate:.6f}")
        if deriv.predicted_funding_rate is not None:
            parts.append(f"预测资金费率: {deriv.predicted_funding_rate:.6f}")
        if deriv.long_short_ratio is not None:
            parts.append(f"多空比: {deriv.long_short_ratio:.4f}")
        if deriv.top_long_short_ratio is not None:
            parts.append(f"大户多空比: {deriv.top_long_short_ratio:.4f}")

    # CoinGlass 衍生品数据
    cg = data.coinglass
    if cg:
        if cg.oi_snapshots:
            parts.append("\n--- OI 持仓量（CoinGlass）---")
            for snap in cg.oi_snapshots[-3:]:
                parts.append(f"  OI={snap.get('oi')} 变化={snap.get('oi_change_pct', 'N/A')}%")
        if cg.cvd_snapshots:
            parts.append("\n--- CVD 累计成交量差（CoinGlass）---")
            for snap in cg.cvd_snapshots[-3:]:
                parts.append(f"  CVD={snap.get('cvd')} 时间={snap.get('time', 'N/A')}")
        if cg.funding_rate_history:
            parts.append("\n--- 资金费率历史（CoinGlass 多交易所）---")
            for snap in cg.funding_rate_history[-3:]:
                parts.append(
                    f"  费率={snap.get('rate', 'N/A')} "
                    f"交易所={snap.get('exchange', 'N/A')}"
                )
        if cg.netflow_snapshots:
            parts.append("\n--- 期货净流入（CoinGlass）---")
            for snap in cg.netflow_snapshots[-3:]:
                parts.append(f"  净流入={snap.get('netflow', 'N/A')} 时间={snap.get('time', 'N/A')}")

    return "\n".join(parts)


class TechnicalAgent(BaseAgent):
    """技术分析智能体 — 单一职责：基于技术指标生成交易信号。"""

    AGENT_ID: str = "technical"

    async def analyze(self, data: MarketData) -> AgentReport:
        """分析市场数据，调用 LLM 生成技术分析报告。"""
        user_prompt = _build_user_prompt(data)

        try:
            locale = getattr(data, "locale", "zh-CN")
            system_prompt = get_system_prompt("technical", locale)
            enriched_prompt = await self._enrich_prompt(system_prompt, data.symbol)
            from app.core.model_router import call_with_fallback
            _model_key, result = await call_with_fallback(
                "technical",
                system_prompt=enriched_prompt,
                user_prompt=user_prompt,
            )

            signal = result.get("signal", "neutral")
            if signal not in ("bullish", "bearish", "neutral"):
                signal = "neutral"

            confidence = result.get("confidence", 0.0)
            if not isinstance(confidence, (int, float)) or not (0.0 <= confidence <= 1.0):
                confidence = 0.0

            trend = result.get("trend", "sideways")
            if trend not in VALID_TRENDS:
                trend = "sideways"

            support_levels = result.get("support_levels", [])
            if not isinstance(support_levels, list):
                support_levels = []

            resistance_levels = result.get("resistance_levels", [])
            if not isinstance(resistance_levels, list):
                resistance_levels = []

            key_findings: list[str] = [f"趋势: {trend}"]
            if support_levels:
                key_findings.append(f"支撑位: {support_levels}")
            if resistance_levels:
                key_findings.append(f"阻力位: {resistance_levels}")

            raw = {
                **result,
                "support_levels": support_levels,
                "resistance_levels": resistance_levels,
                "trend": trend,
            }

            reasoning_text = result.get("reasoning", "")
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
                raw_data=raw,
                content_locale=content_locale,
                language_mismatch=lang_mismatch,
            )

        except Exception as exc:
            logger.error(
                "TechnicalAgent analyze failed",
                extra={"symbol": data.symbol, "error": str(exc)},
            )
            return AgentReport(
                agent_id=self.AGENT_ID,
                symbol=data.symbol,
                signal="neutral",
                confidence=0.0,
                reasoning=f"分析失败: {exc}",
                key_findings=["分析过程中发生异常"],
                raw_data={"error": str(exc), "is_fallback": True},
            )
