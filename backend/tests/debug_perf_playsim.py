"""Hit performance and playbook-sim endpoints, print traceback from response."""
import io, sys, traceback
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
import httpx

API = "http://localhost:8000"
r = httpx.post(f"{API}/api/auth/login", data={"username": "test_user@axiom.dev", "password": "TestUser2025!"})
token = r.json()["access_token"]
h = {"Authorization": f"Bearer {token}"}

for ep in ["/api/performance/stats", "/api/playbook-sim/plaza/feed?page=1&page_size=10"]:
    r = httpx.get(f"{API}{ep}", headers=h, timeout=15)
    print(f"[{r.status_code}] {ep}")
    if r.status_code >= 400:
        print(f"  body: {r.text[:500]}")
    print()
