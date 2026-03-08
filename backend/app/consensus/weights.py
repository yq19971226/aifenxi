"""动态权重系统 — 基于历史三维度综合评分计算各模型权重。

- 查询 agent_reports 表获取各模型近30天预测
- 对比 klines 表中预测后24h的实际价格变动
- 三维度综合评分:
  - 方向准确率 (50%): 正确预测数 / 总预测数
  - 校准度 (30%): 预测 confidence 与实际涨跌幅的匹配度
  - 幅度匹配度 (20%): 方向正确时实际涨跌幅的加权平均
- 权重 = 归一化综合评分（最低 0.1 地板）
- 结果存入 Redis（consensus:weights，TTL=24h）
"""

import asyncio
import logging
from datetime import datetime, timezone

from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.redis import get_json, set_with_ttl
from app.core.sql_compat import is_sqlite, age_filter, interval_add

logger = logging.getLogger(__name__)

# ── 常量 ──────────────────────────────────────────────────────

REDIS_KEY = "consensus:weights"
WEIGHT_TTL_SECONDS = 86400  # 24h
LOOKBACK_DAYS = 30
PRICE_THRESHOLD = 0.01  # 1% 涨跌判定阈值
MIN_WEIGHT = 0.1  # 最低权重地板
DEFAULT_ACCURACY = 0.5  # 无历史数据时的默认准确率

# 三维度综合评分权重
DIRECTION_WEIGHT = 0.5  # 方向准确率权重
CALIBRATION_WEIGHT = 0.3  # 校准度权重
MAGNITUDE_WEIGHT = 0.2  # 幅度匹配度权重

# 共识引擎分析器 ID 列表（用于查询权重）
_CONSENSUS_AGENT_IDS = [
    "consensus_deepseek",
    "consensus_grok",
    "consensus_claude",
    "consensus_qwen",
]


# ── Pydantic 模型 ─────────────────────────────────────────────


class ModelWeight(BaseModel):
    """单个模型的权重详情。"""

    model_config = {"protected_namespaces": ()}

    model_key: str
    accuracy: float = Field(ge=0.0, le=1.0)
    weight: float = Field(ge=0.0, le=1.0)
    sample_count: int = Field(ge=0)


class WeightReport(BaseModel):
    """权重更新报告。"""

    model_config = {"protected_namespaces": ()}

    weights: dict[str, float]
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    model_details: list[ModelWeight] = Field(default_factory=list)


class _ModelScore(BaseModel):
    """单个模型的 DB 查询结果（内部使用）。"""

    model_config = {"protected_namespaces": ()}

    model_key: str
    composite_score: float
    sample_count: int


# ── SQL 查询 ──────────────────────────────────────────────────

# Build SQL with db-specific syntax
_age_pred = age_filter("ar.created_at", ":lookback_days", "day")
_interval_24h = interval_add("p.pred_time", 24, "hours")

_ACCURACY_SQL = text(f"""
WITH predictions AS (
    SELECT
        ar.agent_id,
        ar.signal,
        ar.confidence,
        ar.created_at AS pred_time,
        ar.symbol
    FROM agent_reports ar
    WHERE {_age_pred}
      AND ar.signal IN ('bullish', 'bearish', 'neutral')
      AND ar.agent_id = :agent_id
),
price_checks AS (
    SELECT
        p.agent_id,
        p.signal,
        p.confidence,
        p.pred_time,
        -- 预测时刻最近的收盘价
        (
            SELECT k.close
            FROM klines k
            WHERE k.symbol = p.symbol
              AND k.interval = '1h'
              AND k.time <= p.pred_time
            ORDER BY k.time DESC
            LIMIT 1
        ) AS price_at_pred,
        -- 预测后24h内最近的收盘价
        (
            SELECT k.close
            FROM klines k
            WHERE k.symbol = p.symbol
              AND k.interval = '1h'
              AND k.time > p.pred_time
              AND k.time <= {_interval_24h}
            ORDER BY k.time DESC
            LIMIT 1
        ) AS price_after
    FROM predictions p
),
scored AS (
    SELECT
        agent_id,
        signal,
        confidence,
        price_at_pred,
        price_after,
        CASE
            WHEN price_at_pred IS NOT NULL
                 AND price_after IS NOT NULL
                 AND price_at_pred > 0
            THEN (price_after - price_at_pred) / price_at_pred
            ELSE NULL
        END AS actual_change_pct,
        CASE
            WHEN price_at_pred IS NOT NULL
                 AND price_after IS NOT NULL
                 AND price_at_pred > 0
            THEN
                CASE
                    WHEN signal = 'bullish'
                         AND (price_after - price_at_pred) / price_at_pred > :threshold
                        THEN 1
                    WHEN signal = 'bearish'
                         AND (price_at_pred - price_after) / price_at_pred > :threshold
                        THEN 1
                    WHEN signal = 'neutral'
                         AND ABS(price_after - price_at_pred) / price_at_pred <= :threshold
                        THEN 1
                    ELSE 0
                END
            ELSE 0
        END AS direction_correct
    FROM price_checks
)
SELECT
    agent_id,
    COUNT(*) AS total,
    -- 方向准确率
    SUM(direction_correct) AS correct,
    -- 校准度: 1 - avg(|confidence - |actual_change_pct||), 越接近1越好
    COALESCE(
        1.0 - AVG(
            CASE
                WHEN actual_change_pct IS NOT NULL AND confidence IS NOT NULL
                THEN ABS(confidence - LEAST(ABS(actual_change_pct), 1.0))
                ELSE NULL
            END
        ),
        0.5
    ) AS calibration_score,
    -- 幅度匹配度: 方向正确时 actual_change_pct 绝对值的加权平均, 归一化到 [0,1]
    COALESCE(
        LEAST(
            AVG(
                CASE
                    WHEN direction_correct = 1 AND actual_change_pct IS NOT NULL
                    THEN ABS(actual_change_pct)
                    ELSE NULL
                END
            ) / 0.10,
            1.0
        ),
        0.0
    ) AS magnitude_score
FROM scored
GROUP BY agent_id
""")


# ── 核心函数 ──────────────────────────────────────────────────


def _normalize_weights(
    accuracies: dict[str, float],
    min_weight: float = MIN_WEIGHT,
) -> dict[str, float]:
    """将准确率归一化为权重，应用最低地板。

    1. 对每个模型应用 max(accuracy, min_weight)
    2. 归一化使所有权重之和 = 1.0
    """
    floored = {k: max(v, min_weight) for k, v in accuracies.items()}
    total = sum(floored.values())
    if total <= 0:
        # 全部为零时回退等权
        n = len(accuracies)
        return {k: round(1.0 / n, 4) for k in accuracies} if n > 0 else {}
    return {k: round(v / total, 4) for k, v in floored.items()}


def _compute_composite_score(
    direction_accuracy: float,
    calibration_score: float,
    magnitude_score: float,
) -> float:
    """综合三维度计算模型评分。

    composite = direction_accuracy * 0.5 + calibration_score * 0.3 + magnitude_score * 0.2
    """
    return (
        direction_accuracy * DIRECTION_WEIGHT
        + calibration_score * CALIBRATION_WEIGHT
        + magnitude_score * MAGNITUDE_WEIGHT
    )


async def _query_model_scores(session: AsyncSession) -> dict[str, _ModelScore]:
    """查询各模型三维度评分，返回 {model_key: _ModelScore}。每个模型只查一次 DB。"""
    from app.core.model_router import get_model_for_agent

    # 动态获取当前共识引擎使用的实际 model_key
    model_keys: list[str] = []
    for cid in _CONSENSUS_AGENT_IDS:
        mk = await get_model_for_agent(cid)
        if mk not in model_keys:
            model_keys.append(mk)

    scores: dict[str, _ModelScore] = {}

    for model_key in model_keys:
        agent_id = model_key  # 共识投票以 model_key 作为 agent_id 存储
        try:
            result = await session.execute(
                _ACCURACY_SQL,
                {
                    "lookback_days": LOOKBACK_DAYS,
                    "agent_id": agent_id,
                    "threshold": PRICE_THRESHOLD,
                },
            )
            row = result.fetchone()
            if row and row.total > 0:
                direction_accuracy = float(row.correct) / float(row.total)
                calibration = float(row.calibration_score)
                magnitude = float(row.magnitude_score)
                composite = _compute_composite_score(
                    direction_accuracy, calibration, magnitude,
                )
                scores[model_key] = _ModelScore(
                    model_key=model_key,
                    composite_score=composite,
                    sample_count=int(row.total),
                )
                logger.info(
                    "Model composite score calculated",
                    extra={
                        "model_key": model_key,
                        "correct": int(row.correct),
                        "total": int(row.total),
                        "direction_accuracy": round(direction_accuracy, 4),
                        "calibration_score": round(calibration, 4),
                        "magnitude_score": round(magnitude, 4),
                        "composite_score": round(composite, 4),
                    },
                )
            else:
                scores[model_key] = _ModelScore(
                    model_key=model_key,
                    composite_score=DEFAULT_ACCURACY,
                    sample_count=0,
                )
                logger.info(
                    "No prediction history, using default accuracy",
                    extra={"model_key": model_key},
                )
        except Exception as exc:
            logger.error(
                "Failed to calculate accuracy for model",
                extra={"model_key": model_key, "error": str(exc)},
            )
            scores[model_key] = _ModelScore(
                model_key=model_key,
                composite_score=DEFAULT_ACCURACY,
                sample_count=0,
            )

    return scores


async def calculate_weights(session: AsyncSession) -> dict[str, float]:
    """查询 DB 计算各模型三维度综合评分，返回归一化权重字典。

    三维度：方向准确率 * 0.5 + 校准度 * 0.3 + 幅度匹配度 * 0.2
    无历史数据时使用默认准确率 0.5（Preservation 3.8）。
    """
    scores = await _query_model_scores(session)
    accuracies = {k: s.composite_score for k, s in scores.items()}
    return _normalize_weights(accuracies)


async def update_weights(session: AsyncSession) -> WeightReport:
    """计算权重并存入 Redis（TTL=24h），返回完整报告。"""
    scores = await _query_model_scores(session)
    accuracies = {k: s.composite_score for k, s in scores.items()}
    weights = _normalize_weights(accuracies)

    model_details = [
        ModelWeight(
            model_key=s.model_key,
            accuracy=round(s.composite_score, 4),
            weight=weights.get(s.model_key, 0.25),
            sample_count=s.sample_count,
        )
        for s in scores.values()
    ]

    # 写入 Redis
    try:
        await set_with_ttl(REDIS_KEY, weights, WEIGHT_TTL_SECONDS)
        logger.info(
            "Weights updated in Redis",
            extra={"weights": weights, "ttl": WEIGHT_TTL_SECONDS},
        )
    except Exception as exc:
        logger.error("Failed to store weights in Redis", extra={"error": str(exc)})

    return WeightReport(weights=weights, model_details=model_details)


async def get_current_weights() -> dict[str, float]:
    """从 Redis 读取当前权重，不存在则返回等权。"""
    try:
        cached = await get_json(REDIS_KEY)
        if cached and isinstance(cached, dict):
            logger.info("Loaded weights from Redis", extra={"weights": cached})
            return {str(k): float(v) for k, v in cached.items()}
    except Exception as exc:
        logger.error("Failed to read weights from Redis", extra={"error": str(exc)})

    # 回退等权 — 动态获取共识引擎实际使用的 model_key
    from app.core.model_router import get_model_for_agent
    all_mk = await asyncio.gather(*[get_model_for_agent(cid) for cid in _CONSENSUS_AGENT_IDS])
    keys: list[str] = list(dict.fromkeys(all_mk))  # 去重保序
    default_weights = {k: round(1.0 / len(keys), 4) for k in keys} if keys else {}
    logger.info("Using default equal weights", extra={"weights": default_weights})
    return default_weights
