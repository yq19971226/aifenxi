"""支撑阻力位后验校验器 — 将 LLM 输出的点位与实际 K 线数据交叉验证。

PostValidator 取最近 N 根 K 线的价格范围，扩展容差后过滤不合理的支撑/阻力位，
防止 AI 幻觉产生的虚假点位进入下游策略计算。
"""

import copy
import logging
from typing import Any

from app.agents.base import AgentReport
from app.models.market_data import KlineData

logger = logging.getLogger(__name__)


class PostValidator:
    """支撑阻力位后验校验器。"""

    RANGE_TOLERANCE: float = 0.20  # 20% 容差

    def validate_levels(
        self,
        report: AgentReport,
        klines: list[KlineData],
        n_klines: int = 30,
    ) -> AgentReport:
        """校验 support_levels 和 resistance_levels，丢弃超出范围的点位。

        Args:
            report: 智能体分析报告，raw_data 中含 support_levels / resistance_levels
            klines: 最近的 K 线数据列表
            n_klines: 用于计算合理范围的 K 线数量，默认 30

        Returns:
            修改后的 AgentReport，raw_data 中新增 validation_applied 和 discarded_levels
        """
        try:
            return self._do_validate(report, klines, n_klines)
        except Exception:
            logger.error("后验校验过程异常，返回原始 report", exc_info=True)
            result = report.model_copy(deep=True)
            result.raw_data = {**result.raw_data, "validation_applied": False}
            return result

    def _do_validate(
        self,
        report: AgentReport,
        klines: list[KlineData],
        n_klines: int,
    ) -> AgentReport:
        result = report.model_copy(deep=True)
        result.raw_data = copy.deepcopy(report.raw_data)

        # K 线数据为空时跳过校验
        if not klines:
            result.raw_data["validation_applied"] = False
            return result

        recent = klines[-n_klines:]
        min_low = min(k.low for k in recent)
        max_high = max(k.high for k in recent)

        range_lower = min_low * (1 - self.RANGE_TOLERANCE)
        range_upper = max_high * (1 + self.RANGE_TOLERANCE)

        discarded_levels: list[dict[str, Any]] = []

        # 校验支撑位
        support_levels: list[float] = result.raw_data.get("support_levels", [])
        valid_supports: list[float] = []
        for level in support_levels:
            if range_lower <= level <= range_upper:
                valid_supports.append(level)
            else:
                logger.warning(
                    "支撑位超出合理范围，已丢弃",
                    extra={
                        "level": level,
                        "range_lower": range_lower,
                        "range_upper": range_upper,
                    },
                )
                discarded_levels.append(
                    {
                        "type": "support",
                        "value": level,
                        "reason": f"超出合理范围 [{range_lower:.2f}, {range_upper:.2f}]",
                    }
                )

        # 全部支撑位被丢弃时用 min(low) 回退
        if support_levels and not valid_supports:
            logger.warning(
                "所有支撑位均被丢弃，使用 K 线最低价回退",
                extra={"fallback": min_low},
            )
            valid_supports = [min_low]

        # 校验阻力位
        resistance_levels: list[float] = result.raw_data.get("resistance_levels", [])
        valid_resistances: list[float] = []
        for level in resistance_levels:
            if range_lower <= level <= range_upper:
                valid_resistances.append(level)
            else:
                logger.warning(
                    "阻力位超出合理范围，已丢弃",
                    extra={
                        "level": level,
                        "range_lower": range_lower,
                        "range_upper": range_upper,
                    },
                )
                discarded_levels.append(
                    {
                        "type": "resistance",
                        "value": level,
                        "reason": f"超出合理范围 [{range_lower:.2f}, {range_upper:.2f}]",
                    }
                )

        # 全部阻力位被丢弃时用 max(high) 回退
        if resistance_levels and not valid_resistances:
            logger.warning(
                "所有阻力位均被丢弃，使用 K 线最高价回退",
                extra={"fallback": max_high},
            )
            valid_resistances = [max_high]

        result.raw_data["support_levels"] = valid_supports
        result.raw_data["resistance_levels"] = valid_resistances
        result.raw_data["validation_applied"] = True
        result.raw_data["discarded_levels"] = discarded_levels

        return result
