#!/usr/bin/env bash
# ============================================================
# Axiom 服务器一键初始化脚本
# 在全新 Ubuntu 22.04 服务器上运行此脚本完成所有环境配置
#
# 用法:
#   1. 将代码上传到服务器 /opt/axiom
#   2. sudo bash /opt/axiom/scripts/server-init.sh your-domain.com
# ============================================================
set -euo pipefail

DOMAIN="${1:-}"
PROJECT_DIR="/opt/axiom"

if [ -z "$DOMAIN" ]; then
    echo "用法: sudo bash $0 <your-domain.com>"
    echo "示例: sudo bash $0 app.axiom.com"
    exit 1
fi

if [ "$EUID" -ne 0 ]; then
    echo "请使用 sudo 运行此脚本"
    exit 1
fi

GREEN='\033[0;32m'
NC='\033[0m'
log() { echo -e "${GREEN}[$(date +%H:%M:%S)]${NC} $*"; }

# ── 1. 系统更新 ──
log "步骤 1/8: 系统更新..."
apt-get update -qq
apt-get upgrade -y -qq

# ── 2. 安装基础工具 ──
log "步骤 2/8: 安装基础工具..."
apt-get install -y -qq \
    curl wget git ufw \
    apt-transport-https ca-certificates gnupg lsb-release

# ── 3. 安装 Docker ──
log "步骤 3/8: 安装 Docker..."
if ! command -v docker &> /dev/null; then
    curl -fsSL https://get.docker.com | sh
    systemctl enable docker
    systemctl start docker
    log "  Docker 已安装"
else
    log "  Docker 已存在，跳过"
fi

# 确保 docker compose 可用
if ! docker compose version &> /dev/null; then
    log "  安装 Docker Compose 插件..."
    apt-get install -y -qq docker-compose-plugin
fi

# ── 4. 安装 Nginx ──
log "步骤 4/8: 安装 Nginx..."
if ! command -v nginx &> /dev/null; then
    apt-get install -y -qq nginx
    systemctl enable nginx
fi

# ── 5. 安装 Certbot (Let's Encrypt) ──
log "步骤 5/8: 安装 Certbot..."
if ! command -v certbot &> /dev/null; then
    apt-get install -y -qq certbot python3-certbot-nginx
fi

# ── 6. 配置防火墙 ──
log "步骤 6/8: 配置防火墙..."
ufw --force enable
ufw default deny incoming
ufw default allow outgoing
ufw allow ssh
ufw allow 80/tcp
ufw allow 443/tcp
# 不开放 3000/8000/5432/6379 端口 — 全部走 Nginx 反向代理
log "  防火墙已配置：仅开放 SSH + HTTP + HTTPS"

# ── 7. 配置 Nginx + SSL ──
log "步骤 7/8: 配置 Nginx..."

# 生成 Nginx 配置（替换域名）
sed "s/your-domain.com/${DOMAIN}/g" "${PROJECT_DIR}/nginx/axiom.conf" \
    > /etc/nginx/sites-available/axiom

# 启用站点
ln -sf /etc/nginx/sites-available/axiom /etc/nginx/sites-enabled/axiom
rm -f /etc/nginx/sites-enabled/default

# 先用 HTTP 启动（SSL 证书还没申请）
# 临时注释掉 SSL 相关配置
cat > /etc/nginx/sites-available/axiom-temp << 'EOF'
server {
    listen 80;
    server_name DOMAIN_PLACEHOLDER;

    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

    location /api/ {
        proxy_pass http://127.0.0.1:8000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_buffering off;
        proxy_read_timeout 300s;
    }

    location /ws {
        proxy_pass http://127.0.0.1:8000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 86400s;
    }

    location /health {
        proxy_pass http://127.0.0.1:8000;
    }

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
EOF
sed -i "s/DOMAIN_PLACEHOLDER/${DOMAIN}/g" /etc/nginx/sites-available/axiom-temp
ln -sf /etc/nginx/sites-available/axiom-temp /etc/nginx/sites-enabled/axiom
mkdir -p /var/www/certbot
nginx -t && systemctl reload nginx

# 申请 SSL 证书
log "  申请 SSL 证书..."
certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos --email "admin@${DOMAIN}" || {
    echo ""
    echo "  ⚠ SSL 证书申请失败！"
    echo "  请确保域名 ${DOMAIN} 的 DNS A 记录已指向本服务器 IP"
    echo "  稍后可手动运行: certbot --nginx -d ${DOMAIN}"
    echo ""
}

# 如果证书成功，切换到完整 HTTPS 配置
if [ -f "/etc/letsencrypt/live/${DOMAIN}/fullchain.pem" ]; then
    sed "s/your-domain.com/${DOMAIN}/g" "${PROJECT_DIR}/nginx/axiom.conf" \
        > /etc/nginx/sites-available/axiom
    ln -sf /etc/nginx/sites-available/axiom /etc/nginx/sites-enabled/axiom
    rm -f /etc/nginx/sites-available/axiom-temp
    nginx -t && systemctl reload nginx
    log "  HTTPS 已启用"

    # 自动续期定时任务
    systemctl enable certbot.timer 2>/dev/null || true
fi

# ── 8. 配置部署代理 ──
log "步骤 8/8: 配置部署代理..."
cp "${PROJECT_DIR}/scripts/axiom-deploy-agent.service" /etc/systemd/system/
systemctl daemon-reload
systemctl enable axiom-deploy-agent
systemctl start axiom-deploy-agent
log "  部署代理已启动 (127.0.0.1:9321)"

# ── 9. 初始化 .env ──
if [ ! -f "${PROJECT_DIR}/.env" ]; then
    log "创建 .env 文件..."
    cp "${PROJECT_DIR}/.env.example" "${PROJECT_DIR}/.env"
    # 生成随机 JWT 密钥
    JWT_KEY=$(openssl rand -hex 32)
    sed -i "s/your-super-secret-jwt-key-change-in-production/${JWT_KEY}/" "${PROJECT_DIR}/.env"
    # 生成随机数据库密码
    DB_PASS=$(openssl rand -hex 16)
    sed -i "s/change-me-in-production/${DB_PASS}/" "${PROJECT_DIR}/.env"
    sed -i "s|postgresql+asyncpg://omnimind:password@localhost|postgresql+asyncpg://omnimind:${DB_PASS}@postgres|" "${PROJECT_DIR}/.env"
    # 设置生产环境
    sed -i "s/APP_ENV=development/APP_ENV=production/" "${PROJECT_DIR}/.env"
    sed -i "s|NEXT_PUBLIC_API_URL=http://localhost:8000|NEXT_PUBLIC_API_URL=https://${DOMAIN}|" "${PROJECT_DIR}/.env"
    sed -i "s|NEXT_PUBLIC_WS_URL=ws://localhost:8000|NEXT_PUBLIC_WS_URL=wss://${DOMAIN}|" "${PROJECT_DIR}/.env"
    sed -i "s|PUBLIC_API_URL=https://your-domain.com/api|PUBLIC_API_URL=https://${DOMAIN}|" "${PROJECT_DIR}/.env"
    log "  .env 已生成（请检查并补充 API 密钥）"
else
    log "  .env 已存在，跳过"
fi

# ── 完成 ──
echo ""
echo "════════════════════════════════════════════"
echo "  Axiom 服务器初始化完成！"
echo "════════════════════════════════════════════"
echo ""
echo "  下一步操作："
echo ""
echo "  1. 编辑 .env 文件，填入 API 密钥："
echo "     nano ${PROJECT_DIR}/.env"
echo ""
echo "  2. 启动所有服务："
echo "     cd ${PROJECT_DIR}"
echo "     docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d"
echo ""
echo "  3. 创建管理员账号："
echo "     docker compose exec backend python scripts/create_admin.py"
echo ""
echo "  4. 访问你的网站："
echo "     https://${DOMAIN}"
echo ""
echo "  后续更新代码，只需在管理后台点击「系统更新」按钮即可。"
echo ""
