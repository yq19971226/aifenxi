"""一次性脚本：启用合伙人和任务中心功能开关。"""
import asyncio
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

async def main():
    from app.services.config_service import set_config_value

    await set_config_value("partner_feature_enabled", "true", category="partner", description="合伙人系统总开关")
    await set_config_value("task_feature_enabled", "true", category="task", description="任务中心总开关")
    await set_config_value("push_feature_enabled", "true", category="push", description="推送设置总开关")
    print("✅ partner_feature_enabled = true")
    print("✅ task_feature_enabled = true")
    print("✅ push_feature_enabled = true")

if __name__ == "__main__":
    asyncio.run(main())
