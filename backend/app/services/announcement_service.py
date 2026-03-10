import html
import json
import logging
from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.sql_compat import insert_returning, jsonb_func_cast, update_returning

logger = logging.getLogger(__name__)

_VALID_DISPLAY_MODES = {"blocking_modal", "modal", "banner"}
_VALID_EVENTS = {"shown", "closed", "snoozed", "clicked", "confirmed"}
_VALID_STATUSES = {"draft", "scheduled", "published", "archived"}


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _parse_dt(value: Any) -> datetime | None:
    if value is None or value == "":
        return None
    if isinstance(value, datetime):
        dt = value
    elif isinstance(value, str):
        try:
            dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError:
            return None
    else:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def _to_iso(value: Any) -> str | None:
    dt = _parse_dt(value)
    return dt.isoformat() if dt else None


def _as_bool(value: Any) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, int):
        return value != 0
    if isinstance(value, str):
        return value.lower() in {"1", "true", "t", "yes"}
    return bool(value)


def _load_json_list(value: Any) -> list[Any]:
    if value is None or value == "":
        return []
    if isinstance(value, list):
        return value
    if isinstance(value, str):
        try:
            data = json.loads(value)
        except json.JSONDecodeError:
            return []
        return data if isinstance(data, list) else []
    return []


def _sanitize_content_md(value: str) -> str:
    return html.escape((value or "").strip(), quote=False)


def _generate_announcement_key() -> str:
    return f"announce-{uuid4().hex[:24]}"


def _normalize_pathname(pathname: str | None) -> str:
    path = (pathname or "/").strip()
    if not path:
        return "/"
    return path if path.startswith("/") else f"/{path}"


def _serialize_targets(data: dict[str, Any]) -> dict[str, str]:
    return {
        "target_roles_json": json.dumps(
            [str(x).strip() for x in (data.get("target_roles") or []) if str(x).strip()]
        ),
        "target_membership_levels_json": json.dumps(
            [int(x) for x in (data.get("target_membership_levels") or []) if x is not None]
        ),
        "target_path_prefixes_json": json.dumps(
            [
                _normalize_pathname(str(x))
                for x in (data.get("target_path_prefixes") or [])
                if str(x).strip()
            ]
        ),
    }


def _validate_payload(data: dict[str, Any], *, is_create: bool) -> dict[str, Any]:
    title = (data.get("title") or "").strip()
    content_md = (data.get("content_md") or "").strip()
    display_mode = (data.get("display_mode") or "").strip()
    if not title:
        raise ValueError("公告标题不能为空")
    if not content_md:
        raise ValueError("公告正文不能为空")
    if display_mode not in _VALID_DISPLAY_MODES:
        raise ValueError("无效的 display_mode")

    priority = int(data.get("priority", 0) or 0)
    strong_ack_required = bool(data.get("strong_ack_required", False))
    allow_snooze = bool(data.get("allow_snooze", True))
    starts_at = _parse_dt(data.get("starts_at"))
    ends_at = _parse_dt(data.get("ends_at"))
    if starts_at and ends_at and starts_at >= ends_at:
        raise ValueError("开始时间必须早于结束时间")
    if display_mode == "blocking_modal" and not strong_ack_required:
        raise ValueError("blocking_modal 必须启用 strong_ack_required")

    action_text = (data.get("action_text") or "").strip() or None
    action_href = (data.get("action_href") or "").strip() or None
    if action_href and not (
        action_href.startswith("/")
        or action_href.startswith("http://")
        or action_href.startswith("https://")
    ):
        raise ValueError("action_href 仅支持站内路径或 http/https 链接")

    try:
        target_membership_levels = [
            int(x) for x in (data.get("target_membership_levels") or []) if x is not None
        ]
    except (TypeError, ValueError) as exc:
        raise ValueError("target_membership_levels 必须是整数数组") from exc

    announcement_key = (data.get("announcement_key") or "").strip() or None
    if is_create and not announcement_key:
        announcement_key = _generate_announcement_key()

    return {
        "announcement_key": announcement_key,
        "title": title,
        "summary": ((data.get("summary") or "").strip() or None),
        "content_md": content_md,
        "display_mode": display_mode,
        "priority": priority,
        "strong_ack_required": strong_ack_required,
        "allow_snooze": allow_snooze,
        "action_text": action_text,
        "action_href": action_href,
        "target_roles": [str(x).strip() for x in (data.get("target_roles") or []) if str(x).strip()],
        "target_membership_levels": target_membership_levels,
        "target_path_prefixes": [
            _normalize_pathname(str(x))
            for x in (data.get("target_path_prefixes") or [])
            if str(x).strip()
        ],
        "starts_at": starts_at,
        "ends_at": ends_at,
    }


def _row_to_payload(row: Any) -> dict[str, Any]:
    return {
        "announcement_key": row["announcement_key"],
        "title": row["title"],
        "summary": row["summary"],
        "content_md": row["content_md"],
        "display_mode": row["display_mode"],
        "priority": row["priority"],
        "strong_ack_required": _as_bool(row["strong_ack_required"]),
        "allow_snooze": _as_bool(row["allow_snooze"]),
        "action_text": row["action_text"],
        "action_href": row["action_href"],
        "target_roles": _load_json_list(row["target_roles_json"]),
        "target_membership_levels": _load_json_list(row["target_membership_levels_json"]),
        "target_path_prefixes": _load_json_list(row["target_path_prefixes_json"]),
        "starts_at": _to_iso(row["starts_at"]),
        "ends_at": _to_iso(row["ends_at"]),
    }


def _matches_target(
    row: Any,
    *,
    role: str,
    membership_level: int,
    pathname: str | None,
    enforce_path: bool = True,
) -> bool:
    target_roles = _load_json_list(row["target_roles_json"])
    target_levels = {int(x) for x in _load_json_list(row["target_membership_levels_json"])}
    target_paths = [_normalize_pathname(x) for x in _load_json_list(row["target_path_prefixes_json"])]
    path = _normalize_pathname(pathname)
    if target_roles and role not in target_roles:
        return False
    if target_levels and membership_level not in target_levels:
        return False
    if enforce_path and target_paths and not any(path.startswith(prefix) for prefix in target_paths):
        return False
    return True


def _should_display(row: Any, now: datetime) -> bool:
    confirmed_at = _parse_dt(row["confirmed_at"])
    if confirmed_at:
        return False
    snooze_until = _parse_dt(row["snooze_until"])
    if snooze_until and snooze_until > now:
        return False
    if _as_bool(row["strong_ack_required"]):
        return True
    return row["last_event"] not in {"shown", "closed", "clicked", "confirmed"}


def _row_to_admin_item(row: Any) -> dict[str, Any]:
    return {
        "id": str(row["id"]),
        "announcement_key": row["announcement_key"],
        "version": row["version"],
        "title": row["title"],
        "summary": row["summary"],
        "content_md": row["content_md"],
        "display_mode": row["display_mode"],
        "priority": row["priority"],
        "status": row["status"],
        "strong_ack_required": _as_bool(row["strong_ack_required"]),
        "allow_snooze": _as_bool(row["allow_snooze"]),
        "action_text": row["action_text"],
        "action_href": row["action_href"],
        "target_roles": _load_json_list(row["target_roles_json"]),
        "target_membership_levels": _load_json_list(row["target_membership_levels_json"]),
        "target_path_prefixes": _load_json_list(row["target_path_prefixes_json"]),
        "starts_at": _to_iso(row["starts_at"]),
        "ends_at": _to_iso(row["ends_at"]),
        "scheduled_at": _to_iso(row["scheduled_at"]),
        "published_at": _to_iso(row["published_at"]),
        "archived_at": _to_iso(row["archived_at"]),
        "created_by": str(row["created_by"]) if row["created_by"] else None,
        "published_by": str(row["published_by"]) if row["published_by"] else None,
        "created_at": _to_iso(row["created_at"]),
        "updated_at": _to_iso(row["updated_at"]),
    }


def _row_to_active_item(row: Any) -> dict[str, Any]:
    return {
        "id": str(row["id"]),
        "announcement_key": row["announcement_key"],
        "version": row["version"],
        "title": row["title"],
        "summary": row["summary"],
        "content_md": _sanitize_content_md(row["content_md"]),
        "display_mode": row["display_mode"],
        "priority": row["priority"],
        "strong_ack_required": _as_bool(row["strong_ack_required"]),
        "allow_snooze": _as_bool(row["allow_snooze"]),
        "action_text": row["action_text"],
        "action_href": row["action_href"],
        "published_at": _to_iso(row["published_at"]),
    }


async def _append_audit_log(
    session: AsyncSession,
    *,
    announcement_id: str | None,
    announcement_key: str,
    version: int,
    action: str,
    actor_user_id: str | None,
    change_summary: dict[str, Any] | None = None,
) -> None:
    await session.execute(
        text(
            f"""
            INSERT INTO announcement_audit_logs (
                announcement_id, announcement_key, version, action, actor_user_id, change_summary_json
            )
            VALUES (
                :announcement_id, :announcement_key, :version, :action, :actor_user_id, {jsonb_func_cast(':change_summary_json')}
            )
            """
        ),
        {
            "announcement_id": announcement_id,
            "announcement_key": announcement_key,
            "version": version,
            "action": action,
            "actor_user_id": actor_user_id,
            "change_summary_json": json.dumps(change_summary or {}, ensure_ascii=False),
        },
    )


async def _get_announcement_row(session: AsyncSession, announcement_id: str) -> Any:
    result = await session.execute(
        text("SELECT * FROM announcements WHERE id = :announcement_id"),
        {"announcement_id": announcement_id},
    )
    return result.mappings().first()


async def _publish_due_scheduled_announcements(session: AsyncSession) -> None:
    now = _utc_now()
    result = await session.execute(
        text(
            """
            SELECT id, announcement_key, version
            FROM announcements
            WHERE status = 'scheduled'
              AND scheduled_at IS NOT NULL
              AND scheduled_at <= :now
            """
        ),
        {"now": now},
    )
    rows = result.mappings().all()
    for row in rows:
        await session.execute(
            text(
                """
                UPDATE announcements
                SET status = 'published',
                    published_at = COALESCE(published_at, scheduled_at, :now)
                WHERE id = :announcement_id
                """
            ),
            {"announcement_id": str(row["id"]), "now": now},
        )
        await _append_audit_log(
            session,
            announcement_id=str(row["id"]),
            announcement_key=row["announcement_key"],
            version=row["version"],
            action="publish",
            actor_user_id=None,
            change_summary={"source": "scheduled_auto_publish"},
        )


def _validate_publishable_row(row: Any, *, scheduled_at: datetime | None = None) -> None:
    if not (row["title"] or "").strip():
        raise ValueError("公告标题不能为空")
    if not (row["content_md"] or "").strip():
        raise ValueError("公告正文不能为空")
    if row["display_mode"] not in _VALID_DISPLAY_MODES:
        raise ValueError("无效的 display_mode")
    if row["display_mode"] == "blocking_modal" and not _as_bool(row["strong_ack_required"]):
        raise ValueError("blocking_modal 必须启用 strong_ack_required")

    starts_at = _parse_dt(row["starts_at"])
    ends_at = _parse_dt(row["ends_at"])
    if starts_at and ends_at and starts_at >= ends_at:
        raise ValueError("开始时间必须早于结束时间")
    if scheduled_at and ends_at and scheduled_at >= ends_at:
        raise ValueError("排期时间必须早于结束时间")


async def get_active_announcements(
    session: AsyncSession,
    *,
    user_id: str,
    role: str,
    membership_level: int,
    pathname: str | None,
) -> list[dict[str, Any]]:
    await _publish_due_scheduled_announcements(session)
    now = _utc_now()
    result = await session.execute(
        text(
            """
            SELECT a.*, d.last_event, d.confirmed_at, d.snooze_until
            FROM announcements a
            LEFT JOIN announcement_deliveries d
              ON d.announcement_id = a.id AND d.user_id = :user_id
            WHERE a.status = 'published'
              AND (a.starts_at IS NULL OR a.starts_at <= :now)
              AND (a.ends_at IS NULL OR a.ends_at > :now)
            ORDER BY a.priority DESC, a.published_at DESC, a.created_at DESC
            """
        ),
        {"user_id": user_id, "now": now},
    )
    rows = result.mappings().all()

    matched: list[dict[str, Any]] = []
    for row in rows:
        if not _matches_target(
            row,
            role=role,
            membership_level=membership_level,
            pathname=pathname,
            enforce_path=True,
        ):
            continue
        if not _should_display(row, now):
            continue
        matched.append(_row_to_active_item(row))

    chosen_blocking: dict[str, Any] | None = None
    remaining: list[dict[str, Any]] = []
    for item in matched:
        if item["display_mode"] == "blocking_modal":
            if chosen_blocking is None:
                chosen_blocking = item
            continue
        remaining.append(item)

    return ([chosen_blocking] if chosen_blocking else []) + remaining


async def get_announcement_history(
    session: AsyncSession,
    *,
    user_id: str,
    role: str,
    membership_level: int,
    page: int = 1,
    page_size: int = 20,
) -> dict[str, Any]:
    await _publish_due_scheduled_announcements(session)
    result = await session.execute(
        text(
            """
            SELECT a.id, a.announcement_key, a.version, a.title, a.summary,
                   a.display_mode, a.status, a.published_at, a.archived_at,
                   a.priority, a.target_roles_json, a.target_membership_levels_json,
                   a.target_path_prefixes_json, d.last_event, d.confirmed_at
            FROM announcements a
            LEFT JOIN announcement_deliveries d
              ON d.announcement_id = a.id AND d.user_id = :user_id
            WHERE a.status IN ('published', 'archived')
            ORDER BY COALESCE(a.published_at, a.archived_at, a.created_at) DESC,
                     a.priority DESC,
                     a.version DESC
            """
        ),
        {"user_id": user_id},
    )
    rows = result.mappings().all()

    filtered: list[dict[str, Any]] = []
    for row in rows:
        matched_now = _matches_target(
            row,
            role=role,
            membership_level=membership_level,
            pathname=None,
            enforce_path=False,
        )
        has_delivery = row["last_event"] is not None or row["confirmed_at"] is not None
        if not matched_now and not has_delivery:
            continue
        filtered.append(
            {
                "id": str(row["id"]),
                "announcement_key": row["announcement_key"],
                "version": row["version"],
                "title": row["title"],
                "summary": row["summary"],
                "display_mode": row["display_mode"],
                "status": row["status"],
                "published_at": _to_iso(row["published_at"]),
                "archived_at": _to_iso(row["archived_at"]),
                "last_event": row["last_event"],
                "confirmed_at": _to_iso(row["confirmed_at"]),
            }
        )

    total = len(filtered)
    offset = (page - 1) * page_size
    return {
        "items": filtered[offset: offset + page_size],
        "total": total,
        "page": page,
        "page_size": page_size,
    }


async def list_admin_announcements(
    session: AsyncSession,
    *,
    status: str | None = None,
    display_mode: str | None = None,
    search: str | None = None,
    page: int = 1,
    page_size: int = 20,
) -> dict[str, Any]:
    await _publish_due_scheduled_announcements(session)

    where_clauses: list[str] = []
    params: dict[str, Any] = {}
    if status:
        if status not in _VALID_STATUSES:
            raise ValueError("无效的 status")
        where_clauses.append("status = :status")
        params["status"] = status
    if display_mode:
        if display_mode not in _VALID_DISPLAY_MODES:
            raise ValueError("无效的 display_mode")
        where_clauses.append("display_mode = :display_mode")
        params["display_mode"] = display_mode
    if search and search.strip():
        where_clauses.append(
            "(" 
            "LOWER(announcement_key) LIKE :search OR "
            "LOWER(title) LIKE :search OR "
            "LOWER(COALESCE(summary, '')) LIKE :search"
            ")"
        )
        params["search"] = f"%{search.strip().lower()}%"

    where_sql = f"WHERE {' AND '.join(where_clauses)}" if where_clauses else ""
    count_result = await session.execute(
        text(f"SELECT COUNT(*) AS total FROM announcements {where_sql}"),
        params,
    )
    total = int(count_result.scalar() or 0)

    params.update({"limit": page_size, "offset": (page - 1) * page_size})
    result = await session.execute(
        text(
            f"""
            SELECT *
            FROM announcements
            {where_sql}
            ORDER BY COALESCE(published_at, scheduled_at, created_at) DESC,
                     priority DESC,
                     version DESC
            LIMIT :limit OFFSET :offset
            """
        ),
        params,
    )
    rows = result.mappings().all()
    return {
        "items": [_row_to_admin_item(row) for row in rows],
        "total": total,
        "page": page,
        "page_size": page_size,
    }


async def _next_version_for_key(session: AsyncSession, announcement_key: str) -> int:
    result = await session.execute(
        text(
            """
            SELECT COALESCE(MAX(version), 0) AS max_version
            FROM announcements
            WHERE announcement_key = :announcement_key
            """
        ),
        {"announcement_key": announcement_key},
    )
    return int(result.scalar() or 0) + 1


async def _insert_draft(
    session: AsyncSession,
    *,
    payload: dict[str, Any],
    actor_user_id: str,
    version: int,
    change_summary: dict[str, Any],
) -> dict[str, Any]:
    target_values = _serialize_targets(payload)
    result = await insert_returning(
        session,
        f"""
        INSERT INTO announcements (
            announcement_key, version, title, summary, content_md,
            display_mode, priority, status, strong_ack_required, allow_snooze,
            action_text, action_href, target_roles_json,
            target_membership_levels_json, target_path_prefixes_json,
            starts_at, ends_at, created_by
        )
        VALUES (
            :announcement_key, :version, :title, :summary, :content_md,
            :display_mode, :priority, 'draft', :strong_ack_required, :allow_snooze,
            :action_text, :action_href, {jsonb_func_cast(':target_roles_json')},
            {jsonb_func_cast(':target_membership_levels_json')}, {jsonb_func_cast(':target_path_prefixes_json')},
            :starts_at, :ends_at, :created_by
        )
        RETURNING *
        """,
        {
            "announcement_key": payload["announcement_key"],
            "version": version,
            "title": payload["title"],
            "summary": payload["summary"],
            "content_md": payload["content_md"],
            "display_mode": payload["display_mode"],
            "priority": payload["priority"],
            "strong_ack_required": payload["strong_ack_required"],
            "allow_snooze": payload["allow_snooze"],
            "action_text": payload["action_text"],
            "action_href": payload["action_href"],
            "target_roles_json": target_values["target_roles_json"],
            "target_membership_levels_json": target_values["target_membership_levels_json"],
            "target_path_prefixes_json": target_values["target_path_prefixes_json"],
            "starts_at": payload["starts_at"],
            "ends_at": payload["ends_at"],
            "created_by": actor_user_id,
        },
        table="announcements",
    )
    row = result.mappings().first()
    await session.flush()
    await _append_audit_log(
        session,
        announcement_id=str(row["id"]),
        announcement_key=row["announcement_key"],
        version=row["version"],
        action="create",
        actor_user_id=actor_user_id,
        change_summary=change_summary,
    )
    return _row_to_admin_item(row)


async def create_announcement_draft(
    session: AsyncSession,
    *,
    actor_user_id: str,
    data: dict[str, Any],
) -> dict[str, Any]:
    payload = _validate_payload(data, is_create=True)
    version = await _next_version_for_key(session, payload["announcement_key"])
    return await _insert_draft(
        session,
        payload=payload,
        actor_user_id=actor_user_id,
        version=version,
        change_summary={"source": "admin_create"},
    )


async def update_announcement(
    session: AsyncSession,
    *,
    announcement_id: str,
    actor_user_id: str,
    data: dict[str, Any],
) -> dict[str, Any]:
    row = await _get_announcement_row(session, announcement_id)
    if row is None:
        raise ValueError("公告不存在")

    merged = _row_to_payload(row)
    merged.update(data)
    merged["announcement_key"] = row["announcement_key"]
    payload = _validate_payload(merged, is_create=False)
    payload["announcement_key"] = row["announcement_key"]

    if row["status"] == "draft":
        target_values = _serialize_targets(payload)
        result = await update_returning(
            session,
            f"""
            UPDATE announcements
            SET title = :title,
                summary = :summary,
                content_md = :content_md,
                display_mode = :display_mode,
                priority = :priority,
                strong_ack_required = :strong_ack_required,
                allow_snooze = :allow_snooze,
                action_text = :action_text,
                action_href = :action_href,
                target_roles_json = {jsonb_func_cast(':target_roles_json')},
                target_membership_levels_json = {jsonb_func_cast(':target_membership_levels_json')},
                target_path_prefixes_json = {jsonb_func_cast(':target_path_prefixes_json')},
                starts_at = :starts_at,
                ends_at = :ends_at
            WHERE id = :announcement_id
            RETURNING *
            """,
            {
                "announcement_id": announcement_id,
                "title": payload["title"],
                "summary": payload["summary"],
                "content_md": payload["content_md"],
                "display_mode": payload["display_mode"],
                "priority": payload["priority"],
                "strong_ack_required": payload["strong_ack_required"],
                "allow_snooze": payload["allow_snooze"],
                "action_text": payload["action_text"],
                "action_href": payload["action_href"],
                "target_roles_json": target_values["target_roles_json"],
                "target_membership_levels_json": target_values["target_membership_levels_json"],
                "target_path_prefixes_json": target_values["target_path_prefixes_json"],
                "starts_at": payload["starts_at"],
                "ends_at": payload["ends_at"],
            },
            table="announcements",
            where="id = :announcement_id",
        )
        updated = result.mappings().first()
        await session.flush()
        await _append_audit_log(
            session,
            announcement_id=str(updated["id"]),
            announcement_key=updated["announcement_key"],
            version=updated["version"],
            action="update_draft",
            actor_user_id=actor_user_id,
            change_summary={"source": "draft_update"},
        )
        return _row_to_admin_item(updated)

    if row["status"] == "scheduled":
        raise ValueError("排期中的公告请先取消排期后再编辑")

    if row["status"] in {"published", "archived"}:
        version = await _next_version_for_key(session, row["announcement_key"])
        return await _insert_draft(
            session,
            payload=payload,
            actor_user_id=actor_user_id,
            version=version,
            change_summary={
                "source": "new_version_from_existing",
                "base_announcement_id": announcement_id,
                "base_version": row["version"],
            },
        )

    raise ValueError("当前状态不支持编辑")


async def record_announcement_event(
    session: AsyncSession,
    *,
    announcement_id: str,
    user_id: str,
    role: str,
    membership_level: int,
    event_type: str,
    pathname: str | None,
    occurred_at: str | datetime,
    snooze_until: str | datetime | None = None,
    metadata: dict[str, Any] | None = None,
) -> dict[str, Any]:
    if event_type not in _VALID_EVENTS:
        raise ValueError("无效的 event_type")

    announcement = await _get_announcement_row(session, announcement_id)
    if announcement is None:
        raise ValueError("公告不存在")
    if announcement["status"] != "published":
        raise ValueError("仅已发布公告可写入用户事件")
    if not _matches_target(
        announcement,
        role=role,
        membership_level=membership_level,
        pathname=pathname,
        enforce_path=bool(pathname),
    ):
        raise ValueError("当前用户不在公告目标范围内")

    occurred_dt = _parse_dt(occurred_at)
    if occurred_dt is None:
        raise ValueError("occurred_at 格式无效")

    snooze_dt = _parse_dt(snooze_until) if snooze_until is not None else None
    if event_type == "snoozed" and not _as_bool(announcement["allow_snooze"]):
        raise ValueError("该公告不支持稍后提醒")
    if event_type == "snoozed" and snooze_until is None:
        raise ValueError("snoozed 事件必须提供 snooze_until")
    if event_type == "snoozed" and snooze_until is not None and snooze_dt is None:
        raise ValueError("snooze_until 格式无效")
    if event_type == "snoozed" and snooze_dt and snooze_dt <= occurred_dt:
        raise ValueError("snooze_until 必须晚于 occurred_at")

    await session.execute(
        text(
            f"""
            INSERT INTO announcement_delivery_events (
                announcement_id, announcement_key, announcement_version,
                user_id, event_type, pathname, metadata_json, occurred_at
            )
            VALUES (
                :announcement_id, :announcement_key, :announcement_version,
                :user_id, :event_type, :pathname, {jsonb_func_cast(':metadata_json')}, :occurred_at
            )
            """
        ),
        {
            "announcement_id": announcement_id,
            "announcement_key": announcement["announcement_key"],
            "announcement_version": announcement["version"],
            "user_id": user_id,
            "event_type": event_type,
            "pathname": _normalize_pathname(pathname),
            "metadata_json": json.dumps(metadata or {}, ensure_ascii=False),
            "occurred_at": occurred_dt,
        },
    )

    await session.execute(
        text(
            """
            INSERT INTO announcement_deliveries (
                announcement_id, announcement_key, announcement_version, user_id,
                first_shown_at, last_shown_at, shown_count, last_event,
                closed_at, clicked_at, confirmed_at, confirmed_by_user_id,
                snooze_until, last_error
            )
            VALUES (
                :announcement_id, :announcement_key, :announcement_version, :user_id,
                CASE WHEN :event_type = 'shown' THEN :occurred_at ELSE NULL END,
                CASE WHEN :event_type = 'shown' THEN :occurred_at ELSE NULL END,
                CASE WHEN :event_type = 'shown' THEN 1 ELSE 0 END,
                :event_type,
                CASE WHEN :event_type = 'closed' THEN :occurred_at ELSE NULL END,
                CASE WHEN :event_type = 'clicked' THEN :occurred_at ELSE NULL END,
                CASE WHEN :event_type = 'confirmed' THEN :occurred_at ELSE NULL END,
                CASE WHEN :event_type = 'confirmed' THEN :user_id ELSE NULL END,
                CASE WHEN :event_type = 'snoozed' THEN :snooze_until ELSE NULL END,
                NULL
            )
            ON CONFLICT (announcement_id, user_id) DO UPDATE SET
                first_shown_at = COALESCE(
                    first_shown_at,
                    CASE WHEN :event_type = 'shown' THEN :occurred_at ELSE NULL END
                ),
                last_shown_at = CASE
                    WHEN :event_type = 'shown' THEN :occurred_at
                    ELSE last_shown_at
                END,
                shown_count = CASE
                    WHEN :event_type = 'shown' THEN shown_count + 1
                    ELSE shown_count
                END,
                last_event = :event_type,
                closed_at = CASE
                    WHEN :event_type = 'closed' THEN :occurred_at
                    ELSE closed_at
                END,
                clicked_at = CASE
                    WHEN :event_type = 'clicked' THEN :occurred_at
                    ELSE clicked_at
                END,
                confirmed_at = CASE
                    WHEN :event_type = 'confirmed' THEN :occurred_at
                    ELSE confirmed_at
                END,
                confirmed_by_user_id = CASE
                    WHEN :event_type = 'confirmed' THEN :user_id
                    ELSE confirmed_by_user_id
                END,
                snooze_until = CASE
                    WHEN :event_type = 'snoozed' THEN :snooze_until
                    WHEN :event_type IN ('shown', 'confirmed') THEN NULL
                    ELSE snooze_until
                END,
                last_error = NULL
            """
        ),
        {
            "announcement_id": announcement_id,
            "announcement_key": announcement["announcement_key"],
            "announcement_version": announcement["version"],
            "user_id": user_id,
            "event_type": event_type,
            "occurred_at": occurred_dt,
            "snooze_until": snooze_dt,
        },
    )
    await session.flush()

    return {
        "announcement_id": announcement_id,
        "event_type": event_type,
        "occurred_at": occurred_dt.isoformat(),
        "snooze_until": snooze_dt.isoformat() if snooze_dt else None,
        "recorded": True,
    }


async def schedule_announcement(
    session: AsyncSession,
    *,
    announcement_id: str,
    actor_user_id: str,
    scheduled_at: str | datetime,
) -> dict[str, Any]:
    row = await _get_announcement_row(session, announcement_id)
    if row is None:
        raise ValueError("公告不存在")
    if row["status"] != "draft":
        raise ValueError("只有草稿状态的公告可以排期")

    scheduled_dt = _parse_dt(scheduled_at)
    if scheduled_dt is None:
        raise ValueError("scheduled_at 格式无效")
    if scheduled_dt <= _utc_now():
        raise ValueError("排期时间必须晚于当前时间")
    _validate_publishable_row(row, scheduled_at=scheduled_dt)

    result = await update_returning(
        session,
        """
        UPDATE announcements
        SET status = 'scheduled', scheduled_at = :scheduled_at
        WHERE id = :announcement_id
        RETURNING *
        """,
        {"announcement_id": announcement_id, "scheduled_at": scheduled_dt},
        table="announcements",
        where="id = :announcement_id",
    )
    updated = result.mappings().first()
    await session.flush()
    await _append_audit_log(
        session,
        announcement_id=str(updated["id"]),
        announcement_key=updated["announcement_key"],
        version=updated["version"],
        action="schedule",
        actor_user_id=actor_user_id,
        change_summary={"scheduled_at": _to_iso(updated["scheduled_at"])} ,
    )
    return _row_to_admin_item(updated)


async def unschedule_announcement(
    session: AsyncSession,
    *,
    announcement_id: str,
    actor_user_id: str,
) -> dict[str, Any]:
    row = await _get_announcement_row(session, announcement_id)
    if row is None:
        raise ValueError("公告不存在")
    if row["status"] != "scheduled":
        raise ValueError("只有排期状态的公告可以取消排期")

    result = await update_returning(
        session,
        """
        UPDATE announcements
        SET status = 'draft', scheduled_at = NULL
        WHERE id = :announcement_id
        RETURNING *
        """,
        {"announcement_id": announcement_id},
        table="announcements",
        where="id = :announcement_id",
    )
    updated = result.mappings().first()
    await session.flush()
    await _append_audit_log(
        session,
        announcement_id=str(updated["id"]),
        announcement_key=updated["announcement_key"],
        version=updated["version"],
        action="unschedule",
        actor_user_id=actor_user_id,
        change_summary={"previous_scheduled_at": _to_iso(row["scheduled_at"])},
    )
    return _row_to_admin_item(updated)


async def publish_announcement(
    session: AsyncSession,
    *,
    announcement_id: str,
    actor_user_id: str,
) -> dict[str, Any]:
    row = await _get_announcement_row(session, announcement_id)
    if row is None:
        raise ValueError("公告不存在")
    if row["status"] not in {"draft", "scheduled"}:
        raise ValueError("只有草稿或排期状态的公告可以发布")

    _validate_publishable_row(row)
    now = _utc_now()
    result = await update_returning(
        session,
        """
        UPDATE announcements
        SET status = 'published',
            published_at = :published_at,
            published_by = :published_by
        WHERE id = :announcement_id
        RETURNING *
        """,
        {
            "announcement_id": announcement_id,
            "published_at": now,
            "published_by": actor_user_id,
        },
        table="announcements",
        where="id = :announcement_id",
    )
    updated = result.mappings().first()
    await session.flush()
    await _append_audit_log(
        session,
        announcement_id=str(updated["id"]),
        announcement_key=updated["announcement_key"],
        version=updated["version"],
        action="publish",
        actor_user_id=actor_user_id,
        change_summary={"published_at": _to_iso(updated["published_at"])} ,
    )
    return _row_to_admin_item(updated)


async def archive_announcement(
    session: AsyncSession,
    *,
    announcement_id: str,
    actor_user_id: str,
) -> dict[str, Any]:
    row = await _get_announcement_row(session, announcement_id)
    if row is None:
        raise ValueError("公告不存在")
    if row["status"] != "published":
        raise ValueError("只有已发布公告可以归档")

    now = _utc_now()
    result = await update_returning(
        session,
        """
        UPDATE announcements
        SET status = 'archived', archived_at = :archived_at
        WHERE id = :announcement_id
        RETURNING *
        """,
        {"announcement_id": announcement_id, "archived_at": now},
        table="announcements",
        where="id = :announcement_id",
    )
    updated = result.mappings().first()
    await session.flush()
    await _append_audit_log(
        session,
        announcement_id=str(updated["id"]),
        announcement_key=updated["announcement_key"],
        version=updated["version"],
        action="archive",
        actor_user_id=actor_user_id,
        change_summary={"archived_at": _to_iso(updated["archived_at"])} ,
    )
    return _row_to_admin_item(updated)


async def get_announcement_deliveries(
    session: AsyncSession,
    *,
    announcement_id: str,
    page: int = 1,
    page_size: int = 20,
) -> dict[str, Any]:
    announcement = await _get_announcement_row(session, announcement_id)
    if announcement is None:
        raise ValueError("公告不存在")

    count_result = await session.execute(
        text(
            """
            SELECT COUNT(*) AS total
            FROM announcement_deliveries
            WHERE announcement_id = :announcement_id
            """
        ),
        {"announcement_id": announcement_id},
    )
    total = int(count_result.scalar() or 0)

    result = await session.execute(
        text(
            """
            SELECT d.*, u.email
            FROM announcement_deliveries d
            JOIN users u ON u.id = d.user_id
            WHERE d.announcement_id = :announcement_id
            ORDER BY d.updated_at DESC, d.created_at DESC
            LIMIT :limit OFFSET :offset
            """
        ),
        {
            "announcement_id": announcement_id,
            "limit": page_size,
            "offset": (page - 1) * page_size,
        },
    )
    rows = result.mappings().all()
    return {
        "items": [
            {
                "id": str(row["id"]),
                "user_id": str(row["user_id"]),
                "email": row["email"],
                "announcement_id": str(row["announcement_id"]),
                "announcement_key": row["announcement_key"],
                "announcement_version": row["announcement_version"],
                "shown_count": row["shown_count"],
                "last_event": row["last_event"],
                "first_shown_at": _to_iso(row["first_shown_at"]),
                "last_shown_at": _to_iso(row["last_shown_at"]),
                "closed_at": _to_iso(row["closed_at"]),
                "clicked_at": _to_iso(row["clicked_at"]),
                "confirmed_at": _to_iso(row["confirmed_at"]),
                "confirmed_by_user_id": str(row["confirmed_by_user_id"]) if row["confirmed_by_user_id"] else None,
                "snooze_until": _to_iso(row["snooze_until"]),
                "last_error": row["last_error"],
                "created_at": _to_iso(row["created_at"]),
                "updated_at": _to_iso(row["updated_at"]),
            }
            for row in rows
        ],
        "total": total,
        "page": page,
        "page_size": page_size,
    }
