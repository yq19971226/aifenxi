"""阶段追踪模块 — 维护交易对的庄家操盘阶段状态。

阶段枚举: accumulation(吸筹) → testing(试盘) → markup(拉盘) → distribution(派发) / washout(洗盘)
         distribution → escape(出逃) / accumulation

使用 Redis Hash `phase:{symbol}` 存储当前阶段、进入时间、转换历史。
检测阶段转换时通过 Redis Stream `alerts` 发布告警。
"""

import json
import logging
from datetime import datetime, timezone
from enum import Enum
from typing import Any

from pydantic import BaseModel, Field

from app.models.market_data import MarketData

logger = logging.getLogger(__name__)


class MarketPhase(str, Enum):
    """庄家操盘阶段枚举。"""

    ACCUMULATION = "accumulation"  # 吸筹
    TESTING = "testing"            # 试盘
    MARKUP = "markup"              # 拉盘
    DISTRIBUTION = "distribution"  # 派发
    ESCAPE = "escape"              # 出逃
    WASHOUT = "washout"            # 洗盘


# 合法的阶段转换路径
_VALID_TRANSITIONS: dict[MarketPhase, list[MarketPhase]] = {
    MarketPhase.ACCUMULATION: [MarketPhase.TESTING, MarketPhase.MARKUP],
    MarketPhase.TESTING: [MarketPhase.MARKUP, MarketPhase.ACCUMULATION],
    MarketPhase.MARKUP: [MarketPhase.DISTRIBUTION, MarketPhase.WASHOUT],
    MarketPhase.DISTRIBUTION: [MarketPhase.ACCUMULATION, MarketPhase.ESCAPE],
    MarketPhase.ESCAPE: [MarketPhase.ACCUMULATION],
    MarketPhase.WASHOUT: [MarketPhase.ACCUMULATION, MarketPhase.MARKUP],
}

# 阶段中文名映射
_PHASE_LABELS: dict[MarketPhase, str] = {
    MarketPhase.ACCUMULATION: "吸筹",
    MarketPhase.TESTING: "试盘",
    MarketPhase.MARKUP: "拉盘",
    MarketPhase.DISTRIBUTION: "派发",
    MarketPhase.ESCAPE: "出逃",
    MarketPhase.WASHOUT: "洗盘",
}


class PhaseTransition(BaseModel):
    """阶段转换事件。"""

    symbol: str
    from_phase: MarketPhase
    to_phase: MarketPhase
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    reason: str = ""


class AccelerationWarning(BaseModel):
    """AI 加速剧本警告。"""

    is_accelerated: bool = False
    transitions_in_window: int = 0       # 时间窗口内的转换次数
    window_hours: float = 24.0           # 检测时间窗口
    avg_phase_duration_hours: float = 0  # 平均阶段持续时间（小时）
    warning: str = ""


class PhaseState(BaseModel):
    """当前阶段状态（存储在 Redis Hash 中）。"""

    phase: MarketPhase = MarketPhase.ACCUMULATION
    entered_at: str = ""  # ISO format datetime string
    transitions: list[dict[str, str]] = Field(default_factory=list)


def _detect_phase_from_data(market_data: MarketData) -> tuple[MarketPhase, str]:
    """基于链上特征 + 技术形态组合规则检测当前阶段。

    Returns:
        (detected_phase, reason) 元组
    """
    onchain = market_data.onchain
    indicators = market_data.indicators
    derivatives = market_data.derivatives

    # 评分系统：各阶段得分
    scores: dict[MarketPhase, float] = {
        MarketPhase.ACCUMULATION: 0.0,
        MarketPhase.TESTING: 0.0,
        MarketPhase.MARKUP: 0.0,
        MarketPhase.DISTRIBUTION: 0.0,
        MarketPhase.ESCAPE: 0.0,
        MarketPhase.WASHOUT: 0.0,
    }
    reasons: dict[MarketPhase, list[str]] = {p: [] for p in MarketPhase}

    # ── 链上特征评分 ──
    if onchain:
        # 交易所净流量
        if onchain.exchange_netflow is not None:
            if onchain.exchange_netflow < -0.01:
                # 净流出 → 吸筹/拉盘信号
                scores[MarketPhase.ACCUMULATION] += 1.0
                scores[MarketPhase.MARKUP] += 0.5
                reasons[MarketPhase.ACCUMULATION].append("交易所净流出")
            elif onchain.exchange_netflow > 0.01:
                # 净流入 → 派发/出逃信号
                scores[MarketPhase.DISTRIBUTION] += 1.5
                reasons[MarketPhase.DISTRIBUTION].append("交易所净流入")
                # 大额净流入叠加巨鲸减仓 → 强出逃信号
                if onchain.exchange_netflow > 0.05:
                    scores[MarketPhase.ESCAPE] += 1.5
                    reasons[MarketPhase.ESCAPE].append("交易所大额净流入")

        # 巨鲸持仓变化
        if onchain.whale_change_24h is not None:
            if onchain.whale_change_24h > 0.5:
                scores[MarketPhase.ACCUMULATION] += 1.0
                scores[MarketPhase.MARKUP] += 0.5
                reasons[MarketPhase.ACCUMULATION].append("巨鲸增仓")
            elif onchain.whale_change_24h < -0.5:
                scores[MarketPhase.DISTRIBUTION] += 1.0
                reasons[MarketPhase.DISTRIBUTION].append("巨鲸减仓")
                if onchain.whale_change_24h < -2.0:
                    scores[MarketPhase.ESCAPE] += 2.0
                    reasons[MarketPhase.ESCAPE].append(f"巨鲸大幅减仓({onchain.whale_change_24h:.1f}%)")

        # 恐慌贪婪指数
        if onchain.fear_greed_index is not None:
            if onchain.fear_greed_index < 25:
                scores[MarketPhase.ACCUMULATION] += 0.5
                reasons[MarketPhase.ACCUMULATION].append("极度恐慌")
            elif onchain.fear_greed_index > 75:
                scores[MarketPhase.DISTRIBUTION] += 0.5
                reasons[MarketPhase.DISTRIBUTION].append("极度贪婪")

        # MVRV
        if onchain.mvrv is not None:
            if onchain.mvrv < 1.5:
                scores[MarketPhase.ACCUMULATION] += 1.0
                reasons[MarketPhase.ACCUMULATION].append(f"MVRV低估({onchain.mvrv:.2f})")
            elif onchain.mvrv > 3.0:
                scores[MarketPhase.DISTRIBUTION] += 1.0
                reasons[MarketPhase.DISTRIBUTION].append(f"MVRV高估({onchain.mvrv:.2f})")
                if onchain.mvrv > 4.0:
                    scores[MarketPhase.ESCAPE] += 1.5
                    reasons[MarketPhase.ESCAPE].append(f"MVRV极端高位({onchain.mvrv:.2f})")

    # ── 技术形态评分 ──
    if indicators:
        # RSI
        if indicators.rsi is not None:
            if indicators.rsi < 30:
                scores[MarketPhase.ACCUMULATION] += 0.5
                reasons[MarketPhase.ACCUMULATION].append("RSI超卖")
            elif indicators.rsi > 70:
                scores[MarketPhase.DISTRIBUTION] += 0.5
                reasons[MarketPhase.DISTRIBUTION].append("RSI超买")
            elif 40 <= indicators.rsi <= 60:
                scores[MarketPhase.TESTING] += 0.5
                reasons[MarketPhase.TESTING].append("RSI中性区间")

        # EMA 排列
        if indicators.ema7 is not None and indicators.ema25 is not None and indicators.ema99 is not None:
            if indicators.ema7 > indicators.ema25 > indicators.ema99:
                scores[MarketPhase.MARKUP] += 1.5
                reasons[MarketPhase.MARKUP].append("EMA多头排列")
            elif indicators.ema7 < indicators.ema25 < indicators.ema99:
                scores[MarketPhase.DISTRIBUTION] += 0.5
                scores[MarketPhase.ACCUMULATION] += 0.5
                reasons[MarketPhase.ACCUMULATION].append("EMA空头排列")

        # 布林带宽度（窄幅 → 试盘/吸筹）
        if indicators.bb_upper is not None and indicators.bb_lower is not None and indicators.bb_middle:
            bb_width = (indicators.bb_upper - indicators.bb_lower) / indicators.bb_middle
            if bb_width < 0.04:
                scores[MarketPhase.TESTING] += 1.0
                scores[MarketPhase.ACCUMULATION] += 0.5
                reasons[MarketPhase.TESTING].append("布林带收窄")
            elif bb_width > 0.1:
                scores[MarketPhase.MARKUP] += 0.5
                reasons[MarketPhase.MARKUP].append("布林带扩张")

    # ── 合约数据评分 ──
    if derivatives:
        if derivatives.funding_rate is not None:
            if derivatives.funding_rate < -0.001:
                scores[MarketPhase.TESTING] += 0.5
                scores[MarketPhase.WASHOUT] += 0.8
                reasons[MarketPhase.TESTING].append("资金费率负值")
                reasons[MarketPhase.WASHOUT].append("资金费率负值(洗盘特征)")
            elif derivatives.funding_rate > 0.001:
                scores[MarketPhase.MARKUP] += 0.3
                scores[MarketPhase.DISTRIBUTION] += 0.3

        # 大规模爆仓 → 洗盘信号
        if derivatives.liquidation_1h_usd is not None and derivatives.liquidation_1h_usd > 20_000_000:
            scores[MarketPhase.WASHOUT] += 1.5
            reasons[MarketPhase.WASHOUT].append(f"大规模爆仓(${derivatives.liquidation_1h_usd/1e6:.0f}M)")

    # 选择得分最高的阶段
    best_phase = max(scores, key=lambda p: scores[p])
    best_score = scores[best_phase]

    # 得分过低时默认 accumulation
    if best_score < 1.0:
        best_phase = MarketPhase.ACCUMULATION
        reason = "数据不足，默认吸筹阶段"
    else:
        reason = "; ".join(reasons[best_phase])

    return best_phase, reason


async def _load_phase_state(symbol: str) -> PhaseState | None:
    """从 Redis Hash 加载阶段状态，Redis 不可用时返回 None。"""
    try:
        from app.core.redis import get_redis_pool

        redis = get_redis_pool()
        key = f"phase:{symbol}"
        data = await redis.hgetall(key)
        if not data:
            return None

        transitions_raw = data.get("transitions", "[]")
        transitions = json.loads(transitions_raw) if transitions_raw else []

        return PhaseState(
            phase=MarketPhase(data.get("phase", "accumulation")),
            entered_at=data.get("entered_at", ""),
            transitions=transitions,
        )
    except Exception as exc:
        logger.warning(
            "Failed to load phase state from Redis",
            extra={"symbol": symbol, "error": str(exc)},
        )
        return None


async def _save_phase_state(symbol: str, state: PhaseState) -> None:
    """将阶段状态保存到 Redis Hash。"""
    try:
        from app.core.redis import get_redis_pool

        redis = get_redis_pool()
        key = f"phase:{symbol}"
        await redis.hset(key, mapping={
            "phase": state.phase.value,
            "entered_at": state.entered_at,
            "transitions": json.dumps(state.transitions, ensure_ascii=False),
        })
        # 设置 TTL 7 天，避免无限堆积
        await redis.expire(key, 7 * 24 * 3600)
    except Exception as exc:
        logger.warning(
            "Failed to save phase state to Redis",
            extra={"symbol": symbol, "error": str(exc)},
        )


async def _publish_phase_alert(transition: PhaseTransition) -> None:
    """阶段转换时发布告警到 alerts stream。"""
    try:
        from app.core.redis import publish_stream

        from_label = _PHASE_LABELS.get(transition.from_phase, transition.from_phase.value)
        to_label = _PHASE_LABELS.get(transition.to_phase, transition.to_phase.value)

        alert_data: dict[str, Any] = {
            "type": "phase_transition",
            "symbol": transition.symbol,
            "from_phase": transition.from_phase.value,
            "to_phase": transition.to_phase.value,
            "message": f"{transition.symbol} 阶段转换: {from_label} → {to_label}",
            "reason": transition.reason,
            "timestamp": transition.timestamp.isoformat(),
        }
        await publish_stream("alerts", alert_data)
        logger.info(
            "Phase transition alert published",
            extra={
                "symbol": transition.symbol,
                "from": transition.from_phase.value,
                "to": transition.to_phase.value,
            },
        )
    except Exception as exc:
        logger.warning(
            "Failed to publish phase transition alert",
            extra={"symbol": transition.symbol, "error": str(exc)},
        )


async def detect_transition(
    symbol: str, market_data: MarketData
) -> PhaseTransition | None:
    """检测交易对的阶段转换。

    Args:
        symbol: 交易对名称（如 BTCUSDT）
        market_data: 当前市场数据

    Returns:
        PhaseTransition 如果发生转换，否则 None。
        Redis 不可用时优雅降级返回 None。
    """
    try:
        detected_phase, reason = _detect_phase_from_data(market_data)

        # 加载当前状态
        current_state = await _load_phase_state(symbol)

        now_iso = datetime.now(timezone.utc).isoformat()

        if current_state is None:
            # 首次追踪，初始化状态
            new_state = PhaseState(
                phase=detected_phase,
                entered_at=now_iso,
                transitions=[],
            )
            await _save_phase_state(symbol, new_state)
            return None

        # 阶段未变化
        if detected_phase == current_state.phase:
            return None

        # 检查是否为合法转换
        valid_next = _VALID_TRANSITIONS.get(current_state.phase, [])
        if detected_phase not in valid_next:
            logger.debug(
                "Invalid phase transition ignored",
                extra={
                    "symbol": symbol,
                    "from": current_state.phase.value,
                    "to": detected_phase.value,
                },
            )
            return None

        # 构建转换事件
        transition = PhaseTransition(
            symbol=symbol,
            from_phase=current_state.phase,
            to_phase=detected_phase,
            reason=reason,
        )

        # 更新状态
        transition_record = {
            "from": current_state.phase.value,
            "to": detected_phase.value,
            "ts": now_iso,
            "at": now_iso,
            "reason": reason,
        }
        history = current_state.transitions[-9:]  # 保留最近 10 条
        history.append(transition_record)

        new_state = PhaseState(
            phase=detected_phase,
            entered_at=now_iso,
            transitions=history,
        )
        await _save_phase_state(symbol, new_state)

        # 发布告警
        await _publish_phase_alert(transition)

        return transition

    except Exception as exc:
        logger.warning(
            "Phase transition detection failed, returning None",
            extra={"symbol": symbol, "error": str(exc)},
        )
        return None


async def get_current_phase(symbol: str) -> MarketPhase | None:
    """获取交易对当前阶段，Redis 不可用时返回 None。"""
    state = await _load_phase_state(symbol)
    if state is None:
        return None
    return state.phase


# ── AI 加速剧本检测 ─────────────────────────────────────────

# 传统庄家五部曲通常需要 1-4 周完成
# 如果在 24 小时内完成 3 次以上阶段转换，视为 AI 加速操盘
_ACCEL_WINDOW_HOURS = 24.0
_ACCEL_MIN_TRANSITIONS = 3
_ACCEL_MIN_AVG_DURATION_HOURS = 4.0  # 平均阶段持续 < 4小时 视为异常


async def detect_acceleration(symbol: str) -> AccelerationWarning:
    """检测是否存在 AI 加速操盘行为。

    通过分析阶段转换历史，判断是否在短时间内经历了
    过多的阶段转换（传统需要数周的操盘五部曲被压缩到数小时）。
    """
    state = await _load_phase_state(symbol)
    if state is None or not state.transitions:
        return AccelerationWarning()

    now = datetime.now(timezone.utc)
    window_start = now.timestamp() - _ACCEL_WINDOW_HOURS * 3600

    # 筛选时间窗口内的转换
    recent_transitions: list[dict] = []
    for t in state.transitions:
        ts_str = t.get("ts") or t.get("at", "")
        if not ts_str:
            continue
        try:
            ts = datetime.fromisoformat(ts_str.replace("Z", "+00:00"))
            if ts.timestamp() >= window_start:
                recent_transitions.append({**t, "_ts": ts})
        except (ValueError, TypeError):
            continue

    count = len(recent_transitions)
    if count < _ACCEL_MIN_TRANSITIONS:
        return AccelerationWarning(
            transitions_in_window=count,
            window_hours=_ACCEL_WINDOW_HOURS,
        )

    # 计算平均阶段持续时间
    durations: list[float] = []
    for i in range(1, len(recent_transitions)):
        prev_ts = recent_transitions[i - 1]["_ts"]
        curr_ts = recent_transitions[i]["_ts"]
        duration_hours = (curr_ts.timestamp() - prev_ts.timestamp()) / 3600
        if duration_hours > 0:
            durations.append(duration_hours)

    avg_duration = sum(durations) / len(durations) if durations else _ACCEL_WINDOW_HOURS

    is_accelerated = (
        count >= _ACCEL_MIN_TRANSITIONS
        and avg_duration < _ACCEL_MIN_AVG_DURATION_HOURS
    )

    warning = ""
    if is_accelerated:
        phases_seen = [t.get("to", "") for t in recent_transitions]
        warning = (
            f"检测到AI加速操盘：{_ACCEL_WINDOW_HOURS:.0f}小时内发生{count}次阶段转换，"
            f"平均阶段持续仅{avg_duration:.1f}小时（正常应>数天）。"
            f"转换路径: {' → '.join(phases_seen)}。"
            f"建议：提高警惕，不追突破，等待阶段稳定后再操作"
        )

    return AccelerationWarning(
        is_accelerated=is_accelerated,
        transitions_in_window=count,
        window_hours=_ACCEL_WINDOW_HOURS,
        avg_phase_duration_hours=round(avg_duration, 2),
        warning=warning,
    )
