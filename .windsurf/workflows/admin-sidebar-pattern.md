---
description: 为 /admin/* 页面创建独立侧边栏布局，替代 TopNav 下拉菜单
---

# Admin 侧边栏布局模式

## 目标

Admin 区域使用独立的 `AdminLayout`（侧边栏 + 内容区），不共用前台 TopNav 的下拉菜单。

## 1. 菜单分组定义

在 `components/admin/AdminSidebar.config.ts` 中定义分组：

```ts
export const ADMIN_MENU_GROUPS = [
  {
    label: "概览",
    items: [
      { label: "后台总览", href: "/admin/dashboard", icon: LayoutDashboard },
      { label: "系统监控", href: "/admin/monitor", icon: Activity },
    ],
  },
  {
    label: "系统配置",
    items: [
      { label: "快速设置", href: "/admin/setup", icon: Settings },
      { label: "参数设置", href: "/settings/configs", icon: SlidersHorizontal },
      { label: "API 密钥", href: "/admin/api-keys", icon: Key },
      { label: "数据源管理", href: "/admin/datasources", icon: Database },
      { label: "模型分工", href: "/admin/models", icon: Brain },
      { label: "币种管理", href: "/admin/symbols", icon: Coins },
    ],
  },
  {
    label: "用户运营",
    items: [
      { label: "用户管理", href: "/admin/users", icon: Users },
      { label: "运营员管理", href: "/admin/operators", icon: UserCog },
      { label: "平台订单", href: "/admin/orders", icon: Receipt },
      { label: "通知管理", href: "/admin/notifications", icon: Bell },
    ],
  },
  {
    label: "内容审核",
    items: [
      { label: "剧本审核", href: "/admin/playbook-review", icon: FileCheck },
      { label: "任务审核", href: "/admin/task-review", icon: ClipboardCheck },
      { label: "任务模板", href: "/admin/task-templates", icon: FileText },
    ],
  },
  {
    label: "财务",
    items: [
      { label: "提现审核", href: "/admin/withdrawals", icon: Wallet },
      { label: "合伙人统计", href: "/admin/partner-stats", icon: PieChart },
    ],
  },
  {
    label: "AI",
    items: [
      { label: "自主学习", href: "/admin/learning", icon: GraduationCap },
    ],
  },
];
```

## 2. AdminLayout 组件

创建 `components/admin/AdminLayout.tsx`：

```tsx
"use client";

import { useAuth } from "@/lib/auth-context";
import { AdminSidebar } from "./AdminSidebar";

export function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  if (!user || (user.role !== "admin" && user.role !== "operator")) {
    return <div className="p-6 text-zinc-500">无权限访问</div>;
  }

  return (
    <div className="flex min-h-[calc(100vh-3.5rem)]">
      <AdminSidebar userRole={user.role} />
      <main className="flex-1 overflow-y-auto p-6">{children}</main>
    </div>
  );
}
```

## 3. 接入路由

在 `app/(main)/admin/layout.tsx` 中包裹 AdminLayout：

```tsx
import { AdminLayout } from "@/components/admin/AdminLayout";

export default function AdminRouteLayout({ children }: { children: React.ReactNode }) {
  return <AdminLayout>{children}</AdminLayout>;
}
```

## 4. TopNav 清理

从 TopNav.tsx 的 `navItems` 中移除整个 `管理` 分组（17 个子菜单）。
替换为一个简单的入口链接：

```ts
{ label: "管理", href: "/admin/dashboard", icon: Shield, minRole: "operator" },
```

## 5. Operator 过滤

AdminSidebar 中按 `isNavItemVisible(href, userRole)` 过滤，operator 只看到白名单页面。

## 6. 验证

// turbo
```bash
cd d:\aifenxi\frontend && npx tsc --noEmit
```

- [ ] 侧边栏分组渲染正确
- [ ] 当前页面高亮
- [ ] operator 只看到 /admin/orders
- [ ] 移动端侧边栏可折叠
- [ ] TopNav 不再有 17 项下拉
