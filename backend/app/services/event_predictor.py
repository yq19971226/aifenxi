"""事件合约预测器 — 每轮自动预测循环。

流程：
1. 合约开始 → 等待 60-90 秒采集数据
2. 调用规则引擎 → 出预测或跳过
3. 记录 prediction 到数据库
4. 到期后由 event_settler 判定胜负
"""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timedelta, timezone
from typing import Any

from app.services.event_ws_stream import EventStreamAggregator
from app.services.event_rule_engine import evaluate, SignalResult

# ── Redis 状态 key（多 Worker 共享）──────────────────────────
_REDIS_STATE_KEY = "event_predictor:state"   # 实时信号 + 指标
_REDIS_STATUS_KEY = "event_predictor:status"  # running / stopped
_REDIS_STATE_TTL = 30  # 30 秒过期（5 秒刷新一次）

logger = logging.getLogger(__name__)

_ROUND_DURATION = 600       # 10 分钟一轮
_DECISION_DELAY = 75        # 开局等待 75 秒后决策
_SETTLE_BUFFER = 15         # 到期后等 15 秒再结算（价格确认）
_SETTLE_RETRY_MAX = 3       # 结算失败最大重试次数
_LARGE_ORDER_MIN_DIFF = 50000  # 大单净差最小阈值（USDT）

# ── 全局状态 ──
_predictor_instance: EventPredictor | None = None


class EventPredictor:
    """事件合约预测器 — 持续运行的预测循环。"""

    def __init__(self, symbol: str = "ETHUSDT") -> None:
        self.symbol = symbol
        self._aggregator = EventStreamAggregator(symbol)
        self._running = False
        self._current_round: int = 0
        self._round_expire_time: datetime | None = None
        self._round_predict_time: datetime | None = None
        self._task: asyncio.Task | None = None
        self._aggregator_task: asyncio.Task | None = None
        self._pending_cleanup_task: asyncio.Task | None = None
        self._redis_publish_task: asyncio.Task | None = None

    @property
    def running(self) -> bool:
        return self._running

    @property
    def aggregator(self) -> EventStreamAggregator:
        return self._aggregator

    async def start(self) -> None:
        """启动预测循环 + 数据聚合器。"""
        if self._running:
            return
        self._running = True
        logger.info("EventPredictor start() called, symbol=%s", self.symbol)

        # 确保数据库表存在（失败不阻止启动）
        try:
            await _ensure_tables()
        except Exception as exc:
            logger.error("ensure_tables_error (non-fatal): %s", exc)

        # 从 DB 恢复 round_num（失败不阻止启动）
        try:
            await self._restore_round_num()
        except Exception as exc:
            logger.error("restore_round_num_error (non-fatal): %s", exc)

        # 恢复重启前遗留的 pending 记录（失败不阻止启动）
        try:
            await self._recover_pending_on_startup()
        except Exception as exc:
            logger.error("recover_pending_error (non-fatal): %s", exc)

        # 启动 WebSocket 聚合器（后台）
        self._aggregator_task = asyncio.create_task(self._aggregator.start())

        # 启动预测循环
        self._task = asyncio.create_task(self._prediction_loop())

        # 启动 pending 清理任务（修复 #12）
        self._pending_cleanup_task = asyncio.create_task(self._pending_cleanup_loop())

        # 启动 Redis 状态发布循环（多 Worker 共享）
        self._redis_publish_task = asyncio.create_task(self._redis_state_publish_loop())

        # 写入 running 状态到 Redis
        await self._set_redis_status("running")

        logger.info("EventPredictor started", extra={"symbol": self.symbol, "resume_round": self._current_round})

    async def stop(self) -> None:
        self._running = False
        await self._aggregator.stop()
        if self._aggregator_task:
            self._aggregator_task.cancel()
        if self._task:
            self._task.cancel()
        if self._pending_cleanup_task:
            self._pending_cleanup_task.cancel()
        if self._redis_publish_task:
            self._redis_publish_task.cancel()
        # 清除 Redis 状态
        await self._set_redis_status("stopped")
        await self._clear_redis_state()
        logger.info("EventPredictor stopped", extra={"symbol": self.symbol})

    async def _redis_state_publish_loop(self) -> None:
        """每 5 秒将实时信号 + 指标快照发布到 Redis，供其他 Worker 读取。"""
        while self._running:
            try:
                await asyncio.sleep(5)
                if not self._running:
                    break
                metrics = self._aggregator.metrics
                if not metrics or not metrics.get("current_price"):
                    # 数据还没准备好，写一个 warming_up 状态
                    state = {
                        "status": "warming_up",
                        "symbol": self.symbol,
                        "message": "数据采集中，请稍候",
                    }
                else:
                    result = evaluate(metrics)
                    state = {
                        "status": "online",
                        "symbol": metrics.get("symbol"),
                        "current_price": metrics.get("current_price"),
                        "prediction": result.to_dict(),
                        "updated_at": metrics.get("updated_at"),
                        "round_num": self._current_round,
                        "round_expire_time": self._round_expire_time.isoformat() if self._round_expire_time else None,
                        "round_predict_time": self._round_predict_time.isoformat() if self._round_predict_time else None,
                    }
                import json
                from app.core.redis import get_redis_pool
                r = get_redis_pool()
                await r.setex(
                    _REDIS_STATE_KEY,
                    _REDIS_STATE_TTL,
                    json.dumps(state, default=str),
                )
            except asyncio.CancelledError:
                break
            except Exception as exc:
                logger.warning("redis_state_publish_error: %s", exc)

    async def _set_redis_status(self, status: str) -> None:
        """写入预测器运行状态到 Redis。"""
        try:
            import json
            from app.core.redis import get_redis_pool
            r = get_redis_pool()
            data = json.dumps({
                "running": status == "running",
                "symbol": self.symbol,
                "status": status,
                "current_round": self._current_round,
            })
            await r.setex(_REDIS_STATUS_KEY, 120, data)  # 2 分钟 TTL
        except Exception as exc:
            logger.warning("set_redis_status_error: %s", exc)

    async def _clear_redis_state(self) -> None:
        """清除 Redis 中的实时状态。"""
        try:
            from app.core.redis import get_redis_pool
            r = get_redis_pool()
            await r.delete(_REDIS_STATE_KEY)
        except Exception as exc:
            logger.warning("clear_redis_state_error: %s", exc)

    async def _prediction_loop(self) -> None:
        """每轮预测循环。"""
        logger.warning("prediction_loop started, warm-up 30s...")
        await asyncio.sleep(30)
        logger.warning("warm-up done, entering round loop")

        while self._running:
            try:
                await self._run_one_round()
            except asyncio.CancelledError:
                break
            except Exception as exc:
                import traceback
                tb = traceback.format_exc()
                logger.error(
                    "prediction_round_error",
                    extra={"error": str(exc), "traceback": tb},
                )
                await asyncio.sleep(30)

    async def _run_one_round(self) -> None:
        """执行单轮预测。"""
        self._current_round += 1
        round_start = datetime.now(timezone.utc)
        expire_time = round_start + timedelta(seconds=_ROUND_DURATION)
        self._round_expire_time = expire_time
        self._round_predict_time = None  # 尚未出信号

        print(f"[PREDICTOR] Round {self._current_round} started", flush=True)
        logger.warning(
            "[PREDICTOR] Round %d started (will decide at +%ds, expire at +%ds)",
            self._current_round, _DECISION_DELAY, _ROUND_DURATION,
        )

        # 等待数据采集
        await asyncio.sleep(_DECISION_DELAY)

        if not self._running:
            return

        # 获取当前指标快照
        metrics = self._aggregator.metrics
        has_price = bool(metrics and metrics.get("current_price"))
        if not has_price:
            logger.warning("[PREDICTOR] Round %d: no metrics available, skipping", self._current_round)
            ok = await self._record_prediction(
                round_num=self._current_round,
                direction=None,
                strength=0.0,
                entry_price=0.0,
                predict_time=datetime.now(timezone.utc),
                expire_time=expire_time,
                signals_detail={"reason": "no_metrics"},
                status="skipped",
            )
            print(f"[PREDICTOR] Round {self._current_round}: skip record_ok={ok}", flush=True)
            # skipped 也写入 event_stats（修复 #3）
            if ok:
                await self._record_skipped_stat()
            # 等待本轮结束
            remaining = (expire_time - datetime.now(timezone.utc)).total_seconds()
            if remaining > 0:
                await asyncio.sleep(remaining)
            return

        # 调用规则引擎
        result = evaluate(metrics)
        predict_time = datetime.now(timezone.utc)
        self._round_predict_time = predict_time
        entry_price = metrics["current_price"]

        if result.direction is None:
            # 信号不足，跳过
            logger.warning(
                "[PREDICTOR] Round %d: signal insufficient, skipping (primary=%.1f, secondary=%.1f)",
                self._current_round, result.primary_score, result.secondary_score,
            )
            ok = await self._record_prediction(
                round_num=self._current_round,
                direction=None,
                strength=result.strength,
                entry_price=entry_price,
                predict_time=predict_time,
                expire_time=expire_time,
                signals_detail=result.to_dict(),
                status="skipped",
            )
            print(f"[PREDICTOR] Round {self._current_round}: skip record_ok={ok}", flush=True)
            # skipped 也写入 event_stats（修复 #3）
            if ok:
                await self._record_skipped_stat()
        else:
            logger.warning(
                "[PREDICTOR] Round %d: predicted %s (strength=%.2f, primary=%.1f, secondary=%.1f)",
                self._current_round, result.direction, result.strength,
                result.primary_score, result.secondary_score,
            )
            ok = await self._record_prediction(
                round_num=self._current_round,
                direction=result.direction,
                strength=result.strength,
                entry_price=entry_price,
                predict_time=predict_time,
                expire_time=expire_time,
                signals_detail={**result.to_dict(), "metrics_snapshot": metrics},
                status="pending",
            )

        # 等待到期
        remaining_to_expire = (expire_time - datetime.now(timezone.utc)).total_seconds()
        if remaining_to_expire > 0:
            await asyncio.sleep(remaining_to_expire)

        # 到期瞬间拍快照（修复 #1 — 结算价必须是到期时刻的价格）
        expire_snapshot_price = self._aggregator.metrics.get("current_price", 0.0)

        # 等待缓冲
        await asyncio.sleep(_SETTLE_BUFFER)

        # 自动结算（使用快照价格）
        if result.direction is not None:
            await self._settle_round(self._current_round, expire_time, expire_snapshot_price)

    async def _record_prediction(
        self,
        round_num: int,
        direction: str | None,
        strength: float,
        entry_price: float,
        predict_time: datetime,
        expire_time: datetime,
        signals_detail: dict,
        status: str,
    ) -> bool:
        """写入预测记录到数据库。返回 True 表示成功（修复 #13）。"""
        try:
            from app.core.database import AsyncSessionLocal
            from sqlalchemy import text
            import json

            async with AsyncSessionLocal() as session:
                await session.execute(
                    text("""
                        INSERT INTO event_predictions
                        (symbol, round_num, direction, strength, signals_detail,
                         entry_price, predict_time, expire_time, status)
                        VALUES (:symbol, :round_num, :direction, :strength, :signals_detail,
                                :entry_price, :predict_time, :expire_time, :status)
                    """),
                    {
                        "symbol": self.symbol,
                        "round_num": round_num,
                        "direction": direction,
                        "strength": strength,
                        "signals_detail": json.dumps(signals_detail),
                        "entry_price": entry_price,
                        "predict_time": predict_time,
                        "expire_time": expire_time,
                        "status": status,
                    },
                )
                await session.commit()
            return True
        except Exception as exc:
            logger.error("record_prediction_error", extra={"error": str(exc), "round": round_num})
            return False

    async def _settle_round(
        self,
        round_num: int,
        expire_time: datetime,
        expire_snapshot_price: float = 0.0,
    ) -> None:
        """结算单轮预测。使用到期快照价格（修复 #1）。"""
        for attempt in range(1, _SETTLE_RETRY_MAX + 1):
            try:
                # 优先使用到期快照价格（修复 #1）
                settle_price = expire_snapshot_price
                if not settle_price:
                    settle_price = self._aggregator.metrics.get("current_price", 0.0)
                if not settle_price:
                    from app.core.redis import get_redis_pool
                    r = get_redis_pool()
                    raw = await r.get(f"latest_price:{self.symbol}")
                    settle_price = float(raw) if raw else 0.0

                from app.core.database import AsyncSessionLocal
                from sqlalchemy import text

                async with AsyncSessionLocal() as session:
                    # 读取预测记录
                    row = await session.execute(
                        text("""
                            SELECT id, direction, entry_price FROM event_predictions
                            WHERE symbol = :symbol AND round_num = :round_num AND status = 'pending'
                            ORDER BY predict_time DESC LIMIT 1
                        """),
                        {"symbol": self.symbol, "round_num": round_num},
                    )
                    pred = row.mappings().first()
                    if not pred:
                        return

                    direction = pred["direction"]
                    entry_price = float(pred["entry_price"])

                    # 判定胜负（修复 #2 — 平局不计入胜负）
                    if settle_price == entry_price:
                        result = "draw"
                    elif direction == "up":
                        result = "win" if settle_price > entry_price else "lose"
                    else:
                        result = "win" if settle_price < entry_price else "lose"

                    # 更新记录
                    await session.execute(
                        text("""
                            UPDATE event_predictions
                            SET settle_price = :settle_price,
                                result = :result,
                                status = 'settled',
                                settled_at = :settled_at
                            WHERE id = :id AND status = 'pending'
                        """),
                        {
                            "settle_price": settle_price,
                            "result": result,
                            "settled_at": datetime.now(timezone.utc),
                            "id": pred["id"],
                        },
                    )
                    await session.commit()  # 先提交预测结算（关键数据）

                    # 更新日统计（独立 commit，失败不回滚结算）
                    try:
                        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
                        await session.execute(
                            text("""
                                INSERT INTO event_stats (symbol, date, total, wins, losses, skipped)
                                VALUES (:symbol, :date, 1,
                                        CASE WHEN :result = 'win' THEN 1 ELSE 0 END,
                                        CASE WHEN :result = 'lose' THEN 1 ELSE 0 END,
                                        0)
                                ON CONFLICT (symbol, date)
                                DO UPDATE SET
                                    total = event_stats.total + 1,
                                    wins = event_stats.wins + CASE WHEN :result = 'win' THEN 1 ELSE 0 END,
                                    losses = event_stats.losses + CASE WHEN :result = 'lose' THEN 1 ELSE 0 END
                            """),
                            {"symbol": self.symbol, "date": today, "result": result},
                        )
                        await session.commit()
                    except Exception as stats_exc:
                        logger.warning("stats_update_failed (prediction already settled): %s", stats_exc)

                    logger.info(
                        "Round %d settled: %s (predicted=%s, entry=%.2f, settle=%.2f, diff=%.4f%%)",
                        round_num, result, direction, entry_price, settle_price,
                        (settle_price - entry_price) / entry_price * 100 if entry_price else 0,
                    )
                return  # 成功 → 退出重试循环

            except Exception as exc:
                logger.error(
                    "settle_round_error (attempt %d/%d)",
                    attempt, _SETTLE_RETRY_MAX,
                    extra={"error": str(exc), "round": round_num},
                )
                if attempt < _SETTLE_RETRY_MAX:
                    await asyncio.sleep(5)  # 等 5 秒重试

    async def _restore_round_num(self) -> None:
        """从 DB 恢复 round_num，避免重启后编号重复（修复 #4）。"""
        try:
            from app.core.database import AsyncSessionLocal
            from sqlalchemy import text

            async with AsyncSessionLocal() as session:
                row = await session.execute(
                    text("SELECT MAX(round_num) FROM event_predictions WHERE symbol = :symbol"),
                    {"symbol": self.symbol},
                )
                max_round = row.scalar()
                if max_round and max_round > 0:
                    self._current_round = max_round
                    logger.info("Restored round_num=%d from DB", max_round)
        except Exception as exc:
            logger.warning("restore_round_num_error", extra={"error": str(exc)})

    async def _record_skipped_stat(self) -> None:
        """将 skipped 轮次写入 event_stats（修复 #3）。"""
        try:
            from app.core.database import AsyncSessionLocal
            from sqlalchemy import text

            today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
            async with AsyncSessionLocal() as session:
                await session.execute(
                    text("""
                        INSERT INTO event_stats (symbol, date, total, wins, losses, skipped)
                        VALUES (:symbol, :date, 1, 0, 0, 1)
                        ON CONFLICT (symbol, date)
                        DO UPDATE SET
                            total = event_stats.total + 1,
                            skipped = event_stats.skipped + 1
                    """),
                    {"symbol": self.symbol, "date": today},
                )
                await session.commit()
        except Exception as exc:
            logger.warning("record_skipped_stat_error", extra={"error": str(exc)})

    async def _pending_cleanup_loop(self) -> None:
        """定期清理超时 pending 记录（修复 #12）。

        每 5 分钟扫描一次，将已过期超过 20 分钟仍为 pending 的记录标记为 expired。
        """
        while self._running:
            try:
                await asyncio.sleep(300)  # 每 5 分钟检查
                if not self._running:
                    break
                from app.core.database import AsyncSessionLocal
                from sqlalchemy import text

                async with AsyncSessionLocal() as session:
                    result = await session.execute(
                        text("""
                            UPDATE event_predictions
                            SET status = 'expired', result = 'error'
                            WHERE symbol = :symbol
                              AND status = 'pending'
                              AND expire_time < :cutoff
                        """),
                        {
                            "symbol": self.symbol,
                            "cutoff": datetime.now(timezone.utc) - timedelta(minutes=20),
                        },
                    )
                    if result.rowcount and result.rowcount > 0:
                        await session.commit()
                        logger.warning(
                            "Cleaned up %d expired pending predictions", result.rowcount,
                        )
            except asyncio.CancelledError:
                break
            except Exception as exc:
                logger.warning("pending_cleanup_error", extra={"error": str(exc)})

    async def _recover_pending_on_startup(self) -> None:
        """启动时清理上一次运行遗留的 pending 记录。

        服务器重建/重启后，之前未结算的 pending 记录无法再正常结算
        （因为已错过到期时间窗口），直接标记为 expired。
        """
        try:
            from app.core.database import AsyncSessionLocal
            from sqlalchemy import text

            async with AsyncSessionLocal() as session:
                result = await session.execute(
                    text("""
                        UPDATE event_predictions
                        SET status = 'expired', result = 'restart'
                        WHERE symbol = :symbol AND status = 'pending'
                    """),
                    {"symbol": self.symbol},
                )
                if result.rowcount and result.rowcount > 0:
                    await session.commit()
                    logger.warning(
                        "Recovered %d orphaned pending predictions from previous session",
                        result.rowcount,
                    )
                else:
                    logger.info("No orphaned pending predictions found")
        except Exception as exc:
            logger.warning("recover_pending_on_startup_error", extra={"error": str(exc)})


# ── 数据库建表 ──────────────────────────────────────────────

async def _ensure_tables() -> None:
    """确保 event_predictions 和 event_stats 表存在。"""
    from app.core.database import AsyncSessionLocal
    from app.core.sql_compat import serial_pk, varchar, timestamptz_default
    from sqlalchemy import text

    async with AsyncSessionLocal() as session:
        _spk = serial_pk()
        _v20 = varchar(20)
        _v10 = varchar(10)
        _ts = timestamptz_default()

        await session.execute(text(f"""
            CREATE TABLE IF NOT EXISTS event_predictions (
                id {_spk},
                symbol {_v20} NOT NULL,
                round_num INTEGER NOT NULL,
                direction {_v10},
                strength REAL DEFAULT 0,
                signals_detail TEXT,
                entry_price REAL DEFAULT 0,
                settle_price REAL,
                predict_time {_ts},
                expire_time {_ts},
                result {_v10},
                status {_v20} DEFAULT 'pending',
                settled_at {_ts},
                created_at {_ts}
            )
        """))
        await session.execute(text("""
            CREATE INDEX IF NOT EXISTS idx_event_pred_symbol_status
            ON event_predictions (symbol, status)
        """))
        await session.execute(text("""
            CREATE INDEX IF NOT EXISTS idx_event_pred_created
            ON event_predictions (created_at DESC)
        """))

        await session.execute(text(f"""
            CREATE TABLE IF NOT EXISTS event_stats (
                id {_spk},
                symbol {_v20} NOT NULL,
                date DATE NOT NULL,
                total INTEGER DEFAULT 0,
                wins INTEGER DEFAULT 0,
                losses INTEGER DEFAULT 0,
                skipped INTEGER DEFAULT 0,
                created_at {_ts},
                UNIQUE(symbol, date)
            )
        """))
        await session.commit()
        logger.info("event_predictions and event_stats tables ensured")


# ── Redis 分布式锁（防多 Worker 重复启动）───────────────────

_LOCK_KEY = "event_predictor:lock"
_LOCK_TTL = 60          # 锁有效期 60 秒
_LOCK_RENEW_INTERVAL = 30  # 每 30 秒续约一次
_lock_id: str | None = None  # 当前进程的锁 ID
_lock_renew_task: asyncio.Task | None = None


async def _acquire_lock() -> bool:
    """尝试获取 Redis 分布式锁。成功返回 True。"""
    global _lock_id
    try:
        import uuid
        from app.core.redis import get_redis_pool
        r = get_redis_pool()
        _lock_id = str(uuid.uuid4())
        acquired = await r.set(_LOCK_KEY, _lock_id, nx=True, ex=_LOCK_TTL)
        if acquired:
            logger.info("Acquired event_predictor lock: %s", _lock_id)
            return True
        existing = await r.get(_LOCK_KEY)
        logger.info("event_predictor lock held by another worker: %s", existing)
        return False
    except Exception as exc:
        logger.warning("acquire_lock_error: %s", exc)
        return False


async def _release_lock() -> None:
    """释放 Redis 分布式锁。"""
    global _lock_id, _lock_renew_task
    if _lock_renew_task:
        _lock_renew_task.cancel()
        _lock_renew_task = None
    if not _lock_id:
        return
    try:
        from app.core.redis import get_redis_pool
        r = get_redis_pool()
        # 只释放自己持有的锁
        current = await r.get(_LOCK_KEY)
        if current == _lock_id:
            await r.delete(_LOCK_KEY)
            logger.info("Released event_predictor lock: %s", _lock_id)
    except Exception as exc:
        logger.warning("release_lock_error: %s", exc)
    finally:
        _lock_id = None


async def _lock_renew_loop() -> None:
    """后台续约锁，防止长时间运行后锁过期被其他 Worker 抢走。"""
    global _predictor_instance
    while True:
        try:
            await asyncio.sleep(_LOCK_RENEW_INTERVAL)
            if not _lock_id:
                break
            from app.core.redis import get_redis_pool
            r = get_redis_pool()
            current = await r.get(_LOCK_KEY)
            if current == _lock_id:
                await r.expire(_LOCK_KEY, _LOCK_TTL)
            else:
                logger.error("Lock lost! Another worker took it: %s. Stopping predictor.", current)
                # 主动停止预测器，防止双实例运行
                if _predictor_instance and _predictor_instance.running:
                    asyncio.create_task(_predictor_instance.stop())
                    _predictor_instance = None
                break
        except asyncio.CancelledError:
            break
        except Exception as exc:
            logger.warning("lock_renew_error: %s", exc)


# ── 模块级接口 ──────────────────────────────────────────────

def get_predictor() -> EventPredictor | None:
    return _predictor_instance


async def start_predictor(symbol: str = "ETHUSDT") -> EventPredictor:
    """启动预测器。使用 Redis 锁确保多 Worker 环境只有一个实例运行。"""
    global _predictor_instance, _lock_renew_task
    logger.info("start_predictor called, symbol=%s", symbol)
    if _predictor_instance and _predictor_instance.running:
        return _predictor_instance

    # 获取分布式锁
    lock_acquired = await _acquire_lock()
    logger.info("lock acquired: %s", lock_acquired)
    if not lock_acquired:
        logger.info("EventPredictor skipped: another worker holds the lock")
        return None  # type: ignore[return-value]

    # 启动锁续约
    _lock_renew_task = asyncio.create_task(_lock_renew_loop())

    _predictor_instance = EventPredictor(symbol)
    await _predictor_instance.start()
    logger.info("predictor started successfully")
    return _predictor_instance


async def stop_predictor() -> None:
    global _predictor_instance
    if _predictor_instance:
        await _predictor_instance.stop()
        _predictor_instance = None
    await _release_lock()


async def get_live_signal_from_redis() -> dict | None:
    """从 Redis 读取预测器实时信号（任意 Worker 可调用）。"""
    try:
        import json
        from app.core.redis import get_redis_pool
        r = get_redis_pool()
        raw = await r.get(_REDIS_STATE_KEY)
        if raw:
            return json.loads(raw)
    except Exception as exc:
        logger.warning("get_live_signal_from_redis_error: %s", exc)
    return None


async def get_predictor_status_from_redis() -> dict:
    """从 Redis 读取预测器运行状态（任意 Worker 可调用）。"""
    try:
        import json
        from app.core.redis import get_redis_pool
        r = get_redis_pool()
        raw = await r.get(_REDIS_STATUS_KEY)
        if raw:
            return json.loads(raw)
    except Exception as exc:
        logger.warning("get_predictor_status_from_redis_error: %s", exc)
    return {"running": False, "status": "unknown"}
