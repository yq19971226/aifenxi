---
description: 上线前完整检查清单，覆盖代码质量、安全、性能、文档、基础设施
---

# 上线前检查清单

版本发布到生产环境前，按以下 7 个维度逐项检查。

---

## 1. 代码质量

// turbo
```bash
cd d:\aifenxi\frontend && npx tsc --noEmit
```

// turbo
```bash
cd d:\aifenxi\backend && python -m pytest tests/ -x -q --tb=short 2>&1 | head -30
```

- [ ] 前端 `tsc --noEmit` 零错误
- [ ] 后端所有测试通过
- [ ] 无未使用的 import / 变量（`grep -r "unused"` 抽查）
- [ ] 无空 catch 块（`grep -rn "catch\s*(" --include="*.tsx" --include="*.ts" | grep -v console`）
- [ ] 无 `console.log` 调试残留（生产代码中）
- [ ] 所有页面文件 ≤ 300 行

## 2. 安全

- [ ] 所有 `/admin/*` API 端点有 `require_admin` 依赖注入
- [ ] 所有 `/admin/*` 前端页面有组件级 role 检查
- [ ] `.env` 不在 git 中（检查 `.gitignore`）
- [ ] `seed_admin.py` 不在 git 中
- [ ] JWT secret 不是默认值 `your_secret_key_here`
- [ ] CORS 配置限制为实际域名（非 `*`）

// turbo
```bash
cd d:\aifenxi\backend && grep -rn "require_admin\|require_operator\|get_current_user" app/api/ | wc -l
```

## 3. 数据库

- [ ] `backend/migrations/init.sql` 与实际数据库 schema 一致
- [ ] `backend/init_sqlite.py` 与 `init.sql` 镜像同步
- [ ] 无遗漏的 migration（检查是否有 DDL 只在代码中 CREATE TABLE IF NOT EXISTS）
- [ ] 备份脚本 `scripts/backup_db.sh` 可正常执行
- [ ] 生产数据库连接使用 PostgreSQL（非 SQLite）

## 4. 前端构建

// turbo
```bash
cd d:\aifenxi\frontend && npm run build 2>&1 | tail -20
```

- [ ] `npm run build` 零错误
- [ ] 构建输出包含所有预期页面路由
- [ ] `error.tsx` 存在于 `app/(main)/` 和 `app/(main)/admin/`
- [ ] `loading.tsx` 存在于 `app/(main)/`
- [ ] 无"即将推出"占位页面暴露在导航中

## 5. 后端服务

- [ ] `backend/main.py` 中所有 router 已 include
- [ ] `/health` 端点返回 200
- [ ] Celery Worker 启动无报错
- [ ] Celery Beat 定时任务注册正确
- [ ] Redis 连接正常
- [ ] 所有 API Key 配置项已在 `.env.example` 中说明

## 6. Docker & 基础设施

// turbo
```bash
cd d:\aifenxi && docker compose config --quiet 2>&1
```

- [ ] `docker-compose.yml` 语法正确
- [ ] `docker-compose.prod.yml` 覆盖配置正确
- [ ] `backend/Dockerfile` 构建成功
- [ ] `frontend/Dockerfile` 构建成功
- [ ] Healthcheck 配置正确（backend `/health`，frontend `/dashboard`）
- [ ] 日志配置了 `max-size` 和 `max-file` 防爆盘
- [ ] 端口映射：生产环境不暴露 PostgreSQL/Redis 端口

## 7. 文档 & 版本

- [ ] `README.md` 包含最新的快速启动步骤
- [ ] `CHANGELOG.md` 已更新本次发布内容
- [ ] 版本号已同步更新（`config.py` + `package.json`）
- [ ] 根目录无垃圾文件（`_fix_*.py`、`*_COMPLETE.md` 等）
- [ ] `docs/` 中过时文档已归档到 `docs/archive/`

---

## 最终确认

全部检查通过后，执行 `/release-version` 打版本 tag，然后 `/deploy-production` 部署。
