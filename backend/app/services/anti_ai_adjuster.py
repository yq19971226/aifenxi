"""反AI策略参数调整器 — 当检测到AI操盘时自动调整策略参数。

核心思路：AI的优势（精准/快速/无情绪）也是它的弱点
（模式可预测/过于精准反而暴露/无法理解非理性行为）。

当 AI 操盘概率 > 60% 时，自动调整：
1. 止损外扩（防精准扫损）
2. 进场区间偏移（不在AI预期位置建仓）
3. 置信度下调（AI环境风险更高）
4. 标注调整原因
"""

import logging

from app.agents.ai_detector import AIDetectorResult
from app.services.strategy import StrategyResult

logger = logging.getLogger(__name__)

# AI概率阈值：低于此值不做调整
_AI_ADJUST_THRESHOLD = 60


class AntiAIAdjuster:
    """反AI策略参数调整器。

    基于AI操盘检测结果，对StrategyResult进行防御性调整。
    """

    def adjust(
        self,
        strategy: StrategyResult,
        ai_result: AIDetectorResult,
        current_price: float,
        atr: float,
    ) -> StrategyResult:
        """调整策略参数以对抗AI操盘。

        Args:
            strategy: 原始策略结果
            ai_result: AI操盘检测结果
            current_price: 当前价格
            atr: ATR值（用于动态计算缓冲区）

        Returns:
            调整后的策略（ai_probability < 60 时原样返回）
        """
        if ai_result.ai_probability < _AI_ADJUST_THRESHOLD:
            return strategy

        adjusted = strategy.model_copy(deep=True)
        adjustments: list[str] = []

        # 1. 止损外扩（防精准扫损）
        #    AI扫损精确到±0.1%，所以把止损放到常规位外再加缓冲
        sl_buffer = atr * (1.0 + ai_result.ai_probability / 100)
        if adjusted.direction == "long":
            adjusted.stop_loss = round(adjusted.stop_loss - sl_buffer, 8)
            adjustments.append(f"止损外扩{sl_buffer:.2f}防精准扫损")
        elif adjusted.direction == "short":
            adjusted.stop_loss = round(adjusted.stop_loss + sl_buffer, 8)
            adjustments.append(f"止损外扩{sl_buffer:.2f}防精准扫损")

        # 2. 进场区间偏移（不在AI预期的位置建仓）
        entry_offset = atr * 0.3
        if adjusted.direction == "long":
            adjusted.entry_low = round(adjusted.entry_low - entry_offset, 8)
            adjusted.entry_high = round(adjusted.entry_high - entry_offset, 8)
            adjustments.append(f"进场偏移{entry_offset:.2f}避开预期位")
        elif adjusted.direction == "short":
            adjusted.entry_low = round(adjusted.entry_low + entry_offset, 8)
            adjusted.entry_high = round(adjusted.entry_high + entry_offset, 8)
            adjustments.append(f"进场偏移{entry_offset:.2f}避开预期位")

        # 3. 置信度下调（AI环境风险更高）
        original_conf = adjusted.confidence
        adjusted.confidence = round(
            adjusted.confidence * max(0.5, 1.0 - ai_result.ai_probability / 200),
            4,
        )
        adjustments.append(
            f"置信度 {original_conf:.0%} → {adjusted.confidence:.0%}"
        )

        # 4. 针对特定AI战术的额外调整
        for tactic in ai_result.tactics_detected:
            extra = self._tactic_adjustment(
                tactic, adjusted, current_price, atr
            )
            if extra:
                adjustments.append(extra)

        # 5. 标注调整原因
        adjust_text = "\n".join(f"  • {a}" for a in adjustments)
        adjusted.reasoning += (
            f"\n\n🤖 反AI调整已生效（AI概率{ai_result.ai_probability}%，"
            f"模式: {ai_result.operation_mode}）：\n{adjust_text}"
        )

        # 6. RSI AI 环境失效警告
        rsi_warning = self._rsi_ai_warning(ai_result)
        if rsi_warning:
            adjustments.append(rsi_warning)

        # 7. 止损冷却期建议
        cooldown_advice = self._stoploss_cooldown_advice(ai_result)
        if cooldown_advice:
            adjustments.append(cooldown_advice)

        # 8. 记录调整标记
        if "anti_ai_adjusted" not in adjusted.snapped_fields:
            adjusted.snapped_fields.append("anti_ai_adjusted")

        logger.info(
            "anti_ai_adjustment_done",
            extra={
                "symbol": strategy.symbol,
                "ai_probability": ai_result.ai_probability,
                "adjustments_count": len(adjustments),
            },
        )

        return adjusted

    @staticmethod
    def _tactic_adjustment(
        tactic: str,
        strategy: StrategyResult,
        current_price: float,
        atr: float,
    ) -> str | None:
        """针对特定AI战术的额外微调。"""
        if tactic == "精准爆破":
            # 额外加大止损缓冲
            extra_buffer = atr * 0.5
            if strategy.direction == "long":
                strategy.stop_loss = round(strategy.stop_loss - extra_buffer, 8)
            elif strategy.direction == "short":
                strategy.stop_loss = round(strategy.stop_loss + extra_buffer, 8)
            return f"检测到精准爆破战术，止损额外外扩{extra_buffer:.2f}"

        if tactic == "AI磨人":
            # 磨人模式下降低持仓欲望
            strategy.confidence = round(strategy.confidence * 0.8, 4)
            return "检测到AI磨人战术，建议降低仓位或暂离市场"

        if tactic == "扫损反转":
            # 偏移止损远离整数关口
            price_round = round(current_price, -1)  # 最近的整十位
            if strategy.direction == "long":
                if abs(strategy.stop_loss - price_round) < atr * 0.5:
                    strategy.stop_loss = round(price_round - atr * 0.8, 8)
                    return f"止损远离整数关口{price_round:.0f}"
            elif strategy.direction == "short":
                if abs(strategy.stop_loss - price_round) < atr * 0.5:
                    strategy.stop_loss = round(price_round + atr * 0.8, 8)
                    return f"止损远离整数关口{price_round:.0f}"

        if tactic == "假突破+回收":
            shrink = atr * 0.2
            if strategy.direction == "long":
                strategy.entry_high = round(strategy.entry_high - shrink, 8)
            elif strategy.direction == "short":
                strategy.entry_low = round(strategy.entry_low + shrink, 8)
            return "假突破战术，进场区间收窄，等回踩确认"

        return None

    @staticmethod
    def _rsi_ai_warning(ai_result: AIDetectorResult) -> str | None:
        """RSI AI 环境失效警告。

        AI 操盘环境下 RSI 超买/超卖信号可靠性大幅下降：
        - AI 可以精确控制价格在 RSI 极端区域横盘（磨人）
        - AI 可以制造假的 RSI 背离信号
        - RSI 回归均值的统计规律在 AI 操盘下被打破
        """
        if ai_result.ai_probability < 70:
            return None

        tactics = set(ai_result.tactics_detected)

        if "AI磨人" in tactics or "情绪磨损" in tactics:
            return (
                "RSI 失效警告: AI 磨人模式下 RSI 可长期停留极端区域，"
                "勿以 RSI 超买/超卖作为反转依据"
            )

        if ai_result.ai_probability >= 80:
            return (
                "RSI 失效警告: AI 概率>80%，RSI/MACD 等动量指标"
                "可靠性显著降低，建议以成交量和资金流为主要参考"
            )

        return "RSI 注意: AI 概率较高，RSI 信号可能失真，建议多维交叉验证"

    @staticmethod
    def _stoploss_cooldown_advice(ai_result: AIDetectorResult) -> str | None:
        """止损被扫后冷却期建议。

        AI 操盘的典型手法：精准扫损后快速反转，
        诱导交易者立即反手或重新入场，再次被扫。
        建议触发止损后强制冷却。
        """
        tactics = set(ai_result.tactics_detected)
        has_stophunt = any(
            t in tactics
            for t in ("精准爆破", "扫损反转", "流动性猎杀", "stop_hunt")
        )

        if not has_stophunt and ai_result.ai_probability < 70:
            return None

        if ai_result.ai_probability >= 80 or has_stophunt:
            return (
                "止损冷却: 若本单触发止损，建议至少等待 30 分钟"
                "再考虑重新入场，防止被 AI 连续扫损"
            )

        return (
            "止损冷却: AI 概率较高，触发止损后建议观望 15 分钟，"
            "确认方向后再操作"
        )
