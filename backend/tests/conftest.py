"""全局 pytest 配置 — 设置测试环境变量，避免 Settings 校验失败。"""

import os

# 在任何模块导入 settings 之前设置必需的环境变量
os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://test:test@localhost:5432/test")
os.environ.setdefault("JWT_SECRET_KEY", "test-jwt-secret")
os.environ.setdefault("REDIS_URL", "redis://localhost:6379")
