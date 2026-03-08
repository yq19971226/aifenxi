---
description: 代码/文档/缓存瘦身，清理 AI 产生的垃圾文件和过时内容
---

# 代码瘦身与清理

定期或上线前执行，清理 AI 编码过程中积累的技术债务。

---

## 1. 根目录垃圾文件

扫描并删除根目录中不应存在的文件：

// turbo
```bash
cd d:\aifenxi && dir /b *.md *.py *.html 2>nul
```

**应删除的模式**：
- `_fix_*.py` / `_compact.py` / `_*.py` — AI 临时脚本
- `*_COMPLETE.md` / `*_FINAL.md` / `AUDIT_REPORT.md` — AI 生成报告
- `*_CHECKLIST.md` / `*_SUMMARY.md` — 应在 docs/ 或直接输出到对话
- `*.html`（如 `coinglass_api_docs.html`）— 移入 `docs/reference/`

**允许保留**：README.md

## 2. 前端死代码

// turbo
```bash
cd d:\aifenxi\frontend && npx tsc --noEmit 2>&1 | head -20
```

检查项：
- [ ] 未使用的组件文件（无任何导入方）
- [ ] 未使用的 `lib/api/*.ts` 函数
- [ ] 未使用的 hooks
- [ ] `console.log` 调试语句（生产代码不应有）

```bash
cd d:\aifenxi\frontend && grep -rn "console\.log" --include="*.tsx" --include="*.ts" | grep -v node_modules | grep -v "console.error\|console.warn"
```

## 3. 后端死代码

// turbo
```bash
cd d:\aifenxi\backend && python -m py_compile main.py && echo "OK"
```

检查项：
- [ ] 未使用的 service 文件
- [ ] 重复的路由定义（main.py 中 include_router 检查）
- [ ] 已注释掉的大段代码（超过 10 行的注释块应删除）
- [ ] `scripts/` 中的临时脚本（`scripts/tmp/` 清空）

## 4. 文档清理

- [ ] `docs/` 中过时文档移入 `docs/archive/`
- [ ] `.kiro/specs/` 中已完成的 spec 标记状态为 Done
- [ ] 根目录 AI 报告文件删除或归档

## 5. 缓存与构建产物

```bash
# 前端
cd d:\aifenxi\frontend
rmdir /s /q .next 2>nul
rmdir /s /q node_modules\.cache 2>nul

# 后端
cd d:\aifenxi\backend
del /s /q __pycache__ 2>nul
del /s /q .pytest_cache 2>nul

# Docker（可选，释放磁盘）
docker system prune -f
docker builder prune -f
```

## 6. .gitignore 检查

确认以下条目在 .gitignore 中：
- [ ] `test.db`
- [ ] `.env` / `.env.local`
- [ ] `backend/scripts/seed_admin.py`
- [ ] `__pycache__/`
- [ ] `.next/`
- [ ] `node_modules/`
- [ ] `*.log`
- [ ] `scripts/tmp/`

## 7. Git 状态

```bash
cd d:\aifenxi && git status --short
```

- [ ] 无意外的未跟踪文件
- [ ] 无大文件（>1MB）被跟踪
- [ ] commit 后工作区干净
