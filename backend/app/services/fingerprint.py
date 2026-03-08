"""数据指纹计算器 — 基于市场数据生成缓存指纹。

当价格变动超过模式精度阈值或 K 线收盘价序列变化时，
指纹自动变化，触发缓存未命中。
"""

import hashlib
import math

from app.models.analysis import AnalysisMode
from app.models.market_data import KlineData

# ---------------------------------------------------------------------------
# 模式精度配置（价格取整精度）
# ---------------------------------------------------------------------------

MODE_PRECISION: dict[AnalysisMode, float] = {
    AnalysisMode.SCALPING: 0.002,   # 0.2%
    AnalysisMode.INTRADAY: 0.005,   # 0.5%
    AnalysisMode.TREND: 0.01,       # 1%
}

# ---------------------------------------------------------------------------
# 模式 K 线数量配置（用于指纹计算的最近 N 根 K 线）
# ---------------------------------------------------------------------------

MODE_KLINE_COUNT: dict[AnalysisMode, int] = {
    AnalysisMode.SCALPING: 6,
    AnalysisMode.INTRADAY: 4,
    AnalysisMode.TREND: 3,
}


def round_price_by_precision(
    price: float,
    precision: float,
    anchor_price: float | None = None,
) -> float:
    """按精度取整价格。

    将价格按 ``price * precision`` 为步长取整，使得在精度范围内
    的微小价格波动映射到同一取整值。

    Args:
        price: 当前价格，必须 > 0。
        precision: 精度比例，必须 > 0。
        anchor_price: 步长锚点价格。若为空则回退到 price。

    Returns:
        取整后的价格；若 price 或 precision <= 0 则返回 0.0。
    """
    if price <= 0 or precision <= 0:
        return 0.0
    base_price = anchor_price if anchor_price and anchor_price > 0 else price
    step = base_price * precision
    if step <= 0:
        return 0.0
    return round(math.floor(price / step) * step, 8)


def compute_fingerprint(
    price: float,
    klines: list[KlineData],
    mode: AnalysisMode,
) -> str:
    """计算数据指纹，返回 8 位十六进制字符串。

    指纹由取整后的价格和最近 N 根 K 线收盘价拼接后取 MD5 前 8 位生成。
    相同输入始终产生相同指纹；价格或 K 线变化时指纹自动不同。

    Args:
        price: 当前市场价格。
        klines: K 线数据列表。
        mode: 分析模式，决定精度和 K 线数量。

    Returns:
        8 位十六进制字符串。
    """
    precision = MODE_PRECISION[mode]
    n = MODE_KLINE_COUNT[mode]

    # 使用最近收盘价作为锚点计算量化步长，避免“用当前价计算步长”导致每跳都变化。
    anchor_price = klines[-1].close if klines else price
    rounded_price = round_price_by_precision(price, precision, anchor_price=anchor_price)
    recent_closes = [f"{k.close:.8f}" for k in klines[-n:]] if klines else []

    raw_str = f"{rounded_price:.8f}|{'|'.join(recent_closes)}"
    return hashlib.md5(raw_str.encode()).hexdigest()[:8]
