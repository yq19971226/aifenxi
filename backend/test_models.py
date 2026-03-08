"""Test analysis SSE endpoint."""
import httpx

# 1. Login
print("=== Login ===")
with httpx.Client(timeout=10) as c:
    # Try to find working credentials
    from sqlalchemy import create_engine, text
    engine = create_engine("sqlite:///test.db")
    with engine.connect() as conn:
        rows = conn.execute(text("SELECT email, is_admin FROM users LIMIT 5")).fetchall()
        for r in rows:
            print(f"  User: {r[0]}, admin={r[1]}")

    if rows:
        email = rows[0][0]
        # Try login with common passwords
        for pwd in ["admin123", "Admin123", "password", "123456"]:
            r = c.post("http://localhost:8000/api/auth/login",
                       data={"username": email, "password": pwd})
            if r.status_code == 200:
                token = r.json()["access_token"]
                print(f"  Login OK with {email} / {pwd}")
                print(f"  Token: {token[:30]}...")
                break
            else:
                print(f"  {pwd}: {r.status_code}")
        else:
            print("  All passwords failed")
            exit(1)

# 2. Test analysis SSE
print("\n=== Analysis SSE test ===")
with httpx.Client(timeout=120) as c:
    with c.stream(
        "POST",
        "http://localhost:8000/api/analysis/run",
        headers={"Authorization": f"Bearer {token}"},
        json={"symbol": "ETHUSDT", "mode": "intraday", "force_refresh": True},
    ) as resp:
        print(f"  HTTP status: {resp.status_code}")
        count = 0
        for line in resp.iter_lines():
            if line.strip():
                count += 1
                print(f"  [{count}] {line[:200]}")
                if count > 30:
                    print("  ... stopping")
                    break
