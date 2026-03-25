"""事件合约 API — REST + SSE 接口。

路由:
  GET  /api/event-contracts/live     当前实时信号 + 指标快照
  GET  /api/event-contracts/history  预测历史（分页）
  GET  /api/event-contracts/stats    胜率统计
  POST /api/event-contracts/start    启动预测器（管理员）
  POST /api/event-contracts/stop     停止预测器（管理员）
"""

from __future__ import annotations

import json
import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Query
from app.core.deps import UserInfo, get_current_user, require_admin

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/event-contracts", tags=["event-contracts"])


@router.get("/live")
async def get_live_signal(
    _user: UserInfo = Depends(get_current_user),
) -> dict:
    """获取当前实时信号 + 指标快照。

    优先从 Redis 读取（支持多 Worker 架构），
    回退到本进程的 predictor 实例。
    """
    # 优先从 Redis 读取（任意 Worker 都能响应）
    from app.services.event_predictor import get_live_signal_from_redis
    state = await get_live_signal_from_redis()
    if state:
        return state

    # Redis 无数据 → 尝试本进程的 predictor（单 Worker 回退）
    from app.services.event_predictor import get_predictor
    from app.services.event_rule_engine import evaluate

    predictor = get_predictor()
    if not predictor or not predictor.running:
        return {"status": "offline", "message": "事件合约预测器未启动"}

    metrics = predictor.aggregator.metrics
    if not metrics or not metrics.get("current_price"):
        return {"status": "warming_up", "message": "数据采集中，请稍候"}

    result = evaluate(metrics)
    return {
        "status": "online",
        "symbol": metrics.get("symbol"),
        "current_price": metrics.get("current_price"),
        "prediction": result.to_dict(),
        "metrics": {
            "buy_sell_ratio_30s": metrics.get("buy_sell_ratio_30s"),
            "orderbook_imbalance": metrics.get("orderbook_imbalance"),
            "large_order_flow": metrics.get("large_order_flow"),
            "rsi_1m": metrics.get("rsi_1m"),
            "ema5_vs_ema10": metrics.get("ema5_vs_ema10"),
            "volume_ratio": metrics.get("volume_ratio"),
            "trade_count_30s": metrics.get("trade_count_30s"),
        },
        "updated_at": metrics.get("updated_at"),
    }


@router.get("/history")
async def get_prediction_history(
    _user: UserInfo = Depends(get_current_user),
    symbol: str = "ETHUSDT",
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
) -> dict:
    """获取预测历史（分页）。"""
    from app.core.database import AsyncSessionLocal
    from sqlalchemy import text

    offset = (page - 1) * page_size

    async with AsyncSessionLocal() as session:
        # 总数
        count_row = await session.execute(
            text("SELECT COUNT(*) FROM event_predictions WHERE symbol = :symbol"),
            {"symbol": symbol},
        )
        total = count_row.scalar() or 0

        # 分页查询
        rows = await session.execute(
            text("""
                SELECT id, symbol, round_num, direction, strength,
                       entry_price, settle_price, predict_time, expire_time,
                       result, status, settled_at, signals_detail
                FROM event_predictions
                WHERE symbol = :symbol
                ORDER BY created_at DESC
                LIMIT :limit OFFSET :offset
            """),
            {"symbol": symbol, "limit": page_size, "offset": offset},
        )
        records = []
        for row in rows.mappings():
            signals = None
            if row.get("signals_detail"):
                try:
                    signals = json.loads(row["signals_detail"])
                    # 移除大的 metrics_snapshot 减少传输量
                    signals.pop("metrics_snapshot", None)
                except (json.JSONDecodeError, TypeError):
                    pass
            records.append({
                "id": row["id"],
                "round_num": row["round_num"],
                "direction": row["direction"],
                "strength": row["strength"],
                "entry_price": row["entry_price"],
                "settle_price": row["settle_price"],
                "result": row["result"],
                "status": row["status"],
                "predict_time": row["predict_time"],
                "expire_time": row["expire_time"],
                "settled_at": row["settled_at"],
                "signals": signals,
            })

    return {
        "symbol": symbol,
        "total": total,
        "page": page,
        "page_size": page_size,
        "records": records,
    }


@router.get("/stats")
async def get_stats(
    _user: UserInfo = Depends(get_current_user),
    symbol: str = "ETHUSDT",
) -> dict:
    """获取胜率统计（今日 / 7日 / 30日 / 总计）。"""
    from app.core.database import AsyncSessionLocal
    from app.core.sql_compat import now_minus_interval_literal
    from sqlalchemy import text

    async with AsyncSessionLocal() as session:
        # 今日
        today_row = await session.execute(
            text("""
                SELECT COALESCE(SUM(total), 0) as total,
                       COALESCE(SUM(wins), 0) as wins,
                       COALESCE(SUM(losses), 0) as losses,
                       COALESCE(SUM(skipped), 0) as skipped
                FROM event_stats
                WHERE symbol = :symbol AND date = CURRENT_DATE
            """),
            {"symbol": symbol},
        )
        today = dict(today_row.mappings().first() or {})

        # 7日（修复 #16 — 使用兼容语法）
        _7d_cutoff = now_minus_interval_literal(7, "days")
        week_row = await session.execute(
            text(f"""
                SELECT COALESCE(SUM(total), 0) as total,
                       COALESCE(SUM(wins), 0) as wins,
                       COALESCE(SUM(losses), 0) as losses,
                       COALESCE(SUM(skipped), 0) as skipped
                FROM event_stats
                WHERE symbol = :symbol AND date >= {_7d_cutoff}
            """),
            {"symbol": symbol},
        )
        week = dict(week_row.mappings().first() or {})

        # 30日
        _30d_cutoff = now_minus_interval_literal(30, "days")
        month_row = await session.execute(
            text(f"""
                SELECT COALESCE(SUM(total), 0) as total,
                       COALESCE(SUM(wins), 0) as wins,
                       COALESCE(SUM(losses), 0) as losses,
                       COALESCE(SUM(skipped), 0) as skipped
                FROM event_stats
                WHERE symbol = :symbol AND date >= {_30d_cutoff}
            """),
            {"symbol": symbol},
        )
        month = dict(month_row.mappings().first() or {})

        # 总计
        all_row = await session.execute(
            text("""
                SELECT COALESCE(SUM(total), 0) as total,
                       COALESCE(SUM(wins), 0) as wins,
                       COALESCE(SUM(losses), 0) as losses,
                       COALESCE(SUM(skipped), 0) as skipped
                FROM event_stats
                WHERE symbol = :symbol
            """),
            {"symbol": symbol},
        )
        all_time = dict(all_row.mappings().first() or {})

    def _add_rate(d: dict) -> dict:
        decided = d.get("wins", 0) + d.get("losses", 0)
        d["win_rate"] = round(d["wins"] / decided * 100, 1) if decided > 0 else 0.0
        d["decided"] = decided
        # draws = total - wins - losses - skipped（平局数）
        d["draws"] = max(0, d.get("total", 0) - d.get("wins", 0) - d.get("losses", 0) - d.get("skipped", 0))
        return d

    return {
        "symbol": symbol,
        "today": _add_rate(today),
        "7d": _add_rate(week),
        "30d": _add_rate(month),
        "all_time": _add_rate(all_time),
    }


# ── 管理员控制端点 ──────────────────────────────────────────

@router.post("/start")
async def start_predictor_endpoint(
    symbol: str = "ETHUSDT",
    _admin: UserInfo = Depends(require_admin),
) -> dict:
    """启动事件合约预测器（管理员）。"""
    from app.services.event_predictor import start_predictor
    predictor = await start_predictor(symbol)
    return {"status": "started", "symbol": symbol}


@router.post("/stop")
async def stop_predictor_endpoint(
    _admin: UserInfo = Depends(require_admin),
) -> dict:
    """停止事件合约预测器（管理员）。"""
    from app.services.event_predictor import stop_predictor
    await stop_predictor()
    return {"status": "stopped"}


@router.get("/status")
async def get_predictor_status(
    _admin: UserInfo = Depends(require_admin),
) -> dict:
    """获取预测器运行状态（管理员）。优先从 Redis 读取。"""
    from app.services.event_predictor import get_predictor_status_from_redis, get_predictor

    # 优先从 Redis 读（任意 Worker 可响应）
    redis_status = await get_predictor_status_from_redis()
    if redis_status.get("running"):
        # 如果本进程有 predictor 实例，补充 aggregator 信息
        predictor = get_predictor()
        if predictor and predictor.running:
            redis_status["aggregator_running"] = predictor.aggregator.running
            redis_status["current_metrics"] = predictor.aggregator.metrics or {}
        return redis_status

    # Redis 无状态 → 回退本进程
    predictor = get_predictor()
    if not predictor:
        return {"running": False}
    return {
        "running": predictor.running,
        "symbol": predictor.symbol,
        "aggregator_running": predictor.aggregator.running,
        "current_metrics": predictor.aggregator.metrics or {},
    }
