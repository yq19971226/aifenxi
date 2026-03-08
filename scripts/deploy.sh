#!/usr/bin/env bash
# ============================================================
# Axiom 一键部署脚本
# 用法: ./scripts/deploy.sh [--no-backup]
# ============================================================
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
COMPOSE_CMD="docker compose -f docker-compose.yml -f docker-compose.prod.yml"
LOG_FILE="${PROJECT_DIR}/logs/deploy-$(date +%Y%m%d-%H%M%S).log"

# 颜色
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

log()  { echo -e "${GREEN}[$(date +%H:%M:%S)]${NC} $*" | tee -a "$LOG_FILE"; }
warn() { echo -e "${YELLOW}[$(date +%H:%M:%S)] WARN:${NC} $*" | tee -a "$LOG_FILE"; }
err()  { echo -e "${RED}[$(date +%H:%M:%S)] ERROR:${NC} $*" | tee -a "$LOG_FILE"; }

cd "$PROJECT_DIR"
mkdir -p logs

# ── 0. 记录当前版本 ──
OLD_COMMIT=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")
log "开始部署 — 当前版本: ${OLD_COMMIT}"

# ── 1. 备份数据库（可跳过） ──
if [[ "${1:-}" != "--no-backup" ]]; then
    log "步骤 1/6: 备份数据库..."
    if [[ -f scripts/backup_db.sh ]]; then
        bash scripts/backup_db.sh >> "$LOG_FILE" 2>&1 || warn "数据库备份失败，继续部署"
    else
        warn "backup_db.sh 不存在，跳过备份"
    fi
else
    log "步骤 1/6: 跳过数据库备份 (--no-backup)"
fi

# ── 2. 拉取最新代码 ──
log "步骤 2/6: 拉取最新代码..."
CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "main")
log "当前分支: ${CURRENT_BRANCH}"
git fetch origin >> "$LOG_FILE" 2>&1
git pull origin "${CURRENT_BRANCH}" >> "$LOG_FILE" 2>&1 || {
    err "git pull 失败，可能有冲突"
    exit 1
}
NEW_COMMIT=$(git rev-parse --short HEAD)
log "代码已更新: ${OLD_COMMIT} → ${NEW_COMMIT}"

# ── 3. 构建镜像 ──
log "步骤 3/6: 构建 Docker 镜像..."
$COMPOSE_CMD build >> "$LOG_FILE" 2>&1 || {
    err "Docker 构建失败"
    exit 2
}

# ── 4. 滚动重启服务 ──
log "步骤 4/6: 重启服务..."
$COMPOSE_CMD up -d --remove-orphans >> "$LOG_FILE" 2>&1 || {
    err "服务启动失败"
    exit 3
}

# ── 5. 等待健康检查 ──
log "步骤 5/6: 等待服务就绪 (最多90秒)..."
MAX_WAIT=90
ELAPSED=0
while [ $ELAPSED -lt $MAX_WAIT ]; do
    sleep 5
    ELAPSED=$((ELAPSED + 5))

    # 检查后端健康
    if curl -sf http://localhost:8000/health > /dev/null 2>&1; then
        log "后端已就绪 (${ELAPSED}s)"
        break
    fi
    log "等待中... (${ELAPSED}s)"
done

if [ $ELAPSED -ge $MAX_WAIT ]; then
    warn "健康检查超时，服务可能仍在启动中"
fi

# ── 6. 冒烟测试 ──
log "步骤 6/6: 冒烟测试..."
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

# ── 结果 ──
echo ""
if $BACKEND_OK && $FRONTEND_OK; then
    log "═══ 部署成功 ═══"
    log "版本: ${OLD_COMMIT} → ${NEW_COMMIT}"
    log "日志: ${LOG_FILE}"
    exit 0
else
    warn "═══ 部署完成但有警告 ═══"
    warn "请检查 docker compose ps 和日志"
    exit 0
fi
