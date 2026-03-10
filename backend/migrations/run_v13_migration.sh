#!/bin/bash
# ============================================================
# OmniMind V13 国际化用户偏好 - 数据库迁移执行脚本
# ============================================================

set -e

echo "=========================================="
echo "OmniMind V13 国际化用户偏好 - 数据库迁移"
echo "=========================================="
echo ""

# 检查 Docker 是否运行
if ! docker ps > /dev/null 2>&1; then
    echo "❌ Docker 未运行，请先启动 Docker"
    exit 1
fi

# 检查 PostgreSQL 容器是否运行
if ! docker ps | grep -q omnimind-postgres; then
    echo "❌ PostgreSQL 容器未运行，请先启动数据库"
    echo "   提示: docker-compose up -d postgres"
    exit 1
fi

echo "✅ Docker 和 PostgreSQL 容器正在运行"
echo ""

# 执行迁移
echo "📝 执行迁移脚本..."
docker exec -i omnimind-postgres-1 psql -U omnimind -d omnimind < backend/migrations/v13_i18n_user_preferences.sql

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ 迁移执行成功!"
    echo ""
    
    # 验证表结构
    echo "📋 验证 user_preferences 表结构:"
    docker exec -i omnimind-postgres-1 psql -U omnimind -d omnimind -c "\d user_preferences"
    
    echo ""
    echo "✅ 迁移完成!"
else
    echo ""
    echo "❌ 迁移执行失败"
    exit 1
fi
