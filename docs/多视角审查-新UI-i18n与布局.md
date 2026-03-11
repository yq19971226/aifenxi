# 新 UI 多视角审查：i18n、404、布局与移动端

## 一、i18n / 繁中仍多英文

### 1.1 问题概述
- 选择「中文繁体」后，大量界面仍为英文，因组件直接写死英文或仅提供简体/英文文案。
- 部分文案仅存在于 zh-CN，zh-TW 未补全或沿用英文 fallback。

### 1.2 硬编码英文热点

| 位置 | 文案示例 | 建议 |
|------|----------|------|
| `app/[locale]/(main)/dashboard/page.tsx` | Command Center, WELCOME BACK, CREDITS, RANK, TOP 5%, Live Analysis Feed, No active analysis sessions., Start New Analysis, Initializing NSED Engine..., System Connection Failed, Retry Connection | 使用 `useTranslations('dashboard')`，在 zh-CN/zh-TW/en 的 dashboard.json 中补全 |
| `components/layout/ContextSidebar.tsx` | System Status, NSED Engine, Online, Data Feed, Connected, Partial, Degraded, Active Agents, 11/11, Network Latency, 45ms, Market Pulse | 新增 namespace（如 `sidebar` 或并入 `common`），三语补齐 |
| `components/cards/DataSourceBanner.tsx` | DOMAIN_LABEL 等为简体中文；getMessageFallback 在缺 key 时回退为 key 路径，易出现英文 | 使用 next-intl，按 locale 加载对应「数据源离线/信号完整度/缺失主域」等文案；zh-TW 需繁体版 |

### 1.3 文案覆盖缺口
- **dashboard**：zh-CN 有 table/legend 等，但缺少 commandCenter、welcomeBack、credits、liveAnalysisFeed、noActiveSessions、startNewAnalysis、initializingEngine、connectionFailed、retryConnection 等 key。
- **common**：可扩展 status 相关（如 Online, Connected, Partial, Degraded）供侧栏与看板共用。
- **zh-TW**：需与 zh-CN 逐 namespace 对照，缺 key 的补繁体，避免 fallback 到英文。

---

## 二、多页面 404

### 2.1 根因
- 项目采用 `localePrefix: 'always'`，有效路径均为 `/{locale}/...`。
- 多处使用 **无 locale 前缀** 的链接（如 `/dashboard`、`/register`、`/forgot-password`），在服务端/客户端跳转后落在「无 locale」路径，与路由不匹配 → 404。

### 2.2 问题链接清单

| 文件 | 当前 href | 应改为 |
|------|-----------|--------|
| `app/[locale]/login/page.tsx` | `/forgot-password` | `/${locale}/forgot-password`（且需新增该页面或占位） |
| `app/[locale]/login/page.tsx` | `/register` | `/${locale}/register` |
| `components/layout/TopNav.tsx` | `/`（Logo） | `/${locale}` 以保持当前语言 |
| `app/[locale]/(main)/announcements/page.tsx` | `/dashboard` | `/${locale}/dashboard` |
| `app/[locale]/(main)/leaderboard/page.tsx` | `/performance` | `/${locale}/performance` |
| `components/dashboard/OnchainSection.tsx` | `/settings/membership` | 需传入 locale 或 useLocale() 后 `/${locale}/settings/membership` |
| `components/dashboard/Badges.tsx` | `/settings/membership` | 同上 |
| `components/dashboard/ExpandedDetail.tsx` | `/consensus?symbol=...` | `/${locale}/consensus?symbol=...` |
| `components/dashboard/OpportunityRisk.tsx` | `/consensus?symbol=...` | 同上 |
| `components/layout/MaintenancePlaceholder.tsx` | `/dashboard` | `/${locale}/dashboard` |
| `app/[locale]/guide/guide-content.tsx` | `/` | `/${locale}` |

### 2.3 缺失路由
- **/forgot-password**：当前无 `app/[locale]/forgot-password/page.tsx`，链接一点即 404。需新增该路由或暂时改为「找回密码」弹窗/同页区块。

---

## 三、布局与移动端

### 3.1 现状
- 主布局：桌面端左侧 Sidebar（`hidden md:flex`）、右侧 ContextSidebar（`hidden xl:block`）、中间 main；移动端 TopNav + 底栏 4 宫格 + 全屏抽屉「更多」。
- main 区域：`md:pl-[64px]`、`pb-20 md:pb-0`（为底栏留白）、`px-4 md:px-8`。

### 3.2 可能问题点
- **Logo 跳转**：TopNav 中 `href="/"` 会经中间件跳到默认 locale（如 zh-CN），繁体用户会变简体。应改为 `/${locale}`。
- **表格/宽内容**：部分列表、表格未做 `overflow-x-auto` + `min-w-0`，小屏易撑破或横向溢出，需逐页检查。
- **DataSourceBanner**：长文案「缺失主域：链上 / 衍生品」等在小屏可能折行混乱，建议 `text-sm`、适当 `truncate` 或两行省略。
- **底栏安全区**：已有 `pb-safe`，需确认在 iOS Safari 等真机下底部不被遮挡。
- **抽屉与 z-index**：TopNav 抽屉 `z-[60]`，需保证高于所有主内容与弹窗，避免被盖住。

### 3.3 建议加固
- 所有带「主内容」的页面容器：`min-w-0 overflow-x-auto`，内部表格用 `overflow-x-auto`。
- 移动端优先检查：dashboard、consensus、leaderboard、settings、admin 列表页。
- 若存在固定宽度（如 `w-[300px]`）的侧栏或卡片，在 sm 下改为 `w-full` 或 `max-w-full`。

---

## 四、修复优先级建议

| 优先级 | 项 | 说明 |
|--------|----|------|
| P0 | 无 locale 链接导致 404 | 登录/注册/公告/排行榜/维护页等链接补 `locale`，避免整页 404 |
| P0 | forgot-password 路由 | 新增 `[locale]/forgot-password` 页面或临时去掉/替换链接 |
| P1 | Dashboard 全页 i18n | 看板标题、欢迎语、CREDITS、Live Feed、按钮、错误态全部用 t() |
| P1 | ContextSidebar 全 i18n | 系统状态、Data Feed、Market Pulse 等全部走文案 key，三语补齐 |
| P2 | zh-TW 与 zh-CN 对齐 | 各 namespace 缺 key 补繁体，避免英文 fallback |
| P2 | DataSourceBanner i18n | 数据源离线/完整度/缺失主域等按 locale 显示 |
| P3 | 移动端布局与溢出 | 主内容 min-w-0、表格 overflow-x-auto、长文案省略 |

---

## 五、小结
- **404**：主要由「无 locale 的链接」和「缺失 forgot-password 路由」导致，修链接 + 补路由可解决大部分。
- **繁中多英文**：Dashboard、ContextSidebar、DataSourceBanner 等硬编码英文改为 i18n，并补全 zh-TW（及 en）对应 key。
- **布局/手机端**：Logo 用当前 locale、主内容防溢出、移动端重点页真机测一遍即可显著改善。

---

## 六、已实施修复（本次）

- **P0 链接与路由**：登录/注册/公告/排行榜/维护页/指南/OnchainSection/Badges/ExpandedDetail/OpportunityRisk/MaintenancePlaceholder/AuthLayout 等所有无 locale 的链接已改为 `/${locale}/...`；新增 `[locale]/forgot-password` 占位页；登录成功跳转、注册成功跳转改为带 locale。
- **P1 i18n**：Dashboard 页全部文案改用 `t()`（commandCenter、welcomeBack、credits、liveAnalysisFeed、noActiveSessions、startNewAnalysis、initializingEngine、connectionFailed、retryConnection）；ContextSidebar 全部改用 `common.sidebar`（systemStatus、nsedEngine、online、dataFeed、connected/partial/degraded、activeAgents、networkLatency、marketPulse）；zh-CN/zh-TW/en 的 dashboard.json、common.sidebar 已补全。
- **待后续**：DataSourceBanner 文案 i18n、zh-TW 与 zh-CN 逐 namespace 对齐、移动端表格 overflow 逐页检查。
