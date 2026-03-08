---
description: 本地修复代码 → 推送线上服务器的完整部署流程
---

# 本地 → 生产部署流程

本流程覆盖：本地修复 → 本地验证 → git 推送 → 服务器更新 → 健康检查。

---

## 阶段一：本地验证

### 1.1 前端构建检查

// turbo
```bash
cd d:\aifenxi\frontend && npx tsc --noEmit
```

// turbo
```bash
cd d:\aifenxi\frontend && npm run build 2>&1 | tail -10
```

### 1.2 后端编译检查

// turbo
```bash
cd d:\aifenxi\backend && python -m py_compile main.py && echo "Backend OK"
```

### 1.3 后端测试

```bash
cd d:\aifenxi\backend && python -m pytest tests/ -x -q --tb=short
```

### 1.4 Docker 构建验证（可选，耗时较长）

```bash
cd d:\aifenxi && docker compose build backend frontend
```

---

## 阶段二：Git 提交与推送

### 2.1 检查变更

// turbo
```bash
cd d:\aifenxi && git status --short
```

// turbo
```bash
cd d:\aifenxi && git diff --stat
```

### 2.2 提交

Commit message 格式：`<type>(<scope>): <描述>`

```bash
cd d:\aifenxi && git add -A && git commit -m "<type>(<scope>): <描述>"
```

### 2.3 推送

```bash
cd d:\aifenxi && git push origin main
```

---

## 阶段三：服务器部署

### 3.1 SSH 到服务器

```bash
ssh user@your-server
```

### 3.2 拉取代码

```bash
cd /opt/axiom && git pull origin main
```

### 3.3 备份数据库

```bash
cd /opt/axiom && bash scripts/backup_db.sh
```

### 3.4 重建并启动

```bash
cd /opt/axiom && docker compose -f docker-compose.yml -f docker-compose.prod.yml build --no-cache
cd /opt/axiom && docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --remove-orphans
```

### 3.5 等待健康检查

```bash
# 等待 30 秒后检查
sleep 30
docker compose ps
```

确认所有服务状态为 `Up (healthy)`：
- [ ] postgres — healthy
- [ ] redis — healthy
- [ ] backend — healthy（`/health` 返回 200）
- [ ] worker — running
- [ ] beat — running
- [ ] frontend — healthy（`/dashboard` 可访问）

### 3.6 快速冒烟测试

```bash
# 后端 API
curl -s http://localhost:8000/health | head -1

# 前端页面
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/dashboard
```

---

## 阶段四：验证与监控

- [ ] 登录前台，检查看板数据正常
- [ ] 登录后台，检查 admin 页面可访问
- [ ] 检查 Celery Worker 日志无报错
- [ ] 检查数据采集任务正常运行

```bash
docker compose logs --tail=20 worker
docker compose logs --tail=20 beat
```

---

## 回滚（如果出问题）

```bash
# 快速回滚到上一版本
cd /opt/axiom && git checkout HEAD~1
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build

# 数据库回滚（如果需要）
# 使用 scripts/backup_db.sh 的备份恢复
```

---

## 后台一键更新（已实现）

### 架构

```
Admin 浏览器 → 后端 API → 部署代理(宿主机:9321) → git pull + docker rebuild
```

- **部署代理** (`scripts/deploy-agent.py`)：运行在宿主机的轻量 HTTP 服务，监听 `127.0.0.1:9321`
- **后端 API** (`/api/admin/system/deploy`)：SSE 流式转发部署日志
- **前端页面** (`/admin/system`)：一键更新按钮 + 实时日志 + 容器状态

### 使用方式

1. 本地修改代码 → `git commit` → `git push origin main`
2. 打开 Admin 后台 → 侧边栏「系统管理」
3. 查看是否有新提交可更新（页面自动检测）
4. 点击「一键更新」按钮
5. 等待部署完成（页面实时显示日志）

### 首次服务器配置

```bash
# 1. 将代码克隆到服务器
git clone <your-repo> /opt/axiom

# 2. 一键初始化（安装 Docker/Nginx/SSL/防火墙/部署代理）
#    会自动生成 .env（数据库密码、JWT 密钥已自动随机生成）
sudo bash /opt/axiom/scripts/server-init.sh your-domain.com

# 3. 启动服务
cd /opt/axiom
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d

# 4. 创建管理员
docker compose exec backend python scripts/create_admin.py

# 5. 登录后台 → 管理 → API 密钥 页面填写 DMXAPI 等业务密钥
#    无需手动编辑 .env！
```

### 相关文件

| 文件 | 说明 |
|---|---|
| `scripts/deploy.sh` | 部署脚本（git pull + docker build + health check）|
| `scripts/deploy-agent.py` | 宿主机部署代理（HTTP 服务）|
| `scripts/axiom-deploy-agent.service` | systemd 服务文件 |
| `scripts/server-init.sh` | 服务器一键初始化 |
| `nginx/axiom.conf` | Nginx 反向代理配置 |
| `backend/app/api/admin_system.py` | 后端系统管理 API |
| `frontend/app/(main)/admin/system/page.tsx` | 前端系统管理页面 |

参见 `/release-version` workflow 了解版本管理细节。
