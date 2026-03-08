"""AI操盘检测器 — 识别庄家是否使用AI/算法进行操盘。

综合分析以下 6 个维度给出 AI 操盘概率（0-100）：
1. 价格精度分析：插针/扫损是否精确命中已知爆仓密集区
2. 时间模式分析：异常操作的时间间隔是否呈现周期性
3. 扫损效率分析：止损猎杀是一次到位还是多次试探
4. 情绪磨损检测：低波横盘→突然爆发的 AI 磨人模式
5. 订单行为分析：挂撤单的机械化重复模式
6. 多维联动分析：价格/OI/资金费率变化的同步性

使用统计方法 + 规则引擎，不依赖 LLM。
纯计算 + Redis 数据读取。
"""

from __future__ import annotations

import logging
import math
from datetime import datetime, timezone
from typing import Any, Literal

from pydantic import BaseModel, Field

from app.models.market_data import KlineData, MarketData

logger = logging.getLogger(__name__)


# ── 输出模型 ─────────────────────────────────────────────────


class AIDetectorResult(BaseModel):
    """AI操盘检测结果。"""

    symbol: str
    ai_probability: int = Field(ge=0, le=100)
    operation_mode: Literal["ai", "manual", "hybrid", "unknown"] = "unknown"
    confidence: float = Field(ge=0.0, le=1.0, default=0.5)
    evidence: list[str] = Field(default_factory=list)
    tactics_detected: list[str] = Field(default_factory=list)
    counter_advice: list[str] = Field(default_factory=list)
    detail_scores: dict[str, int] = Field(default_factory=dict)
    grind_active: bool = False
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


# ── AI 战术 → 对抗方案映射 ────────────────────────────────────

_TACTIC_COUNTER: dict[str, str] = {
    "精准爆破": "止损放在密集区外+1.5ATR，或用限价止损替代市价止损",
    "扫损反转": "不在整数关口设止损，偏移0.3-0.5ATR",
    "磨人横盘": "保持耐心，不追突破，等回踩确认；或暂离市场",
    "情绪操控": "忽略社交媒体噪音，只看链上数据",
    "假突破回收": "突破后不追，等回踩突破位确认",
    "阶梯式引诱": "设置递减止盈而非追加仓位",
    "闪崩收割": "使用限价单而非市价单，闪崩不恐慌",
    "周期性操作": "避开整点/结算点前后15分钟操作",
}

# ── 检测阈值（采纳审阅反馈） ──────────────────────────────────

_PRECISION_HIT_RATE_THRESHOLD = 0.70   # 价格精度命中率 >70% 可疑
_TIME_PERIODICITY_THRESHOLD = 0.60     # 时间周期性 >60% 统计显著
_STOP_HUNT_EFFICIENCY_THRESHOLD = 0.80  # 扫损效率 >80% 可疑
_MECHANICAL_ORDER_THRESHOLD = 5        # 同金额挂单重复 >5次/h


# ── 权重配置 ─────────────────────────────────────────────────

_WEIGHTS: dict[str, float] = {
    "price_precision": 0.25,
    "time_pattern": 0.20,
    "stop_hunt_efficiency": 0.20,
    "grind_pattern": 0.15,
    "order_behavior": 0.10,
    "cross_sync": 0.10,
}


# ── 辅助函数 ─────────────────────────────────────────────────


def _safe_div(a: float, b: float, default: float = 0.0) -> float:
    """安全除法，避免除零。"""
    return a / b if b != 0 else default


def _clamp(value: float, lo: float = 0.0, hi: float = 100.0) -> int:
    """限制到 [lo, hi] 并取整。"""
    return max(int(lo), min(int(hi), int(round(value))))


def _wick_size(k: KlineData, direction: str) -> float:
    """计算影线长度。direction='lower'|'upper'。"""
    if direction == "lower":
        return min(k.open, k.close) - k.low
    return k.high - max(k.open, k.close)


def _body_size(k: KlineData) -> float:
    """实体大小。"""
    return abs(k.close - k.open)


def _kline_range(k: KlineData) -> float:
    """K线全幅。"""
    return k.high - k.low


def _compute_autocorrelation(intervals: list[float], lag: int = 1) -> float:
    """计算时间间隔序列的自相关系数。

    Args:
        intervals: 时间间隔列表（秒）
        lag: 滞后阶数

    Returns:
        自相关系数 [-1, 1]，数据不足返回 0.0
    """
    n = len(intervals)
    if n < lag + 3:
        return 0.0

    mean = sum(intervals) / n
    variance = sum((x - mean) ** 2 for x in intervals) / n
    if variance < 1e-10:
        return 0.0

    covariance = sum(
        (intervals[i] - mean) * (intervals[i + lag] - mean)
        for i in range(n - lag)
    ) / (n - lag)

    return covariance / variance


# ── 核心检测器 ───────────────────────────────────────────────


class AIDetector:
    """AI操盘检测器 — 纯计算 + Redis 数据，不调用 LLM。

    通过 6 个维度的统计分析，给出庄家是否使用 AI/算法操盘的概率评估。
    """

    async def detect(
        self,
        symbol: str,
        market_data: MarketData,
    ) -> AIDetectorResult:
        """对单个交易对执行 AI 操盘检测。

        Args:
            symbol: 交易对名称
            market_data: 当前市场数据（包含多周期K线、指标、合约数据）

        Returns:
            AIDetectorResult 包含 AI 概率、证据、战术和对抗建议
        """
        detail_scores: dict[str, int] = {}
        evidence: list[str] = []
        tactics: list[str] = []

        # ── 1. 价格精度分析 ──
        precision_score, precision_evidence, precision_tactics = (
            await self._analyze_price_precision(symbol, market_data)
        )
        detail_scores["price_precision"] = precision_score
        evidence.extend(precision_evidence)
        tactics.extend(precision_tactics)

        # ── 2. 时间模式分析 ──
        time_score, time_evidence, time_tactics = (
            self._analyze_time_pattern(market_data)
        )
        detail_scores["time_pattern"] = time_score
        evidence.extend(time_evidence)
        tactics.extend(time_tactics)

        # ── 3. 扫损效率分析 ──
        hunt_score, hunt_evidence, hunt_tactics = (
            self._analyze_stop_hunt_efficiency(market_data)
        )
        detail_scores["stop_hunt_efficiency"] = hunt_score
        evidence.extend(hunt_evidence)
        tactics.extend(hunt_tactics)

        # ── 4. 情绪磨损检测 ──
        grind_score, grind_evidence, grind_tactics, grind_active = (
            self._analyze_grind_pattern(market_data)
        )
        detail_scores["grind_pattern"] = grind_score
        evidence.extend(grind_evidence)
        tactics.extend(grind_tactics)

        # ── 5. 订单行为分析 ──
        order_score, order_evidence, order_tactics = (
            await self._analyze_order_behavior(symbol, market_data)
        )
        detail_scores["order_behavior"] = order_score
        evidence.extend(order_evidence)
        tactics.extend(order_tactics)

        # ── 6. 多维联动分析 ──
        sync_score, sync_evidence, sync_tactics = (
            self._analyze_cross_sync(market_data)
        )
        detail_scores["cross_sync"] = sync_score
        evidence.extend(sync_evidence)
        tactics.extend(sync_tactics)

        # ── 加权总分 ──
        total = sum(
            detail_scores.get(dim, 0) * weight
            for dim, weight in _WEIGHTS.items()
        )
        ai_probability = _clamp(total)

        # ── 判定操盘模式 ──
        if ai_probability >= 70:
            operation_mode: Literal["ai", "manual", "hybrid", "unknown"] = "ai"
        elif ai_probability >= 40:
            operation_mode = "hybrid"
        elif ai_probability >= 15:
            operation_mode = "manual"
        else:
            operation_mode = "unknown"

        # ── 生成对抗建议 ──
        counter_advice = self._generate_counter_advice(tactics, ai_probability)

        # ── 置信度 = 有效维度数/6 × 数据充分度 ──
        active_dims = sum(1 for s in detail_scores.values() if s > 0)
        data_completeness = self._assess_data_completeness(market_data)
        confidence = round(min(active_dims / 6.0 * data_completeness, 1.0), 2)

        return AIDetectorResult(
            symbol=symbol,
            ai_probability=ai_probability,
            operation_mode=operation_mode,
            confidence=confidence,
            evidence=evidence,
            tactics_detected=list(set(tactics)),
            counter_advice=counter_advice,
            detail_scores=detail_scores,
            grind_active=grind_active,
        )

    # ──────────────────────────────────────────────────────────
    # 维度 1: 价格精度分析
    # ──────────────────────────────────────────────────────────

    async def _analyze_price_precision(
        self, symbol: str, data: MarketData,
    ) -> tuple[int, list[str], list[str]]:
        """分析插针/扫损是否精确命中爆仓密集区。

        数据源：
        - 15m K线的影线极值
        - Redis 爆仓热力图 liq_heatmap:{symbol}

        评分：
        - 命中率 > 70%: 90-100 分（几乎确定AI）
        - 命中率 50-70%: 60-80 分
        - 命中率 30-50%: 30-50 分
        - 命中率 < 30%: 0-20 分
        """
        evidence: list[str] = []
        tactics: list[str] = []

        # 获取爆仓密集区价格
        liq_zones = await self._get_liquidation_zones(symbol)
        if not liq_zones:
            return 0, [], []

        # 使用 15m K线检测插针精度
        klines = data.klines_15m or data.klines_1h
        if len(klines) < 10:
            return 0, [], []

        # 检测有明显影线的K线（影线 > 实体的 1.5 倍）
        pin_bars: list[tuple[KlineData, str]] = []
        for k in klines[-50:]:
            body = _body_size(k)
            lower = _wick_size(k, "lower")
            upper = _wick_size(k, "upper")
            if body < 1e-10:
                continue
            if lower > body * 1.5:
                pin_bars.append((k, "lower"))
            if upper > body * 1.5:
                pin_bars.append((k, "upper"))

        if not pin_bars:
            return 0, [], []

        # 统计插针精确命中爆仓区的比例
        hit_count = 0
        total_pins = len(pin_bars)
        precision_values: list[float] = []

        for k, direction in pin_bars:
            wick_extreme = k.low if direction == "lower" else k.high
            for zone_price in liq_zones:
                if zone_price <= 0:
                    continue
                deviation_pct = abs(wick_extreme - zone_price) / zone_price * 100
                if deviation_pct < 0.5:  # 0.5% 以内视为命中
                    hit_count += 1
                    precision_values.append(deviation_pct)
                    break

        hit_rate = _safe_div(hit_count, total_pins)

        if hit_rate > _PRECISION_HIT_RATE_THRESHOLD:
            avg_deviation = sum(precision_values) / len(precision_values) if precision_values else 0
            score = _clamp(80 + hit_rate * 20)
            evidence.append(
                f"插针精确度异常: {hit_count}/{total_pins}次命中爆仓区"
                f"(命中率{hit_rate:.0%}, 平均偏差{avg_deviation:.3f}%)"
            )
            if avg_deviation < 0.1:
                tactics.append("精准爆破")
                score = _clamp(score + 10)
            else:
                tactics.append("扫损反转")
        elif hit_rate > 0.5:
            score = _clamp(50 + hit_rate * 40)
            evidence.append(f"插针命中率中等: {hit_rate:.0%}")
        elif hit_rate > 0.3:
            score = _clamp(20 + hit_rate * 50)
        else:
            score = _clamp(hit_rate * 60)

        return score, evidence, tactics

    # ──────────────────────────────────────────────────────────
    # 维度 2: 时间模式分析
    # ──────────────────────────────────────────────────────────

    def _analyze_time_pattern(
        self, data: MarketData,
    ) -> tuple[int, list[str], list[str]]:
        """分析异常波动的时间间隔是否呈现周期性。

        方法：
        - 从K线中提取大幅波动事件的时间戳
        - 计算时间间隔的自相关系数
        - 检测是否集中在整点/结算点附近

        评分：
        - 自相关 > 0.7: 80-100（强周期性 = AI）
        - 整点命中率 > 60%: 额外 +10-20
        """
        evidence: list[str] = []
        tactics: list[str] = []

        klines = data.klines_15m or data.klines_1h
        if len(klines) < 20:
            return 0, [], []

        # 计算每根K线的波动幅度（相对ATR归一化）
        ranges = [_kline_range(k) for k in klines]
        avg_range = sum(ranges) / len(ranges) if ranges else 1.0
        if avg_range < 1e-10:
            return 0, [], []

        # 提取大幅波动事件（幅度 > 2倍平均）
        spike_times: list[datetime] = []
        for i, k in enumerate(klines):
            if _kline_range(k) > avg_range * 2.0:
                spike_times.append(k.open_time)

        if len(spike_times) < 4:
            return 0, [], []

        # 计算时间间隔（秒）
        intervals: list[float] = []
        for i in range(1, len(spike_times)):
            delta = (spike_times[i] - spike_times[i - 1]).total_seconds()
            if delta > 0:
                intervals.append(delta)

        if len(intervals) < 3:
            return 0, [], []

        # 自相关分析
        autocorr = _compute_autocorrelation(intervals)

        # 整点/结算点集中度分析
        on_hour_count = 0
        for t in spike_times:
            if t.minute < 5 or t.minute > 55:
                on_hour_count += 1
            elif t.minute in (28, 29, 30, 31, 32):
                on_hour_count += 1

        on_hour_rate = _safe_div(on_hour_count, len(spike_times))

        score = 0

        if autocorr > 0.7:
            score = _clamp(80 + autocorr * 20)
            evidence.append(f"波动时间呈强周期性(自相关={autocorr:.2f})")
            tactics.append("周期性操作")
        elif autocorr > 0.4:
            score = _clamp(40 + autocorr * 50)
            evidence.append(f"波动时间有一定规律性(自相关={autocorr:.2f})")
        else:
            score = _clamp(autocorr * 60)

        if on_hour_rate > _TIME_PERIODICITY_THRESHOLD:
            score = _clamp(score + 15)
            evidence.append(f"波动集中在整点/结算点附近({on_hour_rate:.0%})")

        # 检测是否存在固定周期（4h/8h）
        if intervals:
            avg_interval = sum(intervals) / len(intervals)
            std_interval = math.sqrt(
                sum((x - avg_interval) ** 2 for x in intervals) / len(intervals)
            )
            cv = _safe_div(std_interval, avg_interval)

            # 变异系数低 → 间隔非常规律
            if cv < 0.2 and avg_interval > 3600:
                hours = avg_interval / 3600
                score = _clamp(score + 10)
                evidence.append(f"波动间隔高度规律: 约{hours:.1f}小时一次(CV={cv:.2f})")

        return score, evidence, tactics

    # ──────────────────────────────────────────────────────────
    # 维度 3: 扫损效率分析
    # ──────────────────────────────────────────────────────────

    def _analyze_stop_hunt_efficiency(
        self, data: MarketData,
    ) -> tuple[int, list[str], list[str]]:
        """分析止损猎杀的效率特征。

        AI 扫损特征：
        - 价格精确触达常用止损位后立即反转
        - 一次到位，不需要多次试探

        手动扫损特征：
        - 多次试探同一水平
        - 可能过冲

        方法：
        - 从 15m K线中找出"插针→反转"形态
        - 统计一次到位率和反转速度
        """
        evidence: list[str] = []
        tactics: list[str] = []

        klines = data.klines_15m or data.klines_1h
        if len(klines) < 20:
            return 0, [], []

        price = data.current_price
        if price <= 0:
            return 0, [], []

        # 寻找"V形反转"模式：
        # 连续下跌 → 插针 → 立即反弹（或反过来）
        v_reversal_count = 0
        multi_probe_count = 0
        total_hunts = 0

        for i in range(2, len(klines) - 1):
            prev = klines[i - 1]
            curr = klines[i]
            nxt = klines[i + 1]

            # 检测下方插针反转
            lower_wick = _wick_size(curr, "lower")
            body = _body_size(curr)
            rng = _kline_range(curr)

            if rng < 1e-10 or body < 1e-10:
                continue

            # 长下影线（> 实体2倍）且后一根反弹
            if lower_wick > body * 2.0 and nxt.close > curr.close:
                total_hunts += 1
                # 检查是否一次到位（前一根没有试探过同一水平）
                prev_low_near = abs(prev.low - curr.low) / price * 100 < 0.3
                if prev_low_near:
                    multi_probe_count += 1
                else:
                    v_reversal_count += 1

            # 上方插针反转
            upper_wick = _wick_size(curr, "upper")
            if upper_wick > body * 2.0 and nxt.close < curr.close:
                total_hunts += 1
                prev_high_near = abs(prev.high - curr.high) / price * 100 < 0.3
                if prev_high_near:
                    multi_probe_count += 1
                else:
                    v_reversal_count += 1

        if total_hunts < 2:
            return 0, [], []

        # 一次到位率
        one_shot_rate = _safe_div(v_reversal_count, total_hunts)

        if one_shot_rate > _STOP_HUNT_EFFICIENCY_THRESHOLD:
            score = _clamp(80 + one_shot_rate * 20)
            evidence.append(
                f"扫损效率极高: 一次到位率{one_shot_rate:.0%}"
                f"({v_reversal_count}/{total_hunts}次)"
            )
            tactics.append("精准爆破")
        elif one_shot_rate > 0.6:
            score = _clamp(50 + one_shot_rate * 40)
            evidence.append(f"扫损效率较高: 一次到位率{one_shot_rate:.0%}")
            tactics.append("扫损反转")
        elif one_shot_rate > 0.4:
            score = _clamp(20 + one_shot_rate * 50)
        else:
            # 多次试探为主 → 更像人工
            score = _clamp(one_shot_rate * 40)

        # 反转速度分析（K线内反转比例）
        quick_reverse = sum(
            1 for k in klines[-30:]
            if _kline_range(k) > 0
            and min(_wick_size(k, "lower"), _wick_size(k, "upper")) / _kline_range(k) > 0.6
        )
        if quick_reverse > 5:
            score = _clamp(score + 10)
            evidence.append(f"快速反转频繁: 最近30根中{quick_reverse}次K线内反转")

        return score, evidence, tactics

    # ──────────────────────────────────────────────────────────
    # 维度 4: 情绪磨损检测（AI磨人模式）
    # ──────────────────────────────────────────────────────────

    def _analyze_grind_pattern(
        self, data: MarketData,
    ) -> tuple[int, list[str], list[str], bool]:
        """检测AI特有的"磨人"模式 — 长时间低波动率消耗散户耐心。

        AI磨人特征：
        - 长时间（12-48h）极低波动率横盘
        - 波幅骤降至平均值的 30% 以下
        - 成交量极度萎缩
        - 然后突然一根大幅K线

        返回: (score, evidence, tactics, grind_active)
        """
        evidence: list[str] = []
        tactics: list[str] = []
        grind_active = False

        klines = data.klines_1h
        if len(klines) < 24:
            return 0, [], [], False

        # 计算每根K线的波幅占价格的百分比
        price = data.current_price
        if price <= 0:
            return 0, [], [], False

        pct_ranges = [_kline_range(k) / price * 100 for k in klines]
        volumes = [k.volume for k in klines]

        avg_range = sum(pct_ranges) / len(pct_ranges)
        avg_volume = sum(volumes) / len(volumes) if volumes else 1.0

        if avg_range < 1e-10 or avg_volume < 1e-10:
            return 0, [], [], False

        # 寻找"低波段"：连续 N 根K线波幅 < 平均值 30%
        low_vol_threshold = avg_range * 0.30
        low_vol_vol_threshold = avg_volume * 0.50

        current_streak = 0
        max_streak = 0
        streak_end_idx = -1

        for i, pct_r in enumerate(pct_ranges):
            if pct_r < low_vol_threshold:
                current_streak += 1
                if current_streak > max_streak:
                    max_streak = current_streak
                    streak_end_idx = i
            else:
                current_streak = 0

        # 当前是否正在磨人阶段
        recent_low_count = sum(
            1 for r in pct_ranges[-8:]
            if r < low_vol_threshold
        )
        recent_low_vol = sum(
            1 for v in volumes[-8:]
            if v < low_vol_vol_threshold
        )
        grind_active = recent_low_count >= 6 and recent_low_vol >= 4

        score = 0

        if max_streak >= 12:  # 12h+ 低波
            score = _clamp(70 + max_streak * 2)
            evidence.append(
                f"检测到AI磨人模式: 连续{max_streak}小时极低波动"
                f"(波幅<{low_vol_threshold:.3f}%)"
            )
            tactics.append("磨人横盘")

            # 检查低波段后是否出现爆发
            if streak_end_idx < len(pct_ranges) - 1:
                after_range = pct_ranges[streak_end_idx + 1]
                if after_range > avg_range * 2.5:
                    score = _clamp(score + 15)
                    evidence.append(
                        f"低波后爆发: 波幅从{pct_ranges[streak_end_idx]:.3f}%"
                        f"→{after_range:.3f}%"
                    )
        elif max_streak >= 8:
            score = _clamp(40 + max_streak * 3)
            evidence.append(f"中等程度磨人: 连续{max_streak}小时低波动")

        if grind_active:
            score = _clamp(score + 10)
            evidence.append("⚠ 当前正处于磨人阶段，即将爆发性波动概率较高")

        # 成交量同步萎缩加分
        if recent_low_vol >= 6:
            score = _clamp(score + 5)
            evidence.append("成交量同步极度萎缩，磨人特征明显")

        return score, evidence, tactics, grind_active

    # ──────────────────────────────────────────────────────────
    # 维度 5: 订单行为分析
    # ──────────────────────────────────────────────────────────

    async def _analyze_order_behavior(
        self, symbol: str, data: MarketData,
    ) -> tuple[int, list[str], list[str]]:
        """分析订单簿行为是否呈现机械化特征。

        数据源：
        - Redis cg_taker:{symbol} — Taker Buy/Sell 数据
        - 合约数据中的多空比变化

        检测：
        - Taker ratio 的变化是否异常规律
        - 多空比是否呈现阶梯式变化
        """
        evidence: list[str] = []
        tactics: list[str] = []

        # 使用 Taker 数据（从 Redis）
        taker_ratios: list[float] = []
        try:
            from app.core.redis import get_json
            taker_data = await get_json(f"cg_taker:{symbol}")
            if taker_data and isinstance(taker_data, list):
                for entry in taker_data[:24]:
                    ratio = float(entry.get("buy_sell_ratio", 0))
                    if ratio > 0:
                        taker_ratios.append(ratio)
        except Exception as exc:
            logger.debug("Taker data unavailable for AI detection: %s", exc)

        if len(taker_ratios) < 6:
            return 0, [], []

        # 检测 Taker ratio 变化的机械化特征
        # AI 操盘的 Taker ratio 变化更均匀，人工更随机
        changes = [
            abs(taker_ratios[i] - taker_ratios[i - 1])
            for i in range(1, len(taker_ratios))
        ]

        if not changes:
            return 0, [], []

        avg_change = sum(changes) / len(changes)
        if avg_change < 1e-10:
            return 0, [], []

        std_change = math.sqrt(
            sum((c - avg_change) ** 2 for c in changes) / len(changes)
        )
        cv = _safe_div(std_change, avg_change)

        score = 0

        # 变异系数低 → 变化过于均匀 → 机械化
        if cv < 0.3:
            score = _clamp(70 + (0.3 - cv) * 200)
            evidence.append(f"Taker比率变化异常均匀(CV={cv:.2f})，疑似程序控制")
        elif cv < 0.5:
            score = _clamp(30 + (0.5 - cv) * 150)
            evidence.append(f"Taker比率变化较规律(CV={cv:.2f})")

        # 检测阶梯式变化
        step_count = 0
        for i in range(2, len(taker_ratios)):
            delta1 = taker_ratios[i - 1] - taker_ratios[i - 2]
            delta2 = taker_ratios[i] - taker_ratios[i - 1]
            if abs(delta1) > 0.01 and abs(delta2) > 0.01:
                if abs(delta1 - delta2) / max(abs(delta1), abs(delta2)) < 0.15:
                    step_count += 1

        if step_count >= 3:
            score = _clamp(score + 15)
            evidence.append(f"Taker比率呈阶梯式变化({step_count}级)")
            tactics.append("阶梯式引诱")

        return score, evidence, tactics

    # ──────────────────────────────────────────────────────────
    # 维度 6: 多维联动分析
    # ──────────────────────────────────────────────────────────

    def _analyze_cross_sync(
        self, data: MarketData,
    ) -> tuple[int, list[str], list[str]]:
        """分析价格、OI、资金费率变化的同步性。

        AI 操盘特征：
        - 价格/OI/资金费率在同一K线内同步异动
        - 变化幅度高度协调

        数据源：
        - K线价格数据
        - 合约数据（funding_rate, liquidation）
        """
        evidence: list[str] = []
        tactics: list[str] = []

        deriv = data.derivatives
        if deriv is None:
            return 0, [], []

        klines = data.klines_1h or data.klines_15m
        if len(klines) < 10:
            return 0, [], []

        score = 0
        price_change_pct = 0.0

        # 计算最近几根K线的价格走势
        recent = klines[-5:]
        if recent[0].open > 0:
            price_change_pct = (recent[-1].close - recent[0].open) / recent[0].open * 100

        # 检测资金费率与价格走势的反常配合
        if deriv.funding_rate is not None:
            fr = deriv.funding_rate

            # 资金费率极端 + 价格走势与之配合 → 可能是协调操纵
            if abs(fr) > 0.001:
                if (fr > 0 and price_change_pct < -2.0) or (fr < 0 and price_change_pct > 2.0):
                    # 反向配合 → 收割信号
                    score = _clamp(score + 40)
                    direction = "多头" if fr > 0 else "空头"
                    evidence.append(
                        f"资金费率与价格反向配合: FR={fr:.4f},"
                        f" 价格{price_change_pct:+.1f}%（收割{direction}）"
                    )

        # 大规模爆仓 + 价格精确回收 → AI协调
        if deriv.liquidation_1h_usd is not None and deriv.liquidation_1h_usd > 20_000_000:
            last_k = klines[-1]
            wick_ratio = max(
                _wick_size(last_k, "lower"), _wick_size(last_k, "upper")
            ) / max(_kline_range(last_k), 1e-10)

            if wick_ratio > 0.7:  # 长影线 + 大爆仓 = 精准收割
                score = _clamp(score + 50)
                evidence.append(
                    f"大规模爆仓(${deriv.liquidation_1h_usd/1e6:.0f}M)"
                    f"+ 精准价格回收(影线比{wick_ratio:.0%})，疑似AI协调收割"
                )
                tactics.append("精准爆破")

        # 多空比极端 + 反向行情 → 定向猎杀
        if deriv.long_short_ratio is not None:
            lsr = deriv.long_short_ratio
            if lsr > 2.0 and price_change_pct < -1.0:
                score = _clamp(score + 30)
                evidence.append(f"多头拥挤(多空比{lsr:.2f}) + 价格下跌，疑似定向猎杀多头")
            elif lsr < 0.5 and price_change_pct > 1.0:
                score = _clamp(score + 30)
                evidence.append(f"空头拥挤(多空比{lsr:.2f}) + 价格上涨，疑似定向猎杀空头")

        return _clamp(score), evidence, tactics

    # ──────────────────────────────────────────────────────────
    # 辅助方法
    # ──────────────────────────────────────────────────────────

    async def _get_liquidation_zones(self, symbol: str) -> list[float]:
        """从 Redis 获取爆仓密集区价格列表。"""
        try:
            from app.core.redis import get_json
            heatmap = await get_json(f"liq_heatmap:{symbol}")
            if not heatmap or not isinstance(heatmap, list):
                return []

            zones: list[float] = []
            for zone in heatmap:
                price_low = float(zone.get("price_low", 0))
                price_high = float(zone.get("price_high", 0))
                if price_low > 0 and price_high > 0:
                    zones.append((price_low + price_high) / 2)
            return zones

        except Exception as exc:
            logger.debug("Liquidation zones unavailable: %s", exc)
            return []

    @staticmethod
    def _assess_data_completeness(data: MarketData) -> float:
        """评估市场数据的完备度（0-1）。"""
        score = 0.0
        total = 5.0

        if len(data.klines_15m) >= 20:
            score += 1.0
        elif len(data.klines_1h) >= 10:
            score += 0.7

        if len(data.klines_1h) >= 24:
            score += 1.0
        elif len(data.klines_1h) >= 12:
            score += 0.5

        if data.derivatives is not None:
            score += 1.0

        if data.onchain is not None:
            score += 1.0

        if data.indicators is not None:
            score += 1.0

        return score / total

    @staticmethod
    def _generate_counter_advice(
        tactics: list[str], ai_probability: int,
    ) -> list[str]:
        """根据检测到的AI战术生成对抗建议。"""
        advice: list[str] = []
        seen: set[str] = set()

        for tactic in tactics:
            counter = _TACTIC_COUNTER.get(tactic)
            if counter and counter not in seen:
                advice.append(f"[{tactic}] {counter}")
                seen.add(counter)

        # 通用建议
        if ai_probability >= 70:
            advice.append("整体建议: 止损外扩1-1.5ATR，进场偏移0.3ATR，降低仓位")
        elif ai_probability >= 40:
            advice.append("整体建议: 适度警惕，止损避开整数关口，关注K线内反转信号")

        return advice
