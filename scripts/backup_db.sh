#!/usr/bin/env bash
# ============================================
# OmniMind 数据库备份脚本
# ============================================
# 用法：./scripts/backup_db.sh
# 建议通过 crontab 定时执行：
#   0 2 * * * /path/to/omnimind/scripts/backup_db.sh >> /var/log/omnimind-backup.log 2>&1

set -euo pipefail

# ---------- 配置 ----------
BACKUP_DIR="${BACKUP_DIR:-/var/backups/omnimind}"
DAILY_RETAIN_DAYS=7       # 每日备份保留天数
WEEKLY_RETAIN_WEEKS=4     # 周备份保留周数

# 数据库连接（从环境变量或默认值）
DB_HOST="${POSTGRES_HOST:-localhost}"
DB_PORT="${POSTGRES_PORT:-5432}"
DB_USER="${POSTGRES_USER:-omnimind}"
DB_NAME="${POSTGRES_DB:-omnimind}"
# PGPASSWORD 从环境变量读取

# ---------- 初始化 ----------
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
DAY_OF_WEEK=$(date +%u)  # 1=周一, 7=周日
DAILY_DIR="${BACKUP_DIR}/daily"
WEEKLY_DIR="${BACKUP_DIR}/weekly"

mkdir -p "${DAILY_DIR}" "${WEEKLY_DIR}"

echo "[${TIMESTAMP}] 开始数据库备份..."

# ---------- 全量备份 ----------
BACKUP_FILE="${DAILY_DIR}/${DB_NAME}_${TIMESTAMP}.sql.gz"

if command -v docker &> /dev/null && docker compose ps postgres 2>/dev/null | grep -q "running"; then
    # Docker 环境：通过 docker compose exec 执行
    echo "  检测到 Docker 环境，使用 docker compose exec..."
    docker compose exec -T postgres pg_dump \
        -U "${DB_USER}" \
        -d "${DB_NAME}" \
        --format=plain \
        --no-owner \
        --no-privileges \
        --verbose 2>/dev/null | gzip > "${BACKUP_FILE}"
else
    # 直连数据库
    echo "  使用直连模式..."
    PGPASSWORD="${POSTGRES_PASSWORD}" pg_dump \
        -h "${DB_HOST}" \
        -p "${DB_PORT}" \
        -U "${DB_USER}" \
        -d "${DB_NAME}" \
        --format=plain \
        --no-owner \
        --no-privileges \
        --verbose 2>/dev/null | gzip > "${BACKUP_FILE}"
fi

BACKUP_SIZE=$(du -h "${BACKUP_FILE}" | cut -f1)
echo "  全量备份完成：${BACKUP_FILE} (${BACKUP_SIZE})"

# ---------- 周备份（周日额外保留一份） ----------
if [ "${DAY_OF_WEEK}" -eq 7 ]; then
    WEEKLY_FILE="${WEEKLY_DIR}/${DB_NAME}_weekly_${TIMESTAMP}.sql.gz"
    cp "${BACKUP_FILE}" "${WEEKLY_FILE}"
    echo "  周备份已保存：${WEEKLY_FILE}"
fi

# ---------- 清理过期备份 ----------
echo "  清理过期备份..."

# 清理超过 N 天的每日备份
DAILY_DELETED=$(find "${DAILY_DIR}" -name "*.sql.gz" -mtime +${DAILY_RETAIN_DAYS} -delete -print | wc -l)
echo "  已删除 ${DAILY_DELETED} 个过期每日备份（>${DAILY_RETAIN_DAYS}天）"

# 清理超过 N 周的周备份
WEEKLY_RETAIN_DAYS=$((WEEKLY_RETAIN_WEEKS * 7))
WEEKLY_DELETED=$(find "${WEEKLY_DIR}" -name "*.sql.gz" -mtime +${WEEKLY_RETAIN_DAYS} -delete -print | wc -l)
echo "  已删除 ${WEEKLY_DELETED} 个过期周备份（>${WEEKLY_RETAIN_WEEKS}周）"

# ---------- 备份验证 ----------
if [ -f "${BACKUP_FILE}" ] && [ -s "${BACKUP_FILE}" ]; then
    # 验证 gzip 文件完整性
    if gzip -t "${BACKUP_FILE}" 2>/dev/null; then
        echo "  备份文件验证通过 ✓"
    else
        echo "  ⚠ 备份文件损坏！" >&2
        exit 1
    fi
else
    echo "  ⚠ 备份文件为空或不存在！" >&2
    exit 1
fi

echo "[$(date +%Y%m%d_%H%M%S)] 备份流程完成"
echo "---"
