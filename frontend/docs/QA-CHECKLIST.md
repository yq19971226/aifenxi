# OmniMind 前端 QA 检查清单

> 最后检查时间: 2026-03-01 | 构建版本: v3.0.0 | 页面总数: 36

---

## 1. 构建与类型安全

| 检查项 | 状态 | 备注 |
|--------|------|------|
| `npx tsc --noEmit` 零错误 | ✅ 通过 | 全量类型检查通过 |
| `npx next build` 零错误 | ✅ 通过 | 36 页面全部编译成功 |
| 无构建警告 | ✅ 通过 | 无 deprecation / unused 警告 |
| 所有 Tailwind 类名正确 | ✅ 通过 | 已统一到设计系统 CSS 变量 |

---

## 2. Core Web Vitals

| 指标 | 目标 | 当前状态 | 措施 |
|------|------|----------|------|
| LCP (Largest Contentful Paint) | < 2.5s | ✅ 预估达标 | 首屏无大图/字体阻塞；SSR 预渲染 login 页 |
| CLS (Cumulative Layout Shift) | < 0.1 | ✅ 预估达标 | Skeleton 占位防止布局偏移；固定高度图表容器 |
| FID (First Input Delay) | < 100ms | ✅ 预估达标 | 所有重计算在 worker/后端；前端仅展示 |
| First Load JS (shared) | < 200KB | ✅ **87.1 KB** | 远低于预算 |

### 各页面 JS 体积（First Load = page JS + shared 87.1KB）

| 页面 | Page JS | First Load | 风险 |
|------|---------|------------|------|
| /dashboard | 19.2 KB | 165 KB | ✅ 安全 |
| /performance | 4.4 KB | 200 KB | ⚠️ 临界（含 Lightweight Charts） |
| /onchain | 12 KB | 193 KB | ⚠️ 接近上限 |
| /derivatives | 6.46 KB | 188 KB | ✅ 安全 |
| /admin/dashboard | 10.5 KB | 138 KB | ✅ 安全 |
| 其余页面 | 3-12 KB | 90-145 KB | ✅ 安全 |

### 优化建议

1. `/performance` 页面接近 200KB 上限 → 考虑 `next/dynamic` 懒加载 Lightweight Charts
2. `/onchain` 页面 193KB → 鲸鱼转账 Feed 可拆分为独立 chunk
3. 已使用 `"use client"` 标记所有客户端组件，Server Component 默认零 JS

---

## 3. WCAG AA 无障碍

| 检查项 | 状态 | 备注 |
|--------|------|------|
| 颜色对比度 > 4.5:1 | ⚠️ 部分需验证 | 主文本 #fafafa on #09090b = 19.3:1 ✅; 次文本 #a1a1aa on #09090b = 7.5:1 ✅; muted #71717a on #09090b = 4.6:1 ✅; ghost #52525b on #09090b = 3.2:1 ❌ |
| 键盘可导航 | ⚠️ 部分缺失 | 原生 button/link/input 可 Tab 导航；自定义组件（PlaybookSelector 卡片）需补充 tabIndex + onKeyDown |
| ARIA 属性 | ⚠️ 需增强 | Toggle 已有 `role="switch" aria-checked`；其余表格/图表缺少 aria-label |
| 焦点指示器 | ⚠️ 需添加 | 当前 `outline: none` 移除了默认焦点环，需添加 `focus-visible` 样式 |
| 屏幕阅读器 | ⚠️ 需测试 | 状态灯仅用颜色区分，需补充 sr-only 文本 |

### 修复优先级

```
P0: 添加 focus-visible 焦点环（全局 CSS）
P1: ghost 文本色 #52525b 对比度不足 → 调整为 #71717a 或仅用于装饰
P2: 状态指示灯添加 sr-only 标签
P3: 自定义交互元素补充 tabIndex + keyboard handler
```

---

## 4. 移动端响应式

| 断点 | 覆盖情况 | 备注 |
|------|----------|------|
| 375px (iPhone SE) | ⚠️ 基本可用 | 侧边栏折叠为 64px 图标模式；表格水平滚动；网格 1 列 |
| 768px (iPad) | ✅ 良好 | 网格 2 列；表格完整显示 |
| 1440px (笔记本) | ✅ 良好 | max-w-1400px 居中；网格 3-4 列 |
| 1920px (桌面) | ✅ 良好 | 内容居中，两侧留白 |

### 使用的断点类

- `sm:` (640px) — 22 个页面使用
- `md:` (768px) — 部分页面使用
- `lg:` (1024px) — 部分页面使用
- `xl:` (1280px) — Admin Dashboard 6 列网格
- `2xl:` (1536px) — 少量使用

### 改进建议

```
P1: 侧边栏在 < 768px 时应切换为底部 Tab 栏或抽屉
P2: 数据表格在手机上添加卡片视图替代（当前仅 overflow-x-auto）
P3: 图表组件在窄屏下自动降低高度
```

---

## 5. 边缘状态处理

| 状态 | 覆盖率 | 实现方式 |
|------|--------|----------|
| 加载状态 | ✅ 28/28 页面 | Skeleton 组件 + animate-pulse + spinner |
| 错误状态 | ✅ 19/28 页面 | 红色错误文本 + try/catch |
| 空状态 | ✅ 15+ 页面 | EmptyState 组件（图标+文案） |
| 离线状态 | ❌ 未实现 | 建议：添加网络状态检测 + 离线提示 Banner |
| 认证过期 | ✅ 已处理 | AuthGuard + middleware 重定向 /login |
| 权限不足 | ✅ 已处理 | ROUTE_PERMISSIONS 映射 + 重定向 /dashboard |

### 缺失项

```
P1: 离线状态检测 — navigator.onLine + window 'offline' 事件
P2: API 超时处理 — 部分 fetch 无 AbortController/timeout
P3: 网络重试 — React Query 已有 retry，但自定义 fetch 无重试
```

---

## 6. 动画降级

| 检查项 | 状态 | 备注 |
|--------|------|------|
| prefers-reduced-motion 支持 | ✅ 已修复 | PageTransition 使用 `useReducedMotion()` |
| CSS 动画降级 | ⚠️ 未覆盖 | animate-pulse / skeleton-shimmer 未检测 reduced-motion |
| framer-motion 全局 | ⚠️ 建议 | 可在 MotionConfig 中设置 `reducedMotion="user"` |

### 建议修复

```css
/* globals.css — 添加全局降级 */
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

---

## 7. 安全

| 检查项 | 状态 |
|--------|------|
| API Key 不硬编码 | ✅ 使用环境变量 NEXT_PUBLIC_API_URL |
| Token 存储 | ✅ localStorage（SPA 标准方案） |
| XSS 防护 | ✅ React 默认转义 + 无 dangerouslySetInnerHTML |
| CORS | ✅ 后端控制 |
| Admin 路由保护 | ✅ AuthGuard + ROUTE_PERMISSIONS |

---

## 总结

| 类别 | 评分 | 说明 |
|------|------|------|
| 构建质量 | ★★★★★ | 零错误零警告 |
| 性能 | ★★★★☆ | JS 体积达标，2 页面临界需优化 |
| 无障碍 | ★★★☆☆ | 对比度基本达标，键盘/ARIA 需增强 |
| 响应式 | ★★★★☆ | 桌面端优秀，移动端可用但需打磨 |
| 边缘状态 | ★★★★☆ | 加载/错误/空状态覆盖全面，缺离线处理 |
| 动画 | ★★★★☆ | 主动画已支持 reduced-motion，CSS 动画待补 |
