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
    email = os.environ.get("ADMIN_EMAIL") or input("Admin email: ").strip()
    password = os.environ.get("ADMIN_PASSWORD") or getpass.getpass("Admin password: ")

    if not email or not password:
        print("ERROR: email and password are required.")
        sys.exit(1)
    if len(password) < 8:
        print("ERROR: password must be at least 8 characters.")
        sys.exit(1)

    from passlib.context import CryptContext

    pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
    hashed = pwd_context.hash(password)

    from app.core.database import AsyncSessionLocal
    from sqlalchemy import text

    async with AsyncSessionLocal() as session:
        async with session.begin():
            await session.execute(
                text("""
                    INSERT INTO users (email, password_hash, role, is_active, is_admin)
                    VALUES (:email, :hash, 'admin', true, true)
                    ON CONFLICT (email) DO UPDATE
                        SET password_hash = EXCLUDED.password_hash,
                            role = 'admin',
                            is_admin = true
                """),
                {"email": email, "hash": hashed},
            )
        await session.commit()

    print(f"Admin account ready: {email}")


if __name__ == "__main__":
    asyncio.run(main())
