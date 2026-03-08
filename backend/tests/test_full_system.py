"""Axiom 系统全面集成测试 — 30 轮深度测试脚本

覆盖：Auth / Dashboard / Consensus / Analysis / Backtest / Playbook /
      Admin / Partner / Tasks / Alerts / Settings / WebSocket 等全部 API
"""

import asyncio
import io
import json
import sys
import time
import httpx

# Fix Windows GBK encoding
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')

API = "http://localhost:8000"

# ── Test accounts ──
ADMIN_EMAIL = "test_admin@axiom.dev"
ADMIN_PASS = "TestAdmin2025!"
USER_EMAIL = "test_user@axiom.dev"
USER_PASS = "TestUser2025!"

# Track results
results: list[dict] = []
admin_token = ""
user_token = ""
admin_refresh = ""
user_refresh = ""


def log(round_num: int, test_name: str, status: str, detail: str = ""):
    icon = "[OK]" if status == "PASS" else "[FAIL]" if status == "FAIL" else "[WARN]"
    results.append({"round": round_num, "test": test_name, "status": status, "detail": detail})
    print(f"  {icon} R{round_num:02d} | {test_name}: {status}" + (f" -- {detail}" if detail else ""))


async def run_all_tests():
    global admin_token, user_token, admin_refresh, user_refresh

    async with httpx.AsyncClient(base_url=API, timeout=30) as c:

        print("\n" + "=" * 70)
        print("  AXIOM 系统全面集成测试 — 30 轮")
        print("=" * 70)

        # ════════════════════════════════════════════════════════════
        # Round 1: 健康检查
        # ════════════════════════════════════════════════════════════
        print("\n── Round 1: 服务健康检查 ──")
        try:
            r = await c.get("/docs")
            log(1, "FastAPI /docs", "PASS" if r.status_code == 200 else "FAIL", f"status={r.status_code}")
        except Exception as e:
            log(1, "FastAPI /docs", "FAIL", str(e))

        try:
            r = await c.get("/api/auth/register-config")
            log(1, "GET /api/auth/register-config", "PASS" if r.status_code == 200 else "FAIL", f"{r.json()}")
        except Exception as e:
            log(1, "GET /api/auth/register-config", "FAIL", str(e))

        # ════════════════════════════════════════════════════════════
        # Round 2: 注册测试账户
        # ════════════════════════════════════════════════════════════
        print("\n── Round 2: 注册测试账户 ──")
        for email, pwd, role in [
            (ADMIN_EMAIL, ADMIN_PASS, "admin"),
            (USER_EMAIL, USER_PASS, "user"),
        ]:
            try:
                r = await c.post("/api/auth/register", json={"email": email, "password": pwd})
                if r.status_code == 201:
                    log(2, f"注册 {role}", "PASS", r.json().get("message", ""))
                elif r.status_code == 409:
                    log(2, f"注册 {role}", "PASS", "已存在，跳过")
                else:
                    log(2, f"注册 {role}", "FAIL", f"status={r.status_code} {r.text[:200]}")
            except Exception as e:
                log(2, f"注册 {role}", "FAIL", str(e))

        # ════════════════════════════════════════════════════════════
        # Round 3: 登录测试
        # ════════════════════════════════════════════════════════════
        print("\n── Round 3: 登录测试 ──")
        for email, pwd, role in [
            (ADMIN_EMAIL, ADMIN_PASS, "admin"),
            (USER_EMAIL, USER_PASS, "user"),
        ]:
            try:
                r = await c.post("/api/auth/login", data={"username": email, "password": pwd})
                if r.status_code == 200:
                    data = r.json()
                    if role == "admin":
                        admin_token = data["access_token"]
                        admin_refresh = data["refresh_token"]
                    else:
                        user_token = data["access_token"]
                        user_refresh = data["refresh_token"]
                    log(3, f"登录 {role}", "PASS", f"token_type={data['token_type']}")
                else:
                    log(3, f"登录 {role}", "FAIL", f"status={r.status_code} {r.text[:200]}")
            except Exception as e:
                log(3, f"登录 {role}", "FAIL", str(e))

        # ════════════════════════════════════════════════════════════
        # Round 4: Token 刷新测试
        # ════════════════════════════════════════════════════════════
        print("\n── Round 4: Token 刷新测试 ──")
        if user_refresh:
            try:
                r = await c.post("/api/auth/refresh", json={"refresh_token": user_refresh})
                if r.status_code == 200:
                    user_token = r.json()["access_token"]
                    log(4, "Token 刷新", "PASS")
                else:
                    log(4, "Token 刷新", "FAIL", f"status={r.status_code}")
            except Exception as e:
                log(4, "Token 刷新", "FAIL", str(e))

        # 无效 token 测试
        try:
            r = await c.post("/api/auth/refresh", json={"refresh_token": "invalid_token"})
            log(4, "无效Token拒绝", "PASS" if r.status_code == 401 else "FAIL", f"status={r.status_code}")
        except Exception as e:
            log(4, "无效Token拒绝", "FAIL", str(e))

        # ════════════════════════════════════════════════════════════
        # Round 5: /me 端点 + 无认证拒绝
        # ════════════════════════════════════════════════════════════
        print("\n── Round 5: 认证保护测试 ──")
        if user_token:
            try:
                r = await c.get("/api/auth/me", headers={"Authorization": f"Bearer {user_token}"})
                if r.status_code == 200:
                    me = r.json()
                    log(5, "GET /me", "PASS", f"email={me.get('email')}, level={me.get('membership_level')}")
                else:
                    log(5, "GET /me", "FAIL", f"status={r.status_code}")
            except Exception as e:
                log(5, "GET /me", "FAIL", str(e))

        # 无 token 应返回 401
        try:
            r = await c.get("/api/auth/me")
            log(5, "无Token返回401", "PASS" if r.status_code in (401, 403) else "FAIL", f"status={r.status_code}")
        except Exception as e:
            log(5, "无Token返回401", "FAIL", str(e))

        # 错误密码
        try:
            r = await c.post("/api/auth/login", data={"username": USER_EMAIL, "password": "wrongpassword123"})
            log(5, "错误密码拒绝", "PASS" if r.status_code == 401 else "FAIL", f"status={r.status_code}")
        except Exception as e:
            log(5, "错误密码拒绝", "FAIL", str(e))

        # Helper
        def auth(token: str):
            return {"Authorization": f"Bearer {token}"}

        admin_h = auth(admin_token) if admin_token else {}
        user_h = auth(user_token) if user_token else {}

        # ════════════════════════════════════════════════════════════
        # Round 6: 忘记密码 + 密码重置流程
        # ════════════════════════════════════════════════════════════
        print("\n── Round 6: 密码重置流程 ──")
        try:
            r = await c.post("/api/auth/forgot-password", json={"email": USER_EMAIL})
            log(6, "忘记密码请求", "PASS" if r.status_code == 200 else "FAIL", r.json().get("message", ""))
        except Exception as e:
            log(6, "忘记密码请求", "FAIL", str(e))

        # 错误验证码
        try:
            r = await c.post("/api/auth/reset-password", json={
                "email": USER_EMAIL, "code": "000000", "new_password": "NewPass2025!"
            })
            log(6, "错误验证码拒绝", "PASS" if r.status_code == 400 else "FAIL", f"status={r.status_code}")
        except Exception as e:
            log(6, "错误验证码拒绝", "FAIL", str(e))

        # 防邮箱枚举
        try:
            r = await c.post("/api/auth/forgot-password", json={"email": "nonexist@test.com"})
            log(6, "防邮箱枚举", "PASS" if r.status_code == 200 else "FAIL", "不存在邮箱也返回200")
        except Exception as e:
            log(6, "防邮箱枚举", "FAIL", str(e))

        # ════════════════════════════════════════════════════════════
        # Round 7: Dashboard API
        # ════════════════════════════════════════════════════════════
        print("\n── Round 7: Dashboard API ──")
        for endpoint in [
            "/api/dashboard/overview",
            "/api/dashboard/overview?symbols=BTCUSDT",
        ]:
            try:
                r = await c.get(endpoint, headers=user_h)
                log(7, f"GET {endpoint.split('?')[0]}", "PASS" if r.status_code == 200 else "WARN", f"status={r.status_code}")
            except Exception as e:
                log(7, f"GET {endpoint}", "FAIL", str(e))

        # ════════════════════════════════════════════════════════════
        # Round 8: Symbols API
        # ════════════════════════════════════════════════════════════
        print("\n── Round 8: Symbols API ──")
        try:
            r = await c.get("/api/symbols/", headers=user_h)
            if r.status_code == 200:
                symbols = r.json()
                log(8, "GET /api/symbols/", "PASS", f"count={len(symbols)}")
            else:
                log(8, "GET /api/symbols/", "FAIL", f"status={r.status_code}")
        except Exception as e:
            log(8, "GET /api/symbols/", "FAIL", str(e))

        # ════════════════════════════════════════════════════════════
        # Round 9: Consensus API
        # ════════════════════════════════════════════════════════════
        print("\n── Round 9: Consensus API ──")
        try:
            r = await c.get("/api/consensus/latest?symbol=BTCUSDT", headers=user_h)
            log(9, "GET /consensus/latest", "PASS" if r.status_code in (200, 404) else "FAIL", f"status={r.status_code}")
        except Exception as e:
            log(9, "GET /consensus/latest", "FAIL", str(e))

        # ════════════════════════════════════════════════════════════
        # Round 10: Analysis API
        # ════════════════════════════════════════════════════════════
        print("\n── Round 10: Analysis API ──")
        try:
            r = await c.get("/api/analysis/latest?symbol=BTCUSDT&mode=intraday", headers=user_h)
            log(10, "GET /analysis/latest", "PASS" if r.status_code in (200, 404) else "FAIL", f"status={r.status_code}")
        except Exception as e:
            log(10, "GET /analysis/latest", "FAIL", str(e))

        try:
            r = await c.get("/api/analysis/quota", headers=user_h)
            log(10, "GET /analysis/quota", "PASS" if r.status_code == 200 else "FAIL", f"status={r.status_code}")
        except Exception as e:
            log(10, "GET /analysis/quota", "FAIL", str(e))

        # ════════════════════════════════════════════════════════════
        # Round 11: Backtest API
        # ════════════════════════════════════════════════════════════
        print("\n── Round 11: Backtest API ──")
        try:
            r = await c.get("/api/backtest/summary?days=30", headers=user_h)
            log(11, "GET /backtest/summary", "PASS" if r.status_code == 200 else "FAIL", f"status={r.status_code}")
        except Exception as e:
            log(11, "GET /backtest/summary", "FAIL", str(e))

        try:
            r = await c.get("/api/backtest/trades?days=30&page=1", headers=user_h)
            log(11, "GET /backtest/trades", "PASS" if r.status_code == 200 else "FAIL", f"status={r.status_code}")
        except Exception as e:
            log(11, "GET /backtest/trades", "FAIL", str(e))

        # ════════════════════════════════════════════════════════════
        # Round 12: Playbook API
        # ════════════════════════════════════════════════════════════
        print("\n── Round 12: Playbook API ──")
        try:
            r = await c.get("/api/playbook/latest?symbol=BTCUSDT", headers=user_h)
            log(12, "GET /playbook/latest", "PASS" if r.status_code in (200, 404) else "FAIL", f"status={r.status_code}")
        except Exception as e:
            log(12, "GET /playbook/latest", "FAIL", str(e))

        try:
            r = await c.get("/api/playbook-sim/plaza/feed?page=1&page_size=10", headers=user_h)
            log(12, "GET /playbook-sim/plaza/feed", "PASS" if r.status_code == 200 else "FAIL", f"status={r.status_code}")
        except Exception as e:
            log(12, "GET /playbook-sim/plaza/feed", "FAIL", str(e))

        # ════════════════════════════════════════════════════════════
        # Round 13: Performance API
        # ════════════════════════════════════════════════════════════
        print("\n── Round 13: Performance API ──")
        try:
            r = await c.get("/api/performance/stats", headers=user_h)
            log(13, "GET /performance/stats", "PASS" if r.status_code == 200 else "FAIL", f"status={r.status_code}")
        except Exception as e:
            log(13, "GET /performance/stats", "FAIL", str(e))

        # ════════════════════════════════════════════════════════════
        # Round 14: Alerts API
        # ════════════════════════════════════════════════════════════
        print("\n── Round 14: Alerts API ──")
        try:
            r = await c.get("/api/alerts/rules", headers=user_h)
            log(14, "GET /alerts/rules", "PASS" if r.status_code == 200 else "FAIL", f"status={r.status_code}")
        except Exception as e:
            log(14, "GET /alerts/rules", "FAIL", str(e))

        try:
            r = await c.get("/api/alerts/triggers?page=1&page_size=10", headers=user_h)
            log(14, "GET /alerts/triggers", "PASS" if r.status_code == 200 else "FAIL", f"status={r.status_code}")
        except Exception as e:
            log(14, "GET /alerts/triggers", "FAIL", str(e))

        # ════════════════════════════════════════════════════════════
        # Round 15: Partner API
        # ════════════════════════════════════════════════════════════
        print("\n── Round 15: Partner API ──")
        try:
            r = await c.get("/api/partner/dashboard", headers=user_h)
            log(15, "GET /partner/dashboard", "PASS" if r.status_code == 200 else "FAIL", f"status={r.status_code}")
        except Exception as e:
            log(15, "GET /partner/dashboard", "FAIL", str(e))

        try:
            r = await c.get("/api/partner/invitations?page=1", headers=user_h)
            log(15, "GET /partner/invitations", "PASS" if r.status_code == 200 else "FAIL", f"status={r.status_code}")
        except Exception as e:
            log(15, "GET /partner/invitations", "FAIL", str(e))

        try:
            r = await c.get("/api/partner/commissions?page=1", headers=user_h)
            log(15, "GET /partner/commissions", "PASS" if r.status_code == 200 else "FAIL", f"status={r.status_code}")
        except Exception as e:
            log(15, "GET /partner/commissions", "FAIL", str(e))

        # ════════════════════════════════════════════════════════════
        # Round 16: Tasks API
        # ════════════════════════════════════════════════════════════
        print("\n── Round 16: Tasks API ──")
        try:
            r = await c.get("/api/tasks", headers=user_h)
            log(16, "GET /tasks", "PASS" if r.status_code == 200 else "FAIL", f"status={r.status_code}")
        except Exception as e:
            log(16, "GET /tasks", "FAIL", str(e))

        try:
            r = await c.get("/api/partner/wallet", headers=user_h)
            log(16, "GET /partner/wallet", "PASS" if r.status_code in (200, 404) else "FAIL", f"status={r.status_code}")
        except Exception as e:
            log(16, "GET /tasks/wallet", "FAIL", str(e))

        # ════════════════════════════════════════════════════════════
        # Round 17: Membership API
        # ════════════════════════════════════════════════════════════
        print("\n── Round 17: Membership API ──")
        try:
            r = await c.get("/api/membership/plans", headers=user_h)
            log(17, "GET /membership/plans", "PASS" if r.status_code == 200 else "FAIL", f"status={r.status_code}")
        except Exception as e:
            log(17, "GET /membership/plans", "FAIL", str(e))

        try:
            r = await c.get("/api/membership/free-trial", headers=user_h)
            log(17, "GET /membership/free-trial", "PASS" if r.status_code == 200 else "FAIL", f"status={r.status_code}")
        except Exception as e:
            log(17, "GET /membership/free-trial", "FAIL", str(e))

        # ════════════════════════════════════════════════════════════
        # Round 18: Push / Settings API
        # ════════════════════════════════════════════════════════════
        print("\n── Round 18: Push Settings API ──")
        try:
            r = await c.get("/api/push/settings", headers=user_h)
            log(18, "GET /push/settings", "PASS" if r.status_code == 200 else "FAIL", f"status={r.status_code}")
        except Exception as e:
            log(18, "GET /push/settings", "FAIL", str(e))

        # ════════════════════════════════════════════════════════════
        # Round 19: Market Data API
        # ════════════════════════════════════════════════════════════
        print("\n── Round 19: Market Data API ──")
        for ep in [
            "/api/klines?symbol=BTCUSDT&interval=1h&limit=10",
            "/api/market/regime?symbol=BTCUSDT",
        ]:
            try:
                r = await c.get(ep, headers=user_h)
                name = ep.split("?")[0].replace("/api/market/", "")
                log(19, f"GET /market/{name}", "PASS" if r.status_code == 200 else "WARN", f"status={r.status_code}")
            except Exception as e:
                log(19, f"GET {ep}", "FAIL", str(e))

        # ════════════════════════════════════════════════════════════
        # Round 20: Reflection / Defense API
        # ════════════════════════════════════════════════════════════
        print("\n── Round 20: Reflection & Defense API ──")
        try:
            r = await c.get("/api/reflection/latest?symbol=BTCUSDT", headers=user_h)
            log(20, "GET /reflection/latest", "PASS" if r.status_code in (200, 404) else "FAIL", f"status={r.status_code}")
        except Exception as e:
            log(20, "GET /reflection/latest", "FAIL", str(e))

        try:
            r = await c.get("/api/defense/latest?symbol=BTCUSDT", headers=user_h)
            log(20, "GET /defense/latest", "PASS" if r.status_code in (200, 404) else "FAIL", f"status={r.status_code}")
        except Exception as e:
            log(20, "GET /defense/latest", "FAIL", str(e))

        try:
            r = await c.get("/api/defense/alert-level?symbol=BTCUSDT", headers=user_h)
            log(20, "GET /defense/alert-level", "PASS" if r.status_code in (200, 404) else "FAIL", f"status={r.status_code}")
        except Exception as e:
            log(20, "GET /defense/alert-level", "FAIL", str(e))

        # ════════════════════════════════════════════════════════════
        # Round 21: Admin Dashboard
        # ════════════════════════════════════════════════════════════
        print("\n── Round 21: Admin Dashboard API ──")
        try:
            r = await c.get("/api/admin/dashboard", headers=admin_h)
            log(21, "GET /admin/dashboard", "PASS" if r.status_code == 200 else "FAIL", f"status={r.status_code}")
        except Exception as e:
            log(21, "GET /admin/dashboard", "FAIL", str(e))

        try:
            r = await c.get("/api/admin/dashboard/llm-cost", headers=admin_h)
            log(21, "GET /admin/dashboard/llm-cost", "PASS" if r.status_code == 200 else "FAIL", f"status={r.status_code}")
        except Exception as e:
            log(21, "GET /admin/dashboard/llm-cost", "FAIL", str(e))

        # 普通用户不能访问 admin
        try:
            r = await c.get("/api/admin/dashboard", headers=user_h)
            log(21, "普通用户拒绝Admin", "PASS" if r.status_code == 403 else "FAIL", f"status={r.status_code}")
        except Exception as e:
            log(21, "普通用户拒绝Admin", "FAIL", str(e))

        # ════════════════════════════════════════════════════════════
        # Round 22: Admin Users
        # ════════════════════════════════════════════════════════════
        print("\n── Round 22: Admin Users API ──")
        try:
            r = await c.get("/api/admin/users?page=1&size=10", headers=admin_h)
            if r.status_code == 200:
                data = r.json()
                log(22, "GET /admin/users", "PASS", f"total={data.get('total', '?')}")
            else:
                log(22, "GET /admin/users", "FAIL", f"status={r.status_code}")
        except Exception as e:
            log(22, "GET /admin/users", "FAIL", str(e))

        # ════════════════════════════════════════════════════════════
        # Round 23: Admin Models
        # ════════════════════════════════════════════════════════════
        print("\n── Round 23: Admin Models API ──")
        try:
            r = await c.get("/api/admin/models/available", headers=admin_h)
            log(23, "GET /admin/models/available", "PASS" if r.status_code == 200 else "FAIL", f"status={r.status_code}")
        except Exception as e:
            log(23, "GET /admin/models/available", "FAIL", str(e))

        try:
            r = await c.get("/api/admin/models/assignments", headers=admin_h)
            log(23, "GET /admin/models/assignments", "PASS" if r.status_code == 200 else "FAIL", f"status={r.status_code}")
        except Exception as e:
            log(23, "GET /admin/models/assignments", "FAIL", str(e))

        # ════════════════════════════════════════════════════════════
        # Round 24: Admin Datasources
        # ════════════════════════════════════════════════════════════
        print("\n── Round 24: Admin Datasources API ──")
        try:
            r = await c.get("/api/admin/datasources", headers=admin_h)
            log(24, "GET /admin/datasources", "PASS" if r.status_code == 200 else "FAIL", f"status={r.status_code}")
        except Exception as e:
            log(24, "GET /admin/datasources", "FAIL", str(e))

        try:
            r = await c.get("/api/admin/datasources/health", headers=admin_h)
            log(24, "GET /admin/datasources/health", "PASS" if r.status_code == 200 else "FAIL", f"status={r.status_code}")
        except Exception as e:
            log(24, "GET /admin/datasources/health", "FAIL", str(e))

        # ════════════════════════════════════════════════════════════
        # Round 25: Admin Configs
        # ════════════════════════════════════════════════════════════
        print("\n── Round 25: Admin Configs API ──")
        try:
            r = await c.get("/api/admin/configs", headers=admin_h)
            log(25, "GET /admin/configs", "PASS" if r.status_code == 200 else "FAIL", f"status={r.status_code}")
        except Exception as e:
            log(25, "GET /admin/configs", "FAIL", str(e))

        # ════════════════════════════════════════════════════════════
        # Round 26: Admin Symbols
        # ════════════════════════════════════════════════════════════
        print("\n── Round 26: Admin Symbols API ──")
        try:
            r = await c.get("/api/symbols/admin/all", headers=admin_h)
            log(26, "GET /symbols/admin/all", "PASS" if r.status_code == 200 else "FAIL", f"status={r.status_code}")
        except Exception as e:
            log(26, "GET /symbols/admin/all", "FAIL", str(e))

        # ════════════════════════════════════════════════════════════
        # Round 27: Learning / Cases API
        # ════════════════════════════════════════════════════════════
        print("\n── Round 27: Learning & Cases API ──")
        try:
            r = await c.get("/api/admin/learning/performance-review", headers=admin_h)
            log(27, "GET /admin/learning/performance-review", "PASS" if r.status_code == 200 else "FAIL", f"status={r.status_code}")
        except Exception as e:
            log(27, "GET /admin/learning/performance-review", "FAIL", str(e))

        # ════════════════════════════════════════════════════════════
        # Round 28: 输入验证安全测试
        # ════════════════════════════════════════════════════════════
        print("\n── Round 28: 输入验证安全测试 ──")
        # 注册 - 密码太短
        try:
            r = await c.post("/api/auth/register", json={"email": "short@test.com", "password": "123"})
            log(28, "短密码拒绝", "PASS" if r.status_code == 422 else "FAIL", f"status={r.status_code}")
        except Exception as e:
            log(28, "短密码拒绝", "FAIL", str(e))

        # 注册 - 无效邮箱
        try:
            r = await c.post("/api/auth/register", json={"email": "not-an-email", "password": "ValidPass123!"})
            log(28, "无效邮箱拒绝", "PASS" if r.status_code == 422 else "FAIL", f"status={r.status_code}")
        except Exception as e:
            log(28, "无效邮箱拒绝", "FAIL", str(e))

        # SQL 注入尝试
        try:
            r = await c.post("/api/auth/login", data={"username": "' OR 1=1 --", "password": "test"})
            log(28, "SQL注入防御", "PASS" if r.status_code in (401, 422) else "FAIL", f"status={r.status_code}")
        except Exception as e:
            log(28, "SQL注入防御", "FAIL", str(e))

        # ════════════════════════════════════════════════════════════
        # Round 29: 权限边界测试
        # ════════════════════════════════════════════════════════════
        print("\n── Round 29: 权限边界测试 ──")
        admin_endpoints = [
            "/api/admin/dashboard",
            "/api/admin/users?page=1&size=1",
            "/api/admin/models/available",
            "/api/admin/configs",
        ]
        for ep in admin_endpoints:
            try:
                r = await c.get(ep, headers=user_h)
                name = ep.split("?")[0].replace("/api/", "")
                log(29, f"非Admin拒绝 {name}", "PASS" if r.status_code == 403 else "FAIL", f"status={r.status_code}")
            except Exception as e:
                log(29, f"权限测试 {ep}", "FAIL", str(e))

        # ════════════════════════════════════════════════════════════
        # Round 30: 前端构建验证 + 总结
        # ════════════════════════════════════════════════════════════
        print("\n── Round 30: 前端页面可访问性 ──")
        frontend = "http://localhost:3000"
        pages = ["/login", "/dashboard", "/consensus", "/backtest", "/settings/membership"]
        async with httpx.AsyncClient(timeout=10, follow_redirects=True) as fc:
            for page in pages:
                try:
                    r = await fc.get(f"{frontend}{page}")
                    log(30, f"前端 {page}", "PASS" if r.status_code == 200 else "WARN", f"status={r.status_code}")
                except Exception as e:
                    log(30, f"前端 {page}", "FAIL", str(e))

    # ── Summary ──
    print("\n" + "=" * 70)
    print("  测试结果汇总")
    print("=" * 70)
    passed = sum(1 for r in results if r["status"] == "PASS")
    failed = sum(1 for r in results if r["status"] == "FAIL")
    warned = sum(1 for r in results if r["status"] == "WARN")
    total = len(results)
    print(f"\n  总计: {total} | ✅ PASS: {passed} | ❌ FAIL: {failed} | ⚠️ WARN: {warned}")
    print(f"  通过率: {passed/total*100:.1f}%\n")

    if failed > 0:
        print("  ── 失败项 ──")
        for r in results:
            if r["status"] == "FAIL":
                print(f"  ❌ R{r['round']:02d} | {r['test']}: {r['detail']}")
        print()

    if warned > 0:
        print("  ── 警告项 ──")
        for r in results:
            if r["status"] == "WARN":
                print(f"  ⚠️ R{r['round']:02d} | {r['test']}: {r['detail']}")
        print()

    return failed


if __name__ == "__main__":
    failed = asyncio.run(run_all_tests())
    sys.exit(1 if failed > 0 else 0)
