---
description: 生产环境标准修复流程（Axiom 项目日常 Bug 修复与代码更新）
---

# Axiom 生产环境标准修复流程

> 系统已部署在服务器 `/opt/axiom`，所有改动遵循此流程，确保生产安全。

---

## STEP 1：理解问题

1. 读取用户描述，明确是 Bug 修复 还是功能迭代
2. 查看相关文件，了解当前代码状态
3. 如涉及 Bug，先搜索已有记录：`docs/AI助手开发规则与避坑手册.md`

---

## STEP 2：代码定位与审查

1. 用 `grep_search` 或 `find_by_name` 定位相关文件
2. 用 `view_file` 查看当前代码内容
3. 确认改动范围，不扩大影响面

---

## STEP 3：实施修改

遵守以下强制规则：

**i18n 文件修改：**
- ✅ 使用 `replace_file_content` 或 `multi_replace_file_content` 直接编辑
- ❌ 禁止用 Python 脚本 `json.dump` 写入（会破坏 `${xxx}` 占位符）
- ✅ en/ 和 zh-CN/ 必须同步修改

**前端 .tsx 修改：**
- 改完搜索有无残留硬编码字符串
// turbo
- 运行类型检查：`npx tsc --noEmit`（在 d:\aifenxi\frontend 目录）

**后端新增模型：**
- 同步修改 `llm_client.py`（MODELS + MODEL_PRICING）
- 同步修改 `model_router.py`（AVAILABLE_MODELS）

---

## STEP 4：提交代码

// turbo
1. 在 `d:\aifenxi` 执行：
```bash
git add -A
git commit -m "<类型>(<范围>): <一句话说明>"
git push
```

---

## STEP 5：告知用户部署命令

根据改动类型，告知用户在服务器执行对应命令：

**仅改后端：**
```bash
cd /opt/axiom && git pull
docker compose -f docker-compose.yml -f docker-compose.prod.yml build --no-cache backend
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d backend worker beat
```

**仅改前端（含 i18n）：**
```bash
cd /opt/axiom && git pull
docker compose -f docker-compose.yml -f docker-compose.prod.yml build --no-cache frontend
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d frontend
```

**前后端都改了：**
```bash
cd /opt/axiom && git pull
docker compose -f docker-compose.yml -f docker-compose.prod.yml build --no-cache backend frontend
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

---

## STEP 6：验证（可选）

如果可以浏览器测试，验证改动是否生效。如遇问题：
```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml logs backend --tail=100
```
