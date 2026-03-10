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


# ── ATR 自适应倍数 ──────────────────────────────────────────

def _atr_multipliers(
    atr: float,
    current_price: float,
) -> dict[str, float | list[float]]:
    """根据 ATR/Price 波动率比率返回自适应倍数。

    volatility_regime:
        < 1.0% → 低波动（窄幅震荡，需要更宽的倍数避免噪音触发）
        1.0%-3.0% → 正常
        > 3.0% → 高波动（需要更窄的倍数控制单笔风险）

    Returns:
        {"entry": float, "stop": float, "targets": [float, float, float]}
    """
    if current_price <= 0:
        return {"entry": 1.5, "stop": 2.0, "targets": [1.5, 3.0, 5.0]}

    vol_ratio = atr / current_price  # e.g. 0.015 = 1.5%

    if vol_ratio < 0.01:
        # 低波动：放宽倍数，避免噪音触发止损
        return {"entry": 2.0, "stop": 2.5, "targets": [2.0, 4.0, 7.0]}
    elif vol_ratio > 0.03:
        # 高波动：收窄倍数，控制单笔风险
        return {"entry": 1.0, "stop": 1.5, "targets": [1.0, 2.0, 3.5]}
    else:
        # 正常：维持现有倍数
        return {"entry": 1.5, "stop": 2.0, "targets": [1.5, 3.0, 5.0]}


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


class StrategyService:
    """策略生成与查询服务。"""

    @staticmethod
    def _validate_strategy(
        direction: str, price: float,
        entry_low: float, entry_high: float,
        stop_loss: float, targets: list[float],
    ) -> tuple[float, float, float, list[float]]:
        """确保入场/止损/目标价与方向一致，不一致时回退到百分比默认值。"""
        if direction == "long":
            if stop_loss >= price:
                stop_loss = price * 0.95
            if entry_low > price:
                entry_low = price * 0.98
            targets = sorted([t for t in targets if t > price])
            fallback = [price * 1.03, price * 1.06, price * 1.10]
            while len(targets) < 3:
                targets.append(fallback[len(targets)])
        elif direction == "short":
            if stop_loss <= price:
                stop_loss = price * 1.05
            if entry_high < price:
                entry_high = price * 1.02
            targets = sorted([t for t in targets if t < price], reverse=True)
            fallback = [price * 0.97, price * 0.94, price * 0.90]
            while len(targets) < 3:
                targets.append(fallback[len(targets)])
        return entry_low, entry_high, stop_loss, targets[:3]

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
        worth = rr >= 1.5

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
            stop_loss = round(price * 0.95, 8)
            targets = [round(price * 1.03, 8), round(price * 1.06, 8), round(price * 1.10, 8)]
        elif signal == "bearish":
            direction = "short"
            entry_low = round(price, 8)
            entry_high = round(price * 1.01, 8)
            stop_loss = round(price * 1.05, 8)
            targets = [round(price * 0.97, 8), round(price * 0.94, 8), round(price * 0.90, 8)]
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
            reasoning="智能体未返回有效数据，已生成基于当前价格的回退策略。",
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
                stop_loss = price * 0.95
            entry_high = price
            targets = above_price[:3] if above_price else [
                price * 1.03, price * 1.06, price * 1.10,
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
                stop_loss = price * 1.05
            targets = sorted(below_price, reverse=True)[:3] if below_price else [
                price * 0.97, price * 0.94, price * 0.90,
            ]
        else:
            direction = "neutral"
            entry_low = price * 0.99
            entry_high = price * 1.01
            stop_loss = price * 0.95
            targets = []

        entry_low, entry_high, stop_loss, targets = self._validate_strategy(
            direction, price, entry_low, entry_high, stop_loss, targets,
        )

        rr, worth = self._calc_risk_reward(direction, entry_low, entry_high, stop_loss, targets)
        worth = worth and report.confidence >= 0.4

        return StrategyResult(
            symbol=report.symbol,
            direction=direction,
            entry_low=round(entry_low, 8),
            entry_high=round(entry_high, 8),
            stop_loss=round(stop_loss, 8),
            targets=[round(t, 8) for t in targets],
            confidence=report.confidence,
            valid_until=datetime.now(timezone.utc) + timedelta(hours=4),
            reasoning=report.reasoning,
            risk_reward_ratio=rr,
            is_worth_taking=worth,
        )

    def generate_from_consensus(
        self, report: ConsensusReport, current_price: float,
        atr: float | None = None,
        market_regime: str | None = None,
        regime_support: float | None = None,
        regime_resistance: float | None = None,
    ) -> StrategyResult:
        """根据 ConsensusReport 生成策略。

        利用共识信号、加权置信度和分歧度生成策略。
        分歧度高时降低置信度，少数派警告附加到 reasoning。
        当 ATR 可用时使用 ATR 动态计算入场区间和止损，否则回退到固定百分比。

        market_regime: "ranging" | "trending" | "volatile" | None
            当为 "ranging" 时自动切换为区间策略（高抛低吸）。
        """
        # 方向映射
        if report.consensus_signal == "bullish":
            direction = "long"
        elif report.consensus_signal == "bearish":
            direction = "short"
        else:
            direction = "neutral"

        # 基础置信度
        confidence = report.consensus_confidence

        # 分歧度衰减：divergence > 30 时乘以衰减因子
        if report.divergence > 30:
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
            buffer = range_height * 0.1  # 10% 缓冲区

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

        # ── 趋势/高波动市场：原有逻辑 ───────────────────────
        if direction == "long":
            if use_atr:
                m = _atr_multipliers(atr, current_price)
                entry_low = current_price - m["entry"] * atr
                stop_loss = current_price - m["stop"] * atr
                targets = [current_price + t * atr for t in m["targets"]]
            else:
                entry_low = current_price * 0.98
                stop_loss = current_price * 0.95
                targets = [
                    current_price * 1.03,
                    current_price * 1.06,
                    current_price * 1.10,
                ]
            entry_high = current_price
        elif direction == "short":
            entry_low = current_price
            if use_atr:
                m = _atr_multipliers(atr, current_price)
                entry_high = current_price + m["entry"] * atr
                stop_loss = current_price + m["stop"] * atr
                targets = [current_price - t * atr for t in m["targets"]]
            else:
                entry_high = current_price * 1.02
                stop_loss = current_price * 1.05
                targets = [
                    current_price * 0.97,
                    current_price * 0.94,
                    current_price * 0.90,
                ]
        else:
            if use_atr:
                entry_low = current_price - 0.5 * atr
                entry_high = current_price + 0.5 * atr
            else:
                entry_low = current_price * 0.99
                entry_high = current_price * 1.01
            stop_loss = current_price * 0.95
            targets = []

        # 最终验证：确保方向一致性
        entry_low, entry_high, stop_loss, targets = self._validate_strategy(
            direction, current_price, entry_low, entry_high, stop_loss, targets,
        )

        # 构建 reasoning
        regime_label = {"trending": "趋势", "volatile": "高波动", "ranging": "震荡"}.get(market_regime or "", "")
        reasoning = f"共识信号: {report.consensus_signal} (置信度 {report.consensus_confidence:.0%}, 分歧度 {report.divergence:.1f}%)"
        if regime_label:
            reasoning = f"【{regime_label}行情】" + reasoning
        if report.minority_warnings:
            reasoning += "\n少数派警告:\n" + "\n".join(report.minority_warnings)

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
            valid_until=datetime.now(timezone.utc) + timedelta(hours=4),
            reasoning=reasoning,
            risk_reward_ratio=rr,
            is_worth_taking=worth,
        )


    def generate_from_playbook(
        self,
        playbook_raw: dict,
        current_price: float,
        atr: float | None = None,
    ) -> StrategyResult:
        """根据剧本推演的反制策略生成具体交易策略。

        从 PlaybookAgent 返回的 raw_data 中提取 counter_strategy，
        结合当前价格和 ATR 生成精确的入场/止损/止盈点位。

        Args:
            playbook_raw: PlaybookAgent 的 raw_data（含 counter_strategy）
            current_price: 当前价格
            atr: ATR 值（可选，用于动态计算点位）
        """
        counter = playbook_raw.get("counter_strategy", {})
        matched = playbook_raw.get("matched_playbook", "")
        probability = playbook_raw.get("probability", 0.0)

        if not counter or not matched:
            # 无反制策略时回退到默认
            return StrategyResult(
                symbol=playbook_raw.get("symbol", "UNKNOWN"),
                direction="neutral",
                entry_low=current_price * 0.99,
                entry_high=current_price * 1.01,
                stop_loss=current_price * 0.95,
                targets=[],
                confidence=0.0,
                valid_until=datetime.now(timezone.utc) + timedelta(hours=4),
                reasoning="剧本反制策略数据不足",
            )

        # 从 LLM 返回的 counter_strategy 中提取点位
        entry_price_str = str(counter.get("entry_price", ""))
        stop_loss_str = str(counter.get("stop_loss", ""))
        tp1_str = str(counter.get("take_profit_1", ""))
        tp2_str = str(counter.get("take_profit_2", ""))
        risk_level = str(counter.get("risk_level", "moderate"))
        strategy_type = str(counter.get("strategy_type", ""))
        action = str(counter.get("action", ""))
        wait_signal = str(counter.get("wait_signal", ""))
        risk_warning = str(counter.get("risk_warning", ""))

        # 尝试解析 LLM 给出的具体数字
        entry_price = self._parse_price(entry_price_str, current_price)
        stop_loss = self._parse_price(stop_loss_str, current_price * 0.95)
        tp1 = self._parse_price(tp1_str, 0.0)
        tp2 = self._parse_price(tp2_str, 0.0)

        # 确定方向
        from app.agents.playbook_patterns import PLAYBOOK_SIGNAL_MAP
        signal = PLAYBOOK_SIGNAL_MAP.get(matched, "neutral")

        if signal == "bullish":
            direction = "long"
        elif signal == "bearish":
            direction = "short"
        else:
            direction = "neutral"

        # 使用 ATR 动态调整（如果 LLM 没给出合理点位）
        use_atr = atr is not None and atr > 0

        if direction == "long":
            m = _atr_multipliers(atr, current_price) if use_atr else None
            entry_low = entry_price if entry_price < current_price else (
                current_price - m["entry"] * atr if use_atr else current_price * 0.98
            )
            entry_high = current_price
            if stop_loss >= entry_low:
                stop_loss = entry_low - (m["stop"] * atr if use_atr else current_price * 0.03)
            targets = [t for t in [tp1, tp2] if t > current_price]
            if not targets:
                if use_atr:
                    targets = [current_price + m["targets"][0] * atr, current_price + m["targets"][1] * atr]
                else:
                    targets = [current_price * 1.03, current_price * 1.06]
        elif direction == "short":
            m = _atr_multipliers(atr, current_price) if use_atr else None
            entry_low = current_price
            entry_high = entry_price if entry_price > current_price else (
                current_price + m["entry"] * atr if use_atr else current_price * 1.02
            )
            if stop_loss <= entry_high:
                stop_loss = entry_high + (m["stop"] * atr if use_atr else current_price * 0.03)
            targets = [t for t in [tp1, tp2] if t < current_price]
            if not targets:
                if use_atr:
                    targets = [current_price - m["targets"][0] * atr, current_price - m["targets"][1] * atr]
                else:
                    targets = [current_price * 0.97, current_price * 0.94]
        else:
            entry_low = current_price * 0.99
            entry_high = current_price * 1.01
            stop_loss = current_price * 0.95
            targets = []

        # 验证方向一致性
        entry_low, entry_high, stop_loss, targets = self._validate_strategy(
            direction, current_price, entry_low, entry_high, stop_loss, targets,
        )

        # 置信度：剧本概率 × 风险等级系数
        risk_multiplier = {"aggressive": 0.8, "moderate": 1.0, "conservative": 1.2}.get(risk_level, 1.0)
        confidence = min(1.0, max(0.0, probability * risk_multiplier))

        # 构建 reasoning
        reasoning_parts = [
            f"剧本: {matched} (概率 {probability:.0%})",
            f"策略类型: {strategy_type}",
            f"反制方案: {action}",
        ]
        if wait_signal:
            reasoning_parts.append(f"确认信号: {wait_signal}")
        if risk_warning:
            reasoning_parts.append(f"⚠ {risk_warning}")

        rr, worth = self._calc_risk_reward(direction, entry_low, entry_high, stop_loss, targets)
        worth = worth and confidence >= 0.4

        return StrategyResult(
            symbol=playbook_raw.get("symbol", "UNKNOWN"),
            direction=direction,
            entry_low=round(entry_low, 8),
            entry_high=round(entry_high, 8),
            stop_loss=round(stop_loss, 8),
            targets=[round(t, 8) for t in targets],
            confidence=round(confidence, 4),
            valid_until=datetime.now(timezone.utc) + timedelta(hours=4),
            reasoning="\n".join(reasoning_parts),
            risk_reward_ratio=rr,
            is_worth_taking=worth,
        )

    @staticmethod
    def _parse_price(text: str, fallback: float) -> float:
        """尝试从 LLM 返回的文本中解析价格数字。"""
        import re
        numbers = re.findall(r"[\d,]+\.?\d*", text.replace(",", ""))
        if numbers:
            try:
                return float(numbers[0])
            except ValueError:
                pass
        return fallback

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
