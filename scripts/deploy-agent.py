#!/usr/bin/env python3
"""
Axiom 部署代理 — 运行在宿主机上的轻量 HTTP 服务。

功能：
- 接收后端 API 的部署请求，执行 scripts/deploy.sh
- 仅监听 127.0.0.1:9321，不对外暴露
- 返回 SSE 流式日志，前端可实时显示进度
- 提供系统状态查询（git 版本、Docker 容器状态）

安装为 systemd 服务后，后端容器通过 host.docker.internal:9321 调用。
零外部依赖，仅使用 Python 标准库。
"""

import json
import subprocess
import threading
import os
import time
from http.server import HTTPServer, BaseHTTPRequestHandler
from datetime import datetime, timezone

PROJECT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEPLOY_SCRIPT = os.path.join(PROJECT_DIR, "scripts", "deploy.sh")
COMPOSE_CMD = f"docker compose -f {PROJECT_DIR}/docker-compose.yml -f {PROJECT_DIR}/docker-compose.prod.yml"

# 全局部署锁 — 同一时间只允许一个部署
_deploy_lock = threading.Lock()
_deploy_running = False
_last_deploy: dict | None = None

AUTH_TOKEN = os.environ.get("DEPLOY_AGENT_TOKEN", "")


def _json_response(handler: BaseHTTPRequestHandler, status: int, data: dict):
    body = json.dumps(data, ensure_ascii=False).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Content-Length", str(len(body)))
    handler.end_headers()
    handler.wfile.write(body)


def _check_auth(handler: BaseHTTPRequestHandler) -> bool:
    if not AUTH_TOKEN:
        return True
    auth = handler.headers.get("Authorization", "")
    if auth == f"Bearer {AUTH_TOKEN}":
        return True
    _json_response(handler, 401, {"error": "未授权"})
    return False


def _git_info() -> dict:
    try:
        commit = subprocess.check_output(
            ["git", "rev-parse", "--short", "HEAD"],
            cwd=PROJECT_DIR, text=True, timeout=5
        ).strip()
        message = subprocess.check_output(
            ["git", "log", "-1", "--pretty=%s"],
            cwd=PROJECT_DIR, text=True, timeout=5
        ).strip()
        branch = subprocess.check_output(
            ["git", "rev-parse", "--abbrev-ref", "HEAD"],
            cwd=PROJECT_DIR, text=True, timeout=5
        ).strip()
        # 检查是否有远程更新
        subprocess.check_call(
            ["git", "fetch", "origin", "--quiet"],
            cwd=PROJECT_DIR, timeout=15
        )
        local = subprocess.check_output(
            ["git", "rev-parse", "HEAD"],
            cwd=PROJECT_DIR, text=True, timeout=5
        ).strip()
        remote = subprocess.check_output(
            ["git", "rev-parse", f"origin/{branch}"],
            cwd=PROJECT_DIR, text=True, timeout=5
        ).strip()
        behind = 0
        if local != remote:
            behind_output = subprocess.check_output(
                ["git", "rev-list", "--count", f"HEAD..origin/{branch}"],
                cwd=PROJECT_DIR, text=True, timeout=5
            ).strip()
            behind = int(behind_output)
        return {
            "commit": commit,
            "message": message,
            "branch": branch,
            "behind": behind,
            "has_update": behind > 0,
        }
    except Exception as e:
        return {"error": str(e)}


def _docker_status() -> list[dict]:
    try:
        output = subprocess.check_output(
            f"{COMPOSE_CMD} ps --format json".split(),
            cwd=PROJECT_DIR, text=True, timeout=10
        )
        containers = []
        for line in output.strip().split("\n"):
            if not line.strip():
                continue
            try:
                c = json.loads(line)
                containers.append({
                    "name": c.get("Name", ""),
                    "service": c.get("Service", ""),
                    "state": c.get("State", ""),
                    "status": c.get("Status", ""),
                    "health": c.get("Health", ""),
                })
            except json.JSONDecodeError:
                continue
        return containers
    except Exception as e:
        return [{"error": str(e)}]


class DeployHandler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        # 静默日志，避免刷屏
        pass

    def do_GET(self):
        if not _check_auth(self):
            return

        if self.path == "/status":
            git = _git_info()
            containers = _docker_status()
            _json_response(self, 200, {
                "deploying": _deploy_running,
                "last_deploy": _last_deploy,
                "git": git,
                "containers": containers,
                "server_time": datetime.now(timezone.utc).isoformat(),
            })
            return

        if self.path == "/health":
            _json_response(self, 200, {"status": "ok"})
            return

        _json_response(self, 404, {"error": "未知路径"})

    def do_POST(self):
        global _deploy_running, _last_deploy

        if not _check_auth(self):
            return

        if self.path != "/deploy":
            _json_response(self, 404, {"error": "未知路径"})
            return

        if _deploy_running:
            _json_response(self, 409, {"error": "部署正在进行中，请稍后再试"})
            return

        if not _deploy_lock.acquire(blocking=False):
            _json_response(self, 409, {"error": "部署正在进行中"})
            return

        # SSE 流式响应
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream; charset=utf-8")
        self.send_header("Cache-Control", "no-cache")
        self.send_header("X-Accel-Buffering", "no")
        self.end_headers()

        _deploy_running = True
        start_time = time.time()
        success = False

        try:
            def send_event(event: str, data: str):
                try:
                    msg = f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"
                    self.wfile.write(msg.encode("utf-8"))
                    self.wfile.flush()
                except Exception:
                    pass

            send_event("log", "开始部署...")

            process = subprocess.Popen(
                ["bash", DEPLOY_SCRIPT, "--no-backup"],
                cwd=PROJECT_DIR,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                bufsize=1,
            )

            for line in process.stdout:
                line = line.rstrip()
                if line:
                    send_event("log", line)

            process.wait()
            elapsed = round(time.time() - start_time, 1)

            if process.returncode == 0:
                success = True
                send_event("done", f"部署成功，耗时 {elapsed} 秒")
            else:
                send_event("error", f"部署失败 (exit code: {process.returncode})，耗时 {elapsed} 秒")

        except Exception as e:
            elapsed = round(time.time() - start_time, 1)
            send_event("error", f"部署异常: {e}")
        finally:
            _deploy_running = False
            _last_deploy = {
                "success": success,
                "elapsed_s": elapsed,
                "finished_at": datetime.now(timezone.utc).isoformat(),
                "commit": _git_info().get("commit", "unknown"),
            }
            _deploy_lock.release()


def main():
    host = "127.0.0.1"
    port = int(os.environ.get("DEPLOY_AGENT_PORT", "9321"))
    server = HTTPServer((host, port), DeployHandler)
    print(f"Axiom Deploy Agent 运行在 {host}:{port}")
    print(f"项目目录: {PROJECT_DIR}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n停止部署代理")
        server.shutdown()


if __name__ == "__main__":
    main()
