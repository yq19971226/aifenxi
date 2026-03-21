"""因子学习服务 — 记录因子得分、追踪结果、统计命中率、训练优化权重。

阶段1：数据采集层
  - 每次 VPD V2 分析后记录因子快照
  - 定时追踪价格结果（15m/1h/4h/24h）
  - 统计各因子命中率

阶段2：AI 训练层
  - LightGBM 训练因子权重
  - 管理员一键应用

安全约束：
  - AI 建议 ≠ 自动生效
  - 单因子权重上限 0.40
  - 最低 100 条记录才允许训练
  - 权重变更审计日志
"""

import json
import logging
from datetime import datetime, timezone, timedelta

from sqlalchemy import text

from app.core.database import AsyncSessionLocal

logger = logging.getLogger(__name__)


# ══════════════════════════════════════════════════════════════
# 建表（启动时自动执行）
# ══════════════════════════════════════════════════════════════


_INIT_SQLS = [
    """CREATE TABLE IF NOT EXISTS vpd_factor_snapshots (
        id BIGSERIAL PRIMARY KEY,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        symbol VARCHAR(20) NOT NULL,
        analysis_mode VARCHAR(20) NOT NULL,
        signal_direction VARCHAR(10) NOT NULL,
        signal_confidence FLOAT NOT NULL,
        vpd_score FLOAT NOT NULL,
        vpd_grade VARCHAR(20),
        vpd_modifier FLOAT NOT NULL,
        position_label VARCHAR(20),
        data_completeness FLOAT,
        factor_scores JSONB NOT NULL,
        price_at_signal FLOAT NOT NULL,
        atr_at_signal FLOAT
    )""",
    """CREATE TABLE IF NOT EXISTS vpd_outcome_tracking (
        id BIGSERIAL PRIMARY KEY,
        snapshot_id BIGINT REFERENCES vpd_factor_snapshots(id) ON DELETE CASCADE,
        price_after_15m FLOAT,
        price_after_1h FLOAT,
        price_after_4h FLOAT,
        price_after_24h FLOAT,
        pct_change_15m FLOAT,
        pct_change_1h FLOAT,
        pct_change_4h FLOAT,
        pct_change_24h FLOAT,
        hit_15m BOOLEAN,
        hit_1h BOOLEAN,
        hit_4h BOOLEAN,
        hit_24h BOOLEAN,
        tracked_at TIMESTAMPTZ DEFAULT NOW()
    )""",
    """CREATE TABLE IF NOT EXISTS vpd_weight_audit_log (
        id BIGSERIAL PRIMARY KEY,
        changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        changed_by VARCHAR(50),
        source VARCHAR(20) NOT NULL,
        old_weights JSONB NOT NULL,
        new_weights JSONB NOT NULL,
        ai_accuracy FLOAT,
        sample_count INT,
        notes TEXT
    )""",
    """CREATE INDEX IF NOT EXISTS idx_vpd_snap_sym_time
        ON vpd_factor_snapshots(symbol, created_at DESC)""",
    """CREATE INDEX IF NOT EXISTS idx_vpd_snap_mode
        ON vpd_factor_snapshots(analysis_mode)""",
    """CREATE INDEX IF NOT EXISTS idx_vpd_outcome_snap
        ON vpd_outcome_tracking(snapshot_id)""",
]

_tables_initialized = False


async def _ensure_tables():
    """确保因子学习表已创建。"""
    global _tables_initialized
    if _tables_initialized:
        return
    try:
        async with AsyncSessionLocal() as session:
            for sql in _INIT_SQLS:
                await session.execute(text(sql))
            await session.commit()
        _tables_initialized = True
        logger.info("vpd_factor_learning tables initialized")
    except Exception as exc:
        logger.warning("Failed to init vpd learning tables: %s", exc)


# ══════════════════════════════════════════════════════════════
# 记录因子快照
# ══════════════════════════════════════════════════════════════


async def record_factor_snapshot(
    symbol: str,
    analysis_mode: str,
    signal_direction: str,
    signal_confidence: float,
    vpd_result: dict,
    price_at_signal: float,
    atr_at_signal: float | None = None,
) -> int | None:
    """记录一次 VPD V2 分析的因子快照。

    Args:
        vpd_result: VolumePriceDivergenceV2.model_dump() 的结果

    Returns:
        snapshot_id 或 None
    """
    await _ensure_tables()

    factor_scores = {}
    for f in vpd_result.get("factors", []):
        factor_scores[f["factor_id"]] = round(f["score"], 4)

    try:
        async with AsyncSessionLocal() as session:
            result = await session.execute(
                text("""
                    INSERT INTO vpd_factor_snapshots
                    (symbol, analysis_mode, signal_direction, signal_confidence,
                     vpd_score, vpd_grade, vpd_modifier, position_label,
                     data_completeness, factor_scores, price_at_signal, atr_at_signal)
                    VALUES
                    (:symbol, :mode, :direction, :confidence,
                     :score, :grade, :modifier, :position,
                     :completeness, CAST(:factors AS jsonb), :price, :atr)
                    RETURNING id
                """),
                {
                    "symbol": symbol,
                    "mode": analysis_mode,
                    "direction": signal_direction,
                    "confidence": signal_confidence,
                    "score": vpd_result.get("score", 0),
                    "grade": vpd_result.get("grade", "正常"),
                    "modifier": vpd_result.get("confidence_modifier", 1.0),
                    "position": vpd_result.get("position", "inside_value"),
                    "completeness": vpd_result.get("data_completeness", 1.0),
                    "factors": json.dumps(factor_scores),
                    "price": price_at_signal,
                    "atr": atr_at_signal,
                },
            )
            row = result.fetchone()
            await session.commit()
            snapshot_id = row[0] if row else None
            logger.debug("factor_snapshot_recorded", extra={"id": snapshot_id, "symbol": symbol})

            # ── 自动训练触发检查（每 50 条检查一次）──
            if snapshot_id and snapshot_id % 50 == 0:
                try:
                    await _maybe_auto_train()
                except Exception as train_exc:
                    logger.warning("auto_train_check failed: %s", train_exc)

            return snapshot_id
    except Exception as exc:
        logger.warning("Failed to record factor snapshot: %s", exc)
        return None


async def _maybe_auto_train() -> None:
    """当样本量达标时自动运行 AI 训练并缓存结果供管理员审核。

    安全约束：
    - Redis 分布式锁防止并发触发（锁 1 小时）
    - 只缓存训练结果，不自动应用权重
    - 管理员在后台查看并一键应用
    """
    try:
        from app.core.redis import get_redis_pool, set_with_ttl

        redis = get_redis_pool()
        lock_key = "factor:auto_train:lock"

        # 尝试获取锁（1 小时内不重复触发）
        acquired = await redis.set(lock_key, "1", nx=True, ex=3600)
        if not acquired:
            return  # 已有训练在运行或最近已触发过

        # 获取统计数据检查是否达标
        stats = await get_factor_stats(days=14)
        if stats["total_analyses"] < 200 or stats["tracked_count"] < 100:
            # 未达标，释放锁（下次 50 条后再检查）
            await redis.delete(lock_key)
            return

        logger.info(
            "Auto-training triggered",
            extra={
                "total_analyses": stats["total_analyses"],
                "tracked_count": stats["tracked_count"],
            },
        )

        # 运行 AI 训练（异常时释放锁以便下次重试）
        train_ok = False
        try:
            from app.services.factor_ai_trainer import run_ai_training
            result = await run_ai_training(days=14)
            train_ok = bool(result.get("ok"))
        except Exception as train_exc:
            logger.warning("run_ai_training exception: %s", train_exc)
            await redis.delete(lock_key)  # 释放锁以便下次重试
            return

        # 缓存训练结果（管理员审核用，TTL=24 小时）
        if train_ok:
            await set_with_ttl(
                "factor:auto_train:latest_result",
                result,
                ttl_seconds=86400,
            )
            logger.info(
                "Auto-training completed, result cached for admin review",
                extra={"tokens_used": result.get("tokens_used", 0)},
            )
        else:
            logger.warning("Auto-training failed: %s", result.get("error"))
            # 释放锁以便下次重试
            await redis.delete(lock_key)
    except Exception as exc:
        logger.warning("_maybe_auto_train error: %s", exc)


# ══════════════════════════════════════════════════════════════
# 结果追踪
# ══════════════════════════════════════════════════════════════


def _is_hit(direction: str, pct_change: float) -> bool:
    """判断信号方向是否与实际价格变动一致。"""
    if direction == "bullish":
        return pct_change > 0.001
    elif direction == "bearish":
        return pct_change < -0.001
    else:  # neutral
        return abs(pct_change) < 0.005


async def _price_at_time(
    session,
    symbol: str,
    target_time: datetime,
) -> float | None:
    """从 klines 表查询 target_time 之后最近的 1h 收盘价。

    多时间窗口共用同一个 session，避免频繁建立连接。
    返回 None 表示该时刻的数据尚未落库（信号太新）。
    """
    try:
        result = await session.execute(
            text("""
                SELECT close
                FROM klines
                WHERE symbol = :symbol
                  AND interval = '1h'
                  AND time >= :target_time
                ORDER BY time ASC
                LIMIT 1
            """),
            {"symbol": symbol.upper(), "target_time": target_time},
        )
        row = result.fetchone()
        if row and row[0] and float(row[0]) > 0:
            return float(row[0])
    except Exception as exc:
        logger.debug("_price_at_time query failed: %s", exc)
    return None


async def track_outcomes():
    """追踪未回填的因子快照的价格结果。

    由定时任务调用（每 15 分钟一次）。

    核心修正：每个时间窗口（15m/1h/4h/24h）使用历史 klines 表中
    该窗口边界时刻的实际收盘价，而非「追踪时刻」的当前价格。
    避免以 T+24h 的价格充当 T+4h 的结果，导致命中率系统性失真。
    """
    await _ensure_tables()

    async with AsyncSessionLocal() as session:
        # 找出需要追踪的快照（已过去 15m 且未完成追踪的）
        cutoff_15m = datetime.now(timezone.utc) - timedelta(minutes=15)

        rows = await session.execute(
            text("""
                SELECT s.id, s.symbol, s.signal_direction, s.price_at_signal, s.created_at,
                       t.id as tracking_id,
                       t.price_after_15m, t.price_after_1h, t.price_after_4h, t.price_after_24h
                FROM vpd_factor_snapshots s
                LEFT JOIN vpd_outcome_tracking t ON t.snapshot_id = s.id
                WHERE s.created_at < :cutoff_15m
                  AND (t.id IS NULL OR t.price_after_24h IS NULL)
                ORDER BY s.created_at DESC
                LIMIT 100
            """),
            {"cutoff_15m": cutoff_15m},
        )
        snapshots = rows.fetchall()

        if not snapshots:
            return

        now_utc = datetime.now(timezone.utc)
        updated = 0

        for row in snapshots:
            snap_id, symbol, direction, price_at, created_at = (
                row[0], row[1], row[2], float(row[3]), row[4],
            )
            tracking_id = row[5]
            existing_15m, existing_1h, existing_4h, existing_24h = (
                row[6], row[7], row[8], row[9],
            )

            if not price_at or price_at <= 0:
                continue

            # 统一保证 created_at 有时区
            if created_at.tzinfo is None:
                created_at = created_at.replace(tzinfo=timezone.utc)

            age = now_utc - created_at
            updates: dict = {}

            # ── 15 分钟窗口 ──────────────────────────────────────
            if existing_15m is None and age >= timedelta(minutes=15):
                target = created_at + timedelta(minutes=15)
                p = await _price_at_time(session, symbol, target)
                if p:
                    pct = (p - price_at) / price_at
                    updates["price_after_15m"] = p
                    updates["pct_change_15m"] = pct
                    updates["hit_15m"] = _is_hit(direction, pct)

            # ── 1 小时窗口 ───────────────────────────────────────
            if existing_1h is None and age >= timedelta(hours=1):
                target = created_at + timedelta(hours=1)
                p = await _price_at_time(session, symbol, target)
                if p:
                    pct = (p - price_at) / price_at
                    updates["price_after_1h"] = p
                    updates["pct_change_1h"] = pct
                    updates["hit_1h"] = _is_hit(direction, pct)

            # ── 4 小时窗口 ───────────────────────────────────────
            if existing_4h is None and age >= timedelta(hours=4):
                target = created_at + timedelta(hours=4)
                p = await _price_at_time(session, symbol, target)
                if p:
                    pct = (p - price_at) / price_at
                    updates["price_after_4h"] = p
                    updates["pct_change_4h"] = pct
                    updates["hit_4h"] = _is_hit(direction, pct)

            # ── 24 小时窗口 ──────────────────────────────────────
            if existing_24h is None and age >= timedelta(hours=24):
                target = created_at + timedelta(hours=24)
                p = await _price_at_time(session, symbol, target)
                if p:
                    pct = (p - price_at) / price_at
                    updates["price_after_24h"] = p
                    updates["pct_change_24h"] = pct
                    updates["hit_24h"] = _is_hit(direction, pct)

            if not updates:
                continue

            if tracking_id is None:
                cols = ", ".join(["snapshot_id"] + list(updates.keys()))
                vals = ", ".join([":snapshot_id"] + [f":{k}" for k in updates.keys()])
                await session.execute(
                    text(f"INSERT INTO vpd_outcome_tracking ({cols}) VALUES ({vals})"),
                    {"snapshot_id": snap_id, **updates},
                )
            else:
                set_clause = ", ".join(f"{k} = :{k}" for k in updates.keys())
                await session.execute(
                    text(
                        f"UPDATE vpd_outcome_tracking "
                        f"SET {set_clause}, tracked_at = NOW() WHERE id = :tid"
                    ),
                    {"tid": tracking_id, **updates},
                )
            updated += 1

        if updated:
            await session.commit()
            logger.info("vpd_outcomes_tracked", extra={"count": updated})


# ══════════════════════════════════════════════════════════════
# 统计查询
# ══════════════════════════════════════════════════════════════


async def get_factor_stats(
    days: int = 7,
    symbol: str | None = None,
    mode: str | None = None,
) -> dict:
    """获取因子命中率统计。"""
    await _ensure_tables()

    where_parts = ["s.created_at > :since"]
    params: dict = {"since": datetime.now(timezone.utc) - timedelta(days=days)}

    if symbol:
        where_parts.append("s.symbol = :symbol")
        params["symbol"] = symbol
    if mode:
        where_parts.append("s.analysis_mode = :mode")
        params["mode"] = mode

    where = " AND ".join(where_parts)

    async with AsyncSessionLocal() as session:
        # 总体统计
        overview = await session.execute(
            text(f"""
                SELECT
                    COUNT(s.id) as total,
                    COUNT(t.id) as tracked,
                    AVG(CASE WHEN t.hit_1h = true THEN 1.0 ELSE 0.0 END) as hit_rate_1h,
                    AVG(CASE WHEN t.hit_4h = true THEN 1.0 ELSE 0.0 END) as hit_rate_4h
                FROM vpd_factor_snapshots s
                LEFT JOIN vpd_outcome_tracking t ON t.snapshot_id = s.id
                WHERE {where}
            """),
            params,
        )
        ov = overview.fetchone()

        # 各因子的信号活跃时命中率
        factor_stats = await session.execute(
            text(f"""
                SELECT
                    key as factor_id,
                    COUNT(*) as active_count,
                    AVG(CASE WHEN t.hit_1h = true THEN 1.0 ELSE 0.0 END) as hit_rate_1h,
                    AVG(CASE WHEN t.hit_4h = true THEN 1.0 ELSE 0.0 END) as hit_rate_4h,
                    AVG(ABS(value::text::float)) as avg_score
                FROM vpd_factor_snapshots s
                JOIN vpd_outcome_tracking t ON t.snapshot_id = s.id
                CROSS JOIN LATERAL jsonb_each(s.factor_scores) AS j(key, value)
                WHERE {where}
                  AND ABS(value::text::float) > 0.1
                  AND t.hit_1h IS NOT NULL
                GROUP BY key
                ORDER BY hit_rate_1h DESC
            """),
            params,
        )
        factors = []
        for row in factor_stats.fetchall():
            factors.append({
                "factor_id": row[0],
                "active_count": row[1],
                "hit_rate_1h": round(row[2] * 100, 1) if row[2] else 0,
                "hit_rate_4h": round(row[3] * 100, 1) if row[3] else 0,
                "avg_score": round(row[4], 3) if row[4] else 0,
            })

        return {
            "period_days": days,
            "total_analyses": ov[0] if ov else 0,
            "tracked_count": ov[1] if ov else 0,
            "overall_hit_rate_1h": round(ov[2] * 100, 1) if ov and ov[2] else 0,
            "overall_hit_rate_4h": round(ov[3] * 100, 1) if ov and ov[3] else 0,
            "factor_stats": factors,
        }


# ══════════════════════════════════════════════════════════════
# 审计日志
# ══════════════════════════════════════════════════════════════


async def log_weight_change(
    changed_by: str,
    source: str,
    old_weights: dict,
    new_weights: dict,
    ai_accuracy: float | None = None,
    sample_count: int | None = None,
    notes: str | None = None,
):
    """记录权重变更审计日志。"""
    await _ensure_tables()
    try:
        async with AsyncSessionLocal() as session:
            await session.execute(
                text("""
                    INSERT INTO vpd_weight_audit_log
                    (changed_by, source, old_weights, new_weights,
                     ai_accuracy, sample_count, notes)
                    VALUES (:by, :source, CAST(:old AS jsonb), CAST(:new AS jsonb),
                            :acc, :count, :notes)
                """),
                {
                    "by": changed_by,
                    "source": source,
                    "old": json.dumps(old_weights),
                    "new": json.dumps(new_weights),
                    "acc": ai_accuracy,
                    "count": sample_count,
                    "notes": notes,
                },
            )
            await session.commit()
    except Exception as exc:
        logger.warning("Failed to log weight change: %s", exc)
