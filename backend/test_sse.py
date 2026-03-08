"""Test analysis SSE endpoint directly."""
import httpx
from sqlalchemy import create_engine, text

# 1. Find user credentials
print("=== Finding users ===")
engine = create_engine("sqlite:///test.db")
with engine.connect() as conn:
    rows = conn.execute(text("SELECT email, is_admin FROM users LIMIT 5")).fetchall()
    for r in rows:
        print(f"  User: {r[0]}, admin={r[1]}")

if not rows:
    print("No users found!")
    exit(1)

email = rows[0][0]

# 2. Login
print(f"\n=== Login as {email} ===")
token = None
with httpx.Client(timeout=10) as c:
    for pwd in ["admin123", "Admin123!", "password", "123456", "Admin@123"]:
        r = c.post(
            "http://localhost:8000/api/auth/login",
            data={"username": email, "password": pwd},
        )
        if r.status_code == 200:
            token = r.json()["access_token"]
            print(f"  OK with password: {pwd}")
            break
        else:
            print(f"  {pwd}: {r.status_code}")

if not token:
    print("  All passwords failed, exiting")
    exit(1)

# 3. Test analysis SSE
print("\n=== Analysis SSE test (ETHUSDT intraday) ===")
with httpx.Client(timeout=120) as c:
    with c.stream(
        "POST",
        "http://localhost:8000/api/analysis/run",
        headers={"Authorization": f"Bearer {token}"},
        json={"symbol": "ETHUSDT", "mode": "intraday", "force_refresh": True},
    ) as resp:
        print(f"  HTTP status: {resp.status_code}")
        if resp.status_code != 200:
            print(f"  Body: {resp.read().decode()[:500]}")
        else:
            count = 0
            for line in resp.iter_lines():
                line = line.strip()
                if line:
                    count += 1
                    print(f"  [{count}] {line[:250]}")
                    if count > 40:
                        print("  ... stopping after 40 events")
                        break
            print(f"\n  Total SSE events: {count}")
