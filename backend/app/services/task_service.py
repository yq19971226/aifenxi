"""任务中心核心服务 — 模板管理、提交、审核、奖励发放。"""

import logging
from datetime import datetime, timezone

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.redis import get_redis_pool
from app.core.sql_compat import count_filter, insert_returning, now_func
from app.services.config_service import get_config_value

logger = logging.getLogger(__name__)


# ── 功能开关检查 ──────────────────────────────────────────────


async def check_task_enabled() -> bool:
    """检查任务中心功能是否启用。"""
    enabled = await get_config_value("task_feature_enabled", "true")
    return enabled.lower() in ("true", "active")


# ── 用户端：任务首页 ──────────────────────────────────────────


async def get_task_home(session: AsyncSession, user_id: str) -> dict:
    """任务中心首页数据：可用任务 + 今日提交状态 + 奖励余额。"""
    # 可用任务模板
    templates = await _get_active_templates(session)

    # 今日提交状态
    today_submission = await _get_today_submission(session, user_id)

    # 奖励余额
    bonus = await _get_bonus_balances(user_id)

    return {
        "templates": templates,
        "today_submission": today_submission,
        "can_submit": today_submission is None,
        "bonus_credits": bonus,
    }


async def _get_active_templates(session: AsyncSession) -> list[dict]:
    """获取所有启用的任务模板。"""
    result = await session.execute(
        text(
            """
            SELECT id, title, platform, icon, description, rules,
                   reward_mode, reward_amount, min_views, verify_window_hours
            FROM task_templates
            WHERE is_active = true
            ORDER BY sort_order ASC, created_at DESC
            """
        )
    )
    rows = result.mappings().all()
    return [
        {
            "id": str(r["id"]),
            "title": r["title"],
            "platform": r["platform"],
            "icon": r["icon"],
            "description": r["description"],
            "rules": r["rules"],
            "reward_mode": r["reward_mode"],
            "reward_amount": r["reward_amount"],
            "min_views": r["min_views"],
            "verify_window_hours": r["verify_window_hours"],
        }
        for r in rows
    ]


async def _get_today_submission(session: AsyncSession, user_id: str) -> dict | None:
    """获取用户今日的提交记录（UTC 日期）。"""
    today = datetime.now(timezone.utc).date().isoformat()
    result = await session.execute(
        text(
            """
            SELECT s.id, s.template_id, s.post_url, s.screenshot_url,
                   s.status, s.reject_reason, s.reward_granted, s.submitted_at,
                   t.title AS template_title, t.reward_mode, t.reward_amount
            FROM task_submissions s
            JOIN task_templates t ON t.id = s.template_id
            WHERE s.user_id = :uid
              AND DATE(s.submitted_at) = :today
            ORDER BY s.submitted_at DESC
            LIMIT 1
            """
        ),
        {"uid": user_id, "today": today},
    )
    row = result.mappings().first()
    if not row:
        return None
    return {
        "id": str(row["id"]),
        "template_id": str(row["template_id"]),
        "template_title": row["template_title"],
        "post_url": row["post_url"],
        "status": row["status"],
        "reject_reason": row["reject_reason"],
        "reward_granted": row["reward_granted"],
        "reward_mode": row["reward_mode"],
        "reward_amount": row["reward_amount"],
        "submitted_at": row["submitted_at"].isoformat(),
    }


async def _get_bonus_balances(user_id: str) -> dict:
    """获取所有模式的奖励次数余额。"""
    redis = get_redis_pool()
    modes = ["scalping", "intraday", "trend"]
    result = {}
    for mode in modes:
        raw = await redis.get(f"bonus_credits:{user_id}:{mode}")
        result[mode] = max(int(raw), 0) if raw else 0
    return result


# ── 用户端：提交任务 ──────────────────────────────────────────


async def submit_task(
    session: AsyncSession,
    user_id: str,
    template_id: str,
    post_url: str,
    screenshot_url: str,
) -> dict:
    """提交今日任务。每用户每天限 1 次。"""
    # 检查今日是否已提交（Redis 快速判断）
    redis = get_redis_pool()
    today = datetime.now(timezone.utc).date().isoformat()
    submitted_key = f"task_submitted:{user_id}:{today}"

    if await redis.exists(submitted_key):
        raise ValueError("今日已提交过任务，明天再来吧")

    # DB 兜底校验
    existing = await _get_today_submission(session, user_id)
    if existing:
        raise ValueError("今日已提交过任务，明天再来吧")

    # 验证模板存在且启用
    tmpl = await session.execute(
        text("SELECT id, is_active FROM task_templates WHERE id = :tid"),
        {"tid": template_id},
    )
    tmpl_row = tmpl.mappings().first()
    if not tmpl_row:
        raise ValueError("任务模板不存在")
    if not tmpl_row["is_active"]:
        raise ValueError("该任务已下架")

    # 创建提交记录
    result = await insert_returning(
        session,
        """
        INSERT INTO task_submissions (user_id, template_id, post_url, screenshot_url, status)
        VALUES (:uid, :tid, :post_url, :screenshot_url, 'pending')
        RETURNING id, submitted_at
        """,
        {
            "uid": user_id,
            "tid": template_id,
            "post_url": post_url.strip(),
            "screenshot_url": screenshot_url.strip(),
        },
        table="task_submissions",
    )
    row = result.mappings().first()
    await session.flush()

    # 设置 Redis 标记（48h TTL）
    await redis.set(submitted_key, "1", ex=48 * 3600)

    logger.info("task_submitted: user=%s, template=%s", user_id, template_id)

    return {
        "id": str(row["id"]),
        "status": "pending",
        "submitted_at": row["submitted_at"].isoformat(),
        "message": "提交成功，等待审核",
    }


# ── 用户端：提交历史 ─────────────────────────────────────────


async def get_my_submissions(
    session: AsyncSession, user_id: str, limit: int = 30
) -> list[dict]:
    """获取用户的提交历史。"""
    result = await session.execute(
        text(
            """
            SELECT s.id, s.template_id, s.post_url, s.status, s.reject_reason,
                   s.reward_granted, s.submitted_at, s.reviewed_at,
                   t.title AS template_title, t.reward_mode, t.reward_amount
            FROM task_submissions s
            JOIN task_templates t ON t.id = s.template_id
            WHERE s.user_id = :uid
            ORDER BY s.submitted_at DESC
            LIMIT :lim
            """
        ),
        {"uid": user_id, "lim": limit},
    )
    rows = result.mappings().all()
    return [
        {
            "id": str(r["id"]),
            "template_title": r["template_title"],
            "status": r["status"],
            "reject_reason": r["reject_reason"],
            "reward_granted": r["reward_granted"],
            "reward_mode": r["reward_mode"],
            "reward_amount": r["reward_amount"],
            "submitted_at": r["submitted_at"].isoformat(),
            "reviewed_at": r["reviewed_at"].isoformat() if r["reviewed_at"] else None,
        }
        for r in rows
    ]


# ── 运营后台：审核 ───────────────────────────────────────────


async def get_pending_submissions(
    session: AsyncSession, status_filter: str | None = None, limit: int = 50
) -> list[dict]:
    """获取待审核/所有提交列表（后台用）。"""
    where = "WHERE 1=1"
    params: dict = {"lim": limit}
    if status_filter:
        where += " AND s.status = :status"
        params["status"] = status_filter

    result = await session.execute(
        text(
            f"""
            SELECT s.id, s.user_id, s.template_id, s.post_url, s.screenshot_url,
                   s.status, s.reject_reason, s.reward_granted,
                   s.submitted_at, s.reviewed_at, s.reviewed_by,
                   t.title AS template_title, t.min_views, t.reward_mode, t.reward_amount,
                   u.email
            FROM task_submissions s
            JOIN task_templates t ON t.id = s.template_id
            JOIN users u ON u.id = s.user_id
            {where}
            ORDER BY s.submitted_at DESC
            LIMIT :lim
            """
        ),
        params,
    )
    rows = result.mappings().all()
    return [
        {
            "id": str(r["id"]),
            "user_id": str(r["user_id"]),
            "email": r["email"],
            "template_title": r["template_title"],
            "post_url": r["post_url"],
            "screenshot_url": r["screenshot_url"],
            "min_views": r["min_views"],
            "status": r["status"],
            "reject_reason": r["reject_reason"],
            "reward_granted": r["reward_granted"],
            "reward_mode": r["reward_mode"],
            "reward_amount": r["reward_amount"],
            "submitted_at": r["submitted_at"].isoformat(),
            "reviewed_at": r["reviewed_at"].isoformat() if r["reviewed_at"] else None,
        }
        for r in rows
    ]


async def approve_submission(
    session: AsyncSession, submission_id: str, admin_id: str
) -> None:
    """审核通过任务提交，发放奖励。"""
    result = await session.execute(
        text(
            """
            SELECT s.id, s.user_id, s.status, s.reward_granted,
                   t.reward_mode, t.reward_amount
            FROM task_submissions s
            JOIN task_templates t ON t.id = s.template_id
            WHERE s.id = :sid
            """
        ),
        {"sid": submission_id},
    )
    row = result.mappings().first()
    if not row:
        raise ValueError("提交记录不存在")
    if row["status"] != "pending":
        raise ValueError(f"提交状态为 {row['status']}，无法审核")
    if row["reward_granted"]:
        raise ValueError("奖励已发放，请勿重复操作")

    user_id = str(row["user_id"])
    reward_mode = row["reward_mode"]
    reward_amount = row["reward_amount"]

    # 更新提交状态
    await session.execute(
        text(
            f"""
            UPDATE task_submissions
            SET status = 'approved', reward_granted = true,
                reviewed_by = :admin_id, reviewed_at = {now_func()}
            WHERE id = :sid
            """
        ),
        {"sid": submission_id, "admin_id": admin_id},
    )

    # 发放奖励到 Redis
    redis = get_redis_pool()
    await redis.incrby(f"bonus_credits:{user_id}:{reward_mode}", reward_amount)

    # 写入审计日志
    await session.execute(
        text(
            """
            INSERT INTO bonus_credit_logs (user_id, source_type, source_id, mode, amount, note)
            VALUES (:uid, 'task', :sid, :mode, :amount, :note)
            """
        ),
        {
            "uid": user_id,
            "sid": submission_id,
            "mode": reward_mode,
            "amount": reward_amount,
            "note": f"任务审核通过，奖励 {reward_amount} 次 {reward_mode}",
        },
    )
    await session.flush()

    logger.info(
        "task_approved: submission=%s, user=%s, reward=%d %s",
        submission_id, user_id, reward_amount, reward_mode,
    )


async def reject_submission(
    session: AsyncSession, submission_id: str, admin_id: str, reason: str
) -> None:
    """驳回任务提交。"""
    result = await session.execute(
        text("SELECT id, status FROM task_submissions WHERE id = :sid"),
        {"sid": submission_id},
    )
    row = result.mappings().first()
    if not row:
        raise ValueError("提交记录不存在")
    if row["status"] != "pending":
        raise ValueError(f"提交状态为 {row['status']}，无法驳回")

    await session.execute(
        text(
            f"""
            UPDATE task_submissions
            SET status = 'rejected', reject_reason = :reason,
                reviewed_by = :admin_id, reviewed_at = {now_func()}
            WHERE id = :sid
            """
        ),
        {"sid": submission_id, "reason": reason, "admin_id": admin_id},
    )
    await session.flush()

    logger.info("task_rejected: submission=%s, reason=%s", submission_id, reason)


# ── 运营后台：模板 CRUD ──────────────────────────────────────


async def create_template(session: AsyncSession, data: dict) -> dict:
    """创建任务模板。"""
    result = await insert_returning(
        session,
        """
        INSERT INTO task_templates
            (title, platform, icon, description, rules,
             reward_mode, reward_amount, min_views, verify_window_hours,
             sort_order, is_active)
        VALUES
            (:title, :platform, :icon, :description, :rules,
             :reward_mode, :reward_amount, :min_views, :verify_window_hours,
             :sort_order, :is_active)
        RETURNING id, created_at
        """,
        data,
        table="task_templates",
    )
    row = result.mappings().first()
    await session.flush()
    return {"id": str(row["id"]), "created_at": row["created_at"].isoformat()}


async def update_template(session: AsyncSession, template_id: str, data: dict) -> None:
    """更新任务模板。"""
    set_clauses = ", ".join(f"{k} = :{k}" for k in data)
    data["tid"] = template_id
    data["now"] = datetime.now(timezone.utc)
    await session.execute(
        text(f"UPDATE task_templates SET {set_clauses}, updated_at = :now WHERE id = :tid"),
        data,
    )
    await session.flush()


async def delete_template(session: AsyncSession, template_id: str) -> None:
    """软删除（停用）任务模板。"""
    await session.execute(
        text(f"UPDATE task_templates SET is_active = false, updated_at = {now_func()} WHERE id = :tid"),
        {"tid": template_id},
    )
    await session.flush()


async def list_templates(session: AsyncSession) -> list[dict]:
    """获取所有任务模板（包括已停用，后台用）。"""
    result = await session.execute(
        text(
            """
            SELECT id, title, platform, icon, description, rules,
                   reward_mode, reward_amount, min_views, verify_window_hours,
                   sort_order, is_active, created_at, updated_at
            FROM task_templates
            ORDER BY sort_order ASC, created_at DESC
            """
        )
    )
    rows = result.mappings().all()
    return [
        {
            "id": str(r["id"]),
            "title": r["title"],
            "platform": r["platform"],
            "icon": r["icon"],
            "description": r["description"],
            "rules": r["rules"],
            "reward_mode": r["reward_mode"],
            "reward_amount": r["reward_amount"],
            "min_views": r["min_views"],
            "verify_window_hours": r["verify_window_hours"],
            "sort_order": r["sort_order"],
            "is_active": r["is_active"],
            "created_at": r["created_at"].isoformat(),
            "updated_at": r["updated_at"].isoformat(),
        }
        for r in rows
    ]


# ── 统计 ─────────────────────────────────────────────────────


async def get_task_stats(session: AsyncSession) -> dict:
    """任务统计概览（后台用）。"""
    _cf = count_filter
    result = await session.execute(
        text(
            f"""
            SELECT
                {_cf("status = 'pending'")} AS pending_count,
                {_cf("status = 'approved'")} AS approved_count,
                {_cf("status = 'rejected'")} AS rejected_count,
                COUNT(*) AS total_count,
                COUNT(DISTINCT user_id) AS unique_users
            FROM task_submissions
            """
        )
    )
    row = result.mappings().first()
    return {
        "pending": row["pending_count"],
        "approved": row["approved_count"],
        "rejected": row["rejected_count"],
        "total": row["total_count"],
        "unique_users": row["unique_users"],
    }
