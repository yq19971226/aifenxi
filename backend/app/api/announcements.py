import logging
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import UserInfo, get_current_user, require_admin
from app.services import announcement_service

logger = logging.getLogger(__name__)


class AnnouncementDraftRequest(BaseModel):
    announcement_key: str | None = Field(default=None, max_length=100)
    title: str = Field(..., min_length=1, max_length=200)
    summary: str | None = Field(default=None, max_length=2000)
    content_md: str = Field(..., min_length=1)
    display_mode: str = Field(..., min_length=1, max_length=20)
    priority: int = Field(default=0)
    strong_ack_required: bool = Field(default=False)
    allow_snooze: bool = Field(default=True)
    action_text: str | None = Field(default=None, max_length=80)
    action_href: str | None = Field(default=None, max_length=500)
    target_roles: list[str] = Field(default_factory=list)
    target_membership_levels: list[int] = Field(default_factory=list)
    target_path_prefixes: list[str] = Field(default_factory=list)
    starts_at: str | None = None
    ends_at: str | None = None


class AnnouncementUpdateRequest(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    summary: str | None = Field(default=None, max_length=2000)
    content_md: str | None = Field(default=None, min_length=1)
    display_mode: str | None = Field(default=None, min_length=1, max_length=20)
    priority: int | None = None
    strong_ack_required: bool | None = None
    allow_snooze: bool | None = None
    action_text: str | None = Field(default=None, max_length=80)
    action_href: str | None = Field(default=None, max_length=500)
    target_roles: list[str] | None = None
    target_membership_levels: list[int] | None = None
    target_path_prefixes: list[str] | None = None
    starts_at: str | None = None
    ends_at: str | None = None


class AnnouncementEventRequest(BaseModel):
    event_type: str = Field(..., min_length=1, max_length=20)
    pathname: str = Field(..., min_length=1, max_length=500)
    occurred_at: str = Field(..., min_length=1)
    snooze_until: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)


class AnnouncementScheduleRequest(BaseModel):
    scheduled_at: str = Field(..., min_length=1)


def _raise_bad_request(exc: Exception) -> None:
    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))


def _raise_not_found(exc: Exception) -> None:
    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))


def _raise_service_value_error(exc: ValueError) -> None:
    detail = str(exc)
    if "不存在" in detail:
        _raise_not_found(exc)
    if "不在公告目标范围" in detail:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=detail)
    _raise_bad_request(exc)


user_router = APIRouter(prefix="/api/announcements", tags=["announcements"])
admin_router = APIRouter(prefix="/api/admin/announcements", tags=["admin-announcements"])


@user_router.get("/active")
async def get_active_announcements(
    pathname: str | None = Query(default=None, max_length=500),
    user: UserInfo = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
):
    try:
        return await announcement_service.get_active_announcements(
            session,
            user_id=user.user_id,
            role=user.role,
            membership_level=user.membership_level,
            pathname=pathname,
        )
    except Exception as exc:
        logger.error("get_active_announcements failed: user=%s error=%s", user.user_id, exc)
        return []


@user_router.get("/history")
async def get_announcement_history(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    user: UserInfo = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
):
    try:
        return await announcement_service.get_announcement_history(
            session,
            user_id=user.user_id,
            role=user.role,
            membership_level=user.membership_level,
            page=page,
            page_size=page_size,
        )
    except ValueError as exc:
        _raise_service_value_error(exc)
    except Exception as exc:
        logger.error("get_announcement_history failed: user=%s error=%s", user.user_id, exc)
        raise HTTPException(status_code=500, detail="查询公告历史失败")


@user_router.post("/{announcement_id}/events")
async def post_announcement_event(
    announcement_id: str,
    body: AnnouncementEventRequest,
    user: UserInfo = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
):
    try:
        return await announcement_service.record_announcement_event(
            session,
            announcement_id=announcement_id,
            user_id=user.user_id,
            role=user.role,
            membership_level=user.membership_level,
            event_type=body.event_type,
            pathname=body.pathname,
            occurred_at=body.occurred_at,
            snooze_until=body.snooze_until,
            metadata=body.metadata,
        )
    except ValueError as exc:
        _raise_service_value_error(exc)
    except Exception as exc:
        logger.error(
            "post_announcement_event failed: announcement=%s user=%s error=%s",
            announcement_id,
            user.user_id,
            exc,
        )
        raise HTTPException(status_code=500, detail="写入公告事件失败")


@admin_router.get("")
async def list_announcements(
    status_filter: str | None = Query(default=None, alias="status"),
    display_mode: str | None = Query(default=None),
    search: str | None = Query(default=None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    admin: UserInfo = Depends(require_admin),
    session: AsyncSession = Depends(get_db),
):
    try:
        return await announcement_service.list_admin_announcements(
            session,
            status=status_filter,
            display_mode=display_mode,
            search=search,
            page=page,
            page_size=page_size,
        )
    except ValueError as exc:
        _raise_service_value_error(exc)
    except Exception as exc:
        logger.error("list_announcements failed: admin=%s error=%s", admin.user_id, exc)
        raise HTTPException(status_code=500, detail="查询公告列表失败")


@admin_router.post("")
async def create_announcement(
    body: AnnouncementDraftRequest,
    admin: UserInfo = Depends(require_admin),
    session: AsyncSession = Depends(get_db),
):
    try:
        return await announcement_service.create_announcement_draft(
            session,
            actor_user_id=admin.user_id,
            data=body.model_dump(),
        )
    except ValueError as exc:
        _raise_service_value_error(exc)
    except Exception as exc:
        logger.error("create_announcement failed: admin=%s error=%s", admin.user_id, exc)
        raise HTTPException(status_code=500, detail="创建公告草稿失败")


@admin_router.put("/{announcement_id}")
async def update_announcement(
    announcement_id: str,
    body: AnnouncementUpdateRequest,
    admin: UserInfo = Depends(require_admin),
    session: AsyncSession = Depends(get_db),
):
    data = body.model_dump(exclude_unset=True)
    if not data:
        raise HTTPException(status_code=400, detail="无更新字段")
    try:
        return await announcement_service.update_announcement(
            session,
            announcement_id=announcement_id,
            actor_user_id=admin.user_id,
            data=data,
        )
    except ValueError as exc:
        _raise_service_value_error(exc)
    except Exception as exc:
        logger.error(
            "update_announcement failed: announcement=%s admin=%s error=%s",
            announcement_id,
            admin.user_id,
            exc,
        )
        raise HTTPException(status_code=500, detail="更新公告失败")


@admin_router.post("/{announcement_id}/schedule")
async def schedule_announcement(
    announcement_id: str,
    body: AnnouncementScheduleRequest,
    admin: UserInfo = Depends(require_admin),
    session: AsyncSession = Depends(get_db),
):
    try:
        return await announcement_service.schedule_announcement(
            session,
            announcement_id=announcement_id,
            actor_user_id=admin.user_id,
            scheduled_at=body.scheduled_at,
        )
    except ValueError as exc:
        _raise_service_value_error(exc)
    except Exception as exc:
        logger.error(
            "schedule_announcement failed: announcement=%s admin=%s error=%s",
            announcement_id,
            admin.user_id,
            exc,
        )
        raise HTTPException(status_code=500, detail="公告排期失败")


@admin_router.post("/{announcement_id}/unschedule")
async def unschedule_announcement(
    announcement_id: str,
    admin: UserInfo = Depends(require_admin),
    session: AsyncSession = Depends(get_db),
):
    try:
        return await announcement_service.unschedule_announcement(
            session,
            announcement_id=announcement_id,
            actor_user_id=admin.user_id,
        )
    except ValueError as exc:
        _raise_service_value_error(exc)
    except Exception as exc:
        logger.error(
            "unschedule_announcement failed: announcement=%s admin=%s error=%s",
            announcement_id,
            admin.user_id,
            exc,
        )
        raise HTTPException(status_code=500, detail="取消公告排期失败")


@admin_router.post("/{announcement_id}/publish")
async def publish_announcement(
    announcement_id: str,
    admin: UserInfo = Depends(require_admin),
    session: AsyncSession = Depends(get_db),
):
    try:
        return await announcement_service.publish_announcement(
            session,
            announcement_id=announcement_id,
            actor_user_id=admin.user_id,
        )
    except ValueError as exc:
        _raise_service_value_error(exc)
    except Exception as exc:
        logger.error(
            "publish_announcement failed: announcement=%s admin=%s error=%s",
            announcement_id,
            admin.user_id,
            exc,
        )
        raise HTTPException(status_code=500, detail="发布公告失败")


@admin_router.post("/{announcement_id}/archive")
async def archive_announcement(
    announcement_id: str,
    admin: UserInfo = Depends(require_admin),
    session: AsyncSession = Depends(get_db),
):
    try:
        return await announcement_service.archive_announcement(
            session,
            announcement_id=announcement_id,
            actor_user_id=admin.user_id,
        )
    except ValueError as exc:
        _raise_service_value_error(exc)
    except Exception as exc:
        logger.error(
            "archive_announcement failed: announcement=%s admin=%s error=%s",
            announcement_id,
            admin.user_id,
            exc,
        )
        raise HTTPException(status_code=500, detail="归档公告失败")


@admin_router.delete("/{announcement_id}")
async def delete_announcement(
    announcement_id: str,
    admin: UserInfo = Depends(require_admin),
    session: AsyncSession = Depends(get_db),
):
    try:
        return await announcement_service.delete_announcement(
            session,
            announcement_id=announcement_id,
            actor_user_id=admin.user_id,
        )
    except ValueError as exc:
        _raise_service_value_error(exc)
    except Exception as exc:
        logger.error(
            "delete_announcement failed: announcement=%s admin=%s error=%s",
            announcement_id,
            admin.user_id,
            exc,
        )
        raise HTTPException(status_code=500, detail="删除公告失败")


@admin_router.get("/{announcement_id}/deliveries")
async def get_announcement_deliveries(
    announcement_id: str,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    admin: UserInfo = Depends(require_admin),
    session: AsyncSession = Depends(get_db),
):
    try:
        return await announcement_service.get_announcement_deliveries(
            session,
            announcement_id=announcement_id,
            page=page,
            page_size=page_size,
        )
    except ValueError as exc:
        _raise_service_value_error(exc)
    except Exception as exc:
        logger.error(
            "get_announcement_deliveries failed: announcement=%s admin=%s error=%s",
            announcement_id,
            admin.user_id,
            exc,
        )
        raise HTTPException(status_code=500, detail="查询公告投递记录失败")
