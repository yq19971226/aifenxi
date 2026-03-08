"""消息-资金交叉验证器 — 识别"小作文"操纵。

核心逻辑：
当 NewsAnalystAgent 报 bullish/bearish 时，交叉检验 CoinGlass 大单数据：
- 新闻看多 + 大单买入同步 → 真金白银，信号可信
- 新闻看多 + 无大单配合 → 可能是"小作文"语料污染，降权
- 新闻看空 + 大单卖出同步 → 真实恐慌，信号可信
- 新闻看空 + 无大单配合 → 可能是恐慌制造，降权

2025-2026年关键变化：
AI 可以自动生成虚假新闻配合自己的仓位"造势"，
通过污染搜索引擎和 AI 回答形成裂变传播，触发量化跟单。
本模块正是针对这条"数字流水线"的防御。

供 AnalysisOrchestrator 在信号聚合阶段调用。
"""

import logging
from typing import Optional

from pydantic import BaseModel, Field

from app.agents.base import AgentReport
from app.models.market_data import CoinGlassData

logger = logging.getLogger(__name__)


class NewsCapitalValidation(BaseModel):
    """消息-资金交叉验证结果。"""

    is_validated: bool = Field(default=False, description="新闻信号是否得到资金面验证")
    confidence_modifier: float = Field(
        default=1.0, ge=0.0, le=1.5,
        description="置信度调整系数（<1.0 降权, >1.0 加成）",
    )
    validation_type: str = Field(
        default="no_data",
        description="验证类型: confirmed|unconfirmed|contradicted|no_data",
    )
    evidence: list[str] = Field(default_factory=list, description="验证证据")
    warning: str = Field(default="", description="警告信息（如疑似小作文）")


# ── 阈值 ────────────────────────────────────────────────────

_LARGE_ORDER_THRESHOLD_USD = 100_000   # 大单金额阈值（USD）
_MIN_LARGE_ORDERS = 2                  # 至少需要的同向大单数量
_CONFIDENCE_BOOST = 1.15               # 验证通过时的置信度加成
_CONFIDENCE_PENALTY_MILD = 0.75        # 未验证时的轻度降权
_CONFIDENCE_PENALTY_STRONG = 0.5       # 矛盾时的强降权


def validate_news_with_capital(
    news_report: Optional[AgentReport],
    coinglass: Optional[CoinGlassData],
    current_price: float = 0.0,
) -> NewsCapitalValidation:
    """交叉验证新闻信号与资金流向。

    Args:
        news_report: NewsAnalystAgent 的分析报告
        coinglass: CoinGlass 数据（含大单、CVD、资金流）
        current_price: 当前价格

    Returns:
        NewsCapitalValidation 包含验证结果和置信度调整
    """
    # 无新闻报告或新闻为中性 → 不需要验证
    if news_report is None or news_report.signal == "neutral":
        return NewsCapitalValidation(
            validation_type="no_data",
            evidence=["新闻信号为中性或不可用，无需交叉验证"],
        )

    # 新闻置信度极低 → 不需要验证
    if news_report.confidence < 0.2:
        return NewsCapitalValidation(
            validation_type="no_data",
            evidence=["新闻置信度过低，跳过交叉验证"],
        )

    news_signal = news_report.signal  # "bullish" | "bearish"
    is_bullish_news = news_signal == "bullish"

    # 无 CoinGlass 数据 → 无法验证，轻度降权
    if coinglass is None:
        return NewsCapitalValidation(
            confidence_modifier=0.9,
            validation_type="no_data",
            evidence=["CoinGlass 数据不可用，无法交叉验证新闻信号"],
            warning="新闻信号未经资金面验证，建议谨慎对待",
        )

    evidence: list[str] = []

    # ── 维度1: 大单方向验证 ──────────────────────────────────
    large_order_score = _check_large_orders(coinglass, is_bullish_news, evidence)

    # ── 维度2: CVD 方向验证 ──────────────────────────────────
    cvd_score = _check_cvd(coinglass, is_bullish_news, evidence)

    # ── 维度3: 资金净流入/流出验证 ───────────────────────────
    netflow_score = _check_netflow(coinglass, is_bullish_news, evidence)

    # ── 综合评估 ─────────────────────────────────────────────
    # 加权平均（大单权重最高，因为最直接）
    total_score = (
        large_order_score * 0.5 +
        cvd_score * 0.3 +
        netflow_score * 0.2
    )

    if total_score > 0.3:
        # 资金面确认新闻
        return NewsCapitalValidation(
            is_validated=True,
            confidence_modifier=_CONFIDENCE_BOOST,
            validation_type="confirmed",
            evidence=evidence,
        )
    elif total_score < -0.3:
        # 资金面与新闻矛盾
        direction_cn = "看多" if is_bullish_news else "看空"
        return NewsCapitalValidation(
            confidence_modifier=_CONFIDENCE_PENALTY_STRONG,
            validation_type="contradicted",
            evidence=evidence,
            warning=(
                f"⚠️ 新闻{direction_cn}但资金面相反，"
                f"疑似「小作文」语料污染或AI造势，强烈建议忽略此新闻信号"
            ),
        )
    else:
        # 资金面无明确验证
        has_any_data = bool(
            coinglass.large_orders or
            coinglass.cvd_snapshots or
            coinglass.netflow_snapshots
        )
        if has_any_data:
            return NewsCapitalValidation(
                confidence_modifier=_CONFIDENCE_PENALTY_MILD,
                validation_type="unconfirmed",
                evidence=evidence,
                warning="新闻信号未获得资金面验证，可能是已消化的旧闻或噪音",
            )
        else:
            return NewsCapitalValidation(
                confidence_modifier=0.9,
                validation_type="no_data",
                evidence=["CoinGlass 大单/CVD/资金流数据均为空"],
                warning="资金面数据不可用，新闻信号可信度打折",
            )


# ── 维度检测函数 ────────────────────────────────────────────


def _check_large_orders(
    cg: CoinGlassData,
    is_bullish_news: bool,
    evidence: list[str],
) -> float:
    """检查大单方向是否与新闻一致。

    Returns:
        -1.0 ~ +1.0 的得分（正=一致，负=矛盾）
    """
    if not cg.large_orders:
        evidence.append("大单数据不可用")
        return 0.0

    buy_count = 0
    sell_count = 0
    buy_volume = 0.0
    sell_volume = 0.0

    for order in cg.large_orders:
        side = (order.get("side") or order.get("type", "")).lower()
        amount = 0.0
        try:
            amount = float(order.get("amount") or order.get("vol") or order.get("quantity", 0))
        except (ValueError, TypeError):
            pass

        price = 0.0
        try:
            price = float(order.get("price", 0))
        except (ValueError, TypeError):
            pass

        usd_value = amount * price if price > 0 else amount

        if "buy" in side or "long" in side:
            buy_count += 1
            buy_volume += usd_value
        elif "sell" in side or "short" in side:
            sell_count += 1
            sell_volume += usd_value

    total_count = buy_count + sell_count
    if total_count == 0:
        evidence.append("大单数据无买卖方向信息")
        return 0.0

    buy_ratio = buy_count / total_count
    evidence.append(
        f"大单: 买入{buy_count}笔(${buy_volume:,.0f}), "
        f"卖出{sell_count}笔(${sell_volume:,.0f}), "
        f"买入占比{buy_ratio:.0%}"
    )

    if is_bullish_news:
        if buy_ratio >= 0.6 and buy_count >= _MIN_LARGE_ORDERS:
            return 0.8  # 看多新闻 + 大单买入多 → 确认
        elif buy_ratio <= 0.3:
            return -0.8  # 看多新闻 + 大单卖出多 → 矛盾
        return 0.0
    else:
        if buy_ratio <= 0.4 and sell_count >= _MIN_LARGE_ORDERS:
            return 0.8  # 看空新闻 + 大单卖出多 → 确认
        elif buy_ratio >= 0.7:
            return -0.8  # 看空新闻 + 大单买入多 → 矛盾
        return 0.0


def _check_cvd(
    cg: CoinGlassData,
    is_bullish_news: bool,
    evidence: list[str],
) -> float:
    """检查 CVD 趋势是否与新闻一致。

    CVD (Cumulative Volume Delta) 上升 = 主动买入力量强
    """
    if not cg.cvd_snapshots or len(cg.cvd_snapshots) < 2:
        evidence.append("CVD 数据不足")
        return 0.0

    # 取最近几条 CVD
    recent = cg.cvd_snapshots[-5:]
    cvd_values = []
    for snap in recent:
        val = snap.get("cvd") or snap.get("value")
        if val is not None:
            try:
                cvd_values.append(float(val))
            except (ValueError, TypeError):
                pass

    if len(cvd_values) < 2:
        return 0.0

    # CVD 变化趋势
    cvd_change = cvd_values[-1] - cvd_values[0]
    cvd_direction = "上升" if cvd_change > 0 else "下降"
    evidence.append(f"CVD趋势: {cvd_direction} (变化={cvd_change:+.2f})")

    if is_bullish_news:
        if cvd_change > 0:
            return 0.6   # 看多 + CVD上升 → 一致
        elif cvd_change < 0:
            return -0.5  # 看多 + CVD下降 → 矛盾
    else:
        if cvd_change < 0:
            return 0.6   # 看空 + CVD下降 → 一致
        elif cvd_change > 0:
            return -0.5  # 看空 + CVD上升 → 矛盾

    return 0.0


def _check_netflow(
    cg: CoinGlassData,
    is_bullish_news: bool,
    evidence: list[str],
) -> float:
    """检查交易所净流量是否与新闻一致。

    净流出 = 提币到冷钱包 = 看多信号
    净流入 = 转入交易所准备卖 = 看空信号
    """
    if not cg.netflow_snapshots:
        evidence.append("资金流向数据不可用")
        return 0.0

    recent = cg.netflow_snapshots[-3:]
    netflow_values = []
    for snap in recent:
        val = snap.get("netflow") or snap.get("value")
        if val is not None:
            try:
                netflow_values.append(float(val))
            except (ValueError, TypeError):
                pass

    if not netflow_values:
        return 0.0

    avg_netflow = sum(netflow_values) / len(netflow_values)
    flow_direction = "净流出" if avg_netflow < 0 else "净流入"
    evidence.append(f"交易所资金: {flow_direction} (均值={avg_netflow:+.2f})")

    if is_bullish_news:
        if avg_netflow < 0:
            return 0.5   # 看多 + 净流出 → 一致（囤币）
        elif avg_netflow > 0:
            return -0.4  # 看多 + 净流入 → 矛盾（准备卖）
    else:
        if avg_netflow > 0:
            return 0.5   # 看空 + 净流入 → 一致
        elif avg_netflow < 0:
            return -0.4  # 看空 + 净流出 → 矛盾

    return 0.0
