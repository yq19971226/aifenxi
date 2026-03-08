# OmniMind 前端代码组织指南

> Next.js 14 App Router + TanStack Query + Tailwind CSS

---

## 1. 目录结构

```
frontend/
├── app/                          # Next.js App Router
│   ├── globals.css               # 设计系统 + 组件类
│   ├── layout.tsx                # 根 layout（字体、metadata）
│   ├── login/
│   │   └── page.tsx              # 登录页（无 AuthGuard）
│   └── (main)/                   # 需认证的路由组
│       ├── layout.tsx            # AuthGuard + Sidebar + TopNav
│       ├── dashboard/page.tsx    # 庄家看板
│       ├── consensus/page.tsx    # 多智能体共识
│       ├── admin/                # 管理后台（admin 角色）
│       │   ├── dashboard/page.tsx
│       │   ├── users/page.tsx
│       │   └── ...
│       └── settings/
│           ├── configs/page.tsx
│           └── push/page.tsx
│
├── components/
│   ├── ui/                       # ★ 共享基础组件库
│   │   ├── index.ts              # barrel export
│   │   ├── Button.tsx
│   │   ├── Card.tsx
│   │   ├── Input.tsx             # TextField / Toggle / SelectField / Slider
│   │   ├── Badge.tsx             # Badge / StatusDot
│   │   ├── DataTable.tsx         # 通用排序/分页表格
│   │   ├── ChartContainer.tsx    # 图表容器（loading/error）
│   │   ├── Toast.tsx             # ToastProvider / useToast
│   │   ├── Skeleton.tsx          # 骨架屏预设
│   │   ├── EmptyState.tsx        # 空状态占位
│   │   └── TierGate.tsx          # CoinGlass 套餐门控
│   │
│   ├── layout/                   # 布局组件
│   │   ├── Sidebar.tsx
│   │   ├── TopNav.tsx
│   │   ├── AuthGuard.tsx
│   │   └── PageTransition.tsx
│   │
│   ├── cards/                    # 业务卡片（仪表盘用）
│   │   ├── CompositeSignal.tsx
│   │   ├── DefenseAlert.tsx
│   │   ├── StrategyCard.tsx
│   │   └── ...
│   │
│   ├── charts/                   # 图表组件
│   │   ├── OnchainChart.tsx
│   │   └── ...
│   │
│   ├── admin/                    # 管理后台专用组件
│   │   ├── SystemHealthGrid.tsx
│   │   ├── AdminUserTable.tsx
│   │   └── ApiCallChart.tsx
│   │
│   └── [domain]/                 # 按业务域分组
│       ├── analysis/
│       ├── alerts/
│       ├── derivatives/
│       ├── onchain/
│       ├── performance/
│       └── playbook-sim/
│
├── lib/
│   ├── api/                      # API 调用层
│   │   ├── auth.ts               # authHeaders() + token 管理
│   │   ├── admin-dashboard.ts
│   │   ├── admin-users.ts
│   │   ├── consensus.ts
│   │   └── ...
│   │
│   ├── auth-context.tsx          # React Context: useAuth()
│   └── utils/                    # 纯函数工具
│
├── middleware.ts                  # Edge middleware（路由重定向）
├── tailwind.config.ts
├── tsconfig.json
└── next.config.js
```

---

## 2. Server Component vs Client Component

### 原则

```
默认 = Server Component（零 JS 发送到浏览器）
"use client" = 只在需要交互/状态/浏览器 API 时添加
```

### 当前项目情况

OmniMind 是一个**高度交互的 SPA**，几乎所有页面都需要：
- `useState` / `useEffect`（数据加载状态）
- `useQuery`（TanStack Query 数据获取）
- `framer-motion`（动画）
- `useAuth`（认证上下文）

因此**所有 page.tsx 都标记为 `"use client"`**，这是正确的。

### 可以改为 Server Component 的场景

| 场景 | 文件 | 说明 |
|------|------|------|
| 静态布局壳 | `app/(main)/layout.tsx` | 如果 AuthGuard 逻辑移到 middleware |
| 纯展示组件 | `EmptyState.tsx` | 无状态，但需 Lucide 图标（client bundle） |
| metadata | 各 `page.tsx` 导出 metadata | 可拆分 metadata 到 layout |

### 推荐模式

```tsx
// app/(main)/dashboard/page.tsx — Server Component 壳
import { DashboardClient } from "./DashboardClient";

export const metadata = { title: "庄家看板 | OmniMind" };

export default function DashboardPage() {
  return <DashboardClient />;
}

// app/(main)/dashboard/DashboardClient.tsx — Client Component
"use client";
export function DashboardClient() {
  // 所有交互逻辑
}
```

这样 metadata 在服务端处理，交互逻辑在客户端。

---

## 3. 数据获取（TanStack Query 集成）

### 当前模式

项目中混用两种数据获取方式：

| 方式 | 使用场景 | 示例 |
|------|----------|------|
| `useQuery` | 只读数据轮询 | CompositeSignal, DefenseAlert |
| `useState + useEffect + fetch` | 管理后台 CRUD | admin/users, admin/orders |

### 推荐统一为 TanStack Query

```tsx
// ✅ 推荐：用 useQuery 替代手动 useState+useEffect
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

function AdminUsersPage() {
  const queryClient = useQueryClient();

  // 查询
  const { data, isLoading, error } = useQuery({
    queryKey: ["admin", "users", { search, page }],
    queryFn: () => getUsers({ search, page, page_size: 20 }),
  });

  // 变更
  const toggleMutation = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      toggleUserActive(id, active),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
    },
  });

  return (
    // ...
  );
}
```

### Query Key 命名规范

```
["admin", "users"]                    # 用户列表
["admin", "users", { search, page }]  # 带筛选
["admin", "dashboard"]                # 管理概览
["consensus", "latest", symbol]       # 共识报告
["defense", "alert-level", symbol]    # 防御预警
["onchain", symbol]                   # 链上数据
```

### Stale / Refetch 策略

```tsx
// 实时数据 — 30 秒刷新
{ staleTime: 30_000, refetchInterval: 30_000 }

// 准实时 — 1 分钟
{ staleTime: 60_000 }

// 配置类 — 5 分钟缓存
{ staleTime: 5 * 60_000 }

// 静态数据 — 不过期
{ staleTime: Infinity }
```

---

## 4. 路由鉴权

### 双层防护架构

```
┌─────────────────────────────────────────────┐
│ Layer 1: middleware.ts (Edge Runtime)        │
│   - 未认证 → /login 重定向                    │
│   - 路径匹配规则                              │
│   - 运行在 CDN 边缘，延迟最低                  │
└────────────────────┬────────────────────────┘
                     │
┌────────────────────▼────────────────────────┐
│ Layer 2: AuthGuard (Client Component)       │
│   - useAuth() 检查用户状态                    │
│   - ROUTE_PERMISSIONS 角色权限映射             │
│   - 权限不足 → /dashboard 重定向              │
│   - 加载中 → 品牌 shimmer 动画                │
└─────────────────────────────────────────────┘
```

### middleware.ts — 当前实现

```ts
// 仅处理根路径重定向，其余交给 AuthGuard
if (pathname === "/") {
  redirect("/login");
}
```

### 增强建议：Token 级 Middleware 鉴权

```ts
// middleware.ts — 增强版
export function middleware(request: NextRequest) {
  const token = request.cookies.get("token")?.value;
  const { pathname } = request.nextUrl;

  // 公开路由
  if (pathname === "/login") {
    if (token) return NextResponse.redirect(new URL("/dashboard", request.url));
    return NextResponse.next();
  }

  // 需认证路由
  if (!token) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return NextResponse.next();
}
```

### ROUTE_PERMISSIONS 映射

```ts
// AuthGuard.tsx — 角色权限表
export const ROUTE_PERMISSIONS: Record<string, UserRole[]> = {
  "/settings/configs": ["admin"],
  "/admin/operators":  ["admin"],
  "/admin/users":      ["admin"],
  "/admin/dashboard":  ["admin"],
  "/admin/orders":     ["admin", "operator"],
  "/admin/datasources": ["admin"],
  // ...
};
```

---

## 5. 组件编写规范

### 文件结构模板

```tsx
"use client";

import { ... } from "react";
import { ... } from "lucide-react";

/* ── Types ── */

export interface MyComponentProps {
  // ...
}

/* ── Constants ── */

const SOME_MAP: Record<string, string> = { ... };

/* ── Helpers ── */

function formatDate(iso: string): string { ... }

/* ── Component ── */

export function MyComponent({ ... }: MyComponentProps) {
  return ( ... );
}
```

### 命名规范

| 类型 | 规范 | 示例 |
|------|------|------|
| 组件文件 | PascalCase | `AdminUserTable.tsx` |
| API 文件 | kebab-case | `admin-users.ts` |
| Hook | use 前缀 | `useToast()` |
| 常量 | UPPER_SNAKE | `LEVEL_LABEL` |
| CSS 类 | 设计系统类优先 | `.card` > 内联 Tailwind |
| 颜色 | CSS 变量 | `var(--color-bull)` > `#10b981` |

### 设计系统类使用优先级

```
1. 设计系统类   .card / .badge / .btn-primary / .input
2. Tailwind     text-zinc-400 / bg-white/[0.04]
3. 内联 style   仅用于动态值（宽度百分比等）
```

---

## 6. 性能最佳实践

### 已实施

- [x] `"use client"` 最小化（仅交互组件）
- [x] Skeleton 占位防 CLS
- [x] CSS 变量设计系统（零运行时开销）
- [x] First Load JS < 200KB（87.1KB shared）
- [x] Image 无大尺寸（纯数据应用）

### 建议实施

```tsx
// 1. 动态导入重组件
const LiquidationHeatmap = dynamic(
  () => import("@/components/charts/LiquidationHeatmap"),
  { loading: () => <SkeletonChart height="20rem" /> }
);

// 2. 防抖搜索
const debouncedSearch = useDeferredValue(search);

// 3. 虚拟滚动（大列表）
// 当列表 > 100 项时，使用 @tanstack/react-virtual

// 4. React.memo 优化纯展示组件
export const StatCard = memo(function StatCard(props: StatCardProps) {
  // ...
});
```

---

## 7. 错误边界

### 推荐方案

```tsx
// components/layout/ModuleErrorBoundary.tsx
"use client";

import { Component, type ReactNode } from "react";

interface Props { children: ReactNode; name?: string; }
interface State { hasError: boolean; error?: Error; }

export class ModuleErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="card p-6 text-center">
          <p className="text-[13px] text-red-400">
            {this.props.name || "模块"}加载异常
          </p>
          <p className="text-[11px] text-zinc-600 mt-1">
            {this.state.error?.message}
          </p>
        </div>
      );
    }
    return this.props.children;
  }
}

// 使用
<ModuleErrorBoundary name="共识信号">
  <CompositeSignal symbol={symbol} />
</ModuleErrorBoundary>
```

每个独立卡片/模块用 ErrorBoundary 包裹，避免单模块崩溃影响整页。
