"""策略生成服务 — Service 层，调用 Agent 和数据层。

- 从 AgentReport 生成 StrategyResult
- Redis 缓存（TTL=15min）+ PostgreSQL 持久化
- 路由层不直接调用数据库，通过本服务查数据
"""

import json
import logging
from datetime import datetime, timezone, timedelta
from uuid import UUID

from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.agents.base import AgentReport
from app.consensus.engine import ConsensusReport
from app.core.redis import get_json, set_with_ttl
from app.core.sql_compat import insert_returning
from app.services.performance import PerformanceTracker

logger = logging.getLogger(__name__)

_CACHE_TTL_SECONDS = 900  # 15 分钟


# ── ATR 自适应倍数（模式感知）───────────────────────────────

# 模式特化 ATR 倍数覆盖表
# scalping: 目标更近（3h超时），止损偏紧
# intraday: 适中目标（8h超时），止损适度放宽降低噪音止损
# trend:    保持原有宽幅目标（96h超时），充分容忍波动
_MODE_ATR_OVERRIDES: dict[str, dict[str, dict]] = {
    "scalping": {
        "low":    {"entry": 1.2, "stop": 1.5, "targets": [2.0, 3.5, 5.5]},
        "normal": {"entry": 0.8, "stop": 1.0, "targets": [1.5, 2.5, 3.5]},
        "high":   {"entry": 0.6, "stop": 0.8, "targets": [1.2, 2.0, 3.0]},
    },
    "intraday": {
        "low":    {"entry": 1.2, "stop": 2.0, "targets": [2.0, 3.5, 5.5]},
        "normal": {"entry": 0.8, "stop": 1.8, "targets": [1.5, 2.5, 4.0]},
        "high":   {"entry": 0.6, "stop": 1.5, "targets": [1.2, 2.0, 3.5]},
    },
    "trend": {
        "low":    {"entry": 1.5, "stop": 2.0, "targets": [3.0, 5.0, 8.0]},
        "normal": {"entry": 1.0, "stop": 1.5, "targets": [2.5, 4.0, 6.5]},
        "high":   {"entry": 0.8, "stop": 1.2, "targets": [1.8, 3.0, 5.0]},
    },
}

def _atr_multipliers(
    atr: float,
    current_price: float,
    mode: str = "trend",
) -> dict[str, float | list[float]]:
    """根据 ATR/Price 波动率 + 分析模式返回自适应倍数。

    volatility_regime:
        < 1.0% → 低波动（窄幅震荡）
        1.0%-3.0% → 正常
        > 3.0% → 高波动

    mode:
        scalping: 目标近、止损紧（3h超时）
        intraday: 目标适中、止损宽（8h超时，降低噪音止损）
        trend: 目标远、止损标准（96h超时）

    Returns:
        {"entry": float, "stop": float, "targets": [float, float, float]}
    """
    if current_price <= 0:
        return {"entry": 1.5, "stop": 2.0, "targets": [1.5, 3.0, 5.0]}

    vol_ratio = atr / current_price  # e.g. 0.015 = 1.5%

    if vol_ratio < 0.01:
        vol_regime = "low"
    elif vol_ratio > 0.03:
        vol_regime = "high"
    else:
        vol_regime = "normal"

    mode_overrides = _MODE_ATR_OVERRIDES.get(mode, _MODE_ATR_OVERRIDES["trend"])
    return mode_overrides[vol_regime]


class StrategyResult(BaseModel):
    """策略输出模型。"""

    symbol: str
    direction: str  # "long" | "short" | "neutral"
    entry_low: float
    entry_high: float
    stop_loss: float
    targets: list[float] = Field(default_factory=list)
    confidence: float = Field(ge=0.0, le=1.0)
    valid_until: datetime
    reasoning: str
    risk_reward_ratio: float = Field(
        default=0.0, ge=0.0,
        description="风险收益比 = |TP1 - entry_mid| / |entry_mid - SL|",
    )
    is_worth_taking: bool = Field(
        default=False,
        description="R:R >= 1.5 且 confidence >= 0.4 且 direction != neutral",
    )
    snapped_fields: list[str] = Field(default_factory=list)
    is_fallback: bool = False


# ── 模式相关策略参数 ───────────────────────────────────────────
# 短线濒动幅小（TP 间距 0.5%）；日内需要日内波段级别的深度（>1.5%）；趋势模式应对应天级/周级波动幅（>3%）
_MODE_TP_MIN_GAP: dict[str, float] = {
    "scalping": 0.005,   # 0.5%
    "intraday": 0.010,   # 1.0%（从 1.5% 降低，8h 内 1.5% 间距过大导致目标不可达）
    "trend":    0.030,   # 3.0%
}

# 回退策略最小幅度（百分比），防止很小的 TP fallback
_MODE_FALLBACK_TP_PCTS: dict[str, list[float]] = {
    "scalping": [0.050, 0.090, 0.150],
    "intraday": [0.060, 0.120, 0.200],
    "trend":    [0.080, 0.160, 0.250],
}


class StrategyService:
    """策略生成与查询服务。"""

    @staticmethod
    def _validate_strategy(
        direction: str, price: float,
        entry_low: float, entry_high: float,
        stop_loss: float, targets: list[float],
        market_regime: str | None = None,
        mode: str = "scalping",
    ) -> tuple[float, float, float, list[float]]:
        """确保入场/止损/目标价与方向一致，不一致时回退到百分比默认值。

        P1-C: 震荡市场允许 entry 偏离当前价（等回调/反弹入场）。
        P1-D: 强制最小入场宽度 0.3%。
        P2-D: 止盈位最小间距按 mode，日内≥1.5%，趋势≥3%。
        """
        is_ranging = market_regime == "ranging"
        fallback_pcts = _MODE_FALLBACK_TP_PCTS.get(mode, _MODE_FALLBACK_TP_PCTS["scalping"])

        if direction == "long":
            if stop_loss >= price:
                stop_loss = price * 0.95
            # P1-C: 震荡市场允许 entry_low 低于当前价（等回调到支撑位买入）
            if not is_ranging and entry_low > price:
                entry_low = price * 0.98
            # 关键：止损必须在入场区间下方（不能在区间内部）
            if stop_loss >= entry_low:
                stop_loss = entry_low * 0.97
            targets = sorted([t for t in targets if t > price])
            fallback = [price * (1 + p) for p in fallback_pcts]
            while len(targets) < 3:
                targets.append(fallback[len(targets)])
        elif direction == "short":
            if stop_loss <= price:
                stop_loss = price * 1.05
            # P1-C: 震荡市场允许 entry_high 高于当前价（等反弹到阻力位做空）
            if not is_ranging and entry_high < price:
                entry_high = price * 1.02
            # 关键：止损必须在入场区间上方（不能在区间内部）
            if stop_loss <= entry_high:
                stop_loss = entry_high * 1.03
            targets = sorted([t for t in targets if t < price], reverse=True)
            fallback = [price * (1 - p) for p in fallback_pcts]
            while len(targets) < 3:
                targets.append(fallback[len(targets)])

        targets = targets[:3]

        # P1-D: 入场区间最小宽度 0.3%
        entry_mid = (entry_low + entry_high) / 2
        min_entry_width = entry_mid * 0.003
        if entry_high - entry_low < min_entry_width:
            entry_low = entry_mid - min_entry_width / 2
            entry_high = entry_mid + min_entry_width / 2

        # P2-D: 止盈位最小间距（按模式）
        targets = StrategyService._space_targets(targets, mode=mode)

        return entry_low, entry_high, stop_loss, targets

    @staticmethod
    def _space_targets(targets: list[float], mode: str = "scalping") -> list[float]:
        """确保止盈位之间有足够间距（按模式：短线0.5%，日内1.5%，趋势3%）。"""
        min_gap_pct = _MODE_TP_MIN_GAP.get(mode, 0.005)
        if not targets:
            return targets
        spaced = [targets[0]]
        for tp in targets[1:]:
            if abs(tp - spaced[-1]) / max(abs(spaced[-1]), 1e-8) >= min_gap_pct:
                spaced.append(tp)
            else:
                # 按方向拉开：tp > prev 则向上拉，反之向下
                if tp >= spaced[-1]:
                    spaced.append(spaced[-1] * (1 + min_gap_pct))
                else:
                    spaced.append(spaced[-1] * (1 - min_gap_pct))
        return spaced

    @staticmethod
    def _calc_risk_reward(
        direction: str,
        entry_low: float,
        entry_high: float,
        stop_loss: float,
        targets: list[float],
    ) -> tuple[float, bool]:
        """计算风险收益比。

        Returns:
            (risk_reward_ratio, is_worth_taking)
        """
        if direction == "neutral" or not targets:
            return 0.0, False

        entry_mid = (entry_low + entry_high) / 2

        # 风险：入场中位 到 止损 的距离
        risk = abs(entry_mid - stop_loss)
        if risk <= 0:
            return 0.0, False

        # 收益：入场中位 到 第一目标价 的距离
        reward = abs(targets[0] - entry_mid)

        rr = round(reward / risk, 2)
        worth = rr >= 2.0

        return rr, worth

    @staticmethod
    def generate_fallback(
        symbol: str,
        current_price: float,
        signal: str = "neutral",
    ) -> StrategyResult:
        """当智能体全部失败时，基于当前价格生成回退策略。"""
        price = current_price if current_price > 0 else 1.0
        if signal == "bullish":
            direction = "long"
            entry_low = round(price * 0.99, 8)
            entry_high = round(price, 8)
            stop_loss = round(price * 0.97, 8)
            targets = [round(price * 1.05, 8), round(price * 1.10, 8), round(price * 1.18, 8)]
        elif signal == "bearish":
            direction = "short"
            entry_low = round(price, 8)
            entry_high = round(price * 1.01, 8)
            stop_loss = round(price * 1.03, 8)
            targets = [round(price * 0.95, 8), round(price * 0.90, 8), round(price * 0.82, 8)]
        else:
            direction = "neutral"
            entry_low = round(price * 0.99, 8)
            entry_high = round(price * 1.01, 8)
            stop_loss = round(price * 0.95, 8)
            targets = []
        return StrategyResult(
            symbol=symbol,
            direction=direction,
            entry_low=entry_low,
            entry_high=entry_high,
            stop_loss=stop_loss,
            targets=targets,
            confidence=0.0,
            valid_until=datetime.now(timezone.utc) + timedelta(hours=1),
            reasoning="智能体分析数据异常，已基于当前市场价格生成安全基准策略。",
            is_fallback=True,
        )

    def generate_from_report(
        self, report: AgentReport, current_price: float = 0.0,
    ) -> StrategyResult:
        """根据 AgentReport 生成策略。

        基于信号方向和置信度计算入场区间、止损、目标位。
        current_price 优先使用调用方传入值，其次从 raw_data 取，避免为 0。
        """
        raw = report.raw_data
        support_levels: list[float] = sorted(
            [float(s) for s in raw.get("support_levels", []) if isinstance(s, (int, float))]
        )
        resistance_levels: list[float] = sorted(
            [float(r) for r in raw.get("resistance_levels", []) if isinstance(r, (int, float))]
        )

        price = current_price or float(raw.get("current_price", 0))

        atr: float | None = raw.get("atr") if isinstance(raw.get("atr"), (int, float)) else None

        if report.signal == "bullish":
            direction = "long"
            below_price = [s for s in support_levels if s < price]
            above_price = [r for r in resistance_levels if r > price]
            if below_price:
                entry_low = below_price[-1]
                stop_loss = below_price[0]
            elif atr is not None and atr > 0:
                m = _atr_multipliers(atr, price)
                entry_low = price - m["entry"] * atr
                stop_loss = price - m["stop"] * atr
            else:
                entry_low = price * 0.98
                stop_loss = price * 0.97
            entry_high = price
            targets = above_price[:3] if above_price else [
                price * 1.05, price * 1.10, price * 1.18,
            ]
        elif report.signal == "bearish":
            direction = "short"
            entry_low = price
            above_price = [r for r in resistance_levels if r > price]
            below_price = [s for s in support_levels if s < price]
            if above_price:
                entry_high = above_price[0]
                stop_loss = above_price[-1]
            elif atr is not None and atr > 0:
                m = _atr_multipliers(atr, price)
                entry_high = price + m["entry"] * atr
                stop_loss = price + m["stop"] * atr
            else:
                entry_high = price * 1.02
                stop_loss = price * 1.03
            targets = sorted(below_price, reverse=True)[:3] if below_price else [
                price * 0.95, price * 0.90, price * 0.82,
            ]
        else:
            direction = "neutral"
            entry_low = price * 0.99
            entry_high = price * 1.01
            stop_loss = price * 0.95
            targets = []

        entry_low, entry_high, stop_loss, targets = self._validate_strategy(
            direction, price, entry_low, entry_high, stop_loss, targets,
        )  # generate_from_report: non-ranging default

        # 价格精度优化：根据价格量级自动四舍五入
        def _fmt(val: float) -> float:
            if val > 1000: return round(val, 1)
            if val > 1: return round(val, 2)
            return round(val, 6)

        entry_low = _fmt(entry_low)
        entry_high = _fmt(entry_high)
        stop_loss = _fmt(stop_loss)
        targets = [_fmt(t) for t in targets]

        rr, worth = self._calc_risk_reward(direction, entry_low, entry_high, stop_loss, targets)
        worth = worth and report.confidence >= 0.4

        # 置信度封顶 95%
        safe_confidence = min(0.95, report.confidence)

        return StrategyResult(
            symbol=report.symbol,
            direction=direction,
            entry_low=entry_low,
            entry_high=entry_high,
            stop_loss=stop_loss,
            targets=targets,
            confidence=safe_confidence,
            valid_until=datetime.now(timezone.utc) + timedelta(hours=4),
            reasoning=report.reasoning or "多维智能体协同分析已完成，合并技术面、链上数据、合约市场与情绪面总体判断。",
            risk_reward_ratio=rr,
            is_worth_taking=worth,
        )

    def generate_from_consensus(
        self, report: ConsensusReport, current_price: float,
        atr: float | None = None,
        market_regime: str | None = None,
        regime_support: float | None = None,
        regime_resistance: float | None = None,
        klines_1d: list | None = None,
        klines_4h: list | None = None,
        indicators: dict | None = None,
        mode: str = "scalping",
    ) -> StrategyResult:
        """根据 ConsensusReport 生成策略。

        趋势分支优先从真实技术关口（Pivot Point、Swing High/Low、EMA、BB）
        生成 TP 目标位，候选不足时才回退到 ATR 倍数。

        market_regime: "ranging" | "trending" | "volatile" | None
        klines_1d: 日线 K 线列表（用于 Pivot Point 公式化 S/R）
        klines_4h: 4小时 K 线列表（日内模式 Swing 头尾位参考）
        indicators: 技术指标字典（含 bb_upper/bb_lower/ema25/ema99）
        mode: 分析模式，影响 Swing 回溯窗口和 TP 最小间距
        """
        # P3-C: 公式化支撑阻力位交叉验证
        if regime_support or regime_resistance:
            try:
                from app.services.formalized_sr import compute_formula_levels, cross_validate_sr
                formula = compute_formula_levels(klines=klines_1d, indicators=indicators)
                validated_s, validated_r, sr_notes = cross_validate_sr(
                    regime_support, regime_resistance, formula,
                )
                if validated_s is not None:
                    regime_support = validated_s
                if validated_r is not None:
                    regime_resistance = validated_r
                if sr_notes:
                    logger.info("P3-C SR cross-validation: %s", "; ".join(sr_notes))
            except Exception as exc:
                logger.warning("P3-C SR cross-validation skipped: %s", exc)
        # 方向映射
        if report.consensus_signal == "bullish":
            direction = "long"
        elif report.consensus_signal == "bearish":
            direction = "short"
        else:
            direction = "neutral"

        # 基础置信度
        confidence = report.consensus_confidence

        # 分歧度连续衰减：任意分歧度均产生影响（0→1.0, 20→0.8, 70→0.3 下限）
        decay = max(0.3, 1.0 - report.divergence / 100)
        confidence = confidence * decay

        confidence = round(max(0.0, min(1.0, confidence)), 4)

        # 入场区间计算：优先使用 ATR 动态计算，不可用时回退固定百分比
        use_atr = atr is not None and atr > 0
        is_ranging = market_regime == "ranging"

        # ── 震荡市场：区间策略（高抛低吸）──────────────────────
        if is_ranging and regime_support and regime_resistance:
            range_mid = (regime_support + regime_resistance) / 2
            range_height = regime_resistance - regime_support
            _raw_buf = max(range_height * 0.1, atr * 0.5) if use_atr else range_height * 0.1
            buffer = min(_raw_buf, range_height * 0.3)  # 上限 30%，防止缓冲区溢出区间

            # 震荡市场 → 双向区间策略
            if current_price < range_mid:
                # 价格偏低 → 做多（靠近支撑位买入）
                direction = "long"
                entry_low = regime_support
                entry_high = regime_support + buffer
                stop_loss = regime_support - buffer
                targets = [
                    range_mid,
                    regime_resistance - buffer,
                    regime_resistance,
                ]
            else:
                # 价格偏高 → 做空（靠近阻力位卖出）
                direction = "short"
                entry_low = regime_resistance - buffer
                entry_high = regime_resistance
                stop_loss = regime_resistance + buffer
                targets = [
                    range_mid,
                    regime_support + buffer,
                    regime_support,
                ]

            # 震荡市场置信度衰减
            confidence = round(confidence * 0.8, 4)

            reasoning = (
                f"【区间策略】市场处于震荡状态，价格在 {regime_support:.2f} ~ {regime_resistance:.2f} 区间波动。"
                f"\n共识信号: {report.consensus_signal} (置信度 {report.consensus_confidence:.0%}, 分歧度 {report.divergence:.1f}%)"
                f"\n策略: 支撑位附近做多 / 阻力位附近做空，突破区间时止损离场。"
            )
            if report.minority_warnings:
                reasoning += "\n少数派警告:\n" + "\n".join(report.minority_warnings)

            entry_low, entry_high, stop_loss, targets = self._validate_strategy(
                direction, current_price, entry_low, entry_high, stop_loss, targets,
                market_regime="ranging", mode=mode,
            )
            rr, worth = self._calc_risk_reward(direction, entry_low, entry_high, stop_loss, targets)
            worth = worth and confidence >= 0.4
            return StrategyResult(
                symbol=report.symbol,
                direction=direction,
                entry_low=round(entry_low, 8),
                entry_high=round(entry_high, 8),
                stop_loss=round(stop_loss, 8),
                targets=[round(t, 8) for t in targets],
                confidence=confidence,
                valid_until=datetime.now(timezone.utc) + timedelta(hours=2),
                reasoning=reasoning,
                risk_reward_ratio=rr,
                is_worth_taking=worth,
            )

        # ── 趋势/高波动市场：优先用结构性关口定 TP ─────────────
        # 主 K 线数据：日内用 4h，趋势用 1d；均不可用时退到另一个
        _primary_klines = klines_1d or klines_4h
        _tp_source = "structural"   # 记录 TP 来源，供 reasoning 标注

        # ── 先用结构性候选池尝试获取 TP ─────────────────────────
        try:
            from app.services.formalized_sr import build_tp_candidates
            _indic_dict = indicators if isinstance(indicators, dict) else (
                indicators.model_dump() if indicators is not None else None
            )
            tp_pool = build_tp_candidates(
                direction, current_price, _primary_klines, _indic_dict,
                mode=mode, atr=atr,
            )
        except Exception as _tpe:
            logger.warning("build_tp_candidates failed, using ATR fallback: %s", _tpe)
            tp_pool = []

        # TP 池至少需要 1 个候选即用结构性位（减少回退频率）
        _has_structural_tp = len(tp_pool) >= 1

        # 入场区间和止损仍然用 ATR（ATR 适合描述波动幅度，不适合做 TP）
        if direction == "long":
            if use_atr:
                m = _atr_multipliers(atr, current_price, mode=mode)
                entry_low = current_price - m["entry"] * atr
                stop_loss = current_price - m["stop"] * atr
            else:
                entry_low = current_price * 0.98
                stop_loss = current_price * 0.97
            entry_high = current_price

            if _has_structural_tp:
                # 从候选池选出大于 entry_high 的前 3 个
                targets = [t for t in tp_pool if t > entry_high][:3]
            else:
                _tp_source = "atr_fallback"
                if use_atr:
                    m = _atr_multipliers(atr, current_price, mode=mode)
                    targets = [current_price + t * atr for t in m["targets"]]
                else:
                    targets = [current_price * 1.05, current_price * 1.10, current_price * 1.18]

        elif direction == "short":
            entry_low = current_price
            if use_atr:
                m = _atr_multipliers(atr, current_price, mode=mode)
                entry_high = current_price + m["entry"] * atr
                stop_loss = current_price + m["stop"] * atr
            else:
                entry_high = current_price * 1.02
                stop_loss = current_price * 1.03

            if _has_structural_tp:
                # 从候选池选出小于 entry_low 的前 3 个
                targets = [t for t in tp_pool if t < entry_low][:3]
            else:
                _tp_source = "atr_fallback"
                if use_atr:
                    m = _atr_multipliers(atr, current_price, mode=mode)
                    targets = [current_price - t * atr for t in m["targets"]]
                else:
                    targets = [current_price * 0.95, current_price * 0.90, current_price * 0.82]

        else:
            if use_atr:
                entry_low = current_price - 0.5 * atr
                entry_high = current_price + 0.5 * atr
            else:
                entry_low = current_price * 0.99
                entry_high = current_price * 1.01
            stop_loss = current_price * 0.95
            targets = []
            _tp_source = "neutral"

        if _tp_source != "structural":
            logger.info(
                "TP source fallback to %s for direction=%s mode=%s "
                "(pool_size=%d, primary_klines=%d)",
                _tp_source, direction, mode,
                len(tp_pool), len(_primary_klines) if _primary_klines else 0,
            )

        # 最终验证：确保方向一致性
        entry_low, entry_high, stop_loss, targets = self._validate_strategy(
            direction, current_price, entry_low, entry_high, stop_loss, targets,
            market_regime=market_regime, mode=mode,
        )

        # 价格精度优化（5 档覆盖 BTC~SHIB）
        def _fmt(val: float) -> float:
            if val > 10000: return round(val, 1)
            if val > 100:   return round(val, 2)
            if val > 1:     return round(val, 4)
            if val > 0.01:  return round(val, 6)
            return round(val, 8)

        entry_low = _fmt(entry_low)
        entry_high = _fmt(entry_high)
        stop_loss = _fmt(stop_loss)
        targets = [_fmt(t) for t in targets]

        # 市场模式中文标签
        _regime_zh = {
            "trending": "趋势",
            "volatile": "高波动",
            "ranging": "震荡",
        }.get(market_regime or "", "")

        # 共识信号中文
        _signal_zh = {
            "bullish": "看涨",
            "bearish": "看跌",
            "neutral": "中性",
        }.get(report.consensus_signal, report.consensus_signal.upper())

        # 投票分布
        bull_votes = sum(1 for v in report.model_votes if v.signal == "bullish")
        bear_votes = sum(1 for v in report.model_votes if v.signal == "bearish")
        total_votes = len(report.model_votes)
        agree_votes = bull_votes if report.consensus_signal == "bullish" else bear_votes

        # TP 来源标注（帮助用户判断目标位可信度）
        _tp_source_zh = {
            "structural": "锚定技术关口（Pivot/Swing/EMA/BB）",
            "atr_fallback": "ATR估算（关键位不足退回）",
            "neutral": "",
        }.get(_tp_source, "")

        reasoning = (
            f"共识方向: {_signal_zh}（{agree_votes}/{total_votes} 个智能体一致）。"
            f"置信度: {confidence:.0%}。分歧度: {report.divergence:.1f}%。"
        )
        if _tp_source_zh:
            reasoning += f"\nTP目标: {_tp_source_zh}。"
        if _regime_zh:
            reasoning = f"【{_regime_zh}市场】" + reasoning
        if report.minority_warnings:
            reasoning += "\n少数派预警: " + "; ".join([w.split("理由:")[0].strip() for w in report.minority_warnings])

        rr, worth = self._calc_risk_reward(direction, entry_low, entry_high, stop_loss, targets)
        
        # 置信度封顶 95%
        safe_confidence = min(0.95, confidence)
        worth = worth and safe_confidence >= 0.4

        return StrategyResult(
            symbol=report.symbol,
            direction=direction,
            entry_low=entry_low,
            entry_high=entry_high,
            stop_loss=stop_loss,
            targets=targets,
            confidence=safe_confidence,
            valid_until=datetime.now(timezone.utc) + timedelta(hours=4),
            reasoning=reasoning,
            risk_reward_ratio=rr,
            is_worth_taking=worth,
        )




    async def save_strategy(
        self,
        session: AsyncSession,
        strategy: StrategyResult,
        user_id: UUID | None = None,
        analysis_mode: str | None = None,
        skip_cache: bool = False,
    ) -> UUID:
        """将策略写入 strategies 表并更新 Redis 缓存，然后创建绩效快照。

        返回新插入策略的 UUID。绩效快照创建失败不影响策略保存。
        skip_cache: 为 True 时跳过 Redis 写入（调用方已缓存过）。
        """
        try:
            result = await insert_returning(
                session,
                """
                INSERT INTO strategies (symbol, direction, entry_low, entry_high, stop_loss, targets, confidence, valid_until)
                VALUES (:symbol, :direction, :entry_low, :entry_high, :stop_loss, :targets, :confidence, :valid_until)
                RETURNING id
                """,
                {
                    "symbol": strategy.symbol,
                    "direction": strategy.direction,
                    "entry_low": strategy.entry_low,
                    "entry_high": strategy.entry_high,
                    "stop_loss": strategy.stop_loss,
                    "targets": json.dumps(strategy.targets),
                    "confidence": strategy.confidence,
                    "valid_until": strategy.valid_until,
                },
                table="strategies",
            )
            await session.flush()

            row = result.mappings().first()
            strategy_id = UUID(str(row["id"]))

            if not skip_cache:
                cache_key = f"strategy:latest:{strategy.symbol.upper()}"
                await set_with_ttl(cache_key, strategy.model_dump(mode="json"), _CACHE_TTL_SECONDS)

            logger.info("Strategy saved", extra={"symbol": strategy.symbol, "direction": strategy.direction, "id": str(strategy_id)})
        except Exception as exc:
            logger.error("Failed to save strategy", extra={"symbol": strategy.symbol, "error": str(exc)})
            raise

        # 创建绩效快照（失败不影响策略保存）
        try:
            tracker = PerformanceTracker(session)
            snapshot_id = await tracker.create_snapshot(
                strategy_id,
                user_id=user_id,
                analysis_mode=analysis_mode,
            )
        except Exception as exc:
            logger.warning("绩效快照创建失败，不影响策略保存: %s", exc)
            snapshot_id = None

        # 发布判断（失败不影响策略保存）
        if snapshot_id and user_id and analysis_mode:
            try:
                from app.services.publish_engine import PublishRuleEngine
                engine = PublishRuleEngine(session)
                await engine.try_publish(
                    snapshot_id=snapshot_id,
                    user_id=user_id,
                    symbol=strategy.symbol,
                    analysis_mode=analysis_mode,
                    direction=strategy.direction,
                    is_fallback=strategy.is_fallback,
                    is_worth_taking=strategy.is_worth_taking,
                )
            except Exception as exc:
                logger.warning("发布判断失败，不影响策略保存: %s", exc)

        return strategy_id


    async def get_latest(self, symbol: str) -> StrategyResult | None:
        """获取最新策略：先查 Redis 缓存，miss 则查 DB。"""
        cache_key = f"strategy:latest:{symbol.upper()}"

        # 1. 查缓存
        cached = await get_json(cache_key)
        if cached is not None:
            try:
                return StrategyResult.model_validate(cached)
            except Exception as exc:
                logger.warning("Cache parse failed, falling back to DB", extra={"error": str(exc)})

        # 2. 查 DB（通过 raw SQL 避免 ORM 依赖）
        from app.core.database import AsyncSessionLocal

        try:
            async with AsyncSessionLocal() as session:
                sql = text("""
                    SELECT symbol, direction, entry_low, entry_high, stop_loss,
                           targets, confidence, valid_until, created_at
                    FROM strategies
                    WHERE symbol = :symbol
                    ORDER BY created_at DESC
                    LIMIT 1
                """)
                result = await session.execute(sql, {"symbol": symbol.upper()})
                row = result.mappings().first()

                if row is None:
                    return None

                targets_raw = row["targets"]
                targets = json.loads(targets_raw) if isinstance(targets_raw, str) else targets_raw

                strategy = StrategyResult(
                    symbol=row["symbol"],
                    direction=row["direction"],
                    entry_low=float(row["entry_low"]),
                    entry_high=float(row["entry_high"]),
                    stop_loss=float(row["stop_loss"]),
                    targets=targets,
                    confidence=float(row["confidence"]),
                    valid_until=row["valid_until"],
                    reasoning="",
                )

                # 回填缓存
                await set_with_ttl(cache_key, strategy.model_dump(mode="json"), _CACHE_TTL_SECONDS)
                return strategy

        except Exception as exc:
            logger.error("Failed to query latest strategy", extra={"symbol": symbol, "error": str(exc)})
            return None
