"""Quick debug: hit the 500 endpoints and print response body."""
import io, sys
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

import httpx

API = "http://localhost:8000"

# Login
r = httpx.post(f"{API}/api/auth/login", data={"username": "test_user@axiom.dev", "password": "TestUser2025!"})
token = r.json()["access_token"]
h = {"Authorization": f"Bearer {token}"}

endpoints = [
    "/api/backtest/summary?days=7",
    "/api/backtest/trades?days=7&page=1",
    "/api/performance/stats",
    "/api/playbook-sim/plaza/feed?page=1&page_size=10",
    "/api/partner/dashboard",
    "/api/tasks",
    "/api/klines?symbol=BTCUSDT&interval=1h&limit=5",
    "/api/market/regime?symbol=BTCUSDT",
]

for ep in endpoints:
    r = httpx.get(f"{API}{ep}", headers=h, timeout=15)
    status = r.status_code
    body = r.text[:300]
    tag = "OK" if status == 200 else "FAIL"
    print(f"[{tag}] {status} {ep}")
    if status >= 400:
        print(f"  -> {body}")
    print()
