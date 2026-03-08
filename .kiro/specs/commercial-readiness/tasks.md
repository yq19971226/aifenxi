# Tasks — 商用就绪全功能开发计划

> **编号规则**：Task 编号与 requirements.md 的 Part 编号对齐。Part C 为审查结论（无需开发），故 Task 跳过 C。

## Phase A: 商用补齐（P1 优先）

### Task A1: 套餐定价动态化 + 功能对比表
> 合并 Req A1 + Req A3：定价动态化 + 对比表 API 化
- [x] A1.1 后端 `payment.py`: 新增 `_get_plan_price(plan)` 从 config_service 读取，`PLAN_PRICES` 作为回退
- [x] A1.2 前端 `configs/page.tsx`: `CONFIG_GROUPS` 新增「会员定价」分组（plan_price_pro, plan_price_flagship）
- [x] A1.3 后端新增 `api/membership.py`: `GET /api/membership/plans` 返回动态价格+功能对比
- [x] A1.4 前端 `membership/page.tsx`: 价格改为从 `/api/membership/plans` 获取
- [x] A1.5 测试: 验证修改价格后支付和展示均生效 ✅ (33 tests in test_payment.py)

### Task A2: 分析配额管理 UI
- [x] A2.1 前端 `configs/page.tsx`: `CONFIG_GROUPS` 新增「分析配额」分组（6 个配额参数）
- [x] A2.2 测试: 验证通过 UI 修改配额后 analysis_quota 读取新值

### Task A3: 会员时长多选项
- [x] A3.1 后端 `payment.py`: 新增 `DURATION_DISCOUNTS`（从 config_service 读），`create_payment` 接受 `duration_months`
- [x] A3.2 后端 `api/membership.py`: plans 返回包含各时长价格
- [x] A3.3 前端 `membership/page.tsx`: 新增月/季/年切换按钮组，金额实时计算
- [x] A3.4 前端 `configs/page.tsx`: 定价分组增加折扣配置（plan_discount_quarterly, plan_discount_yearly）
- [x] A3.5 测试: 验证季度/年度支付金额计算正确 ✅ (TestDurationPricing: 6 tests)

---

## Phase B: 自主学习模块

### Task B1: 后端 API 基础
- [x] B1.1 新建 `backend/app/api/learning.py` — 学习模块路由（require_admin）
- [x] B1.2 新建 `backend/app/services/learning_service.py` — 业务逻辑层
- [x] B1.3 注册路由到 `main.py`
- [x] B1.4 实现 `GET /api/admin/learning/performance-review` — 绩效回顾数据
  - 复用 PerformanceTracker.get_stats(), get_trend(), _get_agent_accuracy()
  - 新增信号分布统计和按模式分胜率
- [x] B1.5 测试: performance-review API 返回正确数据结构

### Task B2: 手动权重迭代 API
- [x] B2.1 `learning_service.py`: recalculate_weights 支持自定义回看天数
- [x] B2.2 实现 `POST /api/admin/learning/recalculate-weights` — 预览新权重
- [x] B2.3 实现 `POST /api/admin/learning/apply-weights` — 应用权重到 Redis
- [x] B2.4 实现 `GET /api/admin/learning/current-weights` — 获取当前权重
- [x] B2.5 测试: 权重计算和应用流程

### Task B3: 信号校准 API
- [x] B3.1 `consensus/engine.py`: 共识阈值和最小一致数从 config_service 动态读取
- [x] B3.2 实现 `GET /api/admin/learning/calibration-params` — 获取校准参数
- [x] B3.3 实现 `PUT /api/admin/learning/calibration-params` — 更新校准参数
- [x] B3.4 `configs/page.tsx`: CONFIG_GROUPS 新增「信号校准」分组
- [x] B3.5 测试: 修改阈值后共识引擎使用新值

### Task B4: 数据库维护 API
- [x] B4.1 实现 `GET /api/admin/learning/db-stats` — 各表行数统计
- [x] B4.2 实现 `POST /api/admin/learning/cleanup` — 清理过期数据（最小 30 天保留）
- [x] B4.3 测试: 清理操作正确删除过期数据且不影响活跃数据

### Task B5: 前端自主学习页面
- [x] B5.1 新建 `frontend/app/(main)/admin/learning/page.tsx` — Tab 布局骨架
- [x] B5.2 新建 `frontend/lib/api/learning.ts` — API 客户端
- [x] B5.3 绩效回顾 Tab: 时间范围选择器 + 胜率趋势折线图 + 智能体准确率柱状图 + 信号分布饼图
- [x] B5.4 权重迭代 Tab: 回看天数选择 + 新旧权重对比表 + 三维度评分 + 应用按钮
- [x] B5.5 反思复盘 Tab: 币种多选 + 批量触发 + 最近报告列表
- [x] B5.6 信号校准 Tab: 参数展示 + 编辑 + 保存（含推荐值）
- [x] B5.7 数据维护 Tab: 表统计 + 清理操作 + 二次确认弹窗
- [x] B5.8 Sidebar 导航: adminNavItem.children 新增「自主学习」入口

### Task B6: 参数变更快照
- [x] B6.1 `learning_service.py`: ensure_changelog_table (CREATE TABLE IF NOT EXISTS)
- [x] B6.2 `apply-weights` 和 `calibration-params` 端点写入 changelog
- [x] B6.3 绩效回顾 API 返回 `changelog_markers` 列表
- [x] B6.4 前端绩效回顾图表绘制参数变更竖线标记

---

## Phase D: 剧本演练 + 广场 + 验证

> 对应 requirements.md Part D (D1~D7)

### Task D1: 剧本模式结构化
- [x] D1.1 新增 `PlaybookStage` 模型（name, phase, typical_duration, features, key_indicators, next_stage_probability, failure_signal）
- [x] D1.2 `PlaybookPattern` 新增可选字段 `stages: list[PlaybookStage] = []`
- [x] D1.3 为 17 个剧本补充 3~5 个阶段定义
- [x] D1.4 测试: 确认所有剧本的 stages 字段可正确序列化

### Task D2: 剧本演练后端 API
- [x] D2.1 新建 `backend/app/services/playbook_sim_service.py`
- [x] D2.2 新建 `backend/app/api/playbook_sim.py` 路由: `GET /api/playbook-sim/simulate/{symbol}`
- [x] D2.3 注册路由到 `main.py`
- [x] D2.4 Redis 缓存 15min TTL
- [x] D2.5 测试: API 返回正确数据结构，付费/免费用户权限区分正确

### Task D3: 剧本演练前端页面
- [x] D3.1 新建 `frontend/lib/api/playbook-sim.ts` API 客户端
- [x] D3.2 新建 `frontend/app/(main)/playbook-sim/page.tsx`
- [x] D3.3 免费用户模糊遮罩（CSS blur + 解锁引导卡片 + 跳转 membership）
- [x] D3.4 Sidebar 导航新增「剧本推演」入口

### Task D4: 权限配置
- [x] D4.1 前端 `configs/page.tsx` 会员限制分组新增 `playbook_sim_min_level`
- [x] D4.2 前端 `membership/page.tsx` 功能对比表新增「剧本推演」行

### Task D5: 剧本预测持久化 + 自动验证
- [x] D5.1 DB 表 `playbook_predictions` 已存在
- [x] D5.2 `playbook_sim_service.py` 的 `simulate()` 生成结果后自动写入 DB
- [x] D5.3 去重逻辑 + 质量门槛（MIN_PERSIST_MATCH_PCT/MIN_PUBLISH_MATCH_PCT）
- [x] D5.4 `backend/workers/playbook_verify_worker.py` — 自动验证
- [x] D5.5 测试: test_playbook_verify.py

### Task D6: 剧本广场后端 API
- [x] D6.1 广场路由集成到 `playbook_sim.py`（plaza/feed + plaza/stats）
- [x] D6.2 实现 `GET /api/playbook-sim/plaza/feed` — 分页列表
- [x] D6.3 实现 `GET /api/playbook-sim/plaza/stats` — 系统总战绩统计
- [x] D6.4 权限控制: 免费用户只看标题+匹配度

### Task D7: 剧本广场前端页面
- [x] D7.1 前端 API 客户端（playbook-sim.ts + admin-playbook-sim.ts）
- [x] D7.2 剧本演练页面包含广场功能
- [x] D7.3 免费用户模糊遮罩 + 解锁引导
- [x] D7.4 自动刷新
- [x] D7.5 Sidebar 导航「剧本演练」入口

### Task D8: 剧本胜率整合
- [x] D8.1 `learning_service.py` performance-review 返回 `playbook_win_rates`
- [x] D8.2 从 `playbook_predictions` 表聚合查询
- [x] D8.3 前端绩效回顾 Tab 剧本准确率板块

### Task D9: 集成测试
- [x] D9.1 test_playbook_verify.py 测试通过
- [x] D9.2 完整流程已集成

---

## Phase E: 币种管理

> 对应 requirements.md Part E (E1~E2)

### Task E1: 后端币种扩展 + API
- [x] E1.1 `symbol_registry.py`: `DEFAULT_SYMBOLS` 扩展为 10 个主流币（含完整配置）
- [x] E1.2 新增 `soft_delete()` 方法（设 enabled=false，不物理删除）
- [x] E1.3 `api/symbols.py`: 新增 `DELETE /api/symbols/{symbol}` 端点（require_admin）
- [x] E1.4 `api/symbols.py`: 新增 `PUT /api/symbols/{symbol}` 端点（启用/禁用/修改配置）
- [x] E1.5 迁移脚本: v9_extra_symbols.sql 插入 5 个新币种 (ADA, DOGE, AVAX, DOT, MATIC)
- [x] E1.6 测试: 增删改查 + 禁用后不出现在前端列表

### Task E2: 币种管理前端页面
- [x] E2.1 新建 `frontend/lib/api/admin-symbols.ts` — 管理员 API 客户端
- [x] E2.2 新建 `frontend/app/(main)/admin/symbols/page.tsx`
  - 币种列表表格（状态开关/链上/合约/间隔/错误/操作）
  - 「添加币种」按钮 + 表单弹窗
  - 禁用/删除确认
- [x] E2.3 Sidebar `adminNavItem.children` 新增「币种管理」入口
- [x] E2.4 测试: 完整 CRUD 流程

---

## Phase F: 信号推送增强

> 对应 requirements.md Part F (F1~F3)。依赖 Phase D 完成。

### Task F1: 剧本阶段转换推送
- [x] F1.1 `playbook_verify_worker.py` 阶段转换时调用 `broadcast("playbook_switch", ...)` 推送
- [x] F1.2 复用 push_dispatcher broadcast 框架
- [x] F1.3 前端 `/settings/push` 新增 `playbook_switch` 事件开关

### Task F2: 高置信信号推送
- [x] F2.1 `analysis_orchestrator.py` 共识生成后检查置信度，超阈值推送
- [x] F2.2 阈值从 `config_service` 读取（key: `signal_push_threshold`，默认 0.7）
- [x] F2.3 前端 `/settings/push` 新增 `high_confidence_signal` 开关
- [x] F2.4 后台 `configs/page.tsx` 新增 `signal_push_threshold` 参数

### Task F3: 策略触达推送
- [x] F3.1 `push_dispatcher` 支持 `strategy_settlement` 事件
- [x] F3.2 前端 `/settings/push` 新增 `strategy_settlement` 开关

---

## Phase G: 策略回测仪表盘

> 对应 requirements.md Part G (G1)

### Task G1: 回测后端 API
- [x] G1.1 新建 `backend/app/api/backtest.py` 路由，注册到 `main.py`
- [x] G1.2 实现 `GET /api/backtest/summary` — 从 `strategy_snapshots` 表聚合
- [x] G1.3 计算: 总交易数/胜率/总收益率/最大回撒/盈亏比/收益曲线
- [x] G1.4 免费用户限制 7 天，付费最大 180 天
- [x] G1.5 benchmark 对比：与「持有不动」的收益对比

### Task G2: 回测前端页面
- [x] G2.1 新建 `frontend/lib/api/backtest.ts` API 客户端
- [x] G2.2 新建 `frontend/app/(main)/backtest/page.tsx`
- [x] G2.3 Sidebar 导航新增「策略回测」入口
- [x] G2.4 免费用户限制提示（超出 7 天显示解锁引导）

---

## Phase H: 免费试用机制

> 对应 requirements.md Part H (H1)

### Task H1: 新用户赠送 bonus_credits
- [x] H1.1 注册流程中调用 `analysis_quota.add_bonus_credits(user_id, N)` — 已集成到 api/auth.py register
- [x] H1.2 N 从 `config_service` 读取（key: `new_user_bonus_credits`，默认 5）
- [x] H1.3 后台 `configs/page.tsx` 会员限制分组新增:
  - `new_user_bonus_credits`（默认 5）
  - `new_user_bonus_enabled`（默认 true）
- [x] H1.4 前端注册成功页显示赠送提示
- [x] H1.5 测试: 新用户获得 credits → 使用完毕→回到免费限制

---

## 执行顺序

```
Phase A + E + H ──→ Phase B ──→ Phase D ──→ Phase F
 (商用+币种+试用)    (学习)      (剧本体系)    (推送增强)
       并行                                      ↓
                                          Phase G
                                          (策略回测)
```

1. **Phase A** (A1 → A2 → A3) — 商用补齐
2. **Phase E** (E1 → E2) — 币种管理（可与 A 并行）
3. **Phase H** (H1) — 免费试用（改动极小，可与 A 并行）
4. **Phase B** (B1 → B2 → B3 → B4 → B5 → B6) — 自主学习模块
5. **Phase D** (D1 → D2 → D3 → D4 → D5 → D6 → D7 → D8 → D9) — 剧本演练 + 广场
6. **Phase F** (F1 → F2 → F3) — 信号推送增强（F1 依赖 D5 的 verify_worker）
7. **Phase G** (G1 → G2) — 策略回测仪表盘

### 依赖关系

| Phase | 依赖 | 原因 |
|-------|------|------|
| A/E/H | 无 | 独立模块，可并行 |
| B | 无 | 独立模块 |
| D8 | B1 | 胜率整合需要 performance-review API |
| F1 | D5 | 阶段推送依赖 playbook_verify_worker |
| G | 无 | 复用已有 PerformanceTracker 数据 |

---

## 附录：新增文件清单

### 后端新增文件

| 文件 | Phase | 说明 |
|------|-------|------|
| `api/membership.py` | A | 会员套餐 + 功能对比 API |
| `api/learning.py` | B | 自主学习路由 |
| `services/learning_service.py` | B | 学习模块业务逻辑 |
| `services/playbook_sim_service.py` | D | 剧本演练服务 |
| `api/playbook_sim.py` | D | 剧本演练路由 |
| `api/playbook_plaza.py` | D | 剧本广场路由 |
| `workers/playbook_verify_worker.py` | D | 剧本验证定时任务 |
| `api/backtest.py` | G | 回测统计路由 |

### 前端新增文件

| 文件 | Phase | 说明 |
|------|-------|------|
| `lib/api/learning.ts` | B | 学习模块 API 客户端 |
| `app/(main)/admin/learning/page.tsx` | B | 自主学习管理页面 |
| `lib/api/playbook-sim.ts` | D | 剧本演练 API 客户端 |
| `app/(main)/playbook-sim/page.tsx` | D | 剧本推演页面 |
| `lib/api/playbook-plaza.ts` | D | 剧本广场 API 客户端 |
| `app/(main)/playbook-plaza/page.tsx` | D | 剧本广场页面 |
| `lib/api/admin-symbols.ts` | E | 币种管理 API 客户端 |
| `app/(main)/admin/symbols/page.tsx` | E | 币种管理页面 |
| `lib/api/backtest.ts` | G | 回测 API 客户端 |
| `app/(main)/backtest/page.tsx` | G | 策略回测页面 |

### config_service 新增参数汇总

| Key | 默认值 | 分组 | Phase |
|-----|--------|------|-------|
| `plan_price_pro` | 99 | 会员定价 | A |
| `plan_price_flagship` | 299 | 会员定价 | A |
| `plan_discount_quarterly` | 0.9 | 会员定价 | A |
| `plan_discount_yearly` | 0.7 | 会员定价 | A |
| `analysis_daily_limit_*` (6个) | 各不同 | 分析配额 | A |
| `consensus_signal_threshold` | 0.35 | 信号校准 | B |
| `consensus_min_agreement` | 2 | 信号校准 | B |
| `playbook_sim_min_level` | 1 | 会员限制 | D |
| `signal_push_threshold` | 0.7 | 推送设置 | F |
| `backtest_free_days` | 7 | 会员限制 | G |
| `new_user_bonus_credits` | 5 | 会员限制 | H |
| `new_user_bonus_enabled` | true | 会员限制 | H |

### 新增 DB 表

| 表名 | Phase | 迁移方式 |
|------|-------|----------|
| `params_changelog` | B | CREATE TABLE IF NOT EXISTS |
| `playbook_predictions` | D | Alembic 迁移 |
