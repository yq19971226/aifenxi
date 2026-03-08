"""资金费率极值守卫 — 确定性规则引擎。

当资金费率达到极端值时，对顺向信号降权，对反向信号加权。
纯规则计算，无 LLM 调用。
供 AnalysisOrchestrator 在信号聚合阶段调用。
"""

import logging
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)

# ── 阈值 ──
_FR_WARN_THRESHOLD = 0.0005    # ±0.05%
_FR_DANGER_THRESHOLD = 0.001   # ±0.10%


class FundingRateGuardResult(BaseModel):
    """资金费率守卫结果。"""

    is_extreme: bool = False
    funding_rate: float = 0.0
    confidence_modifier: float = Field(
        default=1.0, ge=0.5, le=1.0,
        description="对顺向信号的置信度调整系数",
    )
    warning: str = ""
    mean_reversion_direction: str = Field(
        default="neutral",
        description="均值回归预期方向: bullish / bearish / neutral",
    )


def evaluate_funding_rate(
    funding_rate: float | None,
    signal_direction: str,
) -> FundingRateGuardResult:
    """评估资金费率对信号置信度的影响。

    Args:
        funding_rate: 当前资金费率（如 0.0008 = 0.08%）
        signal_direction: 当前综合信号方向 "bullish" / "bearish" / "neutral"

    Returns:
        FundingRateGuardResult
    """
    if funding_rate is None:
        return FundingRateGuardResult()

    fr = funding_rate
    abs_fr = abs(fr)

    if abs_fr < _FR_WARN_THRESHOLD:
        return FundingRateGuardResult(funding_rate=fr)

    # 确定均值回归方向
    # FR > 0 (多头付费) → 预期回调 → 均值回归方向 bearish
    # FR < 0 (空头付费) → 预期反弹 → 均值回归方向 bullish
    mr_direction = "bearish" if fr > 0 else "bullish"

    # 计算降权系数
    if abs_fr >= _FR_DANGER_THRESHOLD:
        # 极端：顺向信号降权 25%
        base_penalty = 0.75
        level = "极端"
    else:
        # 警告：顺向信号降权 15%
        base_penalty = 0.85
        level = "偏高"

    # 判断信号是否与资金费率同向（需要降权的情况）
    # FR > 0 + signal bullish → 同向（市场过度看多，bullish信号不可靠）
    # FR < 0 + signal bearish → 同向（市场过度看空，bearish信号不可靠）
    is_same_direction = (
        (fr > 0 and signal_direction == "bullish") or
        (fr < 0 and signal_direction == "bearish")
    )

    modifier = base_penalty if is_same_direction else 1.0

    warning = (
        f"资金费率{level}({fr*100:.3f}%)，"
        f"{'顺向信号已降权' if is_same_direction else '信号与费率反向（合理）'}"
    )

    return FundingRateGuardResult(
        is_extreme=True,
        funding_rate=fr,
        confidence_modifier=modifier,
        warning=warning,
        mean_reversion_direction=mr_direction,
    )
