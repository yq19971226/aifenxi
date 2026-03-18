"""排行榜服务 — 排名查询、个人战绩、系统周报。

排名指标：Profit Factor = 总利润 / |总亏损|，封顶 99.9
上榜门槛：至少 1 条已结算的已发布策略（冷启动阶段，后期可调高）
匿名编号：交易员 #XXXX（基于 user_id 哈希）
缓存：Redis TTL 300s
"""

import hashlib
import logging
from uuid import UUID

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.redis import get_json, set_with_ttl
from app.core.sql_compat import count_filter, sum_filter, avg_filter, now_minus_interval_literal, least_val

logger = logging.getLogger(__name__)

_CACHE_TTL = 300  # 5 分钟
# 冷启动阶段：门槛统一降至 1 条（等用户量增长后可调高）
_MIN_STRATEGIES = 1  # 默认上榜最低策略数
_MIN_BY_MODE: dict[str, int] = {
    "all": 1,
    "scalping": 1,
    "intraday": 1,
    "trend": 1,
}


def anonymous_id(user_id: UUID) -> str:
    """生成匿名编号：交易员 #XXXXXX（100 万槽位，碰撞概率极低）"""
    h = hashlib.sha256(str(user_id).encode()).hexdigest()
    num = int(h[:8], 16) % 1_000_000
    return f"交易员 #{num:06d}"


class LeaderboardService:
    """排行榜查询服务。"""

    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    # ── 排行榜 ────────────────────────────────────────────

    async def get_rankings(
        self,
        period: str = "7d",
        mode: str = "all",
        page: int = 1,
        page_size: int = 20,
        current_user_id: UUID | None = None,
    ) -> dict:
        """获取排行榜。返回 { rankings, total, my_rank, my_stats }。"""
        # 排行榜页数据可缓存（与用户无关）
        cache_key = f"leaderboard:{period}:{mode}:{page}:{page_size}"
        cached = await get_json(cache_key)
        if cached:
            page_data = cached
        else:
            page_data = await self._query_rankings_page(period, mode, page, page_size)
            try:
                await set_with_ttl(cache_key, page_data, _CACHE_TTL)
            except Exception:
                pass

        # 用户排名单独查询（不缓存，轻量）
        my_rank = None
        my_stats = None
        if current_user_id:
            my_rank, my_stats = await self._query_my_rank(
                current_user_id, period, mode,
            )

        return {**page_data, "my_rank": my_rank, "my_stats": my_stats}

    async def _query_rankings_page(
        self, period: str, mode: str, page: int, page_size: int,
    ) -> dict:
        """执行排行榜分页查询，返回 { rankings, total }。"""
        period_cutoff = self._period_to_cutoff(period)
        mode_filter = "AND analysis_mode = :mode" if mode != "all" else ""
        ranked_cte = self._ranked_cte(period_cutoff, mode_filter)

        params: dict = {"min_strategies": _MIN_BY_MODE.get(mode, _MIN_STRATEGIES)}
        if mode != "all":
            params["mode"] = mode

        offset = (page - 1) * page_size
        count_sql = ranked_cte + " SELECT COUNT(*) AS cnt FROM ranked"
        page_sql = ranked_cte + " SELECT * FROM ranked ORDER BY rank LIMIT :limit OFFSET :offset"

        try:
            cnt_res = await self._session.execute(text(count_sql), params)
            total = int(cnt_res.scalar() or 0)

            page_res = await self._session.execute(
                text(page_sql), {**params, "limit": page_size, "offset": offset},
            )
            page_rows = [dict(r) for r in page_res.mappings()]
        except Exception as exc:
            logger.error("排行榜查询失败: %s", exc)
            return {"rankings": [], "total": 0}

        rankings = []
        for row in page_rows:
            uid = UUID(str(row["user_id"]))
            _wins = int(row["wins"] or 0)
            _settled = int(row["settled"] or 0)
            _win_rate = float(row.get("win_rate") or 0) if row.get("win_rate") is not None else (
                round(_wins / _settled, 4) if _settled > 0 else 0.0
            )
            rankings.append({
                "rank": row["rank"],
                "anonymous_id": anonymous_id(uid),
                "settled": _settled,
                "wins": _wins,
                "losses": int(row["losses"] or 0),
                "win_rate": _win_rate,
                "profit_factor": float(row["profit_factor"]),
                "avg_pnl": float(row["avg_pnl"] or 0),
            })

        return {"rankings": rankings, "total": total}

    async def _query_my_rank(
        self, user_id: UUID, period: str, mode: str,
    ) -> tuple[int | None, dict | None]:
        """查询当前用户在排行榜中的排名。"""
        period_cutoff = self._period_to_cutoff(period)
        mode_filter = "AND analysis_mode = :mode" if mode != "all" else ""
        ranked_cte = self._ranked_cte(period_cutoff, mode_filter)

        params: dict = {"min_strategies": _MIN_BY_MODE.get(mode, _MIN_STRATEGIES), "uid": str(user_id)}
        if mode != "all":
            params["mode"] = mode

        my_sql = ranked_cte + " SELECT * FROM ranked WHERE user_id = :uid LIMIT 1"
        try:
            my_res = await self._session.execute(text(my_sql), params)
            my_row = my_res.mappings().first()
            if my_row:
                _wins = int(my_row["wins"] or 0)
                _settled = int(my_row["settled"] or 0)
                _win_rate = float(my_row.get("win_rate") or 0) if my_row.get("win_rate") is not None else (
                    round(_wins / _settled, 4) if _settled > 0 else 0.0
                )
                return my_row["rank"], {
                    "rank": my_row["rank"],
                    "anonymous_id": anonymous_id(user_id),
                    "settled": _settled,
                    "wins": _wins,
                    "losses": int(my_row["losses"] or 0),
                    "win_rate": _win_rate,
                    "profit_factor": float(my_row["profit_factor"]),
                    "avg_pnl": float(my_row["avg_pnl"] or 0),
                }
        except Exception as exc:
            logger.warning("查询用户排名失败: %s", exc)
        return None, None

    @staticmethod
    def _ranked_cte(period_cutoff: str, mode_filter: str) -> str:
        _settled = count_filter("status != 'pending'")
        _profit = sum_filter("pnl_pct", "pnl_pct > 0")
        _loss = sum_filter("pnl_pct", "pnl_pct < 0")
        _wins = count_filter("pnl_pct > 0")
        # 修复：平盈（pnl_pct=0）不算亏损，只有负盈亏才是亏损
        _losses = count_filter("pnl_pct < 0 AND status != 'pending'")
        _avg = avg_filter("pnl_pct", "status != 'pending'")
        _having = count_filter("status != 'pending'")
        return f"""
            WITH user_stats AS (
                SELECT
                    user_id,
                    {_settled} AS settled,
                    COALESCE({_profit}, 0) AS total_profit,
                    COALESCE(ABS({_loss}), 0.0001) AS total_loss,
                    {_wins} AS wins,
                    {_losses} AS losses,
                    ROUND(CAST({_avg} AS NUMERIC), 4) AS avg_pnl,
                    ROUND(
                        CAST(CAST({_wins} AS FLOAT)
                        / NULLIF({_settled}, 0) AS NUMERIC),
                        4
                    ) AS win_rate
                FROM strategy_snapshots
                WHERE published = TRUE
                  AND user_id IS NOT NULL
                  AND created_at > {period_cutoff}
                  {mode_filter}
                GROUP BY user_id
                HAVING {_having} >= :min_strategies
            ), ranked AS (
                SELECT
                    user_id, settled, wins, losses, avg_pnl, win_rate, total_profit,
                    {least_val('ROUND(CAST(total_profit / total_loss AS NUMERIC), 2)', '99.9')} AS profit_factor,
                    ROW_NUMBER() OVER (
                        ORDER BY {least_val('ROUND(CAST(total_profit / total_loss AS NUMERIC), 2)', '99.9')} DESC, settled DESC
                    ) AS rank
                FROM user_stats
            )
        """

    # ── 系统周报 ──────────────────────────────────────────

    async def get_system_report(self, period: str = "7d", mode: str = "all") -> dict:
        """系统整体绩效摘要。"""
        cache_key = f"leaderboard:report:{period}:{mode}"
        cached = await get_json(cache_key)
        if cached:
            return cached

        period_cutoff = self._period_to_cutoff(period)
        mode_filter = "AND analysis_mode = :mode" if mode != "all" else ""
        _settled = count_filter("status != 'pending'")
        _wins = count_filter("pnl_pct > 0")
        _profit = sum_filter("pnl_pct", "pnl_pct > 0")
        _loss = sum_filter("pnl_pct", "pnl_pct < 0")
        sql = f"""
            SELECT
                {_settled} AS total_settled,
                {_wins} AS total_wins,
                ROUND(
                    CAST(COALESCE(
                        CAST({_wins} AS FLOAT)
                        / NULLIF({_settled}, 0),
                        0
                    ) AS NUMERIC), 4
                ) AS win_rate,
                COALESCE({_profit}, 0) AS total_profit,
                COALESCE(ABS({_loss}), 0.0001) AS total_loss
            FROM strategy_snapshots
            WHERE published = TRUE
              AND created_at > {period_cutoff}
              {mode_filter}
        """
        params: dict = {"mode": mode} if mode != "all" else {}

        try:
            result = await self._session.execute(text(sql), params)
            row = result.mappings().first()
        except Exception as exc:
            logger.error("系统周报查询失败: %s", exc)
            return {"total_settled": 0, "win_rate": 0, "profit_factor": 0}

        if not row or row["total_settled"] == 0:
            report = {"total_settled": 0, "win_rate": 0, "profit_factor": 0}
        else:
            pf = min(float(row["total_profit"]) / float(row["total_loss"]), 99.9)
            report = {
                "total_settled": int(row["total_settled"]),
                "total_wins": int(row["total_wins"]),
                "win_rate": round(float(row["win_rate"]), 4),
                "profit_factor": round(pf, 2),
            }

        try:
            await set_with_ttl(cache_key, report, _CACHE_TTL)
        except Exception:
            pass

        return report

    # ── 系统命中率（按模式分组）────────────────────────────

    async def get_system_accuracy(self, period: str = "7d") -> dict:
        """按 analysis_mode 分组的系统命中率（不限 published，展示系统整体能力）。"""
        cache_key = f"leaderboard:accuracy:{period}"
        cached = await get_json(cache_key)
        if cached:
            return cached

        period_cutoff = self._period_to_cutoff(period)
        _settled = count_filter("status != 'pending'")
        _wins = count_filter("pnl_pct > 0")
        _losses = count_filter("pnl_pct <= 0 AND status != 'pending'")
        _avg = avg_filter("pnl_pct", "status != 'pending'")
        sql = f"""
            SELECT
                analysis_mode,
                {_settled} AS settled,
                {_wins} AS wins,
                {_losses} AS losses,
                ROUND(
                    CAST(COALESCE(
                        CAST({_wins} AS FLOAT)
                        / NULLIF({_settled}, 0),
                        0
                    ) AS NUMERIC), 4
                ) AS win_rate,
                ROUND(CAST({_avg} AS NUMERIC), 4) AS avg_pnl
            FROM strategy_snapshots
            WHERE created_at > {period_cutoff}
              AND analysis_mode IS NOT NULL
            GROUP BY analysis_mode
            ORDER BY analysis_mode
        """
        try:
            result = await self._session.execute(text(sql))
            rows = result.mappings().all()
        except Exception as exc:
            logger.error("系统命中率查询失败: %s", exc)
            return {"modes": []}

        modes = []
        for row in rows:
            modes.append({
                "mode": row["analysis_mode"],
                "settled": int(row["settled"]),
                "wins": int(row["wins"]),
                "losses": int(row["losses"]),
                "win_rate": round(float(row["win_rate"] or 0), 4),
                "avg_pnl": round(float(row["avg_pnl"] or 0), 4),
            })

        data = {"modes": modes}
        try:
            await set_with_ttl(cache_key, data, _CACHE_TTL)
        except Exception:
            pass
        return data

    # ── 个人战绩 ──────────────────────────────────────────

    async def get_my_stats(self, user_id: UUID, period: str = "7d", mode: str = "all") -> dict:
        """当前用户的个人战绩（仅统计迁移后有 user_id 的数据）。"""
        period_cutoff = self._period_to_cutoff(period)
        mode_filter = "AND analysis_mode = :mode" if mode != "all" else ""
        _pending = count_filter("status = 'pending'")
        _settled = count_filter("status != 'pending'")
        _wins = count_filter("pnl_pct > 0")
        _losses = count_filter("pnl_pct <= 0 AND status != 'pending'")
        _avg = avg_filter("pnl_pct", "status != 'pending'")
        _profit = sum_filter("pnl_pct", "pnl_pct > 0")
        _loss = sum_filter("pnl_pct", "pnl_pct < 0")
        sql = f"""
            SELECT
                COUNT(*) AS total_published,
                {_pending} AS pending,
                {_settled} AS settled,
                {_wins} AS wins,
                {_losses} AS losses,
                ROUND(CAST({_avg} AS NUMERIC), 4) AS avg_pnl,
                COALESCE({_profit}, 0) AS total_profit,
                COALESCE(ABS({_loss}), 0.0001) AS total_loss
            FROM strategy_snapshots
            WHERE user_id = :user_id
              AND published = TRUE
              AND created_at > {period_cutoff}
              {mode_filter}
        """
        params: dict = {"user_id": str(user_id)}
        if mode != "all":
            params["mode"] = mode

        try:
            result = await self._session.execute(text(sql), params)
            row = result.mappings().first()
        except Exception as exc:
            logger.error("个人战绩查询失败: %s", exc)
            return self._empty_my_stats(user_id)

        if not row or int(row["total_published"] or 0) == 0:
            return self._empty_my_stats(user_id)

        settled = int(row["settled"])
        pf = min(float(row["total_profit"]) / float(row["total_loss"]), 99.9) if settled > 0 else 0
        return {
            "anonymous_id": anonymous_id(user_id),
            "total_published": int(row["total_published"]),
            "pending": int(row["pending"]),
            "settled": settled,
            "wins": int(row["wins"]),
            "losses": int(row["losses"]),
            "avg_pnl": float(row["avg_pnl"] or 0),
            "profit_factor": round(pf, 2),
        }

    @staticmethod
    def _empty_my_stats(user_id: UUID) -> dict:
        return {
            "anonymous_id": anonymous_id(user_id),
            "total_published": 0,
            "pending": 0,
            "settled": 0,
            "wins": 0,
            "losses": 0,
            "avg_pnl": 0,
            "profit_factor": 0,
        }

    async def get_my_history(
        self, user_id: UUID, period: str = "7d", mode: str = "all",
        page: int = 1, page_size: int = 20,
    ) -> dict:
        """当前用户的已发布策略明细列表。"""
        period_cutoff = self._period_to_cutoff(period)
        mode_filter = "AND analysis_mode = :mode" if mode != "all" else ""
        base_where = f"""
            WHERE user_id = :user_id
              AND published = TRUE
              AND created_at > {period_cutoff}
              {mode_filter}
        """

        count_sql = f"SELECT COUNT(*) FROM strategy_snapshots {base_where}"
        list_sql = f"""
            SELECT id, symbol, direction, entry_low, entry_high, stop_loss,
                   status, pnl_pct, analysis_mode, created_at
            FROM strategy_snapshots
            {base_where}
            ORDER BY created_at DESC
            LIMIT :limit OFFSET :offset
        """

        params: dict = {"user_id": str(user_id)}
        if mode != "all":
            params["mode"] = mode
        offset = (page - 1) * page_size

        try:
            cnt = await self._session.execute(text(count_sql), params)
            total = int(cnt.scalar() or 0)

            res = await self._session.execute(
                text(list_sql), {**params, "limit": page_size, "offset": offset}
            )
            rows = [dict(r) for r in res.mappings()]
        except Exception as exc:
            logger.error("策略历史查询失败: %s", exc)
            return {"items": [], "total": 0}

        items = []
        for r in rows:
            entry_low = float(r["entry_low"]) if r["entry_low"] else None
            entry_high = float(r["entry_high"]) if r["entry_high"] else None
            entry_mid = round((entry_low + entry_high) / 2, 8) if entry_low and entry_high else None

            items.append({
                "id": str(r["id"]),
                "symbol": r["symbol"],
                "direction": r["direction"],
                "entry_price": entry_mid,
                "stop_loss": float(r["stop_loss"]) if r["stop_loss"] else None,
                "status": r["status"],
                "pnl_pct": float(r["pnl_pct"]) if r["pnl_pct"] is not None else None,
                "analysis_mode": r["analysis_mode"],
                "created_at": str(r["created_at"]),
            })

        return {"items": items, "total": total}

    @staticmethod
    def _period_to_cutoff(period: str) -> str:
        mapping = {"7d": 7, "30d": 30, "90d": 90}
        days = mapping.get(period, 7)
        return now_minus_interval_literal(days, "days")
