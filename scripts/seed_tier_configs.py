"""种子脚本 — 将会员等级参数写入 system_configs 表。

用法: cd backend && python -m scripts.seed_tier_configs
或:   python scripts/seed_tier_configs.py
"""

import asyncio
import sys
import os

# 确保 backend 目录在 path 中
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))

from app.services.config_service import ConfigService, ConfigCreate
from app.core.database import AsyncSessionLocal


TIER_CONFIGS = [
    ConfigCreate(
        config_key="chat_daily_limit_free",
        value="5",
        category="tier",
        description="免费用户每日对话次数上限",
        is_secret=False,
    ),
    ConfigCreate(
        config_key="chat_daily_limit_pro",
        value="50",
        category="tier",
        description="专业用户每日对话次数上限",
        is_secret=False,
    ),
    ConfigCreate(
        config_key="chat_daily_limit_flagship",
        value="200",
        category="tier",
        description="旗舰用户每日对话次数上限",
        is_secret=False,
    ),
    ConfigCreate(
        config_key="query_limit_free",
        value="3",
        category="tier",
        description="免费用户每日查询次数上限",
        is_secret=False,
    ),
    ConfigCreate(
        config_key="perf_days_free",
        value="7",
        category="tier",
        description="免费用户绩效查看天数",
        is_secret=False,
    ),
]


async def seed() -> None:
    """写入等级配置种子数据，已存在则跳过。"""
    async with AsyncSessionLocal() as session:
        svc = ConfigService(session)
        for cfg in TIER_CONFIGS:
            existing = await svc.get_config_detail(cfg.config_key)
            if existing is None:
                await svc.create_config(cfg, admin_user_id="system")
                print(f"  ✓ 已写入: {cfg.config_key} = {cfg.value}")
            else:
                print(f"  - 已存在: {cfg.config_key}, 跳过")
        await session.commit()
    print("种子数据写入完成。")


if __name__ == "__main__":
    asyncio.run(seed())
