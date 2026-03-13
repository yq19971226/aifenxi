"""量价背离检测器 — 识别价量不一致的假突破/假跌破信号。

核心原理（交易员共识）：
- 价格新高 + 成交量萎缩 = 上涨动能不足（bearish divergence，看多信号降权）
- 价格新低 + 成交量萎缩 = 下跌动能不足（bullish divergence，看空信号降权）
- 价格上涨 + 成交量放大 = 真突破（强化看多信号）
- 价格下跌 + 成交量放大 = 恐慌出逃（等企稳后反弹）

供三个分析模式在信号聚合后、策略生成前使用。
"""

import logging
from enum import Enum

from pydantic import BaseModel, Field

from app.models.market_data import KlineData

logger = logging.getLogger(__name__)

# 成交量萎缩判断阈值：当前成交量 < 前N根均量 * 该比率 → 视为萎缩
_VOLUME_SHRINK_RATIO = 0.7
# 成交量放大判断阈值
_VOLUME_EXPAND_RATIO = 1.3
# 价格新高/新低回看周期
_PRICE_LOOKBACK = 10
# 成交量均值计算周期
_VOLUME_MA_PERIOD = 20


class DivergenceType(str, Enum):
    """量价背离类型。"""
    NONE = "正常"                         # 无背离
    BEARISH_DIVERGENCE = "价涨量缩"       # 看多信号降权
    BULLISH_DIVERGENCE = "价跌量缩"       # 看空信号降权
    BULLISH_CONFIRMATION = "量价齐升"     # 看多确认
    BEARISH_CONFIRMATION = "量价齐跌"     # 看空确认


class VolumePriceDivergence(BaseModel):
    """量价背离检测结果。"""
    divergence_type: DivergenceType = DivergenceType.NONE
    confidence_modifier: float = Field(default=1.0, ge=0.0, le=1.5,
                                        description="信号置信度修正系数")
    description: str = ""
    volume_ratio: float = Field(default=1.0,
                                 description="当前成交量 / 均量")
    price_trend: str = ""    # "up" / "down" / "flat"
    is_new_extreme: bool = False  # 是否创近期新高/新低


def detect_volume_price_divergence(
    klines: list[KlineData],
    signal: str = "neutral",
) -> VolumePriceDivergence:
    """检测量价背离。

    Args:
        klines: K线列表，至少需要 _VOLUME_MA_PERIOD + _PRICE_LOOKBACK 根
        signal: 当前聚合信号 ("bullish" / "bearish" / "neutral")

    Returns:
        VolumePriceDivergence — 包含背离类型和置信度修正系数
    """
    min_required = max(_VOLUME_MA_PERIOD, _PRICE_LOOKBACK) + 5
    if not klines or len(klines) < min_required:
        return VolumePriceDivergence(
            description="K线数据不足，跳过量价背离检测",
        )

    # 提取数据
    closes = [k.close for k in klines]
    volumes = [k.volume for k in klines]

    # 计算近期价格趋势（最近 5 根 K 线）
    recent_closes = closes[-5:]
    price_change_pct = (recent_closes[-1] - recent_closes[0]) / recent_closes[0] * 100
    if price_change_pct >= 0.3:
        price_trend = "up"
    elif price_change_pct <= -0.3:
        price_trend = "down"
    else:
        price_trend = "flat"

    # 是否创近期新高/新低
    lookback_closes = closes[-_PRICE_LOOKBACK:]
    current_close = closes[-1]
    is_new_high = current_close >= max(lookback_closes[:-1])
    is_new_low = current_close <= min(lookback_closes[:-1])

    # 成交量分析：当前 3 根均量 vs 前 N 根均量
    recent_vol = sum(volumes[-3:]) / 3
    prev_vol_avg = sum(volumes[-_VOLUME_MA_PERIOD:-3]) / max(len(volumes[-_VOLUME_MA_PERIOD:-3]), 1)

    if prev_vol_avg <= 0:
        return VolumePriceDivergence(
            description="历史成交量为零，跳过检测",
            price_trend=price_trend,
        )

    volume_ratio = recent_vol / prev_vol_avg

    # ── 判定逻辑 ──

    divergence_type = DivergenceType.NONE
    confidence_modifier = 1.0
    description = ""

    if price_trend == "up" and volume_ratio < _VOLUME_SHRINK_RATIO:
        # 价涨量缩 → 上涨动能不足
        divergence_type = DivergenceType.BEARISH_DIVERGENCE
        severity = 1.0 - volume_ratio  # 越缩越严重
        if is_new_high:
            # 创新高但量缩，信号更强
            confidence_modifier = max(0.4, 1.0 - severity * 0.8)
            description = (
                f"⚠️ 量价背离：价格创近期新高但成交量萎缩"
                f"（当前量仅为均量的 {volume_ratio:.0%}），"
                f"上涨动能不足，看多信号可信度大幅降低"
            )
        else:
            confidence_modifier = max(0.6, 1.0 - severity * 0.5)
            description = (
                f"量价背离：价格上涨但成交量萎缩"
                f"（当前量为均量的 {volume_ratio:.0%}），"
                f"看多信号可信度降低"
            )

    elif price_trend == "down" and volume_ratio < _VOLUME_SHRINK_RATIO:
        # 价跌量缩 → 下跌动能不足
        divergence_type = DivergenceType.BULLISH_DIVERGENCE
        severity = 1.0 - volume_ratio
        if is_new_low:
            confidence_modifier = max(0.4, 1.0 - severity * 0.8)
            description = (
                f"⚠️ 量价背离：价格创近期新低但成交量萎缩"
                f"（当前量仅为均量的 {volume_ratio:.0%}），"
                f"下跌动能不足，看空信号可信度大幅降低"
            )
        else:
            confidence_modifier = max(0.6, 1.0 - severity * 0.5)
            description = (
                f"量价背离：价格下跌但成交量萎缩"
                f"（当前量为均量的 {volume_ratio:.0%}），"
                f"看空信号可信度降低"
            )

    elif price_trend == "up" and volume_ratio > _VOLUME_EXPAND_RATIO:
        # 价涨量增 → 真突破确认
        divergence_type = DivergenceType.BULLISH_CONFIRMATION
        boost = min(volume_ratio - 1.0, 0.3)  # 最多加 30%
        confidence_modifier = 1.0 + boost
        description = (
            f"✅ 量价确认：价格上涨且成交量放大"
            f"（当前量为均量的 {volume_ratio:.0%}），突破有效性增强"
        )

    elif price_trend == "down" and volume_ratio > _VOLUME_EXPAND_RATIO:
        # 价跌量增 → 恐慌确认
        divergence_type = DivergenceType.BEARISH_CONFIRMATION
        boost = min(volume_ratio - 1.0, 0.3)
        confidence_modifier = 1.0 + boost
        description = (
            f"⚠️ 量价确认：价格下跌且成交量放大"
            f"（当前量为均量的 {volume_ratio:.0%}），下跌动能充足"
        )

    else:
        description = f"量价关系正常（量比: {volume_ratio:.0%}）"

    # ── 交叉验证：信号方向与量价背离方向一致时强化，冲突时衰减 ──
    if signal == "bullish" and divergence_type == DivergenceType.BEARISH_DIVERGENCE:
        # 看多信号 + 价涨量缩 → 强衰减
        confidence_modifier = min(confidence_modifier, 0.5)
        description += "。看多信号与量价背离冲突，置信度大幅降低"
    elif signal == "bearish" and divergence_type == DivergenceType.BULLISH_DIVERGENCE:
        # 看空信号 + 价跌量缩 → 强衰减
        confidence_modifier = min(confidence_modifier, 0.5)
        description += "。看空信号与量价背离冲突，置信度大幅降低"

    result = VolumePriceDivergence(
        divergence_type=divergence_type,
        confidence_modifier=round(confidence_modifier, 4),
        description=description,
        volume_ratio=round(volume_ratio, 4),
        price_trend=price_trend,
        is_new_extreme=is_new_high or is_new_low,
    )

    if divergence_type != DivergenceType.NONE:
        logger.info(
            "volume_price_divergence_detected",
            extra={
                "type": divergence_type.value,
                "volume_ratio": volume_ratio,
                "price_trend": price_trend,
                "confidence_modifier": confidence_modifier,
            },
        )

    return result
