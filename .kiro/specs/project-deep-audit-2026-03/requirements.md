# Requirements Document — 项目深度审查收尾

## Introduction

本文档记录当前代码库在“基本完工”阶段的深度审查结论。

目标不是继续开发新功能，而是明确：

- 哪些历史问题本轮复核已确认闭环
- 哪些问题当前仍然存在并需要进入整改计划
- 后续整改的验收口径是什么

本 spec 仅记录**当前仍可从代码直接证实**的问题与建议，不做代码修改。

---

## Scope

本次审查覆盖：

- 后端路由、服务层、采集器、Worker、Redis 读写链路
- 前端页面、导航、`AuthGuard`、重定向与 API 代理
- 数据层一致性：`symbol_registry`、ORM 模型、事务边界、SQLite/PostgreSQL 兼容
- 关键业务：任务、合伙人、剧本、后台管理、CoinGlass 扩展能力

---

## Governance Baseline: 真相源矩阵

| Domain | Canonical Source | Must Be Consumed By | Anti-Pattern To Eliminate |
|---|---|---|---|
| 路由权限 | 统一权限注册表 | `AuthGuard`、导航过滤、权限文档 | 每个页面各写一套角色判断 |
| 运行时币种 | `symbol_registry` | 调度器、连接器、面板、分析链路 | `DEFAULT_SYMBOLS` 作为常态执行源 |
| Redis 能力协议 | 统一 canonical key 清单 | Worker、API、Service、Agent | 同能力多 key 命名 |
| 数据模型 | 实际 schema + 同步 ORM | 服务层、Alembic、工具链 | 服务 SQL 已演进，ORM 仍停留旧结构 |
| 根路径跳转 | 单一首页跳转定义 | `middleware` 或 `next.config.js` | `"/"` 存在双重重定向 |

## Approval Decisions Frozen for This Spec

- `/admin/*` 页面默认 **admin-only**；当前唯一冻结放宽白名单为 `/admin/orders`，允许 `admin` 与 `operator` 访问
- 根路径 `/` 的最终真相源冻结为 `frontend/middleware.ts`；目标行为为：进入 `/` 时统一先落到 `/dashboard`，未登录用户再由 `AuthGuard` 重定向到 `/login`
- ORM 在下一阶段的定位冻结为：**schema / toolchain truth**。服务层可继续保留 raw SQL 热路径，但 `app/models/db.py` 必须同步镜像真实表结构，不得继续漂移

## Part A: 已验证闭环项（信息记录，无整改任务）

### Requirement A1: 后端管理 API 权限链路已存在

#### Acceptance Criteria

- `tasks` 后台接口具备后端角色依赖校验
- `partner` / 提现 / 自主学习 / 剧本审核等后台接口具备 `require_admin` 或等价依赖
- 前端守卫即使存在缺口，后端 API 仍应作为最终权限边界

### Requirement A2: 认证基础链路已基本闭环

#### Acceptance Criteria

- 登录、注册、重置密码接口已接入速率限制
- 前端认证请求已具备 token 刷新与重试链路
- 会员过期检查已在鉴权链路中生效

### Requirement A3: 部分历史“断点层”已确认修复

#### Acceptance Criteria

- `news:feed:{symbol}` 存在写入端，不再属于“只读无写”
- `sentiment:fear_greed` 与 `onchain:{symbol}` 存在写入端
- K 线调度已覆盖 `5m/15m/1h/4h/1d/1w`
- `seed_admin.py` 已改为环境变量驱动，不再包含硬编码管理员凭据

---

## Part B: 当前仍需整改的问题

### Requirement B1: 前端后台页面必须完整受角色守卫覆盖

#### Acceptance Criteria

- 所有 `/admin/*` 页面必须被统一的前端角色映射覆盖
- 未在白名单中的后台页面不得默认向普通登录用户开放
- 页面级显隐和路由级拦截必须使用同一份权限真相

#### Implementation Notes

- 当前 `AuthGuard.tsx` 仅覆盖少数后台路径
- 实际存在的后台页明显更多，例如 `learning`、`models`、`monitor`、`partner-stats`、`playbook-review`、`setup`、`symbols`、`task-review`、`task-templates`、`withdrawals` 等

### Requirement B2: `symbol_registry` 必须成为币种配置的唯一真相源

#### Acceptance Criteria

- 采集调度、连接器、面板展示、币种管理必须引用同一份启用币种集合
- 新增或禁用币种后，不允许出现“后台显示已生效，但采集层仍读取硬编码默认值”
- 文档、默认常量、辅助映射中的币种数量必须一致

#### Implementation Notes

- 当前 `dashboard_overview`、`api/onchain` 会读取 `symbol_registry`
- 但 `kline_scheduler`、`binance connector` 仍直接依赖 `DEFAULT_SYMBOLS`
- `news.py` 的 `_SYMBOL_MAP` 仍保留更大的静态币种集合，存在配置漂移

### Requirement B3: Redis 扩展指标必须实现“单一命名”

#### Acceptance Criteria

- 同一类业务数据不得同时存在多个 canonical 名称
- canonical key 清单必须可供 Worker、API、Service、Agent 共用
- 旧 key 若暂时保留，必须以显式兼容/迁移策略存在，而不是隐式并存

#### Implementation Notes

- `api/coinglass.py` 读取 `cg_net_position:{symbol}`，`kill_detector.py` 读取 `cg_net_pos:{symbol}`，命名不一致

### Requirement B4: Redis 扩展指标必须实现“写入闭环或显式降级”

#### Acceptance Criteria

- 被消费的 Redis key 必须存在可搜索到的写入端，或被显式标记为 unavailable / disabled / tier-limited
- 不允许 UI、API、Agent 将“未接入能力”伪装成“正常但暂无数据”
- 新增缓存能力时，必须同时定义 writer、reader、TTL、fallback、能力状态

#### Implementation Notes

- 当前可确认存在写入端的主干 CoinGlass 键包括：`cg_oi`、`cg_cvd`、`cg_netflow`、`cg_orderbook`
- 当前仍可确认的风险项包括：`cg_weighted_fr`、`cg_liq_orders`、`cg_max_pain`、`cg_fr_arb`
- `sentiment:kol:{symbol}`、`sentiment:mentions:{symbol}` 仍只有读侧，未见写入端

### Requirement B5: ORM 模型必须真实镜像当前 schema，并符合兼容目标

#### Acceptance Criteria

- `app/models/db.py` 中的模型字段必须与当前真实表结构一致
- 不允许核心字段在服务层已使用，但 ORM 模型仍缺失
- 若项目要求兼容 SQLite，ORM 层不得长期保留 PostgreSQL 专属类型作为默认实现真相
- 新增服务层字段一旦进入正式业务流，ORM 或 schema 文档必须同步更新

#### Implementation Notes

- `User` 模型未声明 `role`
- `Payment` 模型未声明 `duration_months`
- 模型文件仍直接使用 `JSONB`、`UUID` 等 PostgreSQL 方言类型
- 若下一阶段继续依赖 Alembic / ORM 查询推进开发，则该项按 **P1** 管理；若短期仍以 raw SQL 为主，可暂按 **P2-high** 管理

### Requirement B6: 事务边界必须由单一层负责

#### Acceptance Criteria

- 请求级事务与服务级事务必须有明确边界，不得混用为默认模式
- 默认应由单一 request / job owner 负责提交事务
- 常规 service 函数不应在 `get_db` 自动提交体系内再随意手动 `commit`
- 若确需 service 内提交，必须显式标注其隔离目的、后续影响与允许的部分提交范围
- 复合操作在中途异常时，除显式例外外，不得留下部分成功状态

#### Implementation Notes

- 当前大多数 service 使用 `flush`
- 但 `strategy.py`、`playbook_sim_service.py`、`performance.py`、`notification` 等仍存在 service 内 `commit`
- 该模式易造成跨步骤部分提交、回滚边界不一致、调试困难

### Requirement B7: 仓库内不得保留硬编码管理员初始化脚本

#### Acceptance Criteria

- 仓库中不得保留明文管理员邮箱/密码的可执行初始化脚本
- 所有管理员初始化脚本必须使用环境变量或部署时注入参数
- 历史测试脚本若必须保留，应移动到明确的 dev-only / ignored 区域

#### Implementation Notes

- `backend/scripts/seed_admin.py` 当前是安全的
- 但 `backend/create_admin.py` 仍包含明文邮箱、密码、测试数据库路径与本地地址
- 若仓库继续多人协作、对外交付或开放给非核心成员，此项应提升为 **P1 安全卫生问题**

### Requirement B8: 根路径重定向必须只有一个真相源

#### Acceptance Criteria

- `/` 的跳转行为必须在 `middleware` 与 `next.config.js` 之间统一
- 不得同时存在 `/ -> /login` 与 `/ -> /dashboard` 两套冲突定义
- 登录前后的首页跳转策略必须可预测

#### Implementation Notes

- `frontend/middleware.ts` 将 `/` 重定向到 `/dashboard`
- `frontend/next.config.js` 将 `/` 重定向到 `/login`
- 若已观察到首屏闪烁、循环跳转或埋点失真，应将本项由 **P3** 提升至 **P2**

---

## Part C: 优先级建议

- **P1**
  - B1 前端后台守卫覆盖缺口
  - B2 `symbol_registry` 非唯一真相源
  - B3 Redis 扩展指标命名一致性
  - B4 Redis 扩展指标写入闭环

- **P2**
  - B5 ORM 模型与真实 schema 漂移
  - B6 事务边界不统一
  - B7 硬编码管理员脚本残留

- **P3**
  - B8 根路径双重重定向

---

## Success Criteria

本轮审查收尾完成的标准是：

- 代码、Redis、数据库、前端权限不再存在“表面可用、内部断链”的多真相问题
- 所有被宣称支持的数据能力，都能在代码中找到明确写入端、消费端和降级策略
- 后台管理、币种管理、扩展数据能力具备可验证的一致性
