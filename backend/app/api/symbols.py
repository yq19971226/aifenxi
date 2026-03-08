"""多币种管理 API 路由。"""

import logging

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from pydantic import BaseModel
from app.core.deps import UserInfo, get_current_user, require_admin, require_level
from app.services.symbol_registry import SymbolConfig, SymbolRegistry

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/symbols", tags=["symbols"])


@router.get("/", response_model=list[SymbolConfig])
async def list_symbols(
    user: UserInfo = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> list[SymbolConfig]:
    """获取交易对列表（返回所有 admin 启用的币种）。"""
    registry = SymbolRegistry(session)
    try:
        symbols = await registry.list_symbols(enabled_only=True)
    except Exception as exc:
        logger.error("获取交易对列表失败: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="获取交易对列表失败",
        )

    return symbols


@router.post("/", response_model=SymbolConfig, status_code=status.HTTP_201_CREATED)
async def add_symbol(
    config: SymbolConfig,
    user: UserInfo = Depends(require_level(2)),
    session: AsyncSession = Depends(get_db),
) -> SymbolConfig:
    """添加新交易对（管理员/旗舰）。"""
    registry = SymbolRegistry(session)
    try:
        return await registry.add_symbol(config)
    except Exception as exc:
        logger.error("添加交易对失败: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="添加交易对失败",
        )


# ── 管理员端点 ────────────────────────────────────────────────


class SymbolUpdateRequest(BaseModel):
    """交易对更新请求。"""
    enabled: bool | None = None
    collect_interval_sec: int | None = None
    has_onchain: bool | None = None
    has_derivatives: bool | None = None


@router.get("/admin/all", response_model=list[SymbolConfig])
async def list_all_symbols(
    user: UserInfo = Depends(require_admin),
    session: AsyncSession = Depends(get_db),
) -> list[SymbolConfig]:
    """管理员获取所有交易对（含已禁用）。"""
    registry = SymbolRegistry(session)
    try:
        return await registry.list_symbols(enabled_only=False)
    except Exception as exc:
        logger.error("获取全部交易对失败: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="获取交易对列表失败",
        )


@router.put("/{symbol}", response_model=SymbolConfig)
async def update_symbol(
    symbol: str,
    body: SymbolUpdateRequest,
    user: UserInfo = Depends(require_admin),
    session: AsyncSession = Depends(get_db),
) -> SymbolConfig:
    """管理员更新交易对配置（启用/禁用、采集间隔等）。"""
    registry = SymbolRegistry(session)
    kwargs = body.model_dump(exclude_none=True)
    if not kwargs:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="至少提供一个更新字段",
        )
    try:
        return await registry.update_symbol(symbol, **kwargs)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    except Exception as exc:
        logger.error("更新交易对失败: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="更新交易对失败",
        )


@router.delete("/{symbol}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_symbol(
    symbol: str,
    user: UserInfo = Depends(require_admin),
    session: AsyncSession = Depends(get_db),
) -> None:
    """管理员软删除交易对（设置 enabled=false）。"""
    registry = SymbolRegistry(session)
    try:
        found = await registry.soft_delete(symbol)
    except Exception as exc:
        logger.error("删除交易对失败: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="删除交易对失败",
        )
    if not found:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"交易对 {symbol} 不存在或已禁用",
        )
