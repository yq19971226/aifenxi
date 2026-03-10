#!/usr/bin/env python3
"""
执行 v13 国际化用户偏好迁移脚本

使用方法:
    python backend/migrations/run_v13_migration.py

依赖:
    - PostgreSQL 数据库正在运行
    - 环境变量 DATABASE_URL 已配置
"""

import asyncio
import sys
from pathlib import Path

# 添加项目根目录到 Python 路径
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker


async def run_migration():
    """执行数据库迁移"""
    # 从环境变量读取数据库 URL
    import os
    database_url = os.getenv(
        "DATABASE_URL",
        "postgresql+asyncpg://omnimind:password@localhost:5432/omnimind"
    )
    
    print(f"连接数据库: {database_url.split('@')[1] if '@' in database_url else database_url}")
    
    # 创建异步引擎
    engine = create_async_engine(database_url, echo=True)
    
    # 读取迁移脚本
    migration_file = Path(__file__).parent / "v13_i18n_user_preferences.sql"
    print(f"\n读取迁移脚本: {migration_file}")
    
    with open(migration_file, "r", encoding="utf-8") as f:
        sql_content = f.read()
    
    # 执行迁移
    try:
        async with engine.begin() as conn:
            print("\n开始执行迁移...")
            await conn.execute(text(sql_content))
            print("\n✅ 迁移执行成功!")
            
            # 验证表是否创建成功
            result = await conn.execute(text("""
                SELECT column_name, data_type, column_default, is_nullable
                FROM information_schema.columns
                WHERE table_name = 'user_preferences'
                ORDER BY ordinal_position;
            """))
            
            print("\n📋 user_preferences 表结构:")
            print("-" * 80)
            print(f"{'列名':<20} {'数据类型':<20} {'默认值':<25} {'可空':<10}")
            print("-" * 80)
            
            for row in result:
                column_name, data_type, column_default, is_nullable = row
                default_str = str(column_default)[:24] if column_default else "NULL"
                print(f"{column_name:<20} {data_type:<20} {default_str:<25} {is_nullable:<10}")
            
            print("-" * 80)
            
            # 验证索引
            result = await conn.execute(text("""
                SELECT indexname, indexdef
                FROM pg_indexes
                WHERE tablename = 'user_preferences';
            """))
            
            print("\n🔍 索引:")
            for row in result:
                print(f"  - {row[0]}")
            
            # 验证约束
            result = await conn.execute(text("""
                SELECT conname, pg_get_constraintdef(oid)
                FROM pg_constraint
                WHERE conrelid = 'user_preferences'::regclass;
            """))
            
            print("\n🔒 约束:")
            for row in result:
                print(f"  - {row[0]}: {row[1]}")
            
    except Exception as e:
        print(f"\n❌ 迁移执行失败: {e}")
        raise
    finally:
        await engine.dispose()


if __name__ == "__main__":
    print("=" * 80)
    print("OmniMind V13 国际化用户偏好 - 数据库迁移")
    print("=" * 80)
    
    try:
        asyncio.run(run_migration())
        print("\n✅ 迁移完成!")
        sys.exit(0)
    except KeyboardInterrupt:
        print("\n\n⚠️  迁移被用户中断")
        sys.exit(1)
    except Exception as e:
        print(f"\n\n❌ 迁移失败: {e}")
        sys.exit(1)
