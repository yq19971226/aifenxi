"""模型专责分析器 — 4 个模型各司其职。

- deepseek_analyze: 链上数据解读专责 (DeepSeek V3.1)
- grok_analyze:     宏观叙事 + 实时信息专责 (Grok-4)
- claude_analyze:   风险识别 + 逻辑一致性专责 (Claude Sonnet 4.5)
- qwen_analyze:     模式匹配 + 历史相似专责 (Qwen3 Max)

每个分析器构建专属 system/user prompt，调用 llm_client，
解析结果为 ModelVote。失败时降级为 neutral。
"""

import logging
from typing import Any

from app.core.llm_client import llm_client
from app.models.market_data import MarketData

# ModelVote / _parse_model_vote / _build_market_summary 由 engine 提供
# 为避免循环导入，延迟导入放在函数内部不可取——这里直接导入即可，
# 因为 engine 不会在模块顶层导入 analyzers（只在函数体内使用）。
from app.consensus.engine import ModelVote, _parse_model_vote, _build_market_summary

logger = logging.getLogger(__name__)

_JSON_SCHEMA_INSTRUCTION = (
    '请以 JSON 格式回复，包含以下字段：\n'
    '{"signal": "bullish|bearish|neutral", '
    '"confidence": 0.0-1.0, '
    '"reasoning": "分析理由", '
    '"key_findings": ["发现1", "发现2"]}'
)


def _fallback_vote(model_key: str, error: Exception) -> ModelVote:
    """LLM 调用失败时返回 neutral 降级投票。"""
    return ModelVote(
        model_key=model_key,
        signal="neutral",
        confidence=0.0,
        reasoning=f"模型降级: {error}",
    )


# ── DeepSeek: 链上数据解读专责 ────────────────────────────────

_DEEPSEEK_SYSTEM = (
    "你是链上数据解读专家，专注于加密货币链上指标分析。\n"
    "你的核心能力：\n"
    "1. 解读交易所净流入/流出趋势，判断资金流向\n"
    "2. 分析巨鲸持仓变化，识别大户行为模式\n"
    "3. 结合 MVRV、恐慌贪婪指数等链上指标综合判断\n"
    "4. 判断庄家当前处于哪个阶段：吸筹、洗盘、拉盘、派发、出逃\n\n"
    "请基于链上数据给出你的交易信号判断。"
)


def _build_deepseek_user_prompt(data: MarketData) -> str:
    """构建链上数据重点的 user prompt。"""
    parts: list[str] = [
        f"交易对: {data.symbol}",
        f"当前价格: {data.current_price}",
    ]

    # 链上数据（核心关注）
    if data.onchain:
        oc = data.onchain
        parts.append("\n【链上数据 — 重点分析】")
        parts.append(f"  交易所净流入: {oc.exchange_netflow}")
        parts.append(f"  巨鲸24h持仓变化: {oc.whale_change_24h}")
        parts.append(f"  恐慌贪婪指数: {oc.fear_greed_index}")
        parts.append(f"  MVRV: {oc.mvrv}")
        if oc.active_addresses is not None:
            parts.append(f"  活跃地址数: {oc.active_addresses:,}")
        if oc.new_addresses is not None:
            parts.append(f"  新增地址数: {oc.new_addresses:,}")
        if oc.exchange_balance is not None:
            parts.append(f"  交易所余额: {oc.exchange_balance:,.2f}")
        if oc.large_tx_count is not None:
            parts.append(f"  ⚠️ 大额转账: {oc.large_tx_count} 笔")
            if oc.large_tx_volume is not None:
                parts.append(f"  大额转账总量: {oc.large_tx_volume:,.2f}")
        if oc.miner_reserve_change is not None:
            direction = "增持" if oc.miner_reserve_change > 0 else "减持"
            parts.append(f"  矿工储备变化: {oc.miner_reserve_change:+,.2f} ({direction})")
    else:
        parts.append("\n【链上数据: 暂无】")

    # CoinGlass 衍生品数据
    cg = data.coinglass
    if cg:
        parts.append("\n【CoinGlass 衍生品 — 辅助链上判断】")
        if cg.oi_snapshots:
            latest = cg.oi_snapshots[-1]
            parts.append(f"  OI持仓量: {latest.get('oi', 'N/A')} 变化: {latest.get('oi_change_pct', 'N/A')}%")
        if cg.netflow_snapshots:
            latest = cg.netflow_snapshots[-1]
            parts.append(f"  期货净流入: {latest.get('netflow', 'N/A')}")
        if cg.cvd_snapshots:
            latest = cg.cvd_snapshots[-1]
            parts.append(f"  CVD: {latest.get('cvd', 'N/A')}")

    # 辅助参考：价格与指标
    market_summary = _build_market_summary(data)
    parts.append(f"\n【辅助参考 — 市场概况】\n{market_summary}")

    parts.append(
        "\n请重点从链上数据角度分析庄家行为阶段"
        "（吸筹/洗盘/拉盘/派发/出逃），并给出交易信号。"
    )
    parts.append(f"\n{_JSON_SCHEMA_INSTRUCTION}")
    return "\n".join(parts)


async def deepseek_analyze(data: MarketData) -> ModelVote:
    """DeepSeek 链上数据解读专责分析。"""
    from app.core.model_router import get_model_for_agent
    _model_key = await get_model_for_agent("consensus_deepseek")
    try:
        raw: dict[str, Any] = await llm_client.call_model(
            model_key=_model_key,
            system_prompt=_DEEPSEEK_SYSTEM,
            user_prompt=_build_deepseek_user_prompt(data),
            temperature=0.1,
        )
        return _parse_model_vote(_model_key, raw)
    except Exception as exc:
        logger.error("deepseek_analyze failed", extra={"error": str(exc)})
        return _fallback_vote(_model_key, exc)


# ── Grok-4: 宏观叙事 + 实时信息专责 ─────────────────────────

_GROK_SYSTEM = (
    "你是宏观叙事与实时信息分析专家，专注于加密货币宏观环境研判。\n"
    "你的核心能力：\n"
    "1. 分析价格趋势与成交量模式，判断市场动能\n"
    "2. 评估当前市场所处的宏观周期阶段（积累/上升/分配/下降）\n"
    "3. 结合宏观经济背景（利率、流动性、监管）解读市场走势\n"
    "4. 从英文信息源角度分析市场情绪叙事\n\n"
    "请基于宏观视角给出你的交易信号判断。"
)


def _build_grok_user_prompt(data: MarketData) -> str:
    """构建宏观叙事重点的 user prompt。"""
    parts: list[str] = [
        f"交易对: {data.symbol}",
        f"当前价格: {data.current_price}",
    ]

    # 价格趋势（核心关注）
    parts.append("\n【价格趋势 — 重点分析】")
    for label, klines in [
        ("15m", data.klines_15m),
        ("1h", data.klines_1h),
        ("4h", data.klines_4h),
        ("1d", data.klines_1d),
    ]:
        if klines:
            latest = klines[-1]
            parts.append(
                f"  {label}: O={latest.open} H={latest.high} "
                f"L={latest.low} C={latest.close} V={latest.volume}"
            )

    # 技术指标（辅助宏观判断）
    if data.indicators:
        ind = data.indicators
        parts.append("\n【技术指标 — 辅助参考】")
        parts.append(
            f"  EMA7={ind.ema7} EMA25={ind.ema25} EMA99={ind.ema99}"
        )
        parts.append(f"  RSI={ind.rsi} MACD={ind.macd}")

    # 链上情绪
    if data.onchain:
        parts.append(f"\n【市场情绪】恐慌贪婪指数: {data.onchain.fear_greed_index}")

    parts.append(
        "\n请从宏观叙事角度分析市场周期定位与动能方向，给出交易信号。"
    )
    parts.append(f"\n{_JSON_SCHEMA_INSTRUCTION}")
    return "\n".join(parts)


async def grok_analyze(data: MarketData) -> ModelVote:
    """Grok-4 宏观叙事 + 实时信息专责分析。"""
    from app.core.model_router import get_model_for_agent
    _model_key = await get_model_for_agent("consensus_grok")
    try:
        raw: dict[str, Any] = await llm_client.call_model(
            model_key=_model_key,
            system_prompt=_GROK_SYSTEM,
            user_prompt=_build_grok_user_prompt(data),
            temperature=0.1,
        )
        return _parse_model_vote(_model_key, raw)
    except Exception as exc:
        logger.error("grok_analyze failed", extra={"error": str(exc)})
        return _fallback_vote(_model_key, exc)


# ── Claude: 风险识别 + 逻辑一致性专责 ────────────────────────

_CLAUDE_SYSTEM = (
    "你是风险识别与逻辑一致性分析专家，专注于加密货币风险评估。\n"
    "你的核心能力：\n"
    "1. 识别数据中的矛盾信号（如价格上涨但链上资金流出）\n"
    "2. 评估潜在风险因素与异常波动\n"
    "3. 分析风险收益比，判断当前持仓是否合理\n"
    "4. 检查各指标间的逻辑一致性，发现隐藏风险\n\n"
    "请基于风险视角给出你的交易信号判断。"
)


def _build_claude_user_prompt(data: MarketData) -> str:
    """构建风险识别重点的 user prompt。"""
    parts: list[str] = [
        f"交易对: {data.symbol}",
        f"当前价格: {data.current_price}",
    ]

    # 全量数据供矛盾检测
    parts.append("\n【矛盾信号检测 — 重点分析】")
    parts.append("请特别关注以下数据之间是否存在矛盾：")

    if data.indicators:
        ind = data.indicators
        parts.append(f"\n  技术面: RSI={ind.rsi} MACD={ind.macd} "
                      f"EMA7={ind.ema7} EMA25={ind.ema25} EMA99={ind.ema99}")
        parts.append(f"  布林带: Upper={ind.bb_upper} Lower={ind.bb_lower}")

    if data.onchain:
        oc = data.onchain
        parts.append(f"\n  链上面: 交易所净流入={oc.exchange_netflow} "
                      f"巨鲸变化={oc.whale_change_24h}")
        parts.append(f"  情绪面: 恐慌贪婪={oc.fear_greed_index} MVRV={oc.mvrv}")

    # CoinGlass 衍生品（矛盾检测核心数据源）
    cg = data.coinglass
    if cg:
        parts.append("\n  CoinGlass:")
        if cg.oi_snapshots:
            latest = cg.oi_snapshots[-1]
            parts.append(f"    OI={latest.get('oi', 'N/A')} 变化={latest.get('oi_change_pct', 'N/A')}%")
        if cg.cvd_snapshots:
            latest = cg.cvd_snapshots[-1]
            parts.append(f"    CVD={latest.get('cvd', 'N/A')}")
        if cg.option_max_pain:
            parts.append(f"    期权MaxPain={cg.option_max_pain.get('max_pain_price', 'N/A')}")
        if cg.option_info:
            parts.append(f"    Put/Call比={cg.option_info.get('put_call_ratio', 'N/A')}")

    # 价格数据
    for label, klines in [("4h", data.klines_4h), ("1d", data.klines_1d)]:
        if klines:
            latest = klines[-1]
            parts.append(
                f"\n  {label}K线: O={latest.open} H={latest.high} "
                f"L={latest.low} C={latest.close} V={latest.volume}"
            )

    parts.append(
        "\n请重点识别矛盾信号、异常波动和潜在风险，"
        "评估风险收益比后给出交易信号。"
    )
    parts.append(f"\n{_JSON_SCHEMA_INSTRUCTION}")
    return "\n".join(parts)


async def claude_analyze(data: MarketData) -> ModelVote:
    """Claude 风险识别 + 逻辑一致性专责分析。"""
    from app.core.model_router import get_model_for_agent
    _model_key = await get_model_for_agent("consensus_claude")
    try:
        raw: dict[str, Any] = await llm_client.call_model(
            model_key=_model_key,
            system_prompt=_CLAUDE_SYSTEM,
            user_prompt=_build_claude_user_prompt(data),
            temperature=0.1,
        )
        return _parse_model_vote(_model_key, raw)
    except Exception as exc:
        logger.error("claude_analyze failed", extra={"error": str(exc)})
        return _fallback_vote(_model_key, exc)


# ── Qwen3 Max: 模式匹配 + 历史相似专责 ──────────────────────

_QWEN_SYSTEM = (
    "你是模式匹配与历史相似分析专家，专注于加密货币技术形态识别。\n"
    "你的核心能力：\n"
    "1. 识别当前价格形态（头肩顶/底、双顶/底、三角形、旗形等）\n"
    "2. 分析成交量模式与价格形态的配合度\n"
    "3. 将当前行情与历史相似走势对比，推断后续可能走势\n"
    "4. 评估技术指标组合形成的信号强度\n\n"
    "请基于模式匹配视角给出你的交易信号判断。"
)


def _build_qwen_user_prompt(data: MarketData) -> str:
    """构建模式匹配重点的 user prompt。"""
    parts: list[str] = [
        f"交易对: {data.symbol}",
        f"当前价格: {data.current_price}",
    ]

    # 多周期K线（核心关注 — 形态识别需要）
    parts.append("\n【多周期K线 — 重点分析】")
    for label, klines in [
        ("15m", data.klines_15m),
        ("1h", data.klines_1h),
        ("4h", data.klines_4h),
        ("1d", data.klines_1d),
    ]:
        if klines:
            parts.append(f"\n  {label} 周期（最近 {len(klines)} 根）:")
            # 展示最近几根K线用于形态识别
            recent = klines[-5:] if len(klines) >= 5 else klines
            for k in recent:
                parts.append(
                    f"    O={k.open} H={k.high} L={k.low} C={k.close} V={k.volume}"
                )

    # 技术指标（辅助形态确认）
    if data.indicators:
        ind = data.indicators
        parts.append("\n【技术指标 — 形态确认】")
        parts.append(
            f"  EMA7={ind.ema7} EMA25={ind.ema25} EMA99={ind.ema99}"
        )
        parts.append(f"  RSI={ind.rsi} MACD={ind.macd} MACD_Signal={ind.macd_signal}")
        parts.append(f"  布林带: Upper={ind.bb_upper} Lower={ind.bb_lower}")
        if ind.support_levels:
            parts.append(f"  支撑位: {ind.support_levels}")
        if ind.resistance_levels:
            parts.append(f"  阻力位: {ind.resistance_levels}")
        # 量价指标（辅助形态确认）
        if ind.obv is not None:
            parts.append(f"  OBV: {ind.obv}")
        if ind.vwap is not None:
            parts.append(f"  VWAP: {ind.vwap}")
        if ind.volume_ratio is not None:
            parts.append(f"  量比: {ind.volume_ratio:.2f}")
        if ind.volume_price_divergence and ind.volume_price_divergence != "none":
            parts.append(f"  ⚠️ 量价背离: {ind.volume_price_divergence}")

    parts.append(
        "\n请识别当前价格形态和成交量模式，"
        "与历史相似走势对比后给出交易信号。"
    )
    parts.append(f"\n{_JSON_SCHEMA_INSTRUCTION}")
    return "\n".join(parts)


async def qwen_analyze(data: MarketData) -> ModelVote:
    """Qwen3 Max 模式匹配 + 历史相似专责分析。"""
    from app.core.model_router import get_model_for_agent
    _model_key = await get_model_for_agent("consensus_qwen")
    try:
        raw: dict[str, Any] = await llm_client.call_model(
            model_key=_model_key,
            system_prompt=_QWEN_SYSTEM,
            user_prompt=_build_qwen_user_prompt(data),
            temperature=0.1,
        )
        return _parse_model_vote(_model_key, raw)
    except Exception as exc:
        logger.error("qwen_analyze failed", extra={"error": str(exc)})
        return _fallback_vote(_model_key, exc)
