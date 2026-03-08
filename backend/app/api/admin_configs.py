"""系统配置管理 API：提供 CRUD + 审计日志、连接测试。"""

import logging
import time

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import UserInfo, require_admin
from app.core.redis import get_redis_pool
from app.services.config_service import (
    AuditLogResponse,
    ConfigCreate,
    ConfigService,
    ConfigUpdate,
    SystemConfigResponse,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/admin/configs", tags=["admin-configs"])


class TestConnectionRequest(BaseModel):
    """连接测试请求"""
    config_key: str
    api_key: str


@router.get("", response_model=list[SystemConfigResponse])
async def list_configs(
    category: str | None = Query(default=None),
    admin: UserInfo = Depends(require_admin),
    session: AsyncSession = Depends(get_db),
) -> list[SystemConfigResponse]:
    """获取配置列表，可按分类过滤。"""
    svc = ConfigService(session)
    return await svc.get_all_configs(category=category)


@router.get("/audit-log")
async def list_audit_logs(
    page: int = Query(default=1, ge=1),
    size: int = Query(default=20, ge=1, le=100),
    admin: UserInfo = Depends(require_admin),
    session: AsyncSession = Depends(get_db),
) -> dict:
    """获取配置变更审计日志（分页）。"""
    svc = ConfigService(session)
    items, total = await svc.get_audit_logs(page=page, size=size)
    return {"items": items, "total": total, "page": page, "size": size}


@router.get("/{key}", response_model=SystemConfigResponse)
async def get_config(
    key: str,
    admin: UserInfo = Depends(require_admin),
    session: AsyncSession = Depends(get_db),
) -> SystemConfigResponse:
    """获取单个配置详情。"""
    svc = ConfigService(session)
    config = await svc.get_config_detail(key)
    if config is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="配置不存在",
        )
    return config


@router.post("", response_model=SystemConfigResponse, status_code=status.HTTP_201_CREATED)
async def create_config(
    data: ConfigCreate,
    admin: UserInfo = Depends(require_admin),
    session: AsyncSession = Depends(get_db),
) -> SystemConfigResponse:
    """创建新配置。"""
    svc = ConfigService(session)
    try:
        return await svc.create_config(data, admin_user_id=admin.id)
    except IntegrityError:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"配置 '{data.config_key}' 已存在",
        )


@router.put("/{key}", response_model=SystemConfigResponse)
async def update_config(
    key: str,
    data: ConfigUpdate,
    admin: UserInfo = Depends(require_admin),
    session: AsyncSession = Depends(get_db),
) -> SystemConfigResponse:
    """更新配置值。"""
    svc = ConfigService(session)
    config = await svc.update_config(key, data, admin_user_id=admin.id)
    if config is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="配置不存在",
        )
    return config


@router.delete("/{key}")
async def delete_config(
    key: str,
    admin: UserInfo = Depends(require_admin),
    session: AsyncSession = Depends(get_db),
) -> dict:
    """删除配置项。"""
    svc = ConfigService(session)
    deleted = await svc.delete_config(key, admin_user_id=admin.id)
    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="配置不存在",
        )
    return {"detail": "已删除"}


@router.post("/test-connection")
async def test_connection(
    data: TestConnectionRequest,
    admin: UserInfo = Depends(require_admin),
) -> dict:
    """测试 API Key 是否可用。"""
    try:
        import httpx
    except ImportError:
        logger.error("httpx 未安装")
        return {
            "success": False,
            "message": "服务端缺少 httpx 依赖",
        }

    # 各类 API 测试端点配置
    test_endpoints = {
        "dmx_api_key": {
            "url": "https://api.dmxapi.cn/v1/models",
            "method": "GET",
            "headers": {"Authorization": f"Bearer {data.api_key}"},
            "timeout": 10,
        },
        "cryptopanic_api_token": {
            "url": f"https://cryptopanic.com/api/free/v1/posts/?auth_token={data.api_key}&public=true",
            "method": "GET",
            "timeout": 10,
        },
        "coinglass_api_key": {
            "url": "https://open-api-v4.coinglass.com/api/futures/supported-coins",
            "method": "GET",
            "headers": {"CG-API-KEY": data.api_key, "accept": "application/json"},
            "timeout": 10,
        },
        "alphanode_api_key": {
            "url": "https://api.alphanode.work/open-api-v4.coinglass.com/api/futures/supported-coins",
            "method": "GET",
            "headers": {"x-key": data.api_key, "accept": "application/json"},
            "timeout": 10,
        },
        "cryptoquant_api_key": {
            "url": f"https://api.cryptoquant.com/v1/btc/market-indicator/mvrv?window=day&limit=1&api_key={data.api_key}",
            "method": "GET",
            "headers": {"accept": "application/json"},
            "timeout": 10,
        },
        "fred_api_key": {
            "url": f"https://api.stlouisfed.org/fred/series/observations?series_id=CPIAUCSL&api_key={data.api_key}&file_type=json&sort_order=desc&limit=1",
            "method": "GET",
            "headers": {"accept": "application/json"},
            "timeout": 10,
        },
        "glassnode_api_key": {
            "url": f"https://api.glassnode.com/v1/metrics/market/price_usd_close?a=BTC&i=24h&api_key={data.api_key}",
            "method": "GET",
            "timeout": 10,
        },
        "coingecko_api_key": {
            "url": "https://api.coingecko.com/api/v3/ping",
            "method": "GET",
            "headers": {"x-cg-demo-api-key": data.api_key, "accept": "application/json"},
            "timeout": 10,
        },
        "telegram_bot_token": {
            "url": f"https://api.telegram.org/bot{data.api_key}/getMe",
            "method": "GET",
            "timeout": 10,
        },
        "sendgrid_api_key": {
            "url": "https://api.sendgrid.com/v3/user/profile",
            "method": "GET",
            "headers": {"Authorization": f"Bearer {data.api_key}"},
            "timeout": 10,
        },
        "nowpayments_api_key": {
            "url": "https://api.nowpayments.io/v1/status",
            "method": "GET",
            "headers": {"x-api-key": data.api_key},
            "timeout": 10,
        },
    }

    if data.config_key not in test_endpoints:
        return {
            "success": False,
            "message": f"不支持 {data.config_key} 的连接测试",
        }

    endpoint = test_endpoints[data.config_key]

    try:
        # 禁用 SSL 验证以兼容部分环境
        async with httpx.AsyncClient(verify=False, timeout=endpoint.get("timeout", 10)) as client:
            if endpoint["method"] == "GET":
                response = await client.get(
                    endpoint["url"],
                    headers=endpoint.get("headers", {}),
                )
            else:
                response = await client.post(
                    endpoint["url"],
                    headers=endpoint.get("headers", {}),
                )

            # 判断响应状态
            if response.status_code == 200:
                return {
                    "success": True,
                    "message": "连接成功，API Key 有效",
                    "status_code": response.status_code,
                }
            elif response.status_code == 401:
                return {
                    "success": False,
                    "message": "API Key 无效或已过期",
                    "status_code": response.status_code,
                }
            elif response.status_code == 403:
                return {
                    "success": False,
                    "message": "API Key 权限不足",
                    "status_code": response.status_code,
                }
            elif response.status_code == 404:
                # CryptoPanic 等 API 对无效 token 返回 404
                if data.config_key in ("cryptopanic_api_token",):
                    return {
                        "success": False,
                        "message": "API Key 无效或已过期（CryptoPanic 返回 404）",
                        "status_code": response.status_code,
                    }
                return {
                    "success": False,
                    "message": f"API 端点不存在（HTTP 404），请检查配置",
                    "status_code": response.status_code,
                }
            elif response.status_code == 429:
                return {
                    "success": False,
                    "message": "请求频率超限，请稍后重试",
                    "status_code": response.status_code,
                }
            else:
                return {
                    "success": False,
                    "message": f"非预期状态码: {response.status_code}",
                    "status_code": response.status_code,
                }

    except httpx.TimeoutException:
        logger.warning(f"连接超时: {data.config_key}")
        return {
            "success": False,
            "message": "连接超时，目标 API 无响应",
        }
    except httpx.ConnectError as e:
        logger.warning(f"连接失败: {data.config_key}, {str(e)}")
        return {
            "success": False,
            "message": f"连接失败: {str(e)}",
        }
    except httpx.RequestError as e:
        logger.warning(f"请求异常: {data.config_key}, {str(e)}")
        return {
            "success": False,
            "message": f"请求异常: {str(e)}",
        }
    except Exception as e:
        logger.error(f"未知错误: {data.config_key}, {str(e)}", exc_info=True)
        return {
            "success": False,
            "message": f"未知错误: {str(e)}",
        }


# ── CoinGlass 双通道运维 ─────────────────────────────────────────


class ChannelSwitchRequest(BaseModel):
    """手动通道切换请求。"""
    channel: str  # "proxy" | "official"
    lock: bool = False


@router.post("/coinglass/channel")
async def switch_coinglass_channel(
    body: ChannelSwitchRequest,
    admin: UserInfo = Depends(require_admin),
) -> dict:
    """手动切换 CoinGlass REST 通道 + 可选锁定。"""
    if body.channel not in ("proxy", "official"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="channel 必须为 'proxy' 或 'official'",
        )

    try:
        redis = get_redis_pool()
        pipe = redis.pipeline()
        pipe.set("cg_channel:active", body.channel)
        pipe.set("cg_channel:switched_at", str(int(time.time())))
        pipe.set("cg_channel:switch_reason", f"manual_switch_by_{admin.id}")
        if body.lock:
            pipe.set("cg_channel:locked", body.channel)
        else:
            pipe.delete("cg_channel:locked")
        await pipe.execute()
    except Exception as exc:
        logger.error(f"Redis 操作失败: {exc}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Redis 操作失败: {str(exc)}",
        )

    lock_risk_warning = ""
    if body.lock and body.channel == "proxy":
        lock_risk_warning = (
            "警告：锁定 proxy 时，proxy 故障将导致持续失败，"
            "系统不会自动降级到 official，直到手动解锁或切换。"
        )
    elif body.lock and body.channel == "official":
        lock_risk_warning = (
            "锁定 official：系统不会自动恢复到 proxy，直到手动解锁。"
        )

    logger.info(
        "coinglass_channel_manual_switch",
        extra={"channel": body.channel, "locked": body.lock, "admin": admin.id},
    )
    return {
        "status": "ok",
        "channel": body.channel,
        "locked": body.lock,
        "lock_risk_warning": lock_risk_warning,
    }


@router.get("/coinglass/channel")
async def get_coinglass_channel(
    admin: UserInfo = Depends(require_admin),
) -> dict:
    """查询 CoinGlass 双通道当前运行态。"""
    try:
        redis = get_redis_pool()
        from datetime import datetime, timezone
        date_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        pipe = redis.pipeline()
        pipe.get("cg_channel:active")
        pipe.get("cg_channel:switch_reason")
        pipe.get("cg_channel:switched_at")
        pipe.get("cg_channel:locked")
        pipe.get(f"cg_proxy_daily:{date_str}")
        pipe.get("cg_proxy_quota_remaining")
        results = await pipe.execute()
        locked = results[3] or ""
        lock_risk_warning = ""
        if locked == "proxy":
            lock_risk_warning = (
                "警告：锁定 proxy 时，proxy 故障将导致持续失败，"
                "系统不会自动降级到 official，直到手动解锁或切换。"
            )
        elif locked == "official":
            lock_risk_warning = (
                "锁定 official：系统不会自动恢复到 proxy，直到手动解锁。"
            )

        payload = {
            "active_channel": results[0] or "unknown",
            "switch_reason": results[1] or "",
            "switched_at": results[2] or "",
            "locked": locked,
            "proxy_daily_usage": results[4] or "0",
            "proxy_quota_remaining": results[5] or "",
            "lock_risk_warning": lock_risk_warning,
            "budget_risk": False,
            "budget_risk_reason": "",
        }

        try:
            from app.core.database import AsyncSessionLocal
            from app.services.symbol_registry import SymbolRegistry

            async with AsyncSessionLocal() as session:
                reg = SymbolRegistry(session)
                symbols = await reg.list_symbols(enabled_only=True)
                derivatives_count = sum(1 for s in symbols if s.has_derivatives)
                if derivatives_count > 3:
                    payload["budget_risk"] = True
                    payload["budget_risk_reason"] = (
                        f"已启用 {derivatives_count} 个衍生品币种，"
                        f"超过 proxy 安全预算范围（≤3）"
                    )
        except Exception as exc_br:
            logger.warning(f"budget_risk check error: {exc_br}")

        return payload
    except Exception as exc:
        logger.error(f"Redis 读取失败: {exc}")
        return {"error": str(exc)}
