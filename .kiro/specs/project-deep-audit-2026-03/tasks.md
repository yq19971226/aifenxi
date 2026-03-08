# Tasks — 项目深度审查整改路线图

## Execution Order

1. P1.1 前端权限
2. P1.2 币种真相源
3. P1.3 Redis key protocol
4. P1.4 Redis capability closure
5. P2.1 ORM 漂移
6. P2.2 事务边界
7. P2.3 管理员脚本
8. P2.4 根路径跳转
9. P3 回归与文档同步

---

## Phase P1: 先修复真实断点层

### Task P1.1: 收口前端后台权限
- **Owner**: Frontend
- **Effort**: M
- **Blocker**: 已冻结：`/admin/*` 默认 admin-only，当前唯一放宽白名单为 `/admin/orders`
- [ ] 以 `/admin` 建立默认 admin-only 守卫
- [ ] 为当前唯一例外 `/admin/orders` 单独声明 `operator` 权限
- [ ] 让 `TopNav` 与 `AuthGuard` 共用同一份权限表
- [ ] 验证所有后台页对普通用户前端不可达
- **Exit Criteria**:
  - `AuthGuard` 与 `TopNav` 共用同一权限真相源
  - 除 `/admin/orders` 外，`operator` 访问其余后台页均被前端拒绝

### Task P1.2: 统一币种真相源
- **Owner**: Backend
- **Effort**: M
- **Blocker**: 需要确认调度器与连接器的热刷新策略
- [ ] 盘点所有读取 `DEFAULT_SYMBOLS` 的采集器、连接器、服务
- [ ] 改为统一读取 `symbol_registry` 启用币种快照
- [ ] 将 `DEFAULT_SYMBOLS` 降级为数据库不可用时的回退
- [ ] 清理静态币种映射与实际产品配置的漂移
- **Exit Criteria**:
  - 主链路在注册表可用时不再继续读取 `DEFAULT_SYMBOLS`
  - 后台币种启停能同步影响采集、分析、展示链路

### Task P1.3: 收口 Redis key protocol
- **Owner**: Backend
- **Effort**: M
- **Blocker**: 需要先定义 canonical key 清单
- [ ] 建立 CoinGlass / 情绪扩展指标 canonical key 清单
- [ ] 合并 `cg_net_position` / `cg_net_pos` 为单一命名
- **Exit Criteria**:
  - canonical key 清单定稿并同步到 spec / docs
  - 代码中不再同时存在 `cg_net_position` 与 `cg_net_pos` 双读路径

### Task P1.4: 补齐 Redis capability closure
- **Owner**: Backend
- **Effort**: M
- **Blocker**: 需要确认哪些能力是未接入，哪些能力只是套餐受限
- [ ] 为所有被读取 key 补齐写入端或显式禁用
- [ ] 为 `sentiment:kol`、`sentiment:mentions` 标记能力状态或补数据源接入
- [ ] 为 UI / API / Agent 统一 unavailable / disabled / tier-limited 语义
- **Exit Criteria**:
  - Appendix B 中被消费的 key 均已具备 writer、显式 unavailable，或被正式禁用
  - UI / API / Agent 对 unavailable / disabled / tier-limited 使用统一协议

---

## Phase P2: 清理高风险技术债

### Task P2.1: 修正 ORM 模型漂移
- **Owner**: Backend
- **Effort**: M
- **Blocker**: 已冻结：ORM 作为 `schema / toolchain truth`，允许保留 raw SQL 热路径
- [ ] 按当前真实 schema 校正 `User`、`Payment` 等模型字段
- [ ] 明确 `role`、`duration_months` 等已落库字段的 ORM 映射
- [ ] 审视 PostgreSQL 方言类型在兼容目标下的替代方案
- [ ] 确保 ORM 文件重新成为 schema 真相而不是历史残影
- **Exit Criteria**:
  - `User`、`Payment` 等核心模型字段与真实 schema 对齐
  - `role`、`duration_months` 等已落库字段在 ORM 中可见
  - `app/models/db.py` 可重新支撑迁移、校验或工具链使用

### Task P2.2: 统一事务边界
- **Owner**: Backend
- **Effort**: M
- **Blocker**: 需要先定义允许显式 `commit` 的例外白名单
- [ ] 约定默认由请求层还是服务层提交事务
- [ ] 盘点 service 内 `commit` 的真实必要性
- [ ] 对必须提前提交的场景补充边界说明
- [ ] 避免跨步骤部分提交造成状态撕裂
- **Exit Criteria**:
  - 事务提交责任形成单一约定
  - service 内显式 `commit` 已收敛到白名单
  - 跨步骤写入不再依赖隐式部分提交

### Task P2.3: 清理管理员脚本残留
- **Owner**: Backend / Ops
- **Effort**: S
- **Blocker**: 需要确认是否仍有本地初始化流程依赖旧脚本
- [ ] 删除、移动或忽略 `backend/create_admin.py`
- [ ] 清理明文邮箱、密码、本地地址、测试数据库路径
- [ ] 将管理员初始化流程统一到环境变量驱动脚本
- **Exit Criteria**:
  - 仓库内不再保留默认可执行的明文管理员初始化脚本
  - 管理员初始化入口统一到环境变量驱动方案
  - 旧脚本若保留，必须被隔离为非生产路径并显式标记弃用

### Task P2.4: 统一根路径跳转
- **Owner**: Frontend
- **Effort**: S
- **Blocker**: 已冻结：根路径 `/` 以 `frontend/middleware.ts` 为唯一真相源，先落 `/dashboard` 再由 `AuthGuard` 分流
- [ ] 在 `middleware` 与 `next.config.js` 之间保留单一 `/` 跳转定义
- [ ] 明确未登录与已登录用户的首页落点策略
- [ ] 验证首屏无双重跳转或相互打架行为
- **Exit Criteria**:
  - `/` 只保留一个跳转定义
  - 未登录用户经 `/dashboard` 被一致分流到 `/login`
  - 首屏导航不再出现双跳转或配置打架

---

## Phase P3: 验证与文档同步

### Task P3.1: 回归验证
- **Owner**: QA / Frontend / Backend
- **Effort**: M
- **Blocker**: 依赖 P1/P2 改动全部落地
- [ ] 验证普通用户、operator、admin 三类角色的前端路由表现
- [ ] 验证后台币种变更后采集、展示、分析链路同步生效
- [ ] 验证 Redis 扩展指标不存在“只读无写”残留
- [ ] 验证 ORM、迁移、服务层字段定义一致

### Task P3.2: 文档与能力矩阵同步
- **Owner**: Product / Architecture
- **Effort**: S
- **Blocker**: 依赖 canonical key、权限表、币种真相源最终定稿
- [ ] 更新 `.kiro/specs` 中与币种数量、后台页列表、扩展数据能力相关的旧描述
- [ ] 将“已接入 / 未接入 / 需高级套餐”能力列成单独矩阵
- [ ] 为后续审查保留统一的缓存键与权限清单
