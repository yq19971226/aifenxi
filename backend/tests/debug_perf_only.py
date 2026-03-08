import io, sys
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
import httpx
API = "http://localhost:8000"
r = httpx.post(f"{API}/api/auth/login", data={"username": "test_user@axiom.dev", "password": "TestUser2025!"})
token = r.json()["access_token"]
h = {"Authorization": f"Bearer {token}"}
r = httpx.get(f"{API}/api/performance/stats?days=7", headers=h, timeout=15)
print(f"[{r.status_code}] {r.text[:500]}")
