# 实施计划：管理员角色与权限系统

## 概述

按照依赖关系顺序实施：数据库迁移 → 后端权限中间件 → 运营员管理 + 订单查询 → 前端导航重构 → 路由守卫 → 案例库更新。每个任务构建在前一步基础上，确保无孤立代码。

## 任务

- [x] 1. 数据库迁移与角色字段
  - [x] 1.1 创建 `backend/migrations/v4_role_system.sql` 迁移文件
    - 新增 `role VARCHAR(20) DEFAULT 'user'` 字段到 users 表
    - 将 `is_admin=true` 的用户迁移为 `role='admin'`
    - 添加 CHECK 约束限制 role 取值为 `admin`/`operator`/`user`
    - 添加 `idx_users_role` 索引
    - _需求: 1.1, 1.4_

  - [x] 1.2 扩展 `backend/app/core/deps.py` 中的 UserInfo 模型
    - 在 UserInfo 中新增 `role: str = "user"` 字段
    - 修改 `get_current_user` 的 SQL 查询，增加 `u.role` 字段
    - 构造 UserInfo 时填充 `role` 值
    - _需求: 1.1, 1.2_

  - [x] 1.3 修改 `backend/app/api/auth.py` 登录查询
    - login 端点的 SQL 查询增加 `role` 字段读取
    - `/api/auth/me` 响应自动包含 role（UserInfo 已扩展）
    - _需求: 1.2, 1.3_

  - [ ]* 1.4 编写角色迁移数据一致性测试
    - **属性 P8: 角色迁移数据一致性**
    - 验证迁移后 `is_admin=true` 的用户 `role='admin'`，无 `is_admin=true` 且 `role!='admin'` 的记录
    - **验证: 需求 1.1, 1.4**

- [x] 2. 后端角色权限中间件
  - [x] 2.1 在 `backend/app/core/deps.py` 中实现角色权限依赖注入
    - 实现 `require_role(allowed_roles: list[str])` 通用角色校验函数
    - 重构 `require_admin` 内部委托 `require_role(["admin"])`
    - 新增 `require_operator_or_admin` 依赖，允许 admin 和 operator 角色
    - 角色不在允许列表中时返回 HTTP 403 "权限不足"
    - _需求: 3.1, 3.2, 3.3, 3.4_

  - [ ]* 2.2 编写角色权限层级属性测试
    - **属性 P1: 角色权限层级不变量**
    - 验证 `require_role(["admin"])` 仅允许 admin；`require_role(["admin","operator"])` 仅允许 admin 和 operator；角色不在列表中返回 403
    - **验证: 需求 3.1, 3.2, 3.4**

- [x] 3. 检查点 — 确保基础权限层通过
  - 确保所有测试通过，如有问题请询问用户。

- [x] 4. 运营员管理功能（后端）
  - [x] 4.1 创建 `backend/app/services/operator_service.py` 业务逻辑
    - 实现 `create_operator(email, password)` — 创建 role=operator 的用户，邮箱重复返回 409
    - 实现 `list_operators()` — 查询所有 role=operator 的用户列表
    - 实现 `activate_operator(id)` / `deactivate_operator(id)` — 设置 is_active
    - 密码使用 `hash_password` 加密存储
    - _需求: 4.1, 4.2, 4.3, 4.4, 4.5_

  - [x] 4.2 创建 `backend/app/api/operators.py` API 路由
    - `GET /api/operators` — 获取运营员列表，权限 require_admin
    - `POST /api/operators` — 创建运营员，权限 require_admin，请求体 CreateOperatorRequest(email, password)
    - `PUT /api/operators/{id}/activate` — 启用运营员，权限 require_admin
    - `PUT /api/operators/{id}/deactivate` — 停用运营员，权限 require_admin
    - 定义 CreateOperatorRequest、OperatorInfo 响应模型
    - _需求: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6_

  - [x] 4.3 在 `backend/main.py` 中注册 operators 路由
    - 导入并 include_router operators_router
    - _需求: 4.6_

  - [ ]* 4.4 编写运营员创建幂等性测试
    - **属性 P6: 运营员创建幂等性**
    - 验证相同邮箱第一次创建返回 201，重复创建返回 409，数据库无重复记录
    - **验证: 需求 4.1, 4.2**

- [x] 5. 平台订单查询功能（后端）
  - [x] 5.1 创建 `backend/app/services/order_query_service.py` 业务逻辑
    - 实现 `query_orders(search, status, plan, page, page_size)` 分页查询
    - SQL JOIN users 获取 user_email，按 created_at DESC 排序
    - 搜索使用 ILIKE 模糊匹配邮箱和 payment_id
    - 返回 items + total 用于分页
    - _需求: 5.1, 5.2, 5.3, 5.4, 5.6_

  - [x] 5.2 创建 `backend/app/api/admin_orders.py` API 路由
    - `GET /api/admin/orders` — 分页查询全平台订单，权限 require_operator_or_admin
    - 查询参数：search、status、plan、page、page_size
    - 定义 OrderQueryParams、AdminOrderInfo、AdminOrderListResponse 模型
    - _需求: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6_

  - [x] 5.3 在 `backend/main.py` 中注册 admin_orders 路由
    - 导入并 include_router admin_orders_router
    - _需求: 5.5_

  - [ ]* 5.4 编写订单查询分页属性测试
    - **属性 P5: 订单查询分页不变量**
    - 验证 `items.length <= page_size`，total 等于满足条件的订单总数，结果按 created_at DESC 排序
    - **验证: 需求 5.4, 5.6**

- [x] 6. 检查点 — 确保后端 API 全部通过
  - 确保所有测试通过，如有问题请询问用户。

- [x] 7. 前端类型扩展与 API 封装
  - [x] 7.1 扩展 `frontend/lib/api/auth.ts` 中的 UserInfo 类型
    - 新增 `role: "admin" | "operator" | "user"` 字段
    - _需求: 1.2_

  - [x] 7.2 创建 `frontend/lib/api/operators.ts` API 封装
    - 封装 getOperators、createOperator、activateOperator、deactivateOperator 函数
    - _需求: 4.3, 4.4, 4.5_

  - [x] 7.3 创建 `frontend/lib/api/admin-orders.ts` API 封装
    - 封装 getAdminOrders 函数，支持 search、status、plan、page、page_size 参数
    - 定义 AdminOrderInfo、AdminOrderListResponse 类型
    - _需求: 5.1, 5.2, 5.3, 5.4_

- [x] 8. 前端导航重构：TopNav 组件
  - [x] 8.1 创建 `frontend/components/layout/TopNav.tsx` 顶部导航栏组件
    - 合并原 Sidebar 导航菜单和原 TopBar 状态栏功能
    - 实现 navItems 配置，每个菜单项包含 minRole 属性
    - 实现 ROLE_LEVEL 映射和 visibleItems 过滤逻辑
    - 水平排列菜单项，右侧保留系统状态、时间、通知铃铛、用户头像下拉
    - 暗色主题 bg-[#0A0F1B]，激活项 text-[#2A6DFF]，底部边框 border-white/[0.08]
    - 使用 Framer Motion 实现 hover 动画和下拉菜单过渡
    - _需求: 2.1, 2.2, 2.3, 2.4, 2.5_

  - [x] 8.2 修改 `frontend/app/(main)/layout.tsx` 替换 Sidebar
    - 移除 Sidebar 引用，替换为 TopNav
    - 移除 pl-16 左边距，改为纯顶部导航的 flex-col 布局
    - _需求: 2.1_

  - [ ]* 8.3 编写 TopNav 菜单可见性属性测试
    - **属性 P2: admin 菜单集合完整性** — admin 角色可见全部菜单项
    - **属性 P3: 角色菜单单调递增** — visibleItems(user) ⊂ visibleItems(operator) ⊂ visibleItems(admin)
    - **验证: 需求 2.1, 2.2, 2.3, 2.4**

- [x] 9. 前端页面实现
  - [x] 9.1 创建 `frontend/app/(main)/admin/operators/page.tsx` 运营员管理页面
    - 运营员列表展示（邮箱、创建时间、账户状态）
    - 创建运营员表单（邮箱 + 初始密码）
    - 启用/停用运营员按钮
    - 使用 glass-card 样式和暗色主题
    - _需求: 4.1, 4.3, 4.4, 4.5_

  - [x] 9.2 创建 `frontend/app/(main)/admin/orders/page.tsx` 平台订单页面
    - 订单列表展示（订单ID、用户邮箱、套餐类型、金额、支付网络、状态、创建时间）
    - 搜索框（邮箱/订单ID 模糊搜索）
    - 筛选条件（状态、套餐类型下拉）
    - 分页组件（默认20条，支持10/20/50切换）
    - 按创建时间倒序排列
    - _需求: 5.1, 5.2, 5.3, 5.4, 5.6_

- [x] 10. 前端路由权限守卫
  - [x] 10.1 增强 `frontend/components/layout/AuthGuard.tsx` 角色路由守卫
    - 定义 ROUTE_PERMISSIONS 映射表（/settings/configs → admin, /admin/operators → admin, /admin/orders → admin+operator）
    - 在 useEffect 中检查当前路径是否需要角色校验
    - 角色不匹配时重定向到 /dashboard
    - 未登录用户重定向到 /login（保持现有逻辑）
    - _需求: 6.1, 6.2, 6.3, 6.4_

  - [ ]* 10.2 编写路由守卫与菜单一致性测试
    - **属性 P4: 路由守卫与菜单一致性**
    - 验证菜单不可见的路径对应角色访问时被重定向
    - **验证: 需求 6.1, 6.2, 6.3**

- [x] 11. 检查点 — 确保前端功能完整
  - 确保所有测试通过，如有问题请询问用户。

- [x] 12. 历史案例库更新
  - [x] 12.1 创建 `backend/migrations/seed_cases_2025.sql` 种子数据
    - 为 cases 表添加唯一约束 `uq_cases_name_date_symbol (case_name, date, symbol)`
    - 新增 6+ 条 2025-2026 年案例，覆盖 BTC 和 ETH
    - 覆盖操盘模式：假突破诱多、恐慌洗盘、主升浪启动、顶部派发
    - 每条案例包含完整 similarity_features JSON 和合理的 max_gain_pct / max_loss_pct
    - 使用 `INSERT ... ON CONFLICT DO NOTHING` 确保幂等性
    - _需求: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6_

  - [ ]* 12.2 编写案例种子数据幂等性测试
    - **属性 P7: 案例种子数据幂等性**
    - 验证重复执行不产生重复数据，执行后案例总数 = 原有案例数 + 新增不重复案例数
    - **验证: 需求 7.6**

- [x] 13. 最终检查点 — 全部功能验证
  - 确保所有测试通过，如有问题请询问用户。

## 备注

- 标记 `*` 的任务为可选测试任务，可跳过以加速 MVP
- 每个任务引用具体需求编号，确保可追溯性
- 检查点确保增量验证，避免问题累积
- 属性测试验证设计文档中的正确性属性（P1-P8）
- 后端遵循分层架构：路由层只做参数校验，业务逻辑在 Service 层
