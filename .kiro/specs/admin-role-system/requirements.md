# 需求文档：管理员角色与权限系统

## 简介

为 OmniMind 庄家视角多智能体分析系统引入完整的角色权限体系。当前系统仅区分管理员（is_admin）和普通用户，本功能将新增"运营员"角色，实现三级角色权限：管理员 > 运营员 > 普通用户。顶部导航栏菜单根据角色动态渲染，管理员可管理运营员账户，运营员和管理员可查询平台全部支付订单。同时更新历史案例库，补充 2025-2026 年最新加密货币庄家操盘案例。

## 术语表

- **System**：OmniMind 系统整体
- **TopNav**：前端顶部水平导航栏组件，根据用户角色动态渲染菜单项
- **Role**：用户角色，取值为 `admin`（管理员）、`operator`（运营员）、`user`（普通用户）
- **Admin**：管理员角色，拥有系统全部功能权限
- **Operator**：运营员角色，拥有普通用户功能 + 平台订单查询权限
- **User**：普通用户角色，拥有基础分析功能权限
- **Order_Query_Page**：平台订单查询页面，展示所有用户的支付订单
- **Operator_Management_Page**：运营员管理页面，管理员用于新增和管理运营员账户
- **Auth_API**：后端认证与授权 API
- **Case_Seed_Data**：历史案例库种子数据（seed_cases.sql）

## 需求

### 需求 1：用户角色模型扩展

**用户故事：** 作为系统管理员，我希望系统支持管理员、运营员、普通用户三种角色，以便对不同人员分配不同的功能权限。

#### 验收标准

1. THE System SHALL 在用户表中使用 `role` 字段（VARCHAR(20)）存储用户角色，取值为 `admin`、`operator`、`user`，默认值为 `user`
2. THE Auth_API SHALL 在用户信息响应中包含 `role` 字段，返回当前用户的角色值
3. WHEN 用户登录成功后，THE Auth_API SHALL 在 `/api/auth/me` 响应中返回该用户的 `role` 字段
4. THE System SHALL 保持与现有 `is_admin` 字段的向后兼容，通过数据迁移将 `is_admin=true` 的用户 `role` 设为 `admin`

### 需求 2：顶部导航栏角色菜单动态渲染

**用户故事：** 作为用户，我希望顶部导航栏只显示我有权限访问的菜单项，以便获得清晰的导航体验。

#### 验收标准

1. WHILE 当前用户角色为 `user` 时，THE TopNav SHALL 显示以下菜单项：仪表盘、链上监控、共识详情、历史案例、预警管理、绩效看板、关联分析、设置（会员中心、推送设置）
2. WHILE 当前用户角色为 `user` 时，THE TopNav SHALL 隐藏配置管理、运营员管理、平台订单菜单项
3. WHILE 当前用户角色为 `operator` 时，THE TopNav SHALL 显示普通用户的全部菜单项，并额外显示"平台订单"菜单项
4. WHILE 当前用户角色为 `admin` 时，THE TopNav SHALL 显示全部菜单项，包括所有用户菜单（仪表盘、链上监控、共识详情、历史案例、预警管理、绩效看板、关联分析、设置）+ 所有运营员菜单（平台订单）+ 所有管理员专属菜单（配置管理、运营员管理），管理员可使用系统全部功能
5. WHEN 用户登录后角色信息加载完成，THE TopNav SHALL 在 500ms 内完成菜单渲染

### 需求 3：后端角色权限中间件

**用户故事：** 作为开发者，我希望有统一的角色权限校验机制，以便在 API 路由层安全地控制访问。

#### 验收标准

1. THE Auth_API SHALL 提供 `require_role` 依赖注入函数，接受允许的角色列表参数，校验当前用户角色是否在允许列表中
2. WHEN 用户角色不在允许列表中时，THE Auth_API SHALL 返回 HTTP 403 状态码和错误信息"权限不足"
3. THE Auth_API SHALL 保留现有的 `require_admin` 依赖注入函数，使其内部调用 `require_role(["admin"])` 以保持向后兼容
4. THE Auth_API SHALL 提供 `require_operator_or_admin` 依赖注入函数，允许 `admin` 和 `operator` 角色访问

### 需求 4：运营员账户管理

**用户故事：** 作为管理员，我希望能新增和管理运营员账户，以便分配订单查询等运营职责。

#### 验收标准

1. WHEN 管理员提交创建运营员请求（包含邮箱和初始密码），THE System SHALL 创建一个 `role=operator` 的新用户账户
2. WHEN 管理员提交的运营员邮箱已存在，THE System SHALL 返回 HTTP 409 状态码和错误信息"该邮箱已注册"
3. THE Operator_Management_Page SHALL 展示所有运营员账户列表，包含邮箱、创建时间、账户状态
4. WHEN 管理员点击停用运营员按钮，THE System SHALL 将该运营员的 `is_active` 设为 `false`
5. WHEN 管理员点击启用运营员按钮，THE System SHALL 将该运营员的 `is_active` 设为 `true`
6. THE System SHALL 仅允许 `admin` 角色访问运营员管理相关 API，其他角色访问时返回 HTTP 403

### 需求 5：平台订单查询

**用户故事：** 作为运营员或管理员，我希望能查询平台所有用户的支付订单，以便进行运营管理和对账。

#### 验收标准

1. THE Order_Query_Page SHALL 展示平台所有支付订单列表，包含订单ID、用户邮箱、套餐类型、金额、支付网络、状态、创建时间
2. WHEN 运营员或管理员输入搜索关键词，THE Order_Query_Page SHALL 支持按用户邮箱和订单ID进行模糊搜索
3. WHEN 运营员或管理员选择筛选条件，THE Order_Query_Page SHALL 支持按订单状态（pending/confirmed/failed）和套餐类型（1=专业/2=旗舰）筛选
4. THE Order_Query_Page SHALL 支持分页展示，每页默认 20 条，支持切换每页条数（10/20/50）
5. THE System SHALL 仅允许 `admin` 和 `operator` 角色访问平台订单查询 API，普通用户访问时返回 HTTP 403
6. THE Order_Query_Page SHALL 按创建时间倒序排列订单


### 需求 6：前端路由权限守卫

**用户故事：** 作为用户，我希望在直接访问无权限页面的 URL 时被正确拦截，以防止越权访问。

#### 验收标准

1. WHEN 普通用户通过 URL 直接访问管理员专属页面（配置管理、运营员管理），THE System SHALL 重定向到仪表盘页面
2. WHEN 普通用户通过 URL 直接访问运营员专属页面（平台订单），THE System SHALL 重定向到仪表盘页面
3. WHEN 运营员通过 URL 直接访问管理员专属页面（配置管理、运营员管理），THE System SHALL 重定向到仪表盘页面
4. WHEN 未登录用户访问任何受保护页面，THE System SHALL 重定向到登录页面

### 需求 7：历史案例库更新（2025-2026）

**用户故事：** 作为交易者，我希望历史案例库包含最新的 2025-2026 年庄家操盘案例，以便参考最新的市场模式进行分析。

#### 验收标准

1. THE Case_Seed_Data SHALL 新增至少 6 条 2025-2026 年的加密货币庄家操盘案例
2. THE Case_Seed_Data SHALL 覆盖以下操盘模式：假突破诱多、恐慌洗盘、主升浪启动、顶部派发
3. THE Case_Seed_Data SHALL 覆盖 BTC 和 ETH 两种主要币种
4. THE Case_Seed_Data 中每条案例 SHALL 包含完整的 similarity_features JSON 字段（exchange_netflow、whale_change、fear_greed、mvrv、rsi、price_change_pct）
5. THE Case_Seed_Data 中每条案例 SHALL 包含合理的 max_gain_pct 和 max_loss_pct 数值
6. THE Case_Seed_Data SHALL 使用 INSERT ... ON CONFLICT DO NOTHING 语法，确保重复执行不会产生重复数据
