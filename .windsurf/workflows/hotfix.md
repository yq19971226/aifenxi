---
description: 线上紧急修复流程：最小化变更快速修复生产 Bug
---

# 线上紧急修复（Hotfix）流程

生产环境发现严重 Bug 时，按此流程执行最小化修复。

---

## 原则

- **最小变更**：只修 Bug，不夹带功能或重构
- **快速验证**：只跑受影响模块的测试，不跑全量
- **先止血再根治**：可以先用 workaround 止血，后续再做根本修复

---

## 1. 定位问题

```bash
# 检查服务器日志
ssh user@your-server
docker compose logs --tail=100 backend | grep -i error
docker compose logs --tail=100 worker | grep -i error
docker compose logs --tail=50 frontend
```

- [ ] 确认错误类型（500 / 白屏 / 数据异常 / 服务不可用）
- [ ] 确认影响范围（全部用户 / 特定功能 / 特定角色）
- [ ] 确认紧急程度（P0 立即修 / P1 当天修 / P2 排期修）

## 2. 本地复现

```bash
cd d:\aifenxi
git pull origin main  # 确保本地与线上一致
```

- [ ] 在本地环境复现 Bug
- [ ] 如果无法复现，通过日志推断根因

## 3. 最小修复

- [ ] 只修改导致 Bug 的文件
- [ ] 如果是后端：`python -m py_compile <修改的文件>`
- [ ] 如果是前端：`npx tsc --noEmit`
- [ ] 运行受影响模块的测试

```bash
# 后端：只测相关模块
cd d:\aifenxi\backend && python -m pytest tests/test_<相关>.py -v

# 前端：类型检查
cd d:\aifenxi\frontend && npx tsc --noEmit
```

## 4. 提交与推送

```bash
cd d:\aifenxi
git add <只添加修改的文件>
git commit -m "fix(<scope>): <Bug 描述>"
git push origin main
```

**Commit message 必须以 `fix(` 开头**，便于 CHANGELOG 自动分类。

## 5. 快速部署

```bash
# SSH 到服务器
ssh user@your-server
cd /opt/axiom

# 拉取修复
git pull origin main

# 仅重建受影响的服务（不要 --no-cache，节省时间）
# 如果只改了后端：
docker compose build backend worker beat
docker compose up -d backend worker beat

# 如果只改了前端：
docker compose build frontend
docker compose up -d frontend

# 如果都改了：
docker compose build backend worker beat frontend
docker compose up -d --remove-orphans
```

## 6. 验证修复

```bash
# 健康检查
sleep 15
docker compose ps

# 确认日志中不再出现相同错误
docker compose logs --tail=30 backend | grep -i error
```

- [ ] 相关 API 返回正常
- [ ] 前端页面正常渲染
- [ ] 原 Bug 不再出现

## 7. 后续

- [ ] 如果是 workaround，创建 TODO 记录根本修复计划
- [ ] 考虑是否需要补充测试防止回归
- [ ] 更新 CHANGELOG（下次正式发版时补入）
- [ ] 如果涉及数据修复，记录修复 SQL 到 `scripts/` 备查
