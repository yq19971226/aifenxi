"""策略绩效追踪器 — 快照创建、结算检查、统计查询。

- create_snapshot: 策略生成时创建快照
- check_and_settle: 检查止损/目标/超时
- get_stats: SQL 聚合统计（胜率、盈亏比等）
- get_agent_accuracy: 按智能体维度统计信号准确率
"""

import asyncio
import json
import logging
from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.redis import get_json, set_with_ttl
from app.core.sql_compat import is_sqlite, cast_int, count_filter, avg_filter, age_filter, sum_filter, jsonb_cast, insert_returning
from app.models.performance import (
    PerformanceStats,
    PerfCheckpoint,
    SettlementResult,
    SettlementStatus,
    StrategyDirection,
    StrategySnapshotCreate,
)

logger = logging.getLogger(__name__)

_STATS_CACHE_TTL = 300  # 5 分钟


class PerformanceTracker:
    """策略绩效追踪器。"""

    CHECKPOINT_HOURS: list[int] = [1, 4, 24, 72]

    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    # ── 快照创建 ──────────────────────────────────────────

    async def create_snapshot(
        self,
        strategy_id: UUID,
        user_id: UUID | None = None,
        analysis_mode: str | None = None,
    ) -> UUID:
        """策略生成时创建快照，记录完整市场状态。"""
        strategy = await self._get_strategy(strategy_id)
        if strategy is None:
            raise ValueError(f"策略 {strategy_id} 不存在")

        current_price = await self._get_current_price(strategy["symbol"])
        snapshot = StrategySnapshotCreate(
            strategy_id=strategy_id,
            symbol=strategy["symbol"],
            direction=StrategyDirection(strategy["direction"]),
            entry_low=float(strategy["entry_low"]),
            entry_high=float(strategy["entry_high"]),
            stop_loss=float(strategy["stop_loss"]),
            targets=strategy["targets"],
            confidence=float(strategy["confidence"]),
            price_at_generation=current_price,
            user_id=user_id,
            analysis_mode=analysis_mode,
        )
        return await self._save_snapshot(snapshot)

    # ── 结算检查 ──────────────────────────────────────────

    async def check_and_settle(self, snapshot_id: UUID) -> SettlementResult | None:
        """检查是否触达止损/目标，返回结算结果或 None。"""
        snapshot = await self._get_snapshot(snapshot_id)
        if snapshot is None:
            logger.warning("快照 %s 不存在", snapshot_id)
            return None

        if snapshot["status"] != SettlementStatus.PENDING.value:
            return None

        try:
            current_price = await self._get_current_price(snapshot["symbol"])
        except Exception as exc:
            logger.error("获取 %s 当前价格失败: %s", snapshot["symbol"], exc)
            return None

        created_at = snapshot["created_at"]
        elapsed_hours = (
            datetime.now(timezone.utc) - created_at
        ).total_seconds() / 3600

        direction = snapshot["direction"]
        stop_loss = float(snapshot["stop_loss"])
        targets_raw = snapshot["targets"]
        targets: list[float] = (
            json.loads(targets_raw) if isinstance(targets_raw, str) else targets_raw
        )

        # 检查止损
        if self._hit_stop_loss(direction, stop_loss, current_price):
            return await self._settle(
                snapshot_id, snapshot, current_price, SettlementStatus.HIT_STOP_LOSS
            )

        # 检查目标位
        if self._hit_any_target(direction, targets, current_price):
            return await self._settle(
                snapshot_id, snapshot, current_price, SettlementStatus.HIT_TARGET
            )

        # 按 analysis_mode 动态超时（后台可配置：settle_timeout_scalping/intraday/trend）
        mode = snapshot.get("analysis_mode") or ""
        # P1-A: 按 spec 建议调整默认超时（scalping:3h, intraday:8h, trend:96h）
        _DEFAULT_TIMEOUT = {"scalping": 3, "intraday": 8, "trend": 96}
        try:
            from app.services.config_service import get_config_value
            _key = f"settle_timeout_{mode}" if mode else None
            if _key:
                timeout_hours = int(await get_config_value(_key, str(_DEFAULT_TIMEOUT.get(mode, 72))))
            else:
                timeout_hours = 72
        except Exception:
            timeout_hours = _DEFAULT_TIMEOUT.get(mode, 72)

        # P3-B: ATR 动态超时修正 — 从 market:regime 缓存读取 atr_ratio
        try:
            regime_data = await get_json(f"market:regime:{snapshot['symbol']}")
            if regime_data and isinstance(regime_data, dict):
                atr_ratio_pct = regime_data.get("atr_ratio")  # 百分比形式
                if atr_ratio_pct is not None and atr_ratio_pct > 0:
                    # atr_ratio 以百分比存储（如 2.0 = 2%），基准为 2%
                    volatility_factor = 1 + (atr_ratio_pct / 2.0)
                    volatility_factor = max(0.5, min(3.0, volatility_factor))
                    timeout_hours = timeout_hours * volatility_factor
        except Exception:
            pass  # ATR 读取失败不影响结算

        if elapsed_hours >= timeout_hours:
            return await self._settle(
                snapshot_id, snapshot, current_price, SettlementStatus.TIMEOUT
            )

        # 记录 checkpoint（±6分钟窗口）
        for h in self.CHECKPOINT_HOURS:
            if abs(elapsed_hours - h) < 0.1:
                await self._record_checkpoint(snapshot_id, h, current_price)

        return None

    # ── 盈亏计算 ──────────────────────────────────────────

    def _calc_pnl_pct(
        self, entry_low: float, entry_high: float, direction: str, settlement_price: float
    ) -> float:
        """计算盈亏百分比。做空方向取反。"""
        entry_mid = (entry_low + entry_high) / 2
        if entry_mid == 0:
            return 0.0
        pnl = (settlement_price - entry_mid) / entry_mid * 100
        if direction == StrategyDirection.SHORT.value:
            pnl = -pnl
        return round(pnl, 4)

    # ── 止损/目标判断 ─────────────────────────────────────

    @staticmethod
    def _hit_stop_loss(direction: str, stop_loss: float, current_price: float) -> bool:
        """判断是否触达止损位。"""
        if direction == StrategyDirection.LONG.value:
            return current_price <= stop_loss
        elif direction == StrategyDirection.SHORT.value:
            return current_price >= stop_loss
        return False

    @staticmethod
    def _hit_any_target(
        direction: str, targets: list[float], current_price: float
    ) -> bool:
        """判断是否触达任一目标位。"""
        for target in targets:
            if direction == StrategyDirection.LONG.value and current_price >= target:
                return True
            if direction == StrategyDirection.SHORT.value and current_price <= target:
                return True
        return False

    # ── Checkpoint 记录 ───────────────────────────────────

    async def _record_checkpoint(
        self, snapshot_id: UUID, hours: int, actual_price: float
    ) -> None:
        """记录 1h/4h/24h/72h 检查点价格（UNIQUE 约束防重复）。"""
        try:
            await self._session.execute(
                text("""
                    INSERT INTO perf_checkpoints (snapshot_id, checkpoint_hours, actual_price)
                    VALUES (:snapshot_id, :hours, :price)
                    ON CONFLICT (snapshot_id, checkpoint_hours) DO NOTHING
                """),
                {
                    "snapshot_id": str(snapshot_id),
                    "hours": hours,
                    "price": actual_price,
                },
            )
            await self._session.commit()
            logger.info(
                "Checkpoint recorded: snapshot=%s, hours=%d, price=%s",
                snapshot_id, hours, actual_price,
            )
        except Exception as exc:
            await self._session.rollback()
            logger.error("记录 checkpoint 失败: %s", exc)

    # ── 统计查询（SQL 聚合） ──────────────────────────────

    async def get_stats(
        self,
        symbol: str | None = None,
        days: int = 30,
        direction: str | None = None,
    ) -> PerformanceStats:
        """计算绩效统计，支持按交易对/时间/方向筛选。使用 SQL 聚合查询。"""
        # 尝试从缓存读取
        cache_key = f"perf_stats:{symbol or 'all'}:{days}"
        if direction:
            cache_key += f":{direction}"
        cached = await get_json(cache_key)
        if cached is not None:
            try:
                return PerformanceStats.model_validate(cached)
            except Exception:
                pass

        # 构建 WHERE 子句
        _age = age_filter("created_at", ":days")
        conditions: list[str] = [_age]
        params: dict = {"days": days}

        if symbol:
            conditions.append("symbol = :symbol")
            params["symbol"] = symbol
        if direction:
            conditions.append("direction = :direction")
            params["direction"] = direction

        where_clause = " AND ".join(conditions)
        _ci = cast_int
        _cf = count_filter
        _af = avg_filter

        # Sharpe ratio: PostgreSQL 支持 STDDEV, SQLite 不支持
        if is_sqlite:
            _sharpe_sql = "0 AS sharpe_ratio"
        else:
            _avg_settled = _af('pnl_pct', "status != 'pending'")
            _sharpe_sql = (
                "ROUND(CAST("
                "COALESCE("
                f"CAST({_avg_settled} AS FLOAT)"
                " / NULLIF(STDDEV(CASE WHEN status != 'pending' THEN pnl_pct END), 0),"
                " 0"
                ") AS NUMERIC"
                "), 4) AS sharpe_ratio"
            )

        result = await self._session.execute(
            text(f"""
                SELECT
                    {_ci('COUNT(*)')}                                      AS total_strategies,
                    {_ci(_cf("status != 'pending'"))}                      AS settled_count,
                    COALESCE(
                        CAST({_cf('pnl_pct > 0')} AS FLOAT)
                        / NULLIF({_cf("status != 'pending'")}, 0),
                        0
                    )                                                      AS win_rate,
                    COALESCE(
                        {_af('pnl_pct', 'pnl_pct > 0')}, 0
                    )                                                      AS avg_profit_pct,
                    COALESCE(
                        {_af('pnl_pct', 'pnl_pct <= 0')}, 0
                    )                                                      AS avg_loss_pct,
                    COALESCE(
                        {_af('pnl_pct', 'pnl_pct > 0')}
                        / NULLIF(ABS({_af('pnl_pct', 'pnl_pct <= 0')}), 0),
                        0
                    )                                                      AS profit_loss_ratio,
                    {_sharpe_sql}
                FROM strategy_snapshots
                WHERE {where_clause}
            """),
            params,
        )
        row = result.mappings().first()

        # 按智能体维度统计信号准确率
        by_agent = await self._get_agent_accuracy(symbol, days, direction)

        stats = PerformanceStats(
            total_strategies=int(row["total_strategies"] or 0) if row else 0,
            settled_count=int(row["settled_count"] or 0) if row else 0,
            win_rate=round(float(row["win_rate"] or 0), 4) if row else 0.0,
            avg_profit_pct=round(float(row["avg_profit_pct"] or 0), 4) if row else 0.0,
            avg_loss_pct=round(float(row["avg_loss_pct"] or 0), 4) if row else 0.0,
            profit_loss_ratio=round(float(row["profit_loss_ratio"] or 0), 4) if row else 0.0,
            sharpe_ratio=round(float(row["sharpe_ratio"] or 0), 4) if row else 0.0,
            by_agent=by_agent,
        )

        # 缓存结果
        try:
            await set_with_ttl(cache_key, stats.model_dump(), _STATS_CACHE_TTL)
        except Exception as exc:
            logger.error("缓存绩效统计失败: %s", exc)

        return stats

    # ── 智能体信号准确率 ──────────────────────────────────

    async def _get_agent_accuracy(
        self,
        symbol: str | None = None,
        days: int = 30,
        direction: str | None = None,
    ) -> dict[str, float]:
        """按智能体维度统计信号准确率。

        逻辑：将 agent_reports 的 signal 与同 symbol 的 strategy_snapshots
        的最终 pnl_pct 关联，bullish 信号对应正盈亏为准确，bearish 对应负盈亏为准确。
        """
        _age_ss = age_filter("ss.created_at", ":days")
        conditions: list[str] = [
            _age_ss,
            "ss.status != 'pending'",
        ]
        params: dict = {"days": days}

        if symbol:
            conditions.append("ss.symbol = :symbol")
            params["symbol"] = symbol
        if direction:
            conditions.append("ss.direction = :direction")
            params["direction"] = direction

        where_clause = " AND ".join(conditions)

        # SQLite does not support EXTRACT(EPOCH FROM ...) or INTERVAL literals
        if is_sqlite:
            _time_diff = "ABS(julianday(ar.created_at) - julianday(ss.created_at))"
            _interval_join = (
                "ar.created_at BETWEEN datetime(ss.created_at, '-1 hour') "
                "AND datetime(ss.created_at, '+1 hour')"
            )
        else:
            _time_diff = "ABS(EXTRACT(EPOCH FROM (ar.created_at - ss.created_at)))"
            _interval_join = (
                "ar.created_at BETWEEN ss.created_at - INTERVAL '1 hour' "
                "AND ss.created_at + INTERVAL '1 hour'"
            )

        _correct_filter = count_filter(
            "(signal = 'bullish' AND pnl_pct > 0) OR (signal = 'bearish' AND pnl_pct < 0)"
        )

        try:
            result = await self._session.execute(
                text(f"""
                    WITH matched AS (
                        SELECT
                            ar.agent_id,
                            ar.signal,
                            ss.pnl_pct,
                            ROW_NUMBER() OVER (
                                PARTITION BY ss.id, ar.agent_id
                                ORDER BY {_time_diff}
                            ) AS rn
                        FROM agent_reports ar
                        JOIN strategy_snapshots ss
                            ON ar.symbol = ss.symbol
                            AND {_interval_join}
                        WHERE {where_clause}
                    )
                    SELECT
                        agent_id,
                        {cast_int('COUNT(*)')} AS total,
                        {cast_int(_correct_filter)} AS correct
                    FROM matched
                    WHERE rn = 1
                    GROUP BY agent_id
                """),
                params,
            )
            rows = result.mappings().all()
            return {
                row["agent_id"]: round(row["correct"] / row["total"], 4)
                if row["total"] > 0
                else 0.0
                for row in rows
            }
        except Exception as exc:
            logger.error("查询智能体准确率失败: %s", exc)
            return {}

    # ── 待结算快照查询 ────────────────────────────────────

    async def get_pending_snapshots(self) -> list[dict]:
        """获取所有待结算的快照（供 Worker 使用）。"""
        try:
            result = await self._session.execute(
                text("""
                    SELECT id, strategy_id, symbol, direction,
                           entry_low, entry_high, stop_loss, targets,
                           confidence, price_at_generation, status, created_at
                    FROM strategy_snapshots
                    WHERE status = 'pending'
                    ORDER BY created_at ASC
                """)
            )
            return [dict(row) for row in result.mappings()]
        except Exception as exc:
            logger.error("查询待结算快照失败: %s", exc)
            return []

    # ── 快照详情与趋势查询 ────────────────────────────────

    async def get_snapshot_detail(self, snapshot_id: UUID) -> dict | None:
        """获取单条快照及其所有 checkpoint，供 API 层返回。"""
        snapshot = await self._get_snapshot(snapshot_id)
        if snapshot is None:
            return None

        try:
            result = await self._session.execute(
                text("""
                    SELECT snapshot_id, checkpoint_hours, actual_price, recorded_at
                    FROM perf_checkpoints
                    WHERE snapshot_id = :snapshot_id
                    ORDER BY checkpoint_hours ASC
                """),
                {"snapshot_id": str(snapshot_id)},
            )
            checkpoints = [dict(row) for row in result.mappings()]
        except Exception as exc:
            logger.error("获取 checkpoint 失败: %s", exc)
            checkpoints = []

        return {
            "snapshot": snapshot,
            "checkpoints": checkpoints,
        }

    async def get_trend_data(self, days: int = 30) -> list[dict]:
        """获取胜率趋势和累计盈亏曲线数据，按天聚合。"""
        _age = age_filter("created_at", ":days")
        _cf = count_filter
        _ci = cast_int
        _sf = sum_filter
        try:
            result = await self._session.execute(
                text(f"""
                    SELECT
                        DATE(created_at) AS date,
                        {_ci(_cf("status != 'pending'"))} AS settled,
                        {_ci(_cf('pnl_pct > 0'))} AS wins,
                        COALESCE(
                            CAST({_cf('pnl_pct > 0')} AS FLOAT)
                            / NULLIF({_cf("status != 'pending'")}, 0),
                            0
                        ) AS win_rate,
                        COALESCE({_sf('pnl_pct', "status != 'pending'")}, 0) AS daily_pnl
                    FROM strategy_snapshots
                    WHERE {_age}
                    GROUP BY DATE(created_at)
                    ORDER BY DATE(created_at) ASC
                """),
                {"days": days},
            )
            rows = result.mappings().all()
        except Exception as exc:
            logger.error("获取趋势数据失败: %s", exc)
            raise

        cumulative_pnl = 0.0
        trend_data: list[dict] = []
        for row in rows:
            cumulative_pnl += float(row["daily_pnl"])
            trend_data.append({
                "date": (
                    row["date"].isoformat()
                    if hasattr(row["date"], "isoformat")
                    else str(row["date"])
                ),
                "win_rate": round(float(row["win_rate"]), 4),
                "cumulative_pnl": round(cumulative_pnl, 4),
            })

        return trend_data

    # ── 内部方法 ──────────────────────────────────────────

    async def _get_strategy(self, strategy_id: UUID) -> dict | None:
        """从 strategies 表获取策略详情。"""
        try:
            result = await self._session.execute(
                text("""
                    SELECT id, symbol, direction, entry_low, entry_high,
                           stop_loss, targets, confidence
                    FROM strategies
                    WHERE id = :strategy_id
                """),
                {"strategy_id": str(strategy_id)},
            )
            row = result.mappings().first()
            if row is None:
                return None
            data = dict(row)
            # 解析 targets JSON
            if isinstance(data["targets"], str):
                data["targets"] = json.loads(data["targets"])
            return data
        except Exception as exc:
            logger.error("查询策略 %s 失败: %s", strategy_id, exc)
            return None

    async def _get_current_price(self, symbol: str) -> float:
        """获取当前价格：先查 Redis latest_price 实时缓存，miss 则查 klines 表最新收盘价。"""
        # 1. 从 latest_price 实时缓存获取（由 Binance WS / KlineScheduler 持续更新）
        try:
            raw = await get_json(f"latest_price:{symbol}")
            if isinstance(raw, (int, float)) and raw > 0:
                return float(raw)
        except Exception:
            pass

        # 2. 尝试从 klines 表获取最新价格
        try:
            result = await self._session.execute(
                text("""
                    SELECT close FROM klines
                    WHERE symbol = :symbol
                    ORDER BY time DESC
                    LIMIT 1
                """),
                {"symbol": symbol},
            )
            row = result.mappings().first()
            if row:
                return float(row["close"])
        except Exception as exc:
            logger.error("查询 %s 最新价格失败: %s", symbol, exc)

        raise ValueError(f"无法获取 {symbol} 的当前价格")

    async def _save_snapshot(self, snapshot: StrategySnapshotCreate) -> UUID:
        """将快照写入 strategy_snapshots 表。"""
        try:
            result = await insert_returning(
                self._session,
                f"""
                    INSERT INTO strategy_snapshots
                        (strategy_id, symbol, direction, entry_low, entry_high,
                         stop_loss, targets, confidence, price_at_generation,
                         user_id, analysis_mode)
                    VALUES
                        (:strategy_id, :symbol, :direction, :entry_low, :entry_high,
                         :stop_loss, {jsonb_cast(':targets')}, :confidence, :price_at_generation,
                         :user_id, :analysis_mode)
                    RETURNING id
                """,
                {
                    "strategy_id": str(snapshot.strategy_id),
                    "symbol": snapshot.symbol,
                    "direction": snapshot.direction.value,
                    "entry_low": snapshot.entry_low,
                    "entry_high": snapshot.entry_high,
                    "stop_loss": snapshot.stop_loss,
                    "targets": json.dumps(snapshot.targets),
                    "confidence": snapshot.confidence,
                    "price_at_generation": snapshot.price_at_generation,
                    "user_id": str(snapshot.user_id) if snapshot.user_id else None,
                    "analysis_mode": snapshot.analysis_mode,
                },
                table="strategy_snapshots",
            )
            row = result.mappings().first()
            snapshot_id = UUID(str(row["id"]))
            await self._session.commit()
            logger.info(
                "快照已创建: snapshot=%s, strategy=%s, symbol=%s",
                snapshot_id, snapshot.strategy_id, snapshot.symbol,
            )
            return snapshot_id
        except Exception as exc:
            await self._session.rollback()
            logger.error("保存快照失败: %s", exc)
            raise

    async def _get_snapshot(self, snapshot_id: UUID) -> dict | None:
        """获取单条快照详情。"""
        try:
            result = await self._session.execute(
                text("""
                    SELECT id, strategy_id, symbol, direction,
                           entry_low, entry_high, stop_loss, targets,
                           confidence, price_at_generation, status,
                           settlement_price, settlement_time, pnl_pct,
                           user_id, analysis_mode, published, created_at
                    FROM strategy_snapshots
                    WHERE id = :snapshot_id
                """),
                {"snapshot_id": str(snapshot_id)},
            )
            row = result.mappings().first()
            return dict(row) if row else None
        except Exception as exc:
            logger.error("查询快照 %s 失败: %s", snapshot_id, exc)
            return None

    async def _settle(
        self,
        snapshot_id: UUID,
        snapshot: dict,
        settlement_price: float,
        status: SettlementStatus,
    ) -> SettlementResult:
        """执行结算：更新快照状态、记录结算价格和盈亏。"""
        pnl_pct = self._calc_pnl_pct(
            entry_low=float(snapshot["entry_low"]),
            entry_high=float(snapshot["entry_high"]),
            direction=snapshot["direction"],
            settlement_price=settlement_price,
        )
        now = datetime.now(timezone.utc)

        try:
            await self._session.execute(
                text("""
                    UPDATE strategy_snapshots
                    SET status = :status,
                        settlement_price = :price,
                        settlement_time = :time,
                        pnl_pct = :pnl_pct
                    WHERE id = :snapshot_id
                """),
                {
                    "status": status.value,
                    "price": settlement_price,
                    "time": now,
                    "pnl_pct": pnl_pct,
                    "snapshot_id": str(snapshot_id),
                },
            )
            await self._session.commit()
            logger.info(
                "策略已结算: snapshot=%s, status=%s, pnl=%.4f%%",
                snapshot_id, status.value, pnl_pct,
            )
        except Exception as exc:
            await self._session.rollback()
            logger.error("结算失败: snapshot=%s, error=%s", snapshot_id, exc)
            raise

        # F3: 策略结算推送（fire-and-forget，不阻塞结算流程）
        asyncio.ensure_future(self._push_settlement(
            symbol=snapshot["symbol"],
            status=status,
            settlement_price=settlement_price,
            pnl_pct=pnl_pct,
        ))

        return SettlementResult(
            snapshot_id=snapshot_id,
            status=status,
            settlement_price=settlement_price,
            settlement_time=now,
            pnl_pct=pnl_pct,
        )

    @staticmethod
    async def _push_settlement(
        symbol: str,
        status: SettlementStatus,
        settlement_price: float,
        pnl_pct: float,
    ) -> None:
        """策略结算推送（F3）— 广播给所有启用该事件的用户。"""
        status_labels = {
            SettlementStatus.HIT_STOP_LOSS: "触达止损",
            SettlementStatus.HIT_TARGET: "触达目标",
            SettlementStatus.TIMEOUT: "超时结算",
        }
        result_emoji = "✅" if pnl_pct > 0 else "❌" if pnl_pct < 0 else "⏱"
        try:
            from app.services.push_dispatcher import broadcast
            from app.core.database import AsyncSessionLocal
            async with AsyncSessionLocal() as session:
                await broadcast(
                    session=session,
                    event_type="strategy_settlement",
                    data={
                        "symbol": symbol,
                        "settlement_type": status_labels.get(status, status.value),
                        "settlement_price": f"{settlement_price:.2f}",
                        "pnl_pct": f"{pnl_pct:+.2f}",
                        "result_emoji": result_emoji,
                    },
                )
        except Exception as exc:
            logger.warning("策略结算推送失败: %s", exc)
