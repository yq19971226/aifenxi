# Changelog

所有重要变更记录在此文件。格式遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.0.0/)。

## [4.1.0] - 2026-03-08

### 新增
- Admin 独立侧边栏布局（`AdminLayout` + `AdminSidebar`），替代 TopNav 17 项下拉菜单
- 移动端 Admin 可折叠菜单条（`AdminMobileNav`）
- `/admin` 路由重定向至 `/admin/dashboard`
- `app/(main)/error.tsx` + `loading.tsx` 前台错误边界与加载骨架屏
- `app/(main)/admin/error.tsx` + `loading.tsx` 后台错误边界
- 跨面板 MCP Server（`tools/mcp_panel_server.py`）
- 项目全局 AI 编码规则（`.windsurfrules`，18 条规则 4 大部分）
- 12 个 Windsurf Workflow（`.windsurf/workflows/`）
- 后端 `app_version` 配置字段（`backend/app/core/config.py`）

### 变更
- TopNav "管理" 从下拉菜单改为单链接，图标 Shield → ShieldCheck
- `.gitignore` 大幅补充（celerybeat / *.db / *.bak / *.broken / fix_report / docs/reference/*.html）

### 清理
- 删除根目录 7 个 AI 生成报告（AGENT_MANAGEMENT_*.md、AUDIT_REPORT.md 等）
- 删除后端残留文件（celerybeat-schedule.*、main.py.broken、_configs.json、备份 db）
- 删除前端残留文件（fix_report*.txt）
- 3 个大体积 HTML 参考文档移入 `docs/reference/`
- 5 个过时文档归档至 `docs/archive/`

## [4.0.0] - 2026-03-01

### 新增
- v4 产品重设计：AI 对抗 AI 多智能体分析系统
- 11 个智能体（核心 6 + 增强 3 + 对抗 2）
- 剧本推演页 3AI 对抗（庄家/防御/裁判）
- CoinGlass 全面集成（8 个数据维度、四级套餐）
- CoinMarketCal 日历事件集成
- 公告系统（Admin 管理 + 用户端渲染 + 投递审计）
- 响应式适配（移动端汉堡菜单、自适应表格、字号阶梯）
- 前端 UI 全面重设计（Linear/Bloomberg 暗色主题）
- 数据源开关与能力矩阵

### 变更
- 币种从 10 缩减至 5（BTC/ETH/SOL/BNB/XRP）
- 智能体从 10 调整为 11（移除 PlaybookAgent，新增 CalendarAgent）

---

*版本号规范：MAJOR.MINOR.PATCH（语义化版本）*
*后端版本：`backend/app/core/config.py` → `app_version`*
*前端版本：`frontend/package.json` → `version`*
