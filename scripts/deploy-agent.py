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
from socketserver import ThreadingMixIn
from datetime import datetime, timezone

PROJECT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEPLOY_SCRIPT = os.path.join(PROJECT_DIR, "scripts", "deploy.sh")
ROLLBACK_SCRIPT = os.path.join(PROJECT_DIR, "scripts", "rollback.sh")
COMPOSE_CMD = [
    "docker", "compose",
    "-f", os.path.join(PROJECT_DIR, "docker-compose.yml"),
    "-f", os.path.join(PROJECT_DIR, "docker-compose.prod.yml"),
]

# 全局部署锁 — 同一时间只允许一个部署
_deploy_lock = threading.Lock()
_deploy_running = False
_last_deploy: dict | None = None

AUTH_TOKEN = os.environ.get("DEPLOY_AGENT_TOKEN", "")

# git fetch 结果缓存，避免每 30s 轮询都执行网络请求
_git_cache: dict | None = None
_git_cache_time: float = 0
GIT_CACHE_TTL = 60  # 秒


def _json_response(handler: BaseHTTPRequestHandler, status: int, data: dict):
    body = json.dumps(data, ensure_ascii=False).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Content-Length", str(len(body)))
    handler.end_headers()
    handler.wfile.write(body)


def _read_json_body(handler: BaseHTTPRequestHandler) -> dict:
    length = int(handler.headers.get("Content-Length", "0") or "0")
    if length <= 0:
        return {}
    raw = handler.rfile.read(length)
    if not raw:
        return {}
    try:
        return json.loads(raw.decode("utf-8"))
    except Exception:
        return {}


def _check_auth(handler: BaseHTTPRequestHandler) -> bool:
    if not AUTH_TOKEN:
        return True
    auth = handler.headers.get("Authorization", "")
    if auth == f"Bearer {AUTH_TOKEN}":
        return True
    _json_response(handler, 401, {"error": "未授权"})
    return False


def _git_commit_short() -> str:
    """仅获取当前 commit hash，无网络请求。"""
    try:
        return subprocess.check_output(
            ["git", "rev-parse", "--short", "HEAD"],
            cwd=PROJECT_DIR, text=True, timeout=5
        ).strip()
    except Exception:
        return "unknown"


def _git_info(force_fetch: bool = False) -> dict:
    global _git_cache, _git_cache_time

    # 返回缓存（60s 内不重复 fetch）
    if not force_fetch and _git_cache and (time.time() - _git_cache_time < GIT_CACHE_TTL):
        return _git_cache

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
        result = {
            "commit": commit,
            "message": message,
            "branch": branch,
            "behind": behind,
            "has_update": behind > 0,
        }
        _git_cache = result
        _git_cache_time = time.time()
        return result
    except Exception as e:
        return {"error": str(e)}


def _docker_status() -> list[dict]:
    try:
        output = subprocess.check_output(
            [*COMPOSE_CMD, "ps", "--format", "json"],
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


class ThreadingHTTPServer(ThreadingMixIn, HTTPServer):
    daemon_threads = True


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
        global _deploy_running, _last_deploy, _git_cache, _git_cache_time

        if not _check_auth(self):
            return

        if self.path not in ("/deploy", "/rollback"):
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

            payload = _read_json_body(self)
            target = str(payload.get("target", "")).strip()

            if self.path == "/rollback":
                if target:
                    send_event("log", f"开始回退... (target={target})")
                    cmd = ["bash", ROLLBACK_SCRIPT, target]
                else:
                    send_event("log", "开始回退... (target=上一个版本)")
                    cmd = ["bash", ROLLBACK_SCRIPT]
                action = "rollback"
            else:
                if target:
                    send_event("log", f"开始部署... (target={target})")
                    cmd = ["bash", DEPLOY_SCRIPT, target]
                else:
                    send_event("log", "开始部署... (target=latest)")
                    cmd = ["bash", DEPLOY_SCRIPT]
                action = "deploy"

            process = subprocess.Popen(
                cmd,
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
                done_msg = "回退成功" if action == "rollback" else "部署成功"
                send_event("done", f"{done_msg}，耗时 {elapsed} 秒")
            else:
                fail_msg = "回退失败" if action == "rollback" else "部署失败"
                send_event("error", f"{fail_msg} (exit code: {process.returncode})，耗时 {elapsed} 秒")

        except Exception as e:
            elapsed = round(time.time() - start_time, 1)
            action_name = "回退" if self.path == "/rollback" else "部署"
            send_event("error", f"{action_name}异常: {e}")
        finally:
            _deploy_running = False
            _last_deploy = {
                "success": success,
                "elapsed_s": elapsed,
                "finished_at": datetime.now(timezone.utc).isoformat(),
                "commit": _git_commit_short(),
                "action": "rollback" if self.path == "/rollback" else "deploy",
            }
            # 部署完成后清除 git 缓存，下次查询会重新 fetch
            _git_cache = None
            _git_cache_time = 0
            _deploy_lock.release()


def main():
    host = "127.0.0.1"
    port = int(os.environ.get("DEPLOY_AGENT_PORT", "9321"))
    server = ThreadingHTTPServer((host, port), DeployHandler)
    print(f"Axiom Deploy Agent 运行在 {host}:{port}")
    print(f"项目目录: {PROJECT_DIR}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n停止部署代理")
        server.shutdown()


if __name__ == "__main__":
    main()
