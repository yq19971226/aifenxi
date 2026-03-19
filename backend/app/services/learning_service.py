"""自主学习模块 — 绩效回顾、权重迭代、信号校准、数据维护。

提供 LearningService 类，封装所有学习相关的后端业务逻辑。
复用 PerformanceTracker / weights.py / engine.py 已有能力。
"""

import logging
from datetime import datetime, timezone

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.sql_compat import age_filter, cast_int, cast_bigint, count_filter, avg_filter, serial_pk, varchar, timestamptz_default
from app.services.performance import PerformanceTracker
from app.consensus.weights import (
    _query_model_scores,
    _normalize_weights,
    LOOKBACK_DAYS,
    REDIS_KEY,
    WEIGHT_TTL_SECONDS,
    MIN_WEIGHT,
    ModelWeight,
    WeightReport,
    _ACCURACY_SQL,
    PRICE_THRESHOLD,
    _compute_composite_score,
    _CONSENSUS_AGENT_IDS,
)
from app.core.redis import get_json, set_with_ttl

logger = logging.getLogger(__name__)


class LearningService:
    """自主学习服务 — 绩效回顾、权重迭代、信号校准、数据维护。"""

    def __init__(self, session: AsyncSession) -> None:
        self._session = session
        self._tracker = PerformanceTracker(session)

    # ── B1: 绩效回顾 ─────────────────────────────────────────

    async def get_performance_review(
        self,
        days: int = 30,
        symbol: str | None = None,
    ) -> dict:
        """绩效回顾数据 — 统计 + 趋势 + 智能体准确率 + 信号分布 + 按模式胜率。"""

        stats = await self._tracker.get_stats(symbol=symbol, days=days)
        trend = await self._tracker.get_trend_data(days=days)

        # 信号分布统计
        signal_dist = await self._get_signal_distribution(days, symbol)

        # 按模式分胜率
        mode_win_rates = await self._get_mode_win_rates(days, symbol)

        # 参数变更标记（B6 预留）
        changelog_markers = await self._get_changelog_markers(days)

        # 剧本胜率（D8）
        playbook_win_rates = await self._get_playbook_win_rates(days)
        structure_win_rates = await self._get_structure_win_rates(days)

        return {
            "stats": stats.model_dump(),
            "trend": trend,
            "signal_distribution": signal_dist,
            "mode_win_rates": mode_win_rates,
            "changelog_markers": changelog_markers,
            "playbook_win_rates": playbook_win_rates,
            "structure_win_rates": structure_win_rates,
        }

    async def _get_signal_distribution(
        self, days: int, symbol: str | None = None,
    ) -> dict[str, int]:
        """统计各信号方向的分布数量。"""
        _age = age_filter("created_at", ":days")
        conditions = [_age]
        params: dict = {"days": days}
        if symbol:
            conditions.append("symbol = :symbol")
            params["symbol"] = symbol

        where = " AND ".join(conditions)
        _ci = cast_int
        _cf = count_filter
        try:
            result = await self._session.execute(
                text(f"""
                    SELECT
                        {_ci(_cf("direction = 'long'"))} AS long_count,
                        {_ci(_cf("direction = 'short'"))} AS short_count
                    FROM strategy_snapshots
                    WHERE {where}
                """),
                params,
            )
            row = result.mappings().first()
            if row:
                return {"long": row["long_count"], "short": row["short_count"]}
        except Exception as exc:
            logger.error("查询信号分布失败: %s", exc)
        return {"long": 0, "short": 0}

    async def _get_mode_win_rates(
        self, days: int, symbol: str | None = None,
    ) -> list[dict]:
        """按分析模式（scalping / intraday / trend）分组统计胜率。"""
        _age_ss = age_filter("ss.created_at", ":days")
        conditions = [
            _age_ss,
            "ss.status != 'pending'",
        ]
        params: dict = {"days": days}
        if symbol:
            conditions.append("ss.symbol = :symbol")
            params["symbol"] = symbol

        where = " AND ".join(conditions)
        _ci = cast_int
        _cf = count_filter
        try:
            result = await self._session.execute(
                text(f"""
                    SELECT
                        COALESCE(s.mode, 'unknown') AS mode,
                        {_ci('COUNT(*)')} AS total,
                        {_ci(_cf('ss.pnl_pct > 0'))} AS wins,
                        COALESCE(
                            CAST({_cf('ss.pnl_pct > 0')} AS FLOAT)
                            / NULLIF(COUNT(*), 0), 0
                        ) AS win_rate
                    FROM strategy_snapshots ss
                    LEFT JOIN strategies s ON ss.strategy_id = s.id
                    WHERE {where}
                    GROUP BY COALESCE(s.mode, 'unknown')
                    ORDER BY total DESC
                """),
                params,
            )
            rows = result.mappings().all()
            return [
                {
                    "mode": row["mode"],
                    "total": row["total"],
                    "wins": row["wins"],
                    "win_rate": round(float(row["win_rate"]), 4),
                }
                for row in rows
            ]
        except Exception as exc:
            logger.error("查询模式胜率失败: %s", exc)
            return []

    async def _get_playbook_win_rates(self, days: int) -> list[dict]:
        """剧本功能已移除，返回空列表。"""
        return []

    async def _get_structure_win_rates(self, days: int) -> list[dict]:
        """剧本功能已移除，返回空列表。"""
        return []

    async def _get_changelog_markers(self, days: int) -> list[dict]:
        """从 params_changelog 表获取参数变更标记（B6 预留）。"""
        try:
            _age_cl = age_filter("changed_at", ":days")
            result = await self._session.execute(
                text(f"""
                    SELECT id, param_type, param_key, old_value, new_value,
                           changed_by, changed_at, note
                    FROM params_changelog
                    WHERE {_age_cl}
                    ORDER BY changed_at ASC
                """),
                {"days": days},
            )
            rows = result.mappings().all()
            return [
                {
                    "id": str(row["id"]),
                    "param_type": row["param_type"],
                    "param_key": row["param_key"],
                    "old_value": row["old_value"],
                    "new_value": row["new_value"],
                    "changed_by": row["changed_by"],
                    "changed_at": (
                        row["changed_at"].isoformat()
                        if hasattr(row["changed_at"], "isoformat")
                        else str(row["changed_at"])
                        if row["changed_at"]
                        else None
                    ),
                    "note": row["note"],
                }
                for row in rows
            ]
        except Exception:
            # 表可能尚未创建
            return []

    # ── B2: 权重迭代 ─────────────────────────────────────────

    async def recalculate_weights(self, lookback_days: int = 30) -> dict:
        """预览新权重（不写入 Redis），支持自定义回看天数。"""
        from app.core.model_router import get_model_for_agent

        model_keys: list[str] = []
        for cid in _CONSENSUS_AGENT_IDS:
            mk = await get_model_for_agent(cid)
            if mk not in model_keys:
                model_keys.append(mk)

        scores: dict[str, dict] = {}
        for model_key in model_keys:
            try:
                result = await self._session.execute(
                    _ACCURACY_SQL,
                    {
                        "lookback_days": lookback_days,
                        "agent_id": model_key,
                        "threshold": PRICE_THRESHOLD,
                    },
                )
                row = result.fetchone()
                if row and row.total > 0:
                    direction_acc = float(row.correct) / float(row.total)
                    calibration = float(row.calibration_score)
                    magnitude = float(row.magnitude_score)
                    composite = _compute_composite_score(direction_acc, calibration, magnitude)
                    scores[model_key] = {
                        "direction_accuracy": round(direction_acc, 4),
                        "calibration_score": round(calibration, 4),
                        "magnitude_score": round(magnitude, 4),
                        "composite_score": round(composite, 4),
                        "sample_count": int(row.total),
                    }
                else:
                    scores[model_key] = {
                        "direction_accuracy": 0.5,
                        "calibration_score": 0.5,
                        "magnitude_score": 0.0,
                        "composite_score": 0.5,
                        "sample_count": 0,
                    }
            except Exception as exc:
                logger.error("计算模型评分失败: %s, %s", model_key, exc)
                scores[model_key] = {
                    "direction_accuracy": 0.5,
                    "calibration_score": 0.5,
                    "magnitude_score": 0.0,
                    "composite_score": 0.5,
                    "sample_count": 0,
                }

        composites = {k: v["composite_score"] for k, v in scores.items()}
        new_weights = _normalize_weights(composites)

        # 获取当前权重作为对比
        current_weights = await get_json(REDIS_KEY)
        if not isinstance(current_weights, dict):
            n = len(model_keys)
            current_weights = {k: round(1.0 / n, 4) for k in model_keys} if n else {}

        return {
            "lookback_days": lookback_days,
            "current_weights": current_weights,
            "new_weights": new_weights,
            "model_details": scores,
        }

    async def apply_weights(
        self, weights: dict[str, float], changed_by: str, note: str = "",
    ) -> dict:
        """应用新权重到 Redis，并写入 params_changelog。"""
        old_weights = await get_json(REDIS_KEY) or {}

        await set_with_ttl(REDIS_KEY, weights, WEIGHT_TTL_SECONDS)
        logger.info("权重已应用: %s", weights)

        # 写入 changelog
        await self._write_changelog(
            param_type="weights",
            param_key="consensus:weights",
            old_value=str(old_weights),
            new_value=str(weights),
            changed_by=changed_by,
            note=note,
        )

        return {"status": "applied", "weights": weights}

    async def get_current_weights(self) -> dict:
        """获取当前 Redis 中的权重。"""
        from app.consensus.weights import get_current_weights
        weights = await get_current_weights()
        return {"weights": weights}

    # ── B3: 信号校准 ─────────────────────────────────────────

    async def get_calibration_params(self) -> dict:
        """获取共识引擎的校准参数。"""
        from app.services.config_service import get_config_value

        threshold = float(await get_config_value("consensus_signal_threshold", "0.35"))
        min_agreement = int(await get_config_value("consensus_min_agreement", "2"))
        min_confidence = float(await get_config_value("consensus_min_confidence", "0.50"))

        return {
            "signal_threshold": threshold,
            "min_agreement": min_agreement,
            "min_confidence": min_confidence,
            "recommended": {
                "signal_threshold": {"min": 0.1, "max": 0.8, "default": 0.35},
                "min_agreement": {"min": 1, "max": 4, "default": 2},
                "min_confidence": {"min": 0.0, "max": 0.9, "default": 0.40},
            },
        }

    async def update_calibration_params(
        self,
        signal_threshold: float | None = None,
        min_agreement: int | None = None,
        min_confidence: float | None = None,
        changed_by: str = "admin",
    ) -> dict:
        """更新校准参数到 config_service，并写入 changelog。"""
        from app.services.config_service import ConfigService, ConfigCreate, ConfigUpdate

        svc = ConfigService(self._session)
        updated: dict[str, str] = {}

        if signal_threshold is not None:
            old_val = await svc.get_config("consensus_signal_threshold", "0.35")
            new_val = str(round(signal_threshold, 4))
            await self._upsert_config(
                svc, "consensus_signal_threshold", new_val,
                category="consensus", changed_by=changed_by,
            )
            updated["signal_threshold"] = new_val
            await self._write_changelog(
                "calibration", "consensus_signal_threshold",
                old_val, new_val, changed_by,
            )

        if min_agreement is not None:
            old_val = await svc.get_config("consensus_min_agreement", "2")
            new_val = str(min_agreement)
            await self._upsert_config(
                svc, "consensus_min_agreement", new_val,
                category="consensus", changed_by=changed_by,
            )
            updated["min_agreement"] = new_val
            await self._write_changelog(
                "calibration", "consensus_min_agreement",
                old_val, new_val, changed_by,
            )

        if min_confidence is not None:
            old_val = await svc.get_config("consensus_min_confidence", "0.50")
            new_val = str(round(min_confidence, 4))
            await self._upsert_config(
                svc, "consensus_min_confidence", new_val,
                category="consensus", changed_by=changed_by,
            )
            updated["min_confidence"] = new_val
            await self._write_changelog(
                "calibration", "consensus_min_confidence",
                old_val, new_val, changed_by,
            )

        await self._session.commit()
        return {"status": "updated", "params": updated}

    async def _upsert_config(
        self,
        svc: "ConfigService",
        key: str,
        value: str,
        category: str = "general",
        changed_by: str = "system",
    ) -> None:
        """创建或更新配置项（ConfigService 没有 upsert，需手动判断）。"""
        from app.services.config_service import ConfigCreate, ConfigUpdate

        existing = await svc.get_config_detail(key)
        if existing:
            await svc.update_config(
                key,
                ConfigUpdate(value=value, is_secret=False),
                admin_user_id=changed_by,
            )
        else:
            await svc.create_config(
                ConfigCreate(
                    config_key=key,
                    value=value,
                    category=category,
                    description=f"Calibration param: {key}",
                    is_secret=False,
                ),
                admin_user_id=changed_by,
            )

    # ── B4: 数据库维护 ───────────────────────────────────────

    async def get_db_stats(self) -> list[dict]:
        """获取各主要表的行数统计。"""
        # audit_logs 由 v18_audit_logs.sql 创建，已有库需在服务器上手动执行该迁移
        tables = [
            "strategies", "strategy_snapshots", "perf_checkpoints",
            "agent_reports", "klines", "memberships", "payments",
            "symbol_registry", "system_configs", "audit_logs",
        ]
        stats: list[dict] = []
        for table in tables:
            try:
                result = await self._session.execute(
                    text(f"SELECT {cast_bigint('COUNT(*)')} AS cnt FROM {table}")  # noqa: S608
                )
                row = result.mappings().first()
                stats.append({"table": table, "row_count": row["cnt"] if row else 0})
            except Exception:
                stats.append({"table": table, "row_count": -1, "error": "表不存在或查询失败"})
        return stats

    async def cleanup_old_data(
        self, retain_days: int = 90, changed_by: str = "admin",
    ) -> dict:
        """清理过期数据（最少保留 30 天）。"""
        retain_days = max(retain_days, 30)

        cleanup_targets = [
            ("agent_reports", "created_at"),
            ("klines", "time"),
            ("perf_checkpoints", "recorded_at"),
            ("audit_logs", "created_at"),
        ]

        results: dict[str, int] = {}
        for table, time_col in cleanup_targets:
            try:
                _age_del = age_filter(time_col, ":days")
                result = await self._session.execute(
                    text(f"""
                        DELETE FROM {table}
                        WHERE NOT ({_age_del})
                    """),  # noqa: S608
                    {"days": retain_days},
                )
                results[table] = result.rowcount
            except Exception as exc:
                logger.error("清理 %s 失败: %s", table, exc)
                results[table] = -1

        await self._session.commit()

        # 写入 changelog
        await self._write_changelog(
            "maintenance", "data_cleanup",
            "", f"retain_days={retain_days}, results={results}",
            changed_by, note=f"保留 {retain_days} 天",
        )

        return {
            "retain_days": retain_days,
            "deleted": results,
        }

    # ── B6: 参数变更快照 ─────────────────────────────────────

    async def ensure_changelog_table(self) -> None:
        """确保 params_changelog 表存在。"""
        _spk = serial_pk()
        _v50 = varchar(50)
        _v200 = varchar(200)
        _ts = timestamptz_default()
        await self._session.execute(text(f"""
            CREATE TABLE IF NOT EXISTS params_changelog (
                id {_spk},
                param_type {_v50} NOT NULL,
                param_key {_v200} NOT NULL,
                old_value TEXT DEFAULT '',
                new_value TEXT DEFAULT '',
                changed_by {_v200} DEFAULT 'system',
                changed_at {_ts},
                note TEXT DEFAULT ''
            )
        """))
        await self._session.commit()

    async def _write_changelog(
        self,
        param_type: str,
        param_key: str,
        old_value: str,
        new_value: str,
        changed_by: str,
        note: str = "",
    ) -> None:
        """写入参数变更记录。"""
        try:
            await self._session.execute(
                text("""
                    INSERT INTO params_changelog
                        (param_type, param_key, old_value, new_value, changed_by, note)
                    VALUES (:param_type, :param_key, :old_value, :new_value, :changed_by, :note)
                """),
                {
                    "param_type": param_type,
                    "param_key": param_key,
                    "old_value": old_value,
                    "new_value": new_value,
                    "changed_by": changed_by,
                    "note": note,
                },
            )
            await self._session.commit()
        except Exception as exc:
            logger.error("写入 params_changelog 失败: %s", exc)
            try:
                await self._session.rollback()
            except Exception:
                pass
