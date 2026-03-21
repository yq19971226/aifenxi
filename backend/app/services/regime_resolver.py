"""体制-阶段交叉校验器 — 解决 market_regime 与 phase_tracker 的矛盾。

当市场体制检测（基于 ADX/BB/ATR 三因子）与庄家阶段追踪（基于 8 因子）
给出矛盾结论时（如 regime=震荡 + phase=拉盘），本模块给出校验后的
有效体制（regime_effective），同时保留原始值供风控使用。

设计原则：
- 当 score_gap < 0.5 时（阶段判断不确定），不触发覆盖
- 覆盖时置信度打折 0.7（因为是交叉推断而非直接观测）
- 返回 regime_original + regime_effective 双字段，下游按需选择
- P3-D: 冲突记录写入 regime_conflict_log 表，供后续复盘
"""

import asyncio
import logging

from app.agents.phase_tracker import MarketPhase
from app.services.market_regime import MarketRegime, RegimeType

logger = logging.getLogger(__name__)


# 冲突矩阵：(regime, phase) → (override_regime | None, reason_template)
# None 表示不覆盖，仅标记冲突
CONFLICT_MATRIX: dict[tuple[str, str], tuple[str | None, str]] = {
    # regime=震荡 + 趋势性阶段 → 覆盖为趋势
    ("ranging", "markup"):       ("trending", "链上数据显示庄家处于拉盘阶段"),
    ("ranging", "distribution"): ("trending", "链上数据显示庄家处于派发阶段"),
    ("ranging", "escape"):       ("trending", "链上数据显示庄家出逃"),
    # regime=趋势 + 区间性阶段 → 不覆盖，仅标记冲突
    ("trending", "accumulation"): (None, "技术面趋势但庄家在低位吸筹"),
    ("trending", "washout"):      (None, "技术面趋势但庄家在洗盘"),
}

# ── P3-D: 冲突历史记录 DDL ────────────────────────────────────

_CONFLICT_LOG_DDL = """
CREATE TABLE IF NOT EXISTS regime_conflict_log (
    id SERIAL PRIMARY KEY,
    symbol VARCHAR(20) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    regime_original VARCHAR(20),
    regime_effective VARCHAR(20),
    phase VARCHAR(20),
    phase_score_gap NUMERIC(6,3),
    conflict_detail TEXT,
    price_at_conflict NUMERIC(18,8),
    price_after_4h NUMERIC(18,8),
    regime_was_correct BOOLEAN
)
"""

_TABLE_ENSURED = False


async def _ensure_conflict_table() -> None:
    """懒创建冲突日志表。"""
    global _TABLE_ENSURED
    if _TABLE_ENSURED:
        return
    try:
        from app.core.database import AsyncSessionLocal
        from sqlalchemy import text
        async with AsyncSessionLocal() as session:
            await session.execute(text(_CONFLICT_LOG_DDL))
            await session.commit()
        _TABLE_ENSURED = True
    except Exception as exc:
        logger.warning("regime_conflict_log table creation skipped: %s", exc)


async def _log_conflict(
    symbol: str,
    regime_original: str,
    regime_effective: str,
    phase: str,
    phase_score_gap: float,
    conflict_detail: str,
    price_at_conflict: float | None = None,
) -> None:
    """P3-D: 将冲突记录写入 regime_conflict_log 表。"""
    try:
        await _ensure_conflict_table()
        from app.core.database import AsyncSessionLocal
        from sqlalchemy import text
        async with AsyncSessionLocal() as session:
            await session.execute(
                text("""
                    INSERT INTO regime_conflict_log
                        (symbol, regime_original, regime_effective, phase,
                         phase_score_gap, conflict_detail, price_at_conflict)
                    VALUES
                        (:symbol, :regime_original, :regime_effective, :phase,
                         :phase_score_gap, :conflict_detail, :price_at_conflict)
                """),
                {
                    "symbol": symbol,
                    "regime_original": regime_original,
                    "regime_effective": regime_effective,
                    "phase": phase,
                    "phase_score_gap": phase_score_gap,
                    "conflict_detail": conflict_detail,
                    "price_at_conflict": price_at_conflict,
                },
            )
            await session.commit()
    except Exception as exc:
        logger.warning("P3-D conflict log insert failed: %s", exc)


def resolve_regime_conflict(
    regime_info: MarketRegime,
    phase: MarketPhase | None,
    phase_score_gap: float = 999.0,
    current_price: float | None = None,
) -> tuple[MarketRegime, str | None, bool]:
    """交叉校验并返回 (effective_regime, conflict_detail, has_conflict)。

    当 phase_score_gap < 0.5 时，阶段判断不确定，不触发覆盖。
    P3-D: current_price 参数用于冲突日志记录。
    """
    if not phase or phase_score_gap < 0.5:
        # 阶段判断不确定时不覆盖，避免噪声
        return regime_info, None, False

    key = (regime_info.regime.value, phase.value)
    if key not in CONFLICT_MATRIX:
        return regime_info, None, False

    override_regime, reason_tpl = CONFLICT_MATRIX[key]

    if override_regime is None:
        # 不覆盖，仅标记
        logger.info(
            "Regime-phase conflict detected (no override)",
            extra={
                "symbol": regime_info.symbol,
                "regime": regime_info.regime.value,
                "phase": phase.value,
                "reason": reason_tpl,
            },
        )
        # P3-D: 异步记录冲突
        asyncio.ensure_future(_log_conflict(
            symbol=regime_info.symbol,
            regime_original=regime_info.regime.value,
            regime_effective=regime_info.regime.value,
            phase=phase.value,
            phase_score_gap=phase_score_gap,
            conflict_detail=reason_tpl,
            price_at_conflict=current_price,
        ))
        return regime_info, reason_tpl, True

    # 覆盖 regime
    effective = MarketRegime(
        symbol=regime_info.symbol,
        regime=RegimeType(override_regime),
        confidence=round(regime_info.confidence * 0.7, 3),
        adx=regime_info.adx,
        bb_width_pct=regime_info.bb_width_pct,
        atr_ratio=regime_info.atr_ratio,
        support=regime_info.support,
        resistance=regime_info.resistance,
        suggestion=f"技术面指标偏{regime_info.regime.value}但{reason_tpl}，以趋势策略为主。",
        recommended_mode="trend",
    )
    logger.info(
        "Regime overridden by phase cross-validation",
        extra={
            "symbol": regime_info.symbol,
            "original_regime": regime_info.regime.value,
            "effective_regime": override_regime,
            "phase": phase.value,
            "score_gap": phase_score_gap,
        },
    )
    # P3-D: 异步记录冲突
    asyncio.ensure_future(_log_conflict(
        symbol=regime_info.symbol,
        regime_original=regime_info.regime.value,
        regime_effective=override_regime,
        phase=phase.value,
        phase_score_gap=phase_score_gap,
        conflict_detail=reason_tpl,
        price_at_conflict=current_price,
    ))
    return effective, reason_tpl, True


# ── P3-D: 定时回填函数 ──────────────────────────────────────

async def backfill_conflict_prices() -> int:
    """定时任务调用：回填 4 小时后价格 + 判断体制覆盖是否正确。

    Returns:
        回填记录数
    """
    try:
        from app.core.database import AsyncSessionLocal
        from app.core.redis import get_json
        from sqlalchemy import text

        async with AsyncSessionLocal() as session:
            # 查找需要回填的记录（创建 4h 以上、尚未回填）
            result = await session.execute(text("""
                SELECT id, symbol, regime_original, regime_effective, price_at_conflict
                FROM regime_conflict_log
                WHERE price_after_4h IS NULL
                  AND created_at < NOW() - INTERVAL '4 hours'
                  AND price_at_conflict IS NOT NULL
                ORDER BY created_at ASC
                LIMIT 50
            """))
            rows = result.mappings().all()

            filled = 0
            for row in rows:
                symbol = row["symbol"]
                # 从 Redis 获取当前价格 (4h+ 后的价格)
                price_raw = await get_json(f"latest_price:{symbol}")
                if not isinstance(price_raw, (int, float)):
                    continue

                price_after = float(price_raw)
                price_at = float(row["price_at_conflict"])
                eff = row["regime_effective"]
                orig = row["regime_original"]

                # 判断覆盖是否正确：
                # trending → 价格应有明显方向 (变化 > 0.5%)
                # ranging → 价格应保持在区间内 (变化 < 0.5%)
                pct_change = abs(price_after - price_at) / price_at
                if eff == "trending":
                    was_correct = pct_change > 0.005  # 有方向性运动 = 覆盖正确
                elif eff == orig:
                    was_correct = None  # 未覆盖，不评判
                else:
                    was_correct = pct_change > 0.005

                await session.execute(text("""
                    UPDATE regime_conflict_log
                    SET price_after_4h = :price_after,
                        regime_was_correct = :was_correct
                    WHERE id = :id
                """), {
                    "price_after": price_after,
                    "was_correct": was_correct,
                    "id": row["id"],
                })
                filled += 1

            await session.commit()
            if filled:
                logger.info("P3-D: backfilled %d conflict records", filled)
            return filled

    except Exception as exc:
        logger.error("P3-D: backfill_conflict_prices failed: %s", exc)
        return 0
