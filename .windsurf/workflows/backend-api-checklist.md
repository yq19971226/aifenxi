---
description: 新增或修改后端 API 端点时的质量检查清单
---

# 后端 API 端点检查清单

新增或修改 FastAPI router 端点时，按以下清单逐项检查。

## 1. 鉴权

- [ ] 管理端点使用 `require_admin` 依赖注入
- [ ] 运营端点使用 `require_operator` 或在函数内检查角色
- [ ] 用户端点使用 `get_current_user` 依赖注入
- [ ] **不允许**创建无鉴权的管理/运营端点

## 2. 数据库操作

- [ ] 业务逻辑在 `app/services/` 层，不在 router 函数中直接写 SQL
- [ ] 使用 `get_db` 依赖注入获取 session
- [ ] Service 层使用 `flush()` 而非 `commit()`（事务由 `get_db` 管理）
- [ ] 显式 commit 仅限白名单场景（独立会话 / 后台任务 / Worker）

## 3. 返回结构

- [ ] 遵循现有模式：直接返回 Pydantic model 或 `{ data, message, code }` 字典
- [ ] 错误返回使用 `HTTPException` + 中文 detail 消息
- [ ] 不要返回裸字符串或无结构的 dict

## 4. 路由注册

- [ ] 新 router 在 `main.py` 中 `include_router` 注册
- [ ] prefix 遵循 `/api/xxx`（用户）或 `/api/admin/xxx`（管理）命名
- [ ] 不要创建重复的路由路径（检查已有路由）

## 5. 前端同步

- [ ] 对应的 `frontend/lib/api/xxx.ts` 封装函数已创建或更新
- [ ] 使用 `authFetch` 而非裸 `fetch`
- [ ] 如果是 admin 端点，前端调用处有角色检查

## 6. 验证

// turbo
```bash
cd d:\aifenxi\backend && python -m py_compile main.py
```

```bash
cd d:\aifenxi\backend && python -m pytest tests/ -x -q --tb=short 2>&1 | head -20
```
