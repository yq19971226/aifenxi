"""任务中心 API 路由 — 用户端 + 运营后台。"""

import logging
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File, status
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import UserInfo, get_current_user, require_admin
from app.services import task_service
from app.services.promo_generator import generate_promo

logger = logging.getLogger(__name__)


# ── 请求模型 ──────────────────────────────────────────────────


class SubmitTaskRequest(BaseModel):
    post_url: str = Field(..., min_length=10, description="帖子链接")
    screenshot_url: str = Field(..., min_length=5, description="截图路径或链接")


class ReviewRejectRequest(BaseModel):
    reason: str = Field(..., min_length=1)


# ── 功能开关中间件 ────────────────────────────────────────────


async def _ensure_task_enabled():
    if not await task_service.check_task_enabled():
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="任务中心功能暂未开放",
        )


# ── 用户端路由 ────────────────────────────────────────────────

user_router = APIRouter(prefix="/api/tasks", tags=["tasks"])


@user_router.get("")
async def get_task_home(
    user: UserInfo = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
):
    """任务中心首页。"""
    await _ensure_task_enabled()
    try:
        return await task_service.get_task_home(session, user.user_id)
    except Exception as exc:
        logger.exception("get_task_home failed: user=%s error=%s", user.user_id, exc)
        raise HTTPException(status_code=500, detail=f"任务数据加载失败: {exc}")


@user_router.post("/generate-promo")
async def generate_promo_materials(
    user: UserInfo = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
):
    """生成推广素材。"""
    await _ensure_task_enabled()
    return await generate_promo(session)


_UPLOAD_DIR = Path("uploads/task_proofs")
_MAX_SIZE = 5 * 1024 * 1024  # 5 MB
_ALLOWED_TYPES = {"image/png", "image/jpeg", "image/webp"}


@user_router.post("/upload-proof")
async def upload_proof(
    file: UploadFile = File(...),
    user: UserInfo = Depends(get_current_user),
):
    """上传浏览量截图，返回文件路径。"""
    await _ensure_task_enabled()

    # 校验类型
    content_type = file.content_type or ""
    if content_type not in _ALLOWED_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"不支持的文件类型: {content_type}，仅支持 PNG/JPG/WebP",
        )

    # 读取并校验大小
    data = await file.read()
    if len(data) > _MAX_SIZE:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="文件大小不能超过 5MB",
        )

    # 生成唯一文件名
    ext = content_type.split("/")[-1].replace("jpeg", "jpg")
    filename = f"{uuid.uuid4().hex}.{ext}"
    _UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    filepath = _UPLOAD_DIR / filename

    # 写入文件
    filepath.write_bytes(data)
    logger.info("proof_uploaded: user=%s file=%s size=%d", user.user_id, filename, len(data))

    return {"screenshot_url": f"/uploads/task_proofs/{filename}"}


@user_router.post("/submit")
async def submit_task(
    body: SubmitTaskRequest,
    user: UserInfo = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
):
    """提交今日任务。"""
    await _ensure_task_enabled()
    try:
        return await task_service.submit_task(
            session, user.user_id,
            body.post_url, body.screenshot_url,
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@user_router.get("/my-submissions")
async def get_my_submissions(
    limit: int = Query(default=30, le=100),
    user: UserInfo = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
):
    """我的提交历史。"""
    await _ensure_task_enabled()
    return await task_service.get_my_submissions(session, user.user_id, limit)


@user_router.get("/my-bonus")
async def get_my_bonus(
    user: UserInfo = Depends(get_current_user),
):
    """我的奖励次数余额。"""
    await _ensure_task_enabled()
    return await task_service._get_bonus_balances(user.user_id)


# ── 运营后台路由 ──────────────────────────────────────────────

admin_router = APIRouter(prefix="/api/admin/tasks", tags=["admin-tasks"])


@admin_router.get("/submissions")
async def list_submissions(
    status_filter: str | None = Query(default=None, alias="status"),
    limit: int = Query(default=50, le=100),
    admin: UserInfo = Depends(require_admin),
    session: AsyncSession = Depends(get_db),
):
    """提交列表（支持状态过滤）。"""
    await _ensure_task_enabled()
    return await task_service.get_pending_submissions(session, status_filter, limit)


@admin_router.post("/submissions/{submission_id}/approve")
async def approve_submission(
    submission_id: str,
    admin: UserInfo = Depends(require_admin),
    session: AsyncSession = Depends(get_db),
):
    """审核通过。"""
    await _ensure_task_enabled()
    try:
        await task_service.approve_submission(session, submission_id, admin.user_id)
        return {"message": "审核通过，奖励已发放"}
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@admin_router.post("/submissions/{submission_id}/reject")
async def reject_submission(
    submission_id: str,
    body: ReviewRejectRequest,
    admin: UserInfo = Depends(require_admin),
    session: AsyncSession = Depends(get_db),
):
    """驳回。"""
    await _ensure_task_enabled()
    try:
        await task_service.reject_submission(
            session, submission_id, admin.user_id, body.reason
        )
        return {"message": "已驳回"}
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@admin_router.get("/stats")
async def get_stats(
    admin: UserInfo = Depends(require_admin),
    session: AsyncSession = Depends(get_db),
):
    """任务统计概览。"""
    await _ensure_task_enabled()
    return await task_service.get_task_stats(session)
