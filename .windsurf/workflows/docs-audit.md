---
description: 工程文档一致性审计，清理过时文档并确保文档与代码同步
---

# 工程文档审计

定期执行，确保文档与代码实际状态一致。

---

## 1. 根目录扫描

// turbo
```bash
cd d:\aifenxi && dir /b *.md 2>nul
```

**处理规则**：
| 文件 | 处理 |
|---|---|
| `README.md` | 保留，检查是否最新 |
| `CHANGELOG.md` | 保留 |
| `*_COMPLETE.md` / `*_FINAL.md` | 删除（AI 生成的一次性报告） |
| `AUDIT_REPORT.md` | 移入 `docs/archive/` 或删除 |
| `*_CHECKLIST.md` | 移入 `docs/` 或删除 |
| `*_SUMMARY.md` | 移入 `docs/` 或删除 |

## 2. docs/ 目录审计

// turbo
```bash
cd d:\aifenxi\docs && dir /b *.md 2>nul
```

对每个文件判断：
- **仍然准确** → 保留
- **部分过时** → 更新或标注 `[NEEDS UPDATE]`
- **完全过时** → 移入 `docs/archive/`
- **与 `.kiro/specs/` 重复** → 删除，以 spec 为准

## 3. .kiro/specs/ 状态检查

// turbo
```bash
cd d:\aifenxi\.kiro\specs && dir /b /ad 2>nul
```

对每个 spec 目录检查：
- [ ] `requirements.md` 顶部状态标记是否准确（Draft / In Progress / Done / Archived）
- [ ] `tasks.md` 中的 checkbox 是否反映实际完成状态
- [ ] 如果 spec 已全部完成，状态应标记为 `Done`

## 4. README.md 检查

README 必须包含：
- [ ] 项目简介（一句话描述）
- [ ] 技术栈列表
- [ ] 快速启动步骤（docker compose up 或本地开发命令）
- [ ] 目录结构说明
- [ ] 环境变量说明（指向 `.env.example`）
- [ ] 版本号

对比实际代码验证 README 中的命令是否仍然可用。

## 5. .env.example 检查

// turbo
```bash
cd d:\aifenxi && type .env.example
```

- [ ] 所有后端需要的环境变量都有条目
- [ ] 所有 API Key 配置项有注释说明
- [ ] 示例值不包含真实密钥
- [ ] 与 `backend/app/core/config.py` 中的 Settings 字段对应

## 6. 内联文档检查

搜索代码中的大段注释文档（应该在 docs/ 中而非代码里）：

```bash
cd d:\aifenxi\backend && grep -rn "# ===\|# ---\|\"\"\"$" --include="*.py" | head -20
```

- 超过 20 行的 docstring / 注释块应考虑提取到 `docs/` 或 `.kiro/specs/`
- Service 层函数的简短 docstring（< 5 行）是正常的

## 7. 生成审计摘要

审计完成后输出：
1. 删除了哪些文件
2. 归档了哪些文件
3. 更新了哪些文件
4. README 是否最新
5. 有哪些文档仍需人工确认
