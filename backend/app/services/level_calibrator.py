"""点位校准器 — 利用 SMC 结构数据（FVG / OB / VP）精准校准策略点位。

传统策略生成器用 ATR 倍数算止损，完全不看市场结构，导致：
- 止损落在价值区内（容易被扫）
- 目标位没有阻力/支撑支撑（随意设定）
- 入场区间与 OB/FVG 回调区不匹配

本模块在 StrategyResult 生成后，基于以下数据做结构化点位吸附：
- FVGResult: 未回补的公允价值缺口 → 入场区间/反弹目标
- OrderBlockResult: 机构订单块 → 入场区间/止损护盾
- VP (institutional_support/resistance): 成交密集区 → 止损/目标位支撑
- MarketPhase: 操盘阶段 → 信号置信度修正
"""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from app.models.analysis import FVGResult, OrderBlockResult

logger = logging.getLogger(__name__)

# 最大吸附偏差：点位距目标 < X% 时才考虑吸附
_MAX_SNAP_PCT = 0.03   # 3% — 超过此距离不强制吸附，保留ATR值
_TIGHT_SNAP_PCT = 0.015  # 1.5% — 强吸附窗口（OB/FVG质量高时适用）


# ---------------------------------------------------------------------------
# 操盘阶段 → 信号置信度修正
# ---------------------------------------------------------------------------

# (phase, signal_direction) → confidence_modifier
# 阶段与信号方向一致时提升置信度，相悖时降低
_PHASE_SIGNAL_MODIFIERS: dict[tuple[str, str], float] = {
    # 吸筹：看涨信号可信，看跌信号需谨慎
    ("accumulation", "bullish"):  1.10,
    ("accumulation", "bearish"):  0.75,
    # 试盘：双向均打折
    ("testing",      "bullish"):  0.85,
    ("testing",      "bearish"):  0.85,
    # 拉盘：看涨信号可信，顺势
    ("markup",       "bullish"):  1.10,
    ("markup",       "bearish"):  0.70,
    # 派发：看跌信号可信，看涨是接盘
    ("distribution", "bullish"):  0.70,
    ("distribution", "bearish"):  1.10,
    # 出逃：极度危险，所有方向打折，bearish 略保留
    ("escape",       "bullish"):  0.55,
    ("escape",       "bearish"):  0.90,
    # 洗盘：双向打折，但看多稍留余地（洗盘后可能拉盘）
    ("washout",      "bullish"):  0.80,
    ("washout",      "bearish"):  0.80,
}


def apply_phase_confidence_modifier(
    signal: str,
    confidence: float,
    phase: str | None,
) -> tuple[str, float]:
    """根据操盘阶段修正信号置信度。

    规则：
    - 阶段与信号方向一致 → 最多提升 10%
    - 阶段与信号方向相悖 → 降低 15-45%
    - 置信度修正后 clip 到 [0, 0.95]

    Returns:
        (signal, adjusted_confidence)
    """
    if signal == "neutral" or phase is None:
        return signal, confidence

    key = (phase, signal)
    modifier = _PHASE_SIGNAL_MODIFIERS.get(key, 1.0)
    new_conf = round(min(0.95, max(0.0, confidence * modifier)), 4)

    # 出逃阶段的看涨信号：置信度过低时直接压成 neutral，避免用户做多被套
    if phase == "escape" and signal == "bullish" and new_conf < 0.35:
        logger.warning("出逃阶段看涨信号置信度过低(%.2f)，压制为neutral", new_conf)
        return "neutral", new_conf

    return signal, new_conf


# ---------------------------------------------------------------------------
# 点位吸附：把 ATR 算的价格吸附到结构性价位
# ---------------------------------------------------------------------------

def _closest_below(price: float, levels: list[float], max_pct: float) -> float | None:
    """从 levels 中找到最接近但低于 price 的结构位（在 max_pct 范围内）。"""
    candidates = [l for l in levels if l < price and (price - l) / price <= max_pct]
    return max(candidates) if candidates else None


def _closest_above(price: float, levels: list[float], max_pct: float) -> float | None:
    """从 levels 中找到最接近但高于 price 的结构位（在 max_pct 范围内）。"""
    candidates = [l for l in levels if l > price and (l - price) / price <= max_pct]
    return min(candidates) if candidates else None


def _collect_structural_levels(
    direction: str,
    fvg_list: list,
    ob_list: list,
    vp_data: dict | None,
    current_price: float,
) -> tuple[list[float], list[float]]:
    """从 FVG / OB / VP 中提取结构性支撑位和阻力位。

    Returns:
        (support_levels, resistance_levels)
    """
    supports: list[float] = []
    resistances: list[float] = []

    # ── FVG ──────────────────────────────────────────────────
    for fvg in fvg_list:
        if getattr(fvg, "mitigated", True):
            continue  # 已回补的 FVG 不参与点位
        gap_low = fvg.gap_low
        gap_high = fvg.gap_high
        if fvg.direction == "bullish":
            # 看涨 FVG：缺口区下沿是支撑
            if gap_high < current_price:
                supports.append(gap_low)
            elif gap_low > current_price:
                # FVG 在价格上方 → 也可以是压力/目标
                resistances.append(gap_low)
        else:  # bearish FVG
            if gap_low > current_price:
                resistances.append(gap_high)
            elif gap_high < current_price:
                supports.append(gap_high)

    # ── Order Blocks ─────────────────────────────────────────
    for ob in ob_list:
        ob_top = getattr(ob, "top", None) or getattr(ob, "ob_high", None)
        ob_bot = getattr(ob, "bottom", None) or getattr(ob, "ob_low", None)
        ob_type = getattr(ob, "type", None) or getattr(ob, "ob_type", "")
        if ob_top is None or ob_bot is None:
            continue
        ob_mid = (ob_top + ob_bot) / 2

        if ob_type in ("demand", "bullish"):
            # 需求块：价格下方是支撑
            if ob_top < current_price:
                supports.append(ob_bot)   # 止损护盾：破需求块下沿止损
                supports.append(ob_top)   # 入场参考：需求块上沿附近
        elif ob_type in ("supply", "bearish"):
            if ob_bot > current_price:
                resistances.append(ob_top)
                resistances.append(ob_bot)

    # ── Volume Profile ────────────────────────────────────────
    if vp_data:
        for lvl in vp_data.get("institutional_support", []):
            if isinstance(lvl, (int, float)) and lvl < current_price:
                supports.append(float(lvl))
        for lvl in vp_data.get("institutional_resistance", []):
            if isinstance(lvl, (int, float)) and lvl > current_price:
                resistances.append(float(lvl))

        # VPOC 双向都是强磁力位
        for tf in ("short_term", "long_term"):
            tf_data = vp_data.get(tf)
            if not tf_data:
                continue
            for key in ("vpoc", "vah", "val"):
                val = tf_data.get(key)
                if isinstance(val, (int, float)):
                    if val < current_price * 0.998:
                        supports.append(float(val))
                    elif val > current_price * 1.002:
                        resistances.append(float(val))

    # 去重 + 排序
    supports = sorted(set(round(s, 8) for s in supports), reverse=True)
    resistances = sorted(set(round(r, 8) for r in resistances))
    return supports, resistances


def calibrate_strategy_levels(
    direction: str,
    entry_low: float,
    entry_high: float,
    stop_loss: float,
    targets: list[float],
    current_price: float,
    fvg_list: list,
    ob_list: list,
    vp_data: dict | None,
    atr: float | None = None,
) -> tuple[float, float, float, list[float], list[str]]:
    """用结构性价位精准校准策略点位。

    策略：
    - 止损：吸附到最近的结构支撑位下方（做多）/ 阻力位上方（做空）
      保证止损在结构外，而非价值区内
    - 目标位：吸附到最近的结构阻力位（做多）/ 支撑位（做空）
    - 入场区间：吸附到最近的 OB/FVG 入场区

    Returns:
        (entry_low, entry_high, stop_loss, targets, calibrated_fields)
    """
    if direction == "neutral" or current_price <= 0:
        return entry_low, entry_high, stop_loss, targets, []

    calibrated: list[str] = []

    supports, resistances = _collect_structural_levels(
        direction, fvg_list, ob_list, vp_data, current_price,
    )

    if direction == "long":
        # ── 止损：寻找入场区间下方的结构支撑 ──────────────
        # 止损应在支撑位下方，即取比 entry_low 更低的支撑，再取其 bottom
        # 策略：找最近支撑位，用其下方(小幅缓冲)做止损
        sl_anchor = _closest_below(entry_low, supports, _MAX_SNAP_PCT)
        if sl_anchor is not None:
            # 止损放在结构位下方 0.3%（小缓冲，防止被精准扫损）
            new_sl = sl_anchor * (1 - 0.003)
            # 确保新止损比原始止损更合理（不能比原始止损更高）
            if new_sl < entry_low and new_sl > stop_loss * 0.85:
                stop_loss = round(new_sl, 8)
                calibrated.append("stop_loss→structure")

        # ── 入场区间：寻找最近的需求块/FVG ────────────────
        entry_snap = _closest_below(current_price, supports, _TIGHT_SNAP_PCT)
        if entry_snap is not None and entry_snap > stop_loss:
            # 入场区间：从结构支撑 到 当前价
            new_entry_low = entry_snap
            new_entry_high = min(current_price, entry_snap * 1.01)
            if new_entry_low > stop_loss:
                entry_low = round(new_entry_low, 8)
                entry_high = round(new_entry_high, 8)
                calibrated.append("entry→structure")

        # ── 目标位：吸附到结构阻力 ─────────────────────────
        new_targets: list[float] = []
        for i, t in enumerate(targets[:3]):
            snap = _closest_above(current_price if i == 0 else (new_targets[-1] if new_targets else t),
                                   resistances, _MAX_SNAP_PCT)
            if snap is not None and snap > entry_high:
                new_targets.append(round(snap, 8))
                if snap != t:
                    calibrated.append(f"tp{i+1}→structure")
            else:
                new_targets.append(t)
        if new_targets:
            targets = new_targets

    elif direction == "short":
        # ── 止损：寻找入场区间上方的结构阻力 ──────────────
        sl_anchor = _closest_above(entry_high, resistances, _MAX_SNAP_PCT)
        if sl_anchor is not None:
            new_sl = sl_anchor * (1 + 0.003)
            if new_sl > entry_high and new_sl < stop_loss * 1.15:
                stop_loss = round(new_sl, 8)
                calibrated.append("stop_loss→structure")

        # ── 入场区间：供应块/FVG ────────────────────────────
        entry_snap = _closest_above(current_price, resistances, _TIGHT_SNAP_PCT)
        if entry_snap is not None and entry_snap < stop_loss:
            new_entry_high = entry_snap
            new_entry_low = max(current_price, entry_snap * 0.99)
            if new_entry_high < stop_loss:
                entry_high = round(new_entry_high, 8)
                entry_low = round(new_entry_low, 8)
                calibrated.append("entry→structure")

        # ── 目标位：吸附到结构支撑 ─────────────────────────
        new_targets = []
        for i, t in enumerate(targets[:3]):
            snap = _closest_below(current_price if i == 0 else (new_targets[-1] if new_targets else t),
                                   supports, _MAX_SNAP_PCT)
            if snap is not None and snap < entry_low:
                new_targets.append(round(snap, 8))
                if snap != t:
                    calibrated.append(f"tp{i+1}→structure")
            else:
                new_targets.append(t)
        if new_targets:
            targets = new_targets

    if calibrated:
        logger.info(
            "结构点位校准完成: direction=%s, fields=%s", direction, calibrated,
        )

    return entry_low, entry_high, stop_loss, targets, calibrated
