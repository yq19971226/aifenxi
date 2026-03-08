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

## 后台一键更新（未来版本）

实现 `/api/admin/system/update` 端点后，上述 3.2~3.6 步骤将自动化：
1. Admin 后台点击"系统更新"按钮
2. 后端执行 git pull + docker rebuild + healthcheck
3. 前端显示更新进度
4. 完成后自动刷新页面

参见 `/release-version` workflow 了解版本管理细节。
