"""策略回测仪表盘 API — 聚合历史策略快照生成回测报告。

G1: 从 strategy_snapshots 表聚合统计数据
- 总交易数/胜率/总收益率/最大回撤/盈亏比
- 按天收益曲线 + 持有不动 benchmark 对比
- 免费用户限制 7 天，付费 30/90/180 天
"""

import logging

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import UserInfo, get_current_user
from app.core.sql_compat import is_sqlite, cast_int, count_filter, avg_filter, age_filter
from app.services.subscription import get_membership

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/backtest", tags=["backtest"])

# 免费用户最大天数
_FREE_MAX_DAYS = 7
_PAID_MAX_DAYS = 180


async def _get_max_days(session: AsyncSession, user_id: str) -> int:
    """根据会员等级返回允许的最大回测天数。"""
    try:
        membership = await get_membership(session, str(user_id))
        if membership.level >= 1:
            return _PAID_MAX_DAYS
        return _FREE_MAX_DAYS
    except Exception:
        return _FREE_MAX_DAYS


@router.get("/summary")
async def backtest_summary(
    days: int = Query(30, ge=1, le=180),
    symbol: str | None = Query(None),
    user: UserInfo = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> dict:
    """回测摘要 — 总交易数/胜率/收益率/最大回撤/盈亏比 + 收益曲线。"""
    max_days = await _get_max_days(session, str(user.id))
    actual_days = min(days, max_days)
    is_limited = days > max_days

    _age = age_filter("created_at", ":days")
    conditions = [
        _age,
        "status != 'pending'",
    ]
    params: dict = {"days": actual_days}

    if symbol:
        conditions.append("symbol = :symbol")
        params["symbol"] = symbol.upper()

    where = " AND ".join(conditions)

    try:
        # 聚合统计
        _ci = cast_int
        _cf = count_filter
        _af = avg_filter
        stats_result = await session.execute(
            text(f"""
                SELECT
                    {_ci('COUNT(*)')} AS total_trades,
                    {_ci(_cf('pnl_pct > 0'))} AS wins,
                    {_ci(_cf('pnl_pct <= 0'))} AS losses,
                    COALESCE(
                        CAST({_cf('pnl_pct > 0')} AS FLOAT)
                        / NULLIF(COUNT(*), 0), 0
                    ) AS win_rate,
                    COALESCE(SUM(pnl_pct), 0) AS total_return_pct,
                    COALESCE(AVG(pnl_pct), 0) AS avg_return_pct,
                    COALESCE({_af('pnl_pct', 'pnl_pct > 0')}, 0) AS avg_win_pct,
                    COALESCE({_af('pnl_pct', 'pnl_pct <= 0')}, 0) AS avg_loss_pct,
                    COALESCE(
                        {_af('pnl_pct', 'pnl_pct > 0')}
                        / NULLIF(ABS({_af('pnl_pct', 'pnl_pct <= 0')}), 0),
                        0
                    ) AS profit_loss_ratio,
                    COALESCE(MAX(pnl_pct), 0) AS best_trade_pct,
                    COALESCE(MIN(pnl_pct), 0) AS worst_trade_pct
                FROM strategy_snapshots
                WHERE {where}
            """),
            params,
        )
        stats_row = stats_result.mappings().first()

        # 按天收益曲线
        curve_result = await session.execute(
            text(f"""
                SELECT
                    DATE(created_at) AS date,
                    {_ci('COUNT(*)')} AS trades,
                    COALESCE(SUM(pnl_pct), 0) AS daily_return_pct,
                    {_ci(_cf('pnl_pct > 0'))} AS daily_wins
                FROM strategy_snapshots
                WHERE {where}
                GROUP BY DATE(created_at)
                ORDER BY DATE(created_at)
            """),
            params,
        )
        curve_rows = curve_result.mappings().all()

        # 计算累计收益和最大回撤
        cumulative = 0.0
        peak = 0.0
        max_drawdown = 0.0
        equity_curve = []

        for row in curve_rows:
            daily_ret = float(row["daily_return_pct"])
            cumulative += daily_ret
            if cumulative > peak:
                peak = cumulative
            dd = peak - cumulative
            if dd > max_drawdown:
                max_drawdown = dd

            equity_curve.append({
                "date": row["date"].isoformat(),
                "trades": row["trades"],
                "daily_return_pct": round(daily_ret, 4),
                "cumulative_return_pct": round(cumulative, 4),
                "daily_wins": row["daily_wins"],
            })

        # Benchmark: 持有不动收益（从第一天到最后一天的价格变化）
        benchmark = await _get_benchmark(session, actual_days, symbol)

        return {
            "days": actual_days,
            "is_limited": is_limited,
            "max_days": max_days,
            "symbol": symbol,
            "stats": {
                "total_trades": stats_row["total_trades"] if stats_row else 0,
                "wins": stats_row["wins"] if stats_row else 0,
                "losses": stats_row["losses"] if stats_row else 0,
                "win_rate": round(float(stats_row["win_rate"]), 4) if stats_row else 0,
                "total_return_pct": round(float(stats_row["total_return_pct"]), 4) if stats_row else 0,
                "avg_return_pct": round(float(stats_row["avg_return_pct"]), 4) if stats_row else 0,
                "avg_win_pct": round(float(stats_row["avg_win_pct"]), 4) if stats_row else 0,
                "avg_loss_pct": round(float(stats_row["avg_loss_pct"]), 4) if stats_row else 0,
                "profit_loss_ratio": round(float(stats_row["profit_loss_ratio"]), 4) if stats_row else 0,
                "max_drawdown_pct": round(max_drawdown, 4),
                "best_trade_pct": round(float(stats_row["best_trade_pct"]), 4) if stats_row else 0,
                "worst_trade_pct": round(float(stats_row["worst_trade_pct"]), 4) if stats_row else 0,
            },
            "equity_curve": equity_curve,
            "benchmark": benchmark,
        }
    except Exception as exc:
        logger.error("回测统计失败: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="回测统计失败",
        )


async def _get_benchmark(
    session: AsyncSession, days: int, symbol: str | None
) -> dict:
    """Benchmark: 持有不动收益对比。从 klines 表获取首尾价格。"""
    target_symbol = symbol or "BTCUSDT"
    try:
        result = await session.execute(
            text("""
                SELECT
                    (SELECT close FROM klines
                     WHERE symbol = :symbol
                     ORDER BY open_time ASC LIMIT 1) AS start_price,
                    (SELECT close FROM klines
                     WHERE symbol = :symbol
                     ORDER BY open_time DESC LIMIT 1) AS end_price
            """),
            {"symbol": target_symbol},
        )
        row = result.mappings().first()
        if row and row["start_price"] and row["end_price"]:
            start_p = float(row["start_price"])
            end_p = float(row["end_price"])
            hold_return = (end_p - start_p) / start_p if start_p > 0 else 0
            return {
                "symbol": target_symbol,
                "start_price": round(start_p, 2),
                "end_price": round(end_p, 2),
                "hold_return_pct": round(hold_return * 100, 4),
            }
    except Exception as exc:
        logger.warning("获取 benchmark 失败: %s", exc)

    return {"symbol": target_symbol, "start_price": 0, "end_price": 0, "hold_return_pct": 0}


@router.get("/trades")
async def backtest_trades(
    days: int = Query(30, ge=1, le=180),
    symbol: str | None = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    user: UserInfo = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> dict:
    """回测交易列表 — 分页历史策略快照。"""
    max_days = await _get_max_days(session, str(user.id))
    actual_days = min(days, max_days)

    _age = age_filter("created_at", ":days")
    conditions = [
        _age,
        "status != 'pending'",
    ]
    params: dict = {"days": actual_days, "limit": page_size, "offset": (page - 1) * page_size}

    if symbol:
        conditions.append("symbol = :symbol")
        params["symbol"] = symbol.upper()

    where = " AND ".join(conditions)

    try:
        count_result = await session.execute(
            text(f"SELECT {cast_int('COUNT(*)')} AS cnt FROM strategy_snapshots WHERE {where}"),
            params,
        )
        total = count_result.scalar() or 0

        result = await session.execute(
            text(f"""
                SELECT id, symbol, direction, entry_low, entry_high, stop_loss,
                       confidence, price_at_generation, pnl_pct, status, created_at
                FROM strategy_snapshots
                WHERE {where}
                ORDER BY created_at DESC
                LIMIT :limit OFFSET :offset
            """),
            params,
        )
        rows = result.mappings().all()

        items = [
            {
                "id": str(row["id"]),
                "symbol": row["symbol"],
                "direction": row["direction"],
                "entry_low": float(row["entry_low"]) if row["entry_low"] else 0,
                "entry_high": float(row["entry_high"]) if row["entry_high"] else 0,
                "stop_loss": float(row["stop_loss"]) if row["stop_loss"] else 0,
                "confidence": float(row["confidence"]) if row["confidence"] else 0,
                "price_at_generation": float(row["price_at_generation"]) if row["price_at_generation"] else 0,
                "pnl_pct": round(float(row["pnl_pct"]), 4) if row["pnl_pct"] else 0,
                "status": row["status"],
                "created_at": row["created_at"].isoformat() if row["created_at"] else None,
            }
            for row in rows
        ]

        return {
            "items": items,
            "total": total,
            "page": page,
            "page_size": page_size,
        }
    except Exception as exc:
        logger.error("回测交易列表失败: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="回测交易列表失败",
        )
