"""统计异常检测层 — 基于历史分布的动态阈值计算。

替代 RiskAgent 中的固定阈值，使用 Z-Score 和百分位数检测异常。
从 Redis 缓存读取历史统计摘要（由 Celery Worker 定期更新），
不可用时降级回退到固定阈值。
"""

import logging
import math
from typing import Any

from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)

_STATS_CACHE_KEY_PREFIX = "anomaly:stats"
_STATS_TTL_SECONDS = 7200  # 2 小时（Worker 每 1 小时刷新，TTL 留余量防过期间隙）


class IndicatorStats(BaseModel):
    """单个指标的历史统计摘要。"""

    mean: float = 0.0
    std: float = 1.0
    p5: float = 0.0    # 第 5 百分位
    p95: float = 0.0   # 第 95 百分位
    p99: float = 0.0   # 第 99 百分位
    sample_count: int = 0


class AnomalyResult(BaseModel):
    """异常检测结果。"""

    indicator: str
    value: float
    z_score: float
    percentile_rank: str  # "normal" | "warning" | "extreme"
    is_anomaly: bool
    detail: str = ""


def compute_z_score(value: float, mean: float, std: float) -> float:
    """计算 Modified Z-Score，std 为 0 时返回 0。"""
    if std <= 0 or math.isnan(std):
        return 0.0
    return (value - mean) / std


def classify_percentile(
    value: float, p5: float, p95: float, p99: float
) -> str:
    """根据百分位数分类异常程度。"""
    if value >= p99 or value <= (p5 - (p95 - p5)):
        return "extreme"
    if value >= p95 or value <= p5:
        return "warning"
    return "normal"


def detect_anomalies(
    indicators: dict[str, float],
    stats_map: dict[str, IndicatorStats],
    z_threshold: float = 2.5,
) -> list[AnomalyResult]:
    """对一组指标值进行统计异常检测。

    Args:
        indicators: {指标名: 当前值}
        stats_map: {指标名: 历史统计摘要}
        z_threshold: Z-Score 异常阈值（默认 2.5）

    Returns:
        异常检测结果列表（仅返回检测到异常的指标）
    """
    results: list[AnomalyResult] = []

    for name, value in indicators.items():
        stats = stats_map.get(name)
        if stats is None or stats.sample_count < 10:
            continue

        z = compute_z_score(value, stats.mean, stats.std)
        rank = classify_percentile(value, stats.p5, stats.p95, stats.p99)
        is_anomaly = abs(z) >= z_threshold or rank == "extreme"

        if is_anomaly:
            results.append(AnomalyResult(
                indicator=name,
                value=value,
                z_score=round(z, 3),
                percentile_rank=rank,
                is_anomaly=True,
                detail=f"{name}={value:.4f}, Z={z:.2f}, 百分位={rank}",
            ))

    return results


async def load_indicator_stats(symbol: str) -> dict[str, IndicatorStats]:
    """从 Redis 加载指标历史统计摘要，不可用时返回空 dict。"""
    try:
        from app.core.redis import get_json

        cache_key = f"{_STATS_CACHE_KEY_PREFIX}:{symbol}"
        cached = await get_json(cache_key)
        if cached is None or not isinstance(cached, dict):
            return {}

        result: dict[str, IndicatorStats] = {}
        for name, raw in cached.items():
            if isinstance(raw, dict):
                result[name] = IndicatorStats.model_validate(raw)
        return result

    except Exception as exc:
        logger.warning(
            "Failed to load indicator stats from Redis",
            extra={"symbol": symbol, "error": str(exc)},
        )
        return {}


async def save_indicator_stats(
    symbol: str, stats_map: dict[str, IndicatorStats]
) -> None:
    """将指标历史统计摘要写入 Redis 缓存。"""
    try:
        from app.core.redis import set_with_ttl

        cache_key = f"{_STATS_CACHE_KEY_PREFIX}:{symbol}"
        data = {name: s.model_dump() for name, s in stats_map.items()}
        await set_with_ttl(cache_key, data, _STATS_TTL_SECONDS)

    except Exception as exc:
        logger.warning(
            "Failed to save indicator stats to Redis",
            extra={"symbol": symbol, "error": str(exc)},
        )


def extract_risk_indicators(
    onchain: Any, derivatives: Any, current_price: float
) -> dict[str, float]:
    """从 MarketData 的子模型中提取可量化的风险指标。"""
    indicators: dict[str, float] = {}

    if onchain is not None:
        if onchain.exchange_netflow is not None:
            indicators["exchange_netflow"] = onchain.exchange_netflow
        if onchain.whale_change_24h is not None:
            indicators["whale_change_24h"] = onchain.whale_change_24h
        if onchain.mvrv is not None:
            indicators["mvrv"] = onchain.mvrv
        if onchain.fear_greed_index is not None:
            indicators["fear_greed_index"] = float(onchain.fear_greed_index)
        if onchain.large_tx_count is not None:
            indicators["large_tx_count"] = float(onchain.large_tx_count)

    if derivatives is not None:
        if derivatives.funding_rate is not None:
            indicators["funding_rate"] = derivatives.funding_rate
        if derivatives.liquidation_1h_usd is not None:
            indicators["liquidation_1h_usd"] = derivatives.liquidation_1h_usd
        if derivatives.long_short_ratio is not None:
            indicators["long_short_ratio"] = derivatives.long_short_ratio

    return indicators
