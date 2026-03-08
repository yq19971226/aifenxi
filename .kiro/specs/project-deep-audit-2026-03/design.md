# Design Document — 项目深度审查整改设计

## Overview

本轮复核结论：主业务已基本连通，但仍存在若干“多真相”问题，会导致系统表面可用、内部不稳定。

本设计只保留当前可直接证实的整改项。

---

## Design Principles

- 单一真相源优先于局部修补
- 能力未接入时必须显式暴露状态，不能假装“只是暂时没数据”
- 导航、路由、后端权限应共享同一权限契约，而不是各自枚举
- 默认由单一 request / job owner 管理事务提交边界

## Capability Matrix Strategy

整改后需要维护一张统一能力矩阵，至少包含以下列：

- capability
- canonical source
- writer
- reader
- fallback / disabled reason
- tier limitation

## D1. 前端后台权限覆盖不完整 ✅ DONE

### Evidence (修复前)

- `AuthGuard.tsx` 仅覆盖少数路径，缺失 11 个后台页面
- `TopNav.tsx` 用独立枚举控制导航可见性，与守卫不共享

### Evidence (修复后)

- 新建 `lib/route-permissions.ts` 作为共享权限源
- `AuthGuard.tsx` 调用 `isRouteAllowed()` — `/admin/*` 默认 admin-only
- 唯一白名单放宽：`/admin/orders` → admin + operator
- `TopNav.tsx` 同样读取 `route-permissions.ts` 过滤导航项

### Root Cause

后台页持续增加，但前端路由权限表仍靠手工枚举维护，没有统一收口。

### Design Direction

- 以 `/admin` 为默认 admin-only 前缀
- 再对白名单页面单独放宽到 `operator`
- 导航过滤与路由守卫共享一份权限配置

---

## D2. `symbol_registry` 不是唯一币种真相源 ✅ DONE

### Evidence (修复前)

- `kline_scheduler.py`、`data/connectors/binance.py` 等仍依赖 `DEFAULT_SYMBOLS`
- `data/news.py` 的 `_SYMBOL_MAP` 保留独立静态币种集合

### Evidence (修复后)

- 所有 worker/connector 已改为调用 `get_active_symbols()` / `get_active_symbols_sync()`
- `DEFAULT_SYMBOLS` 仅保留为 DB 不可用时的冷启动回退
- `symbol_registry.py` 成为唯一运行时币种源

### Root Cause

产品侧已引入币种管理，但采集侧还停留在静态常量驱动，导致运行时配置与执行源分裂。

### Design Direction

- `symbol_registry` 成为唯一运行时币种源
- `DEFAULT_SYMBOLS` 仅保留为冷启动回退
- 采集器、连接器、展示层统一读取同一份启用币种快照

---

## D3a. Redis 扩展指标命名不一致 ✅ DONE

### Evidence (修复前)

- `kill_detector.py` 读取 `cg_net_pos`、`cg_liq_orders`、`cg_max_pain`
- `api/coinglass.py` 读取 `cg_net_position`
- 同一语义出现两套 key 名称

### Evidence (修复后)

- `kill_detector.py` 已统一为 canonical key: `cg_net_position`、`cg_large_orders`、`cg_option_maxpain`、`cg_fr_arb`
- 全项目无旧 key 残留

### Root Cause

- Redis 缓存协议没有被单独治理，新增消费侧时直接按局部语义命名。

### Design Direction

- 为每个业务指标定义唯一 canonical key
- 对外 API 与内部风控不得分别读取 `cg_net_position` / `cg_net_pos` 两套命名

---

## D3b. Redis 扩展指标写入闭环与能力状态不完整 ✅ DONE

### Evidence (修复前)

- `cg_weighted_fr`、`cg_fr_arb`、`cg_net_position` 无写入端
- `sentiment:kol`、`sentiment:mentions` 无写入端且无统一状态语义
- 消费侧各自用日志/硬编码处理降级

### Evidence (修复后)

- `coinglass_worker.py` 已补写 `cg_net_position`、`cg_weighted_fr`、`cg_fr_arb`
- `sentiment:kol`、`sentiment:mentions` 在 `capability_state.py` 中注册为 `unavailable`
- 新建 `app/core/capability_state.py` — 统一能力状态协议 (available/unavailable/disabled/tier-limited)
- `is_capability_available()` 已改为 async，读取 Redis 运行时状态（优先 Redis，回退静态注册表）
- `sentiment.py`、`collusion_detector.py` 消费侧 `await is_capability_available()`
- `sentiment.py` 降级日志已改读运行时 `get_capability_status()`
- `coinglass_worker.py` 按端点实际结果逐个注册状态（`cap_ok` dict 跟踪）：
  - 数据写入成功 → `AVAILABLE`
  - tier 检查不通过 → `TIER_LIMITED`（含 endpoint + tier 级别原因）
  - 数据源关闭 → `_collect_all` 批量写 `DISABLED`（含 reason）
- `_CAP_ENDPOINTS` 映射 10 个 capability → 主要 CoinGlass endpoint
- `_V4_REMOVED_ENDPOINTS` 声明 V4 已移除端点（`oi-ohlc-history`, `fr-ohlc-history`）
- V4-removed endpoint → 写 `UNAVAILABLE`（非 TIER_LIMITED）
- `cg_oi` / `cg_fr` 静态默认已改为 `UNAVAILABLE`
- `coinglass_tier.py` 补齐 Startup+ 6 端点 / Standard+ 18 端点
- `admin_dashboard.py` 暴露 `GET /api/admin/dashboard/capability-matrix`
- 运行时验收：`scripts/verify_capability_matrix.py` — 4 种状态全部覆盖 [PASS]
- 回归测试：`tests/test_capability_state.py` — 6 项全部通过
- 维护规范：`.windsurf/workflows/coinglass-endpoint-checklist.md`

### Root Cause

读侧面向“目标能力”先行扩展，但写侧未同步落地，且未建立统一的 unavailable / disabled / tier-limited 状态语义。

### Design Direction

- 被读取的 key 必须具备写入端或显式禁用
- UI、API、Agent 对未接入能力必须共享统一能力状态语义
- Redis 整改顺序固定为：先收口 key protocol，再补 capability state

---

## D4. ORM 模型与真实 schema 漂移 ✅ DONE

### Evidence (修复前)

- `User` 未声明 `role` (v4 迁移已加入 DB)
- `Payment` 未声明 `duration_months` (v9 迁移已加入 DB)
- 导入 `from sqlalchemy.dialects.postgresql import JSONB, UUID`

### Evidence (修复后)

- `User.role` 已补入: `String(20), server_default='user'`
- `Payment.duration_months` 已补入: `Integer, server_default=1`
- 全文件 `UUID(as_uuid=True)` -> `Uuid()`, `JSONB` -> `JSON`
- 已无 `sqlalchemy.dialects.postgresql` 残留

### Root Cause

服务层原始 SQL 已先演进，ORM 模型未同步，导致“模型定义不再代表真实数据库”。

### Design Direction

- 先以当前真实 schema 为准修正 ORM
- 若继续保留 SQLite 兼容目标，模型层不能长期依赖 PostgreSQL 专属类型作为默认真相
- 若短期仍以 raw SQL 为主，先修复字段缺失，再处理方言抽象层

---

## D5. 事务边界不统一 ✅ DONE

### Evidence (修复前)

- `strategy.py`、`playbook_sim_service.py` 在请求上下文中显式 `commit()`
- 项目同时依赖 `get_db` 自动 commit -> 双提交
- 无白名单文档

### Evidence (修复后)

- `strategy.py`、`playbook_sim_service.py` 已改为 `flush()`
- `get_db()` docstring 维护完整白名单 (13 个合法例外点)
- 白名单与实际 `commit()` 分布完全对齐

### Root Cause

历史迭代中混用了“请求层提交”和“服务层提交”两种模式。

### Design Direction

- 明确默认事务所有者
- 常规请求使用单一提交边界
- 只有真正需要提前落库的场景才允许 service 内显式提交
- 例外提交场景应形成白名单，而不是由各 service 自由决定

---

## D6. 残留初始化脚本 ✅ DONE

### Evidence (修复前)

- `create_admin.py` 硬编码 `Admin@123456`、`admin@omnimind.com`、`test.db`
- 直接打印明文凭据到 stdout

### Evidence (修复后)

- `create_admin.py` 已重写：
  - 凭据来源：环境变量 `ADMIN_EMAIL` / `ADMIN_PASSWORD` 或 `getpass` 交互式输入
  - 密码强度校验（≥ 8 位）
  - 使用生产 DB（`AsyncSessionLocal`），非 `test.db`
  - `ON CONFLICT` upsert 幂等
  - 不打印密码

### Design Direction

- 清理或隔离 `create_admin.py`

---

## D7. 根路径重定向双真相 ✅ DONE

### Evidence (修复前)

- `middleware.ts` 将 `/` → `/dashboard`
- `next.config.js` 将 `/` → `/login`
- 两条规则冲突

### Evidence (修复后)

- `next.config.js` 中 `redirects()` 已移除
- `middleware.ts` 为唯一 `/` 跳转真相源：`/` → `/dashboard`
- AuthGuard 负责未登录用户 → `/login`

### Design Direction

- 根路径重定向只保留一个真相源
- 未登录、已登录普通用户、已登录后台用户的首页落点必须明确区分

---

## Appendix A. 后台页面权限矩阵（修复后现状）

权限源：`lib/route-permissions.ts` — AuthGuard + TopNav 共享。

| Route | Allowed Roles | AuthGuard | TopNav | Backend Guard | Note |
|---|---|---|---|---|---|
| `/admin/orders` | `admin`, `operator` | `isRouteAllowed()` | 白名单放宽 | `require_operator_or_admin` | 唯一 operator 白名单 |
| `/admin/dashboard` | `admin` | `isRouteAllowed()` | admin-only | `require_admin` | ✅ 对齐 |
| `/admin/datasources` | `admin` | `isRouteAllowed()` | admin-only | `require_admin` | ✅ 对齐 |
| `/admin/learning` | `admin` | `isRouteAllowed()` | admin-only | `require_admin` | ✅ 对齐 |
| `/admin/models` | `admin` | `isRouteAllowed()` | admin-only | `require_admin` | ✅ 对齐 |
| `/admin/users` | `admin` | `isRouteAllowed()` | admin-only | `require_admin` | ✅ 对齐 |
| `/admin/operators` | `admin` | `isRouteAllowed()` | admin-only | `require_admin` | ✅ 对齐 |
| `/admin/notifications` | `admin` | `isRouteAllowed()` | admin-only | `require_admin` | ✅ 对齐 |
| `/admin/symbols` | `admin` | `isRouteAllowed()` | admin-only | `require_admin` | ✅ 对齐 |
| `/admin/playbook-review` | `admin` | `isRouteAllowed()` | admin-only | `require_admin` | ✅ 对齐 |
| `/admin/task-review` | `admin` | `isRouteAllowed()` | admin-only | `require_admin` | ✅ 对齐 |
| `/admin/task-templates` | `admin` | `isRouteAllowed()` | admin-only | `require_admin` | ✅ 对齐 |
| `/admin/withdrawals` | `admin` | `isRouteAllowed()` | admin-only | `require_admin` | ✅ 对齐 |
| `/admin/partner-stats` | `admin` | `isRouteAllowed()` | admin-only | `require_admin` | ✅ 对齐 |
| `/admin/setup` | `admin` | `isRouteAllowed()` | admin-only | `require_admin` | ✅ 对齐 |
| `/admin/api-keys` | `admin` | `isRouteAllowed()` | admin-only | admin-only | ✅ 对齐 |
| `/admin/monitor` | `admin` | `isRouteAllowed()` | admin-only | `require_admin` | ✅ 对齐 |
---

## Appendix B. Redis 能力矩阵（修复后现状）

能力状态源：`app/core/capability_state.py` — 静态注册表 + Redis 运行时覆盖。
API：`GET /api/admin/dashboard/capability-matrix`

运行时状态由 `coinglass_worker.py` 按端点实际结果写入 Redis（`_CAP_ENDPOINTS` + `_V4_REMOVED_ENDPOINTS`）。
Tier 端点矩阵：`coinglass_tier.py` `_TIER_ENDPOINTS`（Hobbyist / Startup / Standard / Professional）。

| Key | Writer | Reader | Static Default | Runtime Status | Tier Gate | Note |
|---|---|---|---|---|---|---|
| `cg_oi:{symbol}` | `coinglass_oi.py` | `api/coinglass.py` | `unavailable` | `unavailable` | V4 removed | `oi-ohlc-history` 已从 V4 API 移除 |
| `cg_cvd:{symbol}` | `coinglass_flow.py` | `api/coinglass.py` | `available` | per-run | Standard+ | canonical |
| `cg_netflow:{symbol}` | `coinglass_flow.py` | `api/coinglass.py` | `available` | per-run | Standard+ | canonical |
| `cg_orderbook:{symbol}` | `coinglass_orderbook.py` | `api/coinglass.py` | `available` | per-run | Standard+ | canonical |
| `cg_net_position:{symbol}` | `coinglass_worker.py` | `api/coinglass.py`, `kill_detector.py` | `available` | per-run | Startup+ | `net-position` |
| `cg_weighted_fr:{symbol}` | `coinglass_worker.py` | `kill_detector.py` | `available` | per-run | Startup+ | `oi-weight-ohlc-history` |
| `cg_fr_arb:{symbol}` | `coinglass_worker.py` | `kill_detector.py` | `available` | per-run | Standard+ | `fr-arbitrage` |
| `cg_fr:{symbol}` | `coinglass_worker.py` | `api/coinglass.py` | `unavailable` | `unavailable` | V4 removed | `fr-ohlc-history` 已从 V4 API 移除 |
| `cg_large_orders:{symbol}` | `coinglass_orderbook.py` | `kill_detector.py` | `available` | per-run | Standard+ | `large-orderbook` |
| `cg_option_maxpain:{symbol}` | `coinglass_options.py` | `kill_detector.py` | `available` | per-run | Standard+ | `option-max-pain` |
| `sentiment:kol:{symbol}` | 无 | `sentiment.py`, `collusion_detector.py` | `unavailable` | fallback static | — | 需接入 LunarCrush/Twitter API |
| `sentiment:mentions:{symbol}` | 无 | `sentiment.py`, `collusion_detector.py` | `unavailable` | fallback static | — | 需接入 LunarCrush/Twitter API |
| `sentiment:fear_greed` | `coingecko_collector.py` | `sentiment.py` | `available` | — | — | canonical |
| `gecko_market:{symbol}` | `coingecko_collector.py` | `api/coingecko.py` | `available` | — | — | canonical |
| `news:feed:{symbol}` | `news.py` | `sentiment.py` | `available` | — | — | canonical |
| `onchain:{symbol}` | `onchain_collector.py` | `api/onchain.py` | `available` | — | — | canonical |

Runtime Status 说明：`per-run` = worker 每轮采集后按实际结果写入（AVAILABLE/TIER_LIMITED/UNAVAILABLE）；`unavailable` = V4 已移除，始终写 UNAVAILABLE；`fallback static` = 无 worker 写入，读取回退到静态注册表。
