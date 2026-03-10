"""创建管理员账号 — 从环境变量或交互式输入读取凭据。

用法:
  # 环境变量方式（适合 CI / Docker）
  ADMIN_EMAIL=admin@example.com ADMIN_PASSWORD=StrongPass123! python create_admin.py

  # 交互式方式
  python create_admin.py
"""

import asyncio
import getpass
import os
import sys


async def main() -> None:
    raw_email = os.environ.get("ADMIN_EMAIL") or input("Admin email: ").strip()
    password = os.environ.get("ADMIN_PASSWORD") or getpass.getpass("Admin password: ")
    email = raw_email.lower().strip() if raw_email else ""

    if not email or not password:
        print("ERROR: email and password are required.")
        sys.exit(1)
    if len(password) < 8:
        print("ERROR: password must be at least 8 characters.")
        sys.exit(1)

    from app.core.security import hash_password
    from app.core.database import AsyncSessionLocal

    hashed = hash_password(password)
    from sqlalchemy import text

    async with AsyncSessionLocal() as session:
        async with session.begin():
            existing = await session.execute(
                text("SELECT id FROM users WHERE LOWER(email) = :email"),
                {"email": email},
            )
            row = existing.first()
            if row:
                await session.execute(
                    text("""
                        UPDATE users SET password_hash = :hash, role = 'admin',
                               is_admin = true, email = :email
                        WHERE LOWER(email) = :email
                    """),
                    {"email": email, "hash": hashed},
                )
            else:
                await session.execute(
                    text("""
                        INSERT INTO users (email, password_hash, role, is_active, is_admin)
                        VALUES (:email, :hash, 'admin', true, true)
                    """),
                    {"email": email, "hash": hashed},
                )
    # session.begin() 在退出时已提交，无需再 commit

    print(f"Admin account ready: {email}")


if __name__ == "__main__":
    asyncio.run(main())
