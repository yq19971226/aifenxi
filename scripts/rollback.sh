#!/usr/bin/env bash
# ============================================================
# Axiom 一键回退脚本
# 用法:
#   ./scripts/rollback.sh                 # 默认回退到上一个版本
#   ./scripts/rollback.sh <commit-or-tag> # 回退到指定版本
# ============================================================
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
COMPOSE_CMD="docker compose -f docker-compose.yml -f docker-compose.prod.yml"
LOG_FILE="${PROJECT_DIR}/logs/rollback-$(date +%Y%m%d-%H%M%S).log"
STATE_FILE="${PROJECT_DIR}/logs/last_successful_deploy.env"

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

log()  { echo -e "${GREEN}[$(date +%H:%M:%S)]${NC} $*" | tee -a "$LOG_FILE"; }
warn() { echo -e "${YELLOW}[$(date +%H:%M:%S)] WARN:${NC} $*" | tee -a "$LOG_FILE"; }
err()  { echo -e "${RED}[$(date +%H:%M:%S)] ERROR:${NC} $*" | tee -a "$LOG_FILE"; }

cd "$PROJECT_DIR"
mkdir -p logs

CURRENT_COMMIT=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")
TARGET="${1:-}"

if [[ -z "$TARGET" && -f "$STATE_FILE" ]]; then
  # shellcheck disable=SC1090
  source "$STATE_FILE"
  TARGET="${PREV_COMMIT:-}"
fi

if [[ -z "$TARGET" ]]; then
  TARGET="HEAD~1"
fi

log "开始回退 — 当前版本: ${CURRENT_COMMIT}"
log "目标版本: ${TARGET}"

log "步骤 1/5: 备份数据库..."
if [[ -f scripts/backup_db.sh ]]; then
  bash scripts/backup_db.sh >> "$LOG_FILE" 2>&1 || warn "数据库备份失败，继续回退"
else
  warn "backup_db.sh 不存在，跳过备份"
fi

log "步骤 2/5: 切换到目标版本..."
git fetch origin >> "$LOG_FILE" 2>&1 || warn "git fetch 失败，继续使用本地提交"
if ! git rev-parse --verify --quiet "$TARGET^{commit}" > /dev/null; then
  err "目标版本不存在: ${TARGET}"
  exit 11
fi
TARGET_RESOLVED=$(git rev-parse --short "$TARGET")
git reset --hard "$TARGET" >> "$LOG_FILE" 2>&1 || {
  err "回退代码失败"
  exit 12
}
log "代码已回退: ${CURRENT_COMMIT} → ${TARGET_RESOLVED}"

log "步骤 3/5: 重建并启动服务..."
$COMPOSE_CMD build >> "$LOG_FILE" 2>&1 || {
  err "Docker 构建失败"
  exit 13
}
$COMPOSE_CMD up -d --remove-orphans >> "$LOG_FILE" 2>&1 || {
  err "服务启动失败"
  exit 14
}

log "步骤 4/5: 等待服务就绪 (最多90秒)..."
MAX_WAIT=90
ELAPSED=0
while [ $ELAPSED -lt $MAX_WAIT ]; do
  sleep 5
  ELAPSED=$((ELAPSED + 5))
  if curl -sf http://localhost:8000/health > /dev/null 2>&1; then
    log "后端已就绪 (${ELAPSED}s)"
    break
  fi
  log "等待中... (${ELAPSED}s)"
done

if [ $ELAPSED -ge $MAX_WAIT ]; then
  err "健康检查超时"
  exit 15
fi

log "步骤 5/5: 冒烟测试..."
BACKEND_OK=false
FRONTEND_OK=false

if curl -sf http://localhost:8000/health | grep -q '"status":"ok"'; then
  BACKEND_OK=true
  log "  ✓ 后端 API 正常"
else
  warn "  ✗ 后端 API 异常"
fi

FRONTEND_STATUS=$(curl -sf -o /dev/null -w "%{http_code}" http://localhost:3000/dashboard 2>/dev/null || echo "000")
if [ "$FRONTEND_STATUS" = "200" ] || [ "$FRONTEND_STATUS" = "307" ]; then
  FRONTEND_OK=true
  log "  ✓ 前端页面正常 (HTTP ${FRONTEND_STATUS})"
else
  warn "  ✗ 前端页面异常 (HTTP ${FRONTEND_STATUS})"
fi

echo ""
if $BACKEND_OK && $FRONTEND_OK; then
  log "═══ 回退成功 ═══"
  log "版本: ${CURRENT_COMMIT} → ${TARGET_RESOLVED}"
  log "日志: ${LOG_FILE}"
  exit 0
else
  err "═══ 回退失败（冒烟测试未通过）═══"
  err "请检查 docker compose ps 和日志"
  exit 16
fi
