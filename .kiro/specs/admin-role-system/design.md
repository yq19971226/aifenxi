# 设计文档：管理员角色与权限系统

## 概述

本设计文档描述管理员角色与权限系统的技术实现方案。系统将从当前的 `is_admin` 布尔字段升级为三级角色模型（admin/operator/user），前端从侧边栏导航改为顶部导航栏（TopNav），并实现角色驱动的菜单渲染、路由守卫、后端权限中间件、运营员管理、平台订单查询，以及历史案例库更新。

---

## 1. 数据库变更

### 1.1 用户表 role 字段迁移

新增迁移文件 `backend/migrations/v4_role_system.sql`：

```sql
-- 新增 role 字段
ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(20) DEFAULT 'user';

-- 将现有 is_admin=true 的用户迁移为 admin 角色
UPDATE users SET role = 'admin' WHERE is_admin = TRUE AND (role IS NULL OR role = 'user');

-- 添加 CHECK 约束
ALTER TABLE users ADD CONSTRAINT chk_users_role CHECK (role IN ('admin', 'operator', 'user'));

-- 添加索引
CREATE INDEX IF NOT EXISTS idx_users_role ON users (role);
```

不删除 `is_admin` 字段，保持向后兼容。后续版本可废弃。

### 1.2 涉及的表

| 表 | 变更 | 说明 |
|---|---|---|
| users | 新增 `role VARCHAR(20) DEFAULT 'user'` | 三级角色字段 |
| payments | 无变更 | 订单查询复用现有表 |
| cases | 无变更 | 新增种子数据 |

---

## 2. 后端设计

### 2.1 UserInfo 模型扩展

文件：`backend/app/core/deps.py`

```python
class UserInfo(BaseModel):
    id: str
    email: str
    membership_level: int
    is_active: bool
    is_admin: bool = False
    role: str = "user"  # 新增：admin / operator / user
```

`get_current_user` 查询 SQL 增加 `u.role` 字段，构造 UserInfo 时填充 `role`。

### 2.2 角色权限依赖注入

文件：`backend/app/core/deps.py`

```python
def require_role(allowed_roles: list[str]) -> Callable:
    """通用角色校验依赖。"""
    async def _check(user: UserInfo = Depends(get_current_user)) -> UserInfo:
        if user.role not in allowed_roles:
            raise HTTPException(status_code=403, detail="权限不足")
        return user
    return _check

async def require_admin(user: UserInfo = Depends(get_current_user)) -> UserInfo:
    """管理员校验 — 向后兼容，内部委托 require_role。"""
    checker = require_role(["admin"])
    return await checker(user)

async def require_operator_or_admin(user: UserInfo = Depends(get_current_user)) -> UserInfo:
    """运营员或管理员校验。"""
    checker = require_role(["admin", "operator"])
    return await checker(user)
```

### 2.3 运营员管理 API

新增文件：`backend/app/api/operators.py`

| 端点 | 方法 | 权限 | 说明 |
|---|---|---|---|
| `/api/operators` | GET | admin | 获取运营员列表 |
| `/api/operators` | POST | admin | 创建运营员账户 |
| `/api/operators/{id}/activate` | PUT | admin | 启用运营员 |
| `/api/operators/{id}/deactivate` | PUT | admin | 停用运营员 |

请求/响应模型：

```python
class CreateOperatorRequest(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=8)

class OperatorInfo(BaseModel):
    id: str
    email: str
    is_active: bool
    created_at: datetime
```

业务逻辑在 Service 层 `backend/app/services/operator_service.py`，路由层只做参数校验。

### 2.4 平台订单查询 API

新增文件：`backend/app/api/admin_orders.py`

| 端点 | 方法 | 权限 | 说明 |
|---|---|---|---|
| `/api/admin/orders` | GET | admin, operator | 分页查询全平台订单 |

查询参数：

```python
class OrderQueryParams(BaseModel):
    search: str | None = None        # 邮箱/订单ID模糊搜索
    status: str | None = None        # pending/confirmed/failed
    plan: int | None = None          # 1=专业 / 2=旗舰
    page: int = Field(1, ge=1)
    page_size: int = Field(20, ge=10, le=50)
```

响应模型：

```python
class AdminOrderInfo(BaseModel):
    id: str
    payment_id: str
    user_email: str
    plan: int
    amount_usd: float
    network: str | None
    status: str
    created_at: datetime

class AdminOrderListResponse(BaseModel):
    items: list[AdminOrderInfo]
    total: int
    page: int
    page_size: int
```

SQL 查询使用 JOIN users 获取 user_email，按 created_at DESC 排序，LIMIT/OFFSET 分页。搜索使用 `ILIKE` 模糊匹配。

业务逻辑在 `backend/app/services/order_query_service.py`。

### 2.5 Auth API 变更

文件：`backend/app/api/auth.py`

- `/api/auth/me` 响应已包含 UserInfo，新增 `role` 字段自动生效
- `/api/auth/login` 查询 SQL 增加 `role` 字段读取（用于 token payload 可选）
- 注册接口默认 `role='user'`，无需改动

---

## 3. 前端设计

### 3.1 UserInfo 类型扩展

文件：`frontend/lib/api/auth.ts`

```typescript
export interface UserInfo {
  id: string;
  email: string;
  membership_level: number;
  is_active: boolean;
  is_admin: boolean;
  role: "admin" | "operator" | "user";  // 新增
}
```

### 3.2 布局重构：侧边栏 → 顶部导航栏

文件：`frontend/app/(main)/layout.tsx`

将当前的 `<Sidebar />` + `<TopBar />` 左右布局改为纯顶部导航布局：

```typescript
export default function MainLayout({ children }: MainLayoutProps) {
  return (
    <AuthGuard>
      <div className="flex min-h-screen flex-col">
        <TopNav />
        <main className="flex-1">{children}</main>
      </div>
      <ChatSidebar />
    </AuthGuard>
  );
}
```

移除 `<Sidebar />` 引用和 `pl-16` 左边距。

### 3.3 TopNav 组件

新增文件：`frontend/components/layout/TopNav.tsx`

TopNav 合并原 Sidebar 的导航菜单和原 TopBar 的状态栏功能，形成完整的顶部水平导航栏。

菜单配置按角色分层：

```typescript
type UserRole = "admin" | "operator" | "user";

interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  minRole: UserRole;       // 最低可见角色
  children?: SubNavItem[];
}

const ROLE_LEVEL: Record<UserRole, number> = {
  user: 0,
  operator: 1,
  admin: 2,
};

const navItems: NavItem[] = [
  { label: "仪表盘", href: "/dashboard", icon: LayoutDashboard, minRole: "user" },
  { label: "链上监控", href: "/onchain", icon: LinkIcon, minRole: "user" },
  { label: "共识详情", href: "/consensus", icon: Brain, minRole: "user" },
  { label: "历史案例", href: "/cases", icon: History, minRole: "user" },
  { label: "预警管理", href: "/alerts", icon: Bell, minRole: "user" },
  { label: "绩效看板", href: "/performance", icon: TrendingUp, minRole: "user" },
  { label: "关联分析", href: "/correlation", icon: GitBranch, minRole: "user" },
  { label: "平台订单", href: "/admin/orders", icon: Receipt, minRole: "operator" },
  {
    label: "设置",
    href: "/settings",
    icon: Settings,
    minRole: "user",
    children: [
      { label: "会员中心", href: "/settings/membership" },
      { label: "推送设置", href: "/settings/push" },
    ],
  },
  { label: "配置管理", href: "/settings/configs", icon: Sliders, minRole: "admin" },
  { label: "运营员管理", href: "/admin/operators", icon: Users, minRole: "admin" },
];
```

过滤逻辑：

```typescript
const visibleItems = navItems.filter(
  (item) => ROLE_LEVEL[user.role] >= ROLE_LEVEL[item.minRole]
);
```

admin 角色 `ROLE_LEVEL = 2`，所有菜单项的 `minRole` 对应的 level 都 ≤ 2，因此 admin 可见全部菜单（仪表盘、链上监控、共识详情、历史案例、预警管理、绩效看板、关联分析、平台订单、设置、配置管理、运营员管理）。

布局：水平排列菜单项，右侧保留系统状态、时间、通知铃铛、用户头像下拉菜单。使用 Framer Motion 实现 hover 动画和下拉菜单过渡。暗色主题 `bg-[#0A0F1B]`，激活项 `text-[#2A6DFF]`，底部边框 `border-white/[0.08]`。

### 3.4 路由权限守卫增强

文件：`frontend/components/layout/AuthGuard.tsx`

扩展 AuthGuard 增加角色路由守卫：

```typescript
const ROUTE_PERMISSIONS: Record<string, UserRole[]> = {
  "/settings/configs": ["admin"],
  "/admin/operators": ["admin"],
  "/admin/orders": ["admin", "operator"],
};

// 在 useEffect 中检查
const allowedRoles = Object.entries(ROUTE_PERMISSIONS).find(
  ([path]) => pathname.startsWith(path)
)?.[1];

if (allowedRoles && !allowedRoles.includes(user.role)) {
  router.push("/dashboard");
}
```

### 3.5 新增前端页面

| 页面 | 路径 | 权限 | 说明 |
|---|---|---|---|
| 运营员管理 | `frontend/app/(main)/admin/operators/page.tsx` | admin | 运营员列表、创建、启停用 |
| 平台订单 | `frontend/app/(main)/admin/orders/page.tsx` | admin, operator | 订单列表、搜索、筛选、分页 |

### 3.6 新增前端 API 封装

| 文件 | 说明 |
|---|---|
| `frontend/lib/api/operators.ts` | 运营员管理 API 调用 |
| `frontend/lib/api/admin-orders.ts` | 平台订单查询 API 调用 |

---

## 4. 历史案例库更新

文件：`backend/migrations/seed_cases_2025.sql`

新增 6+ 条 2025-2026 年案例，使用 `INSERT ... ON CONFLICT DO NOTHING`。需要先为 cases 表添加唯一约束：

```sql
-- 添加唯一约束（case_name + date + symbol）
ALTER TABLE cases ADD CONSTRAINT uq_cases_name_date_symbol
    UNIQUE (case_name, date, symbol);
```

案例覆盖：
- BTC 假突破诱多（2025）
- ETH 恐慌洗盘（2025）
- BTC 主升浪启动（2025）
- ETH 顶部派发（2025）
- BTC 恐慌洗盘（2026）
- ETH 主升浪启动（2026）

每条案例包含完整的 `similarity_features` JSON 和合理的 `max_gain_pct` / `max_loss_pct`。

---

## 5. 文件变更清单

### 新增文件

| 文件 | 说明 |
|---|---|
| `backend/migrations/v4_role_system.sql` | role 字段迁移 |
| `backend/migrations/seed_cases_2025.sql` | 2025-2026 案例种子数据 |
| `backend/app/api/operators.py` | 运营员管理 API 路由 |
| `backend/app/api/admin_orders.py` | 平台订单查询 API 路由 |
| `backend/app/services/operator_service.py` | 运营员管理业务逻辑 |
| `backend/app/services/order_query_service.py` | 订单查询业务逻辑 |
| `frontend/components/layout/TopNav.tsx` | 顶部导航栏组件 |
| `frontend/app/(main)/admin/operators/page.tsx` | 运营员管理页面 |
| `frontend/app/(main)/admin/orders/page.tsx` | 平台订单页面 |
| `frontend/lib/api/operators.ts` | 运营员 API 封装 |
| `frontend/lib/api/admin-orders.ts` | 订单查询 API 封装 |

### 修改文件

| 文件 | 变更 |
|---|---|
| `backend/app/core/deps.py` | UserInfo 增加 role 字段；新增 require_role、require_operator_or_admin；重构 require_admin |
| `backend/app/api/auth.py` | login 查询增加 role 字段 |
| `backend/main.py` | 注册 operators、admin_orders 路由 |
| `frontend/lib/api/auth.ts` | UserInfo 增加 role 字段 |
| `frontend/app/(main)/layout.tsx` | 移除 Sidebar，使用 TopNav，移除 pl-16 |
| `frontend/components/layout/AuthGuard.tsx` | 增加角色路由守卫 |

### 可删除文件（可选）

| 文件 | 说明 |
|---|---|
| `frontend/components/layout/Sidebar.tsx` | 被 TopNav 替代 |

---

## 6. 正确性属性

### P1: 角色权限层级不变量
对于任意用户，`require_role(["admin"])` 仅允许 admin 通过；`require_role(["admin", "operator"])` 仅允许 admin 和 operator 通过；`require_role(["user", "operator", "admin"])` 允许所有角色通过。角色不在允许列表中时必须返回 HTTP 403。

### P2: admin 菜单集合完整性
admin 角色的可见菜单集合 = 全部菜单项集合。即 `visibleItems(admin).length === navItems.length`。admin 可以访问系统中所有用户功能、运营员功能和管理员专属功能。

### P3: 角色菜单单调递增
对于角色层级 user < operator < admin，高层级角色的可见菜单集合是低层级角色可见菜单集合的超集：`visibleItems(user) ⊂ visibleItems(operator) ⊂ visibleItems(admin)`。

### P4: 路由守卫与菜单一致性
对于任意路由路径，如果该路径对应的菜单项对某角色不可见，则该角色通过 URL 直接访问该路径时必须被重定向到仪表盘。菜单可见性与路由访问权限保持一致。

### P5: 订单查询分页不变量
对于任意分页查询，返回的 `items.length <= page_size`，且 `total` 等于满足筛选条件的订单总数。当 `page * page_size > total` 时，返回空列表。结果按 `created_at DESC` 排序。

### P6: 运营员创建幂等性
对于相同邮箱的重复创建请求，第一次返回 201，后续返回 409。数据库中不会出现重复邮箱的运营员记录。

### P7: 案例种子数据幂等性
`seed_cases_2025.sql` 使用 `INSERT ... ON CONFLICT DO NOTHING`，重复执行不会产生重复数据。执行后案例总数 = 原有案例数 + 新增不重复案例数。

### P8: 角色迁移数据一致性
迁移执行后，所有 `is_admin=true` 的用户 `role='admin'`，所有 `is_admin=false`（或 NULL）且无 role 的用户 `role='user'`。不存在 `is_admin=true` 且 `role!='admin'` 的记录。

---

## 7. 依赖关系

```
需求1（数据库迁移） → 需求2（前端菜单）、需求3（后端中间件）
需求3（后端中间件） → 需求4（运营员管理）、需求5（订单查询）
需求2（前端菜单） → 需求6（路由守卫）
需求7（案例更新）独立，无依赖
```

实施顺序建议：需求1 → 需求3 → 需求4 + 需求5（并行）→ 需求2 → 需求6 → 需求7
