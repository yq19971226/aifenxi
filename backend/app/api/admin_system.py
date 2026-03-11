"""
系统管理 API — 一键更新、一键回退、系统状态查询。

部署代理 (deploy-agent.py) 运行在宿主机 127.0.0.1:9321，
后端容器通过 host.docker.internal:9321 与之通信。
"""

import logging
import os

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from collections import deque

from app.core.config import settings
from app.core.deps import UserInfo, require_admin

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/admin/system", tags=["admin-system"])

DEPLOY_AGENT_URL = os.environ.get(
    "DEPLOY_AGENT_URL", "http://host.docker.internal:9321"
)
DEPLOY_AGENT_TOKEN = os.environ.get("DEPLOY_AGENT_TOKEN", "")


def _agent_headers() -> dict[str, str]:
    headers: dict[str, str] = {}
    if DEPLOY_AGENT_TOKEN:
        headers["Authorization"] = f"Bearer {DEPLOY_AGENT_TOKEN}"
    return headers


class RollbackRequest(BaseModel):
    target: str | None = Field(
        default=None,
        description="可选，回退到指定 commit/tag；为空时默认回退到上一个版本",
    )


class DeployRequest(BaseModel):
    target: str | None = Field(
        default=None,
        description="可选，部署到指定 commit/tag；为空时拉取当前分支最新提交",
    )


@router.get("/status")
async def system_status(admin: UserInfo = Depends(require_admin)) -> dict:
    """获取系统状态：Git 版本、Docker 容器、上次部署信息。"""
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.get(
                f"{DEPLOY_AGENT_URL}/status",
                headers=_agent_headers(),
            )
            if resp.status_code == 200:
                data = resp.json()
                data["agent_connected"] = True
                return data
            return {
                "agent_connected": False,
                "error": f"部署代理返回 {resp.status_code}",
            }
    except Exception as exc:
        logger.warning("无法连接部署代理: %s", exc)
        return {
            "agent_connected": False,
            "error": "无法连接部署代理，请确认 axiom-deploy-agent 服务已启动",
            "deploying": False,
            "git": {},
            "containers": [],
        }


@router.post("/deploy")
async def trigger_deploy(
    request: DeployRequest | None = None,
    admin: UserInfo = Depends(require_admin),
):
    """触发一键部署，返回 SSE 流式日志。"""
    target = request.target if request else None
    logger.info("管理员 %s 触发系统更新", admin.user_id)

    async def stream_action(path: str, payload: dict | None = None):
        try:
            async with httpx.AsyncClient(timeout=600) as client:
                async with client.stream(
                    "POST",
                    f"{DEPLOY_AGENT_URL}{path}",
                    headers=_agent_headers(),
                    json=payload,
                ) as resp:
                    if resp.status_code != 200:
                        detail = "请求部署代理失败"
                        try:
                            error_payload = await resp.aread()
                            if error_payload:
                                detail = error_payload.decode("utf-8")
                        except Exception:
                            detail = f"部署代理返回状态码 {resp.status_code}"
                        yield f'event: error\ndata: "部署失败: {detail}"\n\n'
                        return
                    async for line in resp.aiter_lines():
                        if line:
                            yield line + "\n"
        except httpx.ConnectError:
            yield 'event: error\ndata: "无法连接部署代理，请确认服务已启动"\n\n'
        except Exception as exc:
            yield f'event: error\ndata: "部署异常: {exc}"\n\n'

    return StreamingResponse(
        stream_action("/deploy", {"target": target} if target else {}),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


@router.get("/version")
async def system_version(admin: UserInfo = Depends(require_admin)) -> dict:
    """获取当前系统版本号。"""
    return {
        "version": settings.app_version if hasattr(settings, "app_version") else "3.0.0",
        "env": settings.app_env,
    }


@router.post("/rollback")
async def trigger_rollback(
    request: RollbackRequest | None = None,
    admin: UserInfo = Depends(require_admin),
):
    """触发一键回退，返回 SSE 流式日志。"""
    target = request.target if request else None
    logger.warning("管理员 %s 触发系统回退 target=%s", admin.user_id, target)

    async def stream_rollback():
        try:
            async with httpx.AsyncClient(timeout=600) as client:
                async with client.stream(
                    "POST",
                    f"{DEPLOY_AGENT_URL}/rollback",
                    headers=_agent_headers(),
                    json={"target": target} if target else {},
                ) as resp:
                    if resp.status_code != 200:
                        detail = "请求部署代理失败"
                        try:
                            error_payload = await resp.aread()
                            if error_payload:
                                detail = error_payload.decode("utf-8")
                        except Exception:
                            detail = f"部署代理返回状态码 {resp.status_code}"
                        yield f'event: error\ndata: "回退失败: {detail}"\n\n'
                        return
                    async for line in resp.aiter_lines():
                        if line:
                            yield line + "\n"
        except httpx.ConnectError:
            yield 'event: error\ndata: "无法连接部署代理，请确认服务已启动"\n\n'
        except Exception as exc:
            yield f'event: error\ndata: "回退异常: {exc}"\n\n'

    return StreamingResponse(
        stream_rollback(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


@router.get("/logs/{log_type}")
async def get_system_logs(
    log_type: str,
    lines: int = Query(default=100, ge=10, le=500),
    admin: UserInfo = Depends(require_admin),
) -> dict:
    """获取系统日志内容。"""
    log_files = {
        "stdout": "uvicorn_8000_stdout.log",
        "stderr": "uvicorn_8000_stderr.log",
        "backend_stdout": "backend_uvicorn_stdout.log",
        "backend_stderr": "backend_uvicorn_stderr.log",
    }

    file_name = log_files.get(log_type)
    if not file_name:
        raise HTTPException(status_code=400, detail="无效的日志类型")

    # 获取 backend 目录路径 (假设此文件在 app/api/)
    base_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    file_path = os.path.join(base_dir, file_name)

    if not os.path.exists(file_path):
        return {
            "log_type": log_type,
            "content": f"日志文件 {file_name} 不存在于 {base_dir}",
            "lines": 0,
        }

    try:
        with open(file_path, "r", encoding="utf-8", errors="replace") as f:
            content = "".join(deque(f, maxlen=lines))
            return {
                "log_type": log_type,
                "content": content,
                "lines": len(content.splitlines()),
            }
    except Exception as exc:
        logger.error("读取日志失败", log_type=log_type, error=str(exc))
        raise HTTPException(status_code=500, detail=f"读取日志失败: {exc}")
