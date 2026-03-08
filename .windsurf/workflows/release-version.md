---
description: 版本发布流程：版本号更新 + CHANGELOG + git tag
---

# 版本发布流程

每次发布新版本时执行此流程。

---

## 1. 确定版本号

语义化版本：`MAJOR.MINOR.PATCH`

| 变更类型 | 版本升级 | 示例 |
|---|---|---|
| 不兼容 API 变更 | MAJOR | 1.x.x → 2.0.0 |
| 新功能（向后兼容） | MINOR | 1.2.x → 1.3.0 |
| Bug 修复 | PATCH | 1.2.3 → 1.2.4 |

## 2. 更新版本号

### 2.1 后端

编辑 `backend/app/core/config.py`，更新 `APP_VERSION`：

```python
APP_VERSION = "x.y.z"
```

### 2.2 前端

编辑 `frontend/package.json`，更新 `version`：

```json
{
  "version": "x.y.z"
}
```

## 3. 更新 CHANGELOG

编辑根目录 `CHANGELOG.md`（如不存在则创建），添加新版本条目：

```markdown
# Changelog

## [x.y.z] - YYYY-MM-DD

### 新增
- 功能描述

### 修复
- Bug 描述

### 变更
- 行为变更描述

### 移除
- 废弃功能描述
```

变更分类与 git commit type 对应：
- `feat` → 新增
- `fix` → 修复
- `refactor` / `perf` → 变更
- 废弃功能 → 移除

## 4. 提交版本变更

```bash
cd d:\aifenxi && git add -A
git commit -m "chore(release): v x.y.z"
```

## 5. 打 Git Tag

```bash
git tag -a vx.y.z -m "Release vx.y.z: 简要描述"
git push origin main --tags
```

## 6. Docker 镜像打 Tag（生产环境）

```bash
# 在服务器上构建后打 tag
docker tag axiom-backend:latest axiom-backend:vx.y.z
docker tag axiom-frontend:latest axiom-frontend:vx.y.z
```

保留最近 3 个版本的 tag，清理更早的：
```bash
# 列出所有本地镜像 tag
docker images axiom-backend --format "{{.Tag}}" | sort -rV
```

## 7. 部署

版本发布完成后，执行 `/deploy-production` 流程部署到生产环境。
