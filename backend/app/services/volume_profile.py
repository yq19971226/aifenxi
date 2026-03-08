"""Volume Profile 主力成本区计算器 — 识别机构成本密集区。

传统支撑/阻力位基于价格极值（高低点），容易被庄家精准操纵。
主力成本区（Volume Profile）基于成交密集区，代表真正的筹码分布。

核心概念：
- VPOC (Volume Point of Control): 成交量最大的价格区间，主力核心成本
- VAH (Value Area High): 70%成交量分布的上边界
- VAL (Value Area Low): 70%成交量分布的下边界
- HVN (High Volume Node): 高成交量节点，形成强支撑/阻力
- LVN (Low Volume Node): 低成交量节点，价格容易快速穿越

供 StrategyService、PlaybookAgent、AntiAIAdjuster 消费。
"""

import logging
import math
from typing import Optional

import numpy as np
from pydantic import BaseModel, Field

from app.models.market_data import KlineData

logger = logging.getLogger(__name__)


class VolumeProfileResult(BaseModel):
    """Volume Profile 计算结果。"""

    vpoc: float = Field(description="成交量最大的价格（主力核心成本）")
    vah: float = Field(description="价值区上沿（70%成交量分布上界）")
    val: float = Field(description="价值区下沿（70%成交量分布下界）")
    hvn_levels: list[float] = Field(default_factory=list, description="高成交量节点（强支撑/阻力）")
    lvn_levels: list[float] = Field(default_factory=list, description="低成交量节点（快速穿越区）")
    total_volume: float = Field(default=0.0, description="总成交量")
    bin_count: int = Field(default=0, description="价格分箱数")
    price_range: tuple[float, float] = Field(default=(0.0, 0.0), description="价格范围")


# ── 常量 ────────────────────────────────────────────────────

_VALUE_AREA_PCT = 0.70   # 价值区包含的成交量比例
_MIN_KLINES = 20         # 最少K线数量
_DEFAULT_BINS = 50       # 默认价格分箱数
_HVN_PERCENTILE = 80     # 高成交量节点阈值（百分位）
_LVN_PERCENTILE = 20     # 低成交量节点阈值（百分位）


def compute_volume_profile(
    klines: list[KlineData],
    num_bins: int = _DEFAULT_BINS,
) -> Optional[VolumeProfileResult]:
    """计算 Volume Profile。

    方法：将价格范围等分为 num_bins 个区间，
    每根K线的成交量按 OHLC 分布到各区间（近似 TPO 分布）。

    Args:
        klines: K线数据列表（建议50+根）
        num_bins: 价格分箱数量

    Returns:
        VolumeProfileResult 或 None（数据不足时）
    """
    if not klines or len(klines) < _MIN_KLINES:
        return None

    # 确定价格范围
    all_highs = [k.high for k in klines]
    all_lows = [k.low for k in klines]
    price_min = min(all_lows)
    price_max = max(all_highs)

    if price_max <= price_min:
        return None

    # 添加微小边距避免边界问题
    margin = (price_max - price_min) * 0.001
    price_min -= margin
    price_max += margin

    bin_size = (price_max - price_min) / num_bins
    if bin_size <= 0:
        return None

    # 构建成交量分布
    # 每根K线的成交量按价格范围均匀分布到覆盖的bin中
    volume_bins = np.zeros(num_bins, dtype=np.float64)
    bin_centers = np.array([
        price_min + (i + 0.5) * bin_size for i in range(num_bins)
    ])

    for k in klines:
        if k.volume <= 0:
            continue

        # 确定K线覆盖的bin范围
        k_low = max(k.low, price_min)
        k_high = min(k.high, price_max)

        low_bin = int((k_low - price_min) / bin_size)
        high_bin = int((k_high - price_min) / bin_size)

        low_bin = max(0, min(low_bin, num_bins - 1))
        high_bin = max(0, min(high_bin, num_bins - 1))

        # 将成交量均匀分配到覆盖的bins
        covered_bins = high_bin - low_bin + 1
        vol_per_bin = k.volume / max(covered_bins, 1)

        # 加权分布：K线实体区域获得更多成交量
        body_low = min(k.open, k.close)
        body_high = max(k.open, k.close)

        for b in range(low_bin, high_bin + 1):
            center = bin_centers[b]
            if body_low <= center <= body_high:
                # 实体区域：1.5倍权重
                volume_bins[b] += vol_per_bin * 1.5
            else:
                # 影线区域：0.75倍权重
                volume_bins[b] += vol_per_bin * 0.75

    total_volume = float(np.sum(volume_bins))
    if total_volume <= 0:
        return None

    # ── VPOC: 成交量最大的bin ────────────────────────────────
    vpoc_idx = int(np.argmax(volume_bins))
    vpoc = float(bin_centers[vpoc_idx])

    # ── Value Area (VAH / VAL) ──────────────────────────────
    # 从VPOC向两边扩展，直到包含70%的总成交量
    target_volume = total_volume * _VALUE_AREA_PCT
    accumulated = float(volume_bins[vpoc_idx])
    va_low_idx = vpoc_idx
    va_high_idx = vpoc_idx

    while accumulated < target_volume:
        # 分别看向上和向下扩展哪个能获得更多成交量
        can_go_down = va_low_idx > 0
        can_go_up = va_high_idx < num_bins - 1

        if not can_go_down and not can_go_up:
            break

        vol_down = volume_bins[va_low_idx - 1] if can_go_down else -1
        vol_up = volume_bins[va_high_idx + 1] if can_go_up else -1

        if vol_down >= vol_up:
            va_low_idx -= 1
            accumulated += volume_bins[va_low_idx]
        else:
            va_high_idx += 1
            accumulated += volume_bins[va_high_idx]

    val_price = float(bin_centers[va_low_idx] - bin_size / 2)
    vah_price = float(bin_centers[va_high_idx] + bin_size / 2)

    # ── HVN / LVN 节点 ─────────────────────────────────────
    # 排除零成交量的bin
    nonzero_vols = volume_bins[volume_bins > 0]
    if len(nonzero_vols) < 5:
        hvn_threshold = float(np.max(volume_bins)) * 0.8
        lvn_threshold = float(np.max(volume_bins)) * 0.2
    else:
        hvn_threshold = float(np.percentile(nonzero_vols, _HVN_PERCENTILE))
        lvn_threshold = float(np.percentile(nonzero_vols, _LVN_PERCENTILE))

    hvn_levels: list[float] = []
    lvn_levels: list[float] = []

    for i in range(num_bins):
        if volume_bins[i] >= hvn_threshold:
            # 局部极大值才算HVN
            is_local_max = True
            if i > 0 and volume_bins[i - 1] > volume_bins[i]:
                is_local_max = False
            if i < num_bins - 1 and volume_bins[i + 1] > volume_bins[i]:
                is_local_max = False
            if is_local_max:
                hvn_levels.append(round(float(bin_centers[i]), 2))

        if 0 < volume_bins[i] <= lvn_threshold:
            # 局部极小值才算LVN
            is_local_min = True
            if i > 0 and volume_bins[i - 1] < volume_bins[i]:
                is_local_min = False
            if i < num_bins - 1 and volume_bins[i + 1] < volume_bins[i]:
                is_local_min = False
            if is_local_min:
                lvn_levels.append(round(float(bin_centers[i]), 2))

    # 限制输出数量
    hvn_levels = hvn_levels[:10]
    lvn_levels = lvn_levels[:10]

    return VolumeProfileResult(
        vpoc=round(vpoc, 2),
        vah=round(vah_price, 2),
        val=round(val_price, 2),
        hvn_levels=hvn_levels,
        lvn_levels=lvn_levels,
        total_volume=round(total_volume, 2),
        bin_count=num_bins,
        price_range=(round(price_min + margin, 2), round(price_max - margin, 2)),
    )


def get_institutional_levels(
    klines_short: list[KlineData],
    klines_long: list[KlineData],
) -> dict:
    """计算多周期 Volume Profile 并提取机构关键价位。

    Args:
        klines_short: 短周期K线（如1h），用于短期主力成本
        klines_long: 长周期K线（如4h/1d），用于长期主力成本

    Returns:
        包含多周期 VPOC/VAH/VAL 的字典，供策略生成使用
    """
    result: dict = {
        "short_term": None,
        "long_term": None,
        "institutional_support": [],
        "institutional_resistance": [],
    }

    short_vp = compute_volume_profile(klines_short) if klines_short else None
    long_vp = compute_volume_profile(klines_long) if klines_long else None

    if short_vp:
        result["short_term"] = short_vp.model_dump()

    if long_vp:
        result["long_term"] = long_vp.model_dump()

    # 综合两个周期确定机构支撑/阻力
    support_levels: list[float] = []
    resistance_levels: list[float] = []

    current_price = 0.0
    if klines_short:
        current_price = klines_short[-1].close
    elif klines_long:
        current_price = klines_long[-1].close

    if current_price <= 0:
        return result

    # 收集所有 HVN 和 VA 边界作为机构支撑/阻力
    for vp in [short_vp, long_vp]:
        if vp is None:
            continue

        # VPOC 是最强的支撑/阻力
        if vp.vpoc < current_price:
            support_levels.append(vp.vpoc)
        else:
            resistance_levels.append(vp.vpoc)

        # VAL 作为支撑
        if vp.val < current_price:
            support_levels.append(vp.val)

        # VAH 作为阻力
        if vp.vah > current_price:
            resistance_levels.append(vp.vah)

        # HVN 节点
        for lvl in vp.hvn_levels:
            if lvl < current_price * 0.998:  # 稍低于当前价
                support_levels.append(lvl)
            elif lvl > current_price * 1.002:  # 稍高于当前价
                resistance_levels.append(lvl)

    # 去重排序
    result["institutional_support"] = sorted(set(round(s, 2) for s in support_levels), reverse=True)[:5]
    result["institutional_resistance"] = sorted(set(round(r, 2) for r in resistance_levels))[:5]

    return result
