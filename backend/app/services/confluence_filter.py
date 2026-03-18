"""跨周期共振 + 巨鲸陷阱过滤器 (CrossTimeframe Confluence Filter)

设计原则：
- 只降权或维持，趋势共振可正向 boost（上限 1.25），巨鲸陷阱只降权（上限 1.00）
- Redis 数据超时（scalping/intraday: 30min）则不作调整，返回因子 1.0
- 所有异常均 fail-safe（静默跳过，置信度不调整）
- 通过 ConfigService 读取开关：trend_confluence_enabled / whale_trap_enabled

置信度公式：
    final_confidence = nsed_confidence × trend_factor × whale_factor
    → clamp [0.05, 0.95]
"""

from __future__ import annotations

import logging
import time
from dataclasses import dataclass, field
from typing import Optional

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# 结果数据类
# ---------------------------------------------------------------------------

@dataclass
class ConfluenceResult:
    """共振过滤计算结果，附带标签供前端展示。"""
    trend_factor: float = 1.0          # 跨周期共振因子 (0.65 ~ 1.25)
    whale_factor: float = 1.0          # 巨鲸陷阱因子 (0.40 ~ 1.00)
    original_confidence: float = 0.0
    final_confidence: float = 0.0
    tags: list[str] = field(default_factory=list)   # 展示标签列表
    trend_tag: str = ""                # 共振标签: resonant / counter / neutral / stale / disabled
    whale_risks: list[str] = field(default_factory=list)  # 风险标签列表


# ---------------------------------------------------------------------------
# 趋势共振层
# ---------------------------------------------------------------------------

# analysis:latest:{symbol} 只由 Trend 模式写入（_is_comprehensive_mode 只返回 trend）
# 因此：
#   scalping 参考 trend 缓存（跳过中间的 intraday 层）
#   intraday 参考 trend 缓存
# 如果用户近期没有跟趋势分析，则返回 stale，不作调节
_TREND_REF: dict[str, tuple[str, int]] = {
    "scalping": ("trend", 30 * 60),  # 短线参考趋势(30min超时)
    "intraday": ("trend", 30 * 60),  # 日内参考趋势(30min超时)
    "trend":    ("",       0),        # 趋势无上级，不做共振
}

_TREND_FACTOR_SAME    = 1.25   # 方向一致
_TREND_FACTOR_NEUTRAL = 0.85   # 上级 neutral
_TREND_FACTOR_COUNTER = 0.65   # 方向反向
_TREND_FACTOR_STALE   = 1.00   # 数据过时，不调整


async def _apply_trend_confluence(
    signal: str,
    mode: str,
    symbol: str,
) -> tuple[float, str]:
    """读取上级周期缓存信号，返回（共振因子, 标签）。

    标签枚举：
        resonant  — 顺势
        counter   — 逆势
        neutral   — 上级中性
        stale     — 参考数据过时
        disabled  — 无上级 / 功能未启用
    """
    ref_mode, max_age_sec = _TREND_REF.get(mode, ("", 0))
    if not ref_mode:
        return 1.0, "disabled"

    try:
        from app.core.redis import get_redis_pool, get_json

        # 找最新缓存：先尝试带模式的 key，再尝试不带模式的旧 key
        redis = get_redis_pool()
        cache_key = f"analysis:latest:{symbol.upper()}"

        raw = await get_json(cache_key)
        if not raw:
            return _TREND_FACTOR_STALE, "stale"

        # 检查时效性
        ts_str = raw.get("timestamp")
        if ts_str:
            from datetime import datetime, timezone
            try:
                ts = datetime.fromisoformat(ts_str.replace("Z", "+00:00"))
                age_sec = (datetime.now(timezone.utc) - ts).total_seconds()
                if age_sec > max_age_sec:
                    return _TREND_FACTOR_STALE, "stale"
            except Exception:
                pass

        # 检查确认是对应 ref_mode 的缓存
        cached_mode = raw.get("mode", "")
        if cached_mode and cached_mode != ref_mode:
            return _TREND_FACTOR_STALE, "stale"

        ref_signal = raw.get("signal", "neutral")

        if ref_signal == "neutral":
            return _TREND_FACTOR_NEUTRAL, "neutral"
        if ref_signal == signal:
            return _TREND_FACTOR_SAME, "resonant"
        # 方向相反
        return _TREND_FACTOR_COUNTER, "counter"

    except Exception as exc:
        logger.debug("trend_confluence skip (error): %s", exc)
        return 1.0, "stale"


# ---------------------------------------------------------------------------
# 巨鲸陷阱过滤层
# ---------------------------------------------------------------------------

# 各风险阈值（可后续移入 ConfigService）
_FR_EXTREME_THRESHOLD    = 0.0008   # 资金费率绝对值 >0.08% 为极端
_LIQ_LARGE_THRESHOLD     = 50_000_000  # 1h爆仓 >5000万 USD
_NETFLOW_LARGE_THRESHOLD = 1000     # 链上流入>1000 BTC/h
# long_short_ratio 是比值（多头持仓 / 空头持仓）
# >2.0 = 多头是空头 2 倍以上 → 多头拥挤；<0.5 = 空头拥挤
_LSR_LONG_CROWDED        = 2.0      # 多头拥挤阈值（看多信号时风险）

_WHALE_RISK_FACTORS: dict[str, float] = {
    "funding_rate_extreme": 0.55,   # 资金费率极端 + 信号同向
    "liquidation_surge":    0.60,   # 爆仓量集中
    "netflow_dump_risk":    0.65,   # 大额链上转入交易所
    "lsr_crowded":          0.70,   # 散户多空比极端
}


async def _apply_whale_trap_filter(
    signal: str,
    symbol: str,
    market_data,  # MarketData 对象，已由 orchestrator 采集
) -> tuple[float, list[str]]:
    """根据衍生品 + 链上数据检测巨鲸陷阱，返回（降权因子, 风险标签列表）。

    因子规则：
        - 取所有触发风险中的最低因子
        - 多条同时触发时再 × 0.85（叠加惩罚）
        - 永不超过 1.00（不做正向 boost）
    """
    risks: list[str] = []
    factors: list[float] = []

    try:
        deriv = getattr(market_data, "derivatives", None)
        onchain = getattr(market_data, "onchain", None)

        # ① 资金费率极端（多头方向 + 正资金费率极端 → 多头被挤压风险）
        if deriv is not None:
            fr = getattr(deriv, "funding_rate", None)
            if fr is not None and abs(fr) > _FR_EXTREME_THRESHOLD:
                # 信号与资金费率方向一致才触发（多头 + 正费率 / 空头 + 负费率）
                fr_bias = "bullish" if fr > 0 else "bearish"
                if fr_bias == signal:
                    risks.append("funding_rate_extreme")
                    factors.append(_WHALE_RISK_FACTORS["funding_rate_extreme"])

            # ② 爆仓量集中
            liq = getattr(deriv, "liquidation_1h_usd", None)
            if liq is not None and liq > _LIQ_LARGE_THRESHOLD:
                risks.append("liquidation_surge")
                factors.append(_WHALE_RISK_FACTORS["liquidation_surge"])

            # ③ 散户多空比极端偏多（看多信号时更危险）
            lsr = getattr(deriv, "long_short_ratio", None)
            if lsr is not None and signal == "bullish" and lsr > _LSR_LONG_CROWDED:
                risks.append("lsr_crowded")
                factors.append(_WHALE_RISK_FACTORS["lsr_crowded"])

        # ④ 大额链上流入交易所（看多时触发）
        if onchain is not None and signal == "bullish":
            netflow = getattr(onchain, "exchange_netflow", None)
            if netflow is not None and netflow > _NETFLOW_LARGE_THRESHOLD:
                risks.append("netflow_dump_risk")
                factors.append(_WHALE_RISK_FACTORS["netflow_dump_risk"])

    except Exception as exc:
        logger.debug("whale_trap skip (error): %s", exc)
        return 1.0, []

    if not factors:
        return 1.0, []

    base_factor = min(factors)
    # 多条叠加惩罚
    if len(factors) > 1:
        base_factor = round(base_factor * 0.85, 4)

    return max(base_factor, 0.40), risks


# ---------------------------------------------------------------------------
# 主入口
# ---------------------------------------------------------------------------

async def apply_confluence_filter(
    signal: str,
    confidence: float,
    mode: str,
    symbol: str,
    market_data=None,
) -> ConfluenceResult:
    """综合应用跨周期共振 + 巨鲸陷阱过滤器，返回 ConfluenceResult。

    Args:
        signal:      原始信号 ('bullish' / 'bearish' / 'neutral')
        confidence:  NSED 原始置信度 [0, 1]
        mode:        分析模式 ('scalping' / 'intraday' / 'trend')
        symbol:      交易对，如 'BTCUSDT'
        market_data: MarketData 对象（已由 orchestrator 采集），None 则跳过巨鲸过滤

    Returns:
        ConfluenceResult，包含调整后的 final_confidence 和所有展示标签
    """
    result = ConfluenceResult(original_confidence=confidence)

    # neutral 信号无方向，跳过调整
    if signal == "neutral":
        result.final_confidence = confidence
        return result

    # ── 读取功能开关（Redis 缓存 5min，降低 DB 读频率）──────────────
    trend_enabled = False
    whale_enabled = False
    try:
        from app.core.redis import get_redis_pool
        _redis = get_redis_pool()
        _cfg_key = "confluence_filter:config_cache"
        _cached_cfg = await _redis.hgetall(_cfg_key)
        if _cached_cfg:
            # decode_responses=True 时 hgetall 返回 str:str
            trend_enabled = (_cached_cfg.get("trend", "false") == "true")
            whale_enabled = (_cached_cfg.get("whale", "false") == "true")
        else:
            from app.core.database import AsyncSessionLocal
            from app.services.config_service import ConfigService
            async with AsyncSessionLocal() as session:
                svc = ConfigService(session)
                trend_enabled = (await svc.get_config("trend_confluence_enabled", "false")).lower() == "true"
                whale_enabled = (await svc.get_config("whale_trap_enabled", "false")).lower() == "true"
            await _redis.hset(_cfg_key, mapping={
                "trend": "true" if trend_enabled else "false",
                "whale": "true" if whale_enabled else "false",
            })
            await _redis.expire(_cfg_key, 300)  # 5分钟缓存
    except Exception as exc:
        logger.debug("confluence_filter: config read failed, skipping: %s", exc)

    # ── Phase 2：跨周期趋势共振 ───────────────────────────────
    trend_factor = 1.0
    trend_tag = "disabled"
    if trend_enabled:
        trend_factor, trend_tag = await _apply_trend_confluence(signal, mode, symbol)

    # ── Phase 1：巨鲸陷阱过滤 ────────────────────────────────
    whale_factor = 1.0
    whale_risks: list[str] = []
    if whale_enabled and market_data is not None:
        whale_factor, whale_risks = await _apply_whale_trap_filter(signal, symbol, market_data)

    # ── 最终置信度 ────────────────────────────────────────────
    final = round(confidence * trend_factor * whale_factor, 4)
    final = max(0.05, min(0.95, final))  # 最低 5%，保留细粒度

    # ── 组装标签 ─────────────────────────────────────────────
    tags: list[str] = []
    if trend_enabled and trend_tag not in ("disabled", "stale"):
        tags.append(f"trend:{trend_tag}")
    elif trend_enabled and trend_tag == "stale":
        tags.append("trend:stale")

    for risk in whale_risks:
        tags.append(f"whale:{risk}")

    result.trend_factor = trend_factor
    result.whale_factor = whale_factor
    result.final_confidence = final
    result.tags = tags
    result.trend_tag = trend_tag
    result.whale_risks = whale_risks

    if final != confidence:
        logger.info(
            "confluence_filter: symbol=%s mode=%s signal=%s "
            "conf %.2f→%.2f trend=%s(%s) whale=%s(%s)",
            symbol, mode, signal,
            confidence, final,
            trend_tag, f"{trend_factor:.2f}",
            whale_risks, f"{whale_factor:.2f}",
        )

    return result
