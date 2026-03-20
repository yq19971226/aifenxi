"""
seed_welcome_bonus.py — 设置免费用户注册欢迎包和每日限额配置

变更说明:
  - 免费用户 scalping 每日配额 → 0（取消每日自动补充）
  - 注册欢迎包 welcome_bonus_scalping → 10（注册即送 10 次，用完即止）

运行方式:
  cd d:/aifenxi/backend
  python scripts/seed_welcome_bonus.py
"""

import asyncio
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.services.config_service import ConfigService, ConfigCreate, ConfigUpdate
from app.core.database import AsyncSessionLocal


CONFIGS = [
    ConfigCreate(
        config_key="analysis_daily_limit_free_scalping",
        value="0",
        category="tier",
        description="免费用户 scalping 每日配额（0=无每日补充，依赖 welcome_bonus）",
        is_secret=False,
    ),
    ConfigCreate(
        config_key="welcome_bonus_scalping",
        value="10",
        category="tier",
        description="新用户注册欢迎包 — scalping 次数（一次性赠送）",
        is_secret=False,
    ),
    # 其他模式欢迎包默认为 0（不赠送）
    ConfigCreate(
        config_key="welcome_bonus_intraday",
        value="0",
        category="tier",
        description="新用户注册欢迎包 — intraday 次数",
        is_secret=False,
    ),
    ConfigCreate(
        config_key="welcome_bonus_trend",
        value="0",
        category="tier",
        description="新用户注册欢迎包 — trend 次数",
        is_secret=False,
    ),
]


async def seed() -> None:
    async with AsyncSessionLocal() as session:
        svc = ConfigService(session)
        for cfg in CONFIGS:
            existing = await svc.get_config_detail(cfg.config_key)
            if existing is None:
                await svc.create_config(cfg, admin_user_id="system")
                print(f"  [创建] {cfg.config_key} = {cfg.value}")
            else:
                # 已存在则更新（确保值正确）
                await svc.update_config(
                    cfg.config_key,
                    ConfigUpdate(value=cfg.value, description=cfg.description, is_secret=cfg.is_secret),
                    admin_user_id="system",
                )
                print(f"  [更新] {cfg.config_key} = {cfg.value}")
        await session.commit()
    print("✓ 欢迎包配置写入完成")


if __name__ == "__main__":
    asyncio.run(seed())
