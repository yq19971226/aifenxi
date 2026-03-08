"""智能体管理 API 路由

端点：
- GET  /api/agents                  — 获取所有智能体列表
- GET  /api/agents/enabled          — 获取启用的智能体
- GET  /api/agents/stats            — 获取智能体统计
- GET  /api/agents/categories       — 获取智能体分类
- PUT  /api/agents/{agent_id}       — 更新智能体状态
- POST /api/agents/batch-update     — 批量更新智能体状态
- POST /api/agents/initialize       — 初始化默认配置（管理员）
"""

import logging

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import UserInfo, get_current_user, require_admin
from app.services.agent_management import AgentManagementService, AGENT_CATEGORIES

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/agents", tags=["agents"])


class AgentUpdateRequest(BaseModel):
    """智能体状态更新请求"""

    enabled: bool


class BatchUpdateRequest(BaseModel):
    """批量更新请求"""

    updates: list[dict]


@router.get("")
async def get_all_agents(
    session: AsyncSession = Depends(get_db),
    _user: UserInfo = Depends(get_current_user),
) -> dict:
    """获取所有智能体列表"""
    try:
        service = AgentManagementService(session)
        agents = await service.get_all_agents()

        return {
            "agents": agents,
            "total": len(agents),
        }

    except Exception as exc:
        logger.error("Failed to get agents", extra={"error": str(exc)})
        raise HTTPException(status_code=500, detail="获取智能体列表失败")


@router.get("/enabled")
async def get_enabled_agents(
    session: AsyncSession = Depends(get_db),
    _user: UserInfo = Depends(get_current_user),
) -> dict:
    """获取当前启用的智能体"""
    try:
        service = AgentManagementService(session)
        enabled_agents = await service.get_enabled_agents()

        return {
            "enabled_agents": enabled_agents,
            "count": len(enabled_agents),
        }

    except Exception as exc:
        logger.error("Failed to get enabled agents", extra={"error": str(exc)})
        raise HTTPException(status_code=500, detail="获取启用智能体失败")


@router.get("/stats")
async def get_agent_stats(
    session: AsyncSession = Depends(get_db),
    _user: UserInfo = Depends(get_current_user),
) -> dict:
    """获取智能体统计信息"""
    try:
        service = AgentManagementService(session)
        stats = await service.get_agent_stats()

        return stats

    except Exception as exc:
        logger.error("Failed to get agent stats", extra={"error": str(exc)})
        raise HTTPException(status_code=500, detail="获取智能体统计失败")


@router.get("/categories")
async def get_agent_categories(
    _user: UserInfo = Depends(get_current_user),
) -> dict:
    """获取智能体分类"""
    return {
        "categories": [
            {"id": cat_id, "name": cat_name}
            for cat_id, cat_name in AGENT_CATEGORIES.items()
        ]
    }


@router.get("/category/{category}")
async def get_agents_by_category(
    category: str,
    session: AsyncSession = Depends(get_db),
    _user: UserInfo = Depends(get_current_user),
) -> dict:
    """按分类获取智能体"""
    if category not in AGENT_CATEGORIES:
        raise HTTPException(status_code=404, detail="分类不存在")

    try:
        service = AgentManagementService(session)
        agents = await service.get_agents_by_category(category)

        return {
            "category": category,
            "category_name": AGENT_CATEGORIES[category],
            "agents": agents,
            "count": len(agents),
        }

    except Exception as exc:
        logger.error(
            "Failed to get agents by category",
            extra={"category": category, "error": str(exc)},
        )
        raise HTTPException(status_code=500, detail="获取分类智能体失败")


@router.put("/{agent_id}")
async def update_agent_status(
    agent_id: str,
    request: AgentUpdateRequest,
    session: AsyncSession = Depends(get_db),
    user: UserInfo = Depends(require_admin),
) -> dict:
    """更新智能体启用状态（管理员）"""
    try:
        service = AgentManagementService(session)
        success = await service.update_agent_status(
            agent_id, request.enabled, updated_by=user.email
        )

        if not success:
            raise HTTPException(status_code=404, detail="智能体不存在")

        return {
            "success": True,
            "agent_id": agent_id,
            "enabled": request.enabled,
            "message": f"智能体已{'启用' if request.enabled else '禁用'}",
        }

    except HTTPException:
        raise
    except Exception as exc:
        logger.error(
            "Failed to update agent status",
            extra={"agent_id": agent_id, "error": str(exc)},
        )
        raise HTTPException(status_code=500, detail="更新智能体状态失败")


@router.post("/batch-update")
async def batch_update_agents(
    request: BatchUpdateRequest,
    session: AsyncSession = Depends(get_db),
    user: UserInfo = Depends(require_admin),
) -> dict:
    """批量更新智能体状态（管理员）"""
    try:
        service = AgentManagementService(session)
        result = await service.batch_update_agents(
            request.updates, updated_by=user.email
        )

        return {
            "success": True,
            "updated": result["success"],
            "failed": result["failed"],
            "errors": result["errors"],
        }

    except Exception as exc:
        logger.error("Failed to batch update agents", extra={"error": str(exc)})
        raise HTTPException(status_code=500, detail="批量更新智能体失败")


@router.post("/initialize")
async def initialize_default_agents(
    session: AsyncSession = Depends(get_db),
    _admin: UserInfo = Depends(require_admin),
) -> dict:
    """初始化默认智能体配置（管理员）"""
    try:
        service = AgentManagementService(session)
        await service.initialize_default_agents()

        return {
            "success": True,
            "message": "默认智能体配置已初始化",
        }

    except Exception as exc:
        logger.error("Failed to initialize agents", extra={"error": str(exc)})
        raise HTTPException(status_code=500, detail="初始化智能体配置失败")
