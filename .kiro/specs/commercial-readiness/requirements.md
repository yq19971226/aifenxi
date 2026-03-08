# Requirements Document — 商用就绪全功能需求

## Introduction

本文档涵盖系统商用化的全部需求，共 **7 个 Part、26 项需求**：

1. **Part A — 商用补齐**：定价动态化、配额 UI、功能对比表、时长多选项
2. **Part B — 自主学习模块**：绩效回顾、权重迭代、复盘、校准、DB 维护、变更快照
3. **Part C — 审查结论**：无需重构的模块清单（仅信息记录，无开发任务）
4. **Part D — 剧本演练**：剧本结构化、推演 API、广场、自动验证、胜率整合
5. **Part E — 币种管理**：10 主流币扩展、后台管理 UI
6. **Part F — 信号推送增强**：阶段转换、高置信信号、策略触达推送
7. **Part G — 策略回测仪表盘**：回测统计 + 收益曲线
8. **Part H — 免费试用机制**：新用户 bonus_credits，后台可配，专业版不送

> **编号规则**：Part 编号与 tasks.md 的 Phase 编号一一对应。Part C 为审查结论（无开发任务），故 Task 跳过 C。

## Glossary

- **PLAN_PRICES**: 后端 `payment.py` 中的套餐定价字典，当前硬编码 `{1: 99.00, 2: 299.00}`
- **ANALYSIS_DAILY_LIMITS**: `analysis_quota.py` 中的分析配额矩阵（3 等级 × 3 模式 = 9 组）
- **config_service**: 动态配置服务，支持运行时读写配置参数
- **weight_worker**: 共识引擎权重更新 Worker，每 6 小时基于近 30 天数据自动更新模型权重
- **PerformanceTracker**: 策略绩效追踪器，记录策略快照并计算胜率、盈亏比、智能体准确率
- **ReflectionAgent**: 反思复盘智能体，分析历史数据生成改进洞察
- **strategy_snapshots**: 数据库表，记录每次策略预测与实际结果
- **playbook_predictions**: 数据库表，记录剧本推演预测及阶段验证结果
- **symbol_registry**: 数据库表，管理支持的交易对及其配置
- **bonus_credits**: 额外分析次数，可用于超出免费限制的分析模式
- **params_changelog**: 数据库表，记录参数变更事件日志

---

## Part A: 商用审查 — 发现与修复

### 审查结果概览

| 维度 | 状态 | 说明 |
|------|------|------|
| 后台管理页面 | ✅ 完整（14 页，本计划新增 2 页: learning + symbols = 16 页） | setup, dashboard, api-keys, users, operators, datasources, models, orders, notifications, monitor, task-review, task-templates, withdrawals, partner-stats |
| 参数设置 | ⚠️ 部分缺失 | 7 组参数配置完整，但分析配额和套餐定价不在 UI 中 |
| 会员定价 | ⚠️ 硬编码 | 前后端价格硬编码，管理员无法动态调价 |
| 支付系统 | ✅ 完整 | NowPayments USDT 三网支付，Webhook 验签，幂等 |
| 角色权限 | ✅ 完整 | admin/operator/user 三级 + 路由守卫 |
| 配额系统 | ✅ 逻辑完整 | 3 等级 × 3 模式，支持 bonus_credits，但 UI 不可配 |
| LLM 成本监控 | ✅ 完整 | 按模型分成本，实时面板 |
| 系统体检 | ✅ 完整 | 5 项自动检测 + 快速设置向导 |

---

### Requirement A1: 套餐定价动态化

**User Story:** As a 管理员, I want 在后台动态调整套餐价格, so that 我无需修改代码即可应对市场变化调价

#### Acceptance Criteria

- **Given** 管理员打开参数设置页面
- **When** 在「会员定价」分组中修改专业版或旗舰版价格
- **Then** 新价格立即生效，后续用户支付使用新价格

#### Implementation Notes

- 后端 `payment.py` 的 `PLAN_PRICES` 改为从 `config_service` 动态读取，硬编码作为回退默认值
- 前端 `membership/page.tsx` 的价格从 API `/api/membership/plans` 获取，不再硬编码
- 参数设置页面 `CONFIG_GROUPS` 新增「会员定价」分组
- 新增 config keys: `plan_price_pro`, `plan_price_flagship`

---

### Requirement A2: 分析配额管理 UI

**User Story:** As a 管理员, I want 在参数设置中调整各等级各模式的分析次数限额, so that 我可以根据运营策略灵活调整配额

#### Acceptance Criteria

- **Given** 管理员打开参数设置页面
- **When** 查看「分析配额」分组
- **Then** 显示 9 个配额项（3 等级 × 3 模式），每个可独立编辑
- **And** 修改后立即生效（`analysis_quota.py` 已支持从 config_service 读取）

#### Implementation Notes

- 仅需在前端 `configs/page.tsx` 的 `CONFIG_GROUPS` 中新增一组即可
- 后端 `_LIMIT_CONFIG_KEYS` 已定义 6 个动态配置键，免费用户的 intraday/trend 配额为 0（锁定），无需暴露
- 新增参数: `analysis_daily_limit_free_scalping`, `analysis_daily_limit_pro_scalping`, `analysis_daily_limit_flagship_scalping`, `analysis_daily_limit_pro_intraday`, `analysis_daily_limit_flagship_intraday`, `analysis_daily_limit_flagship_trend`

---

### Requirement A3: 会员功能对比表动态化

**User Story:** As a 管理员, I want 会员功能对比表从后端获取, so that 调整等级权益时无需改前端代码

#### Acceptance Criteria

- **Given** 用户打开会员中心页面
- **When** 查看功能对比表
- **Then** 功能列表和各等级的值从后端 API 动态获取

#### Implementation Notes

- 新增 API `GET /api/membership/plans` 返回定价和功能对比数据
- 后端从 config_service 读取价格，功能对比可以硬编码（变化少）或也纳入配置
- 前端 `PLAN_FEATURES` 和价格改为 API 驱动

---

### Requirement A4: 会员时长多选项

**User Story:** As a 用户, I want 选择月度/季度/年度套餐, so that 长期订阅可获得折扣

#### Acceptance Criteria

- **Given** 用户在会员中心选择升级
- **When** 选择套餐后可切换「月度 / 季度 / 年度」
- **Then** 显示对应价格（季度 9 折，年度 7 折），支付金额按所选时长计算

#### Implementation Notes

- 新增 config keys: `plan_discount_quarterly`(默认 0.9), `plan_discount_yearly`(默认 0.7)
- `payment.py` 的 `create_payment` 接受 `duration` 参数 (1/3/12 个月)
- `subscription.py` 的 `upgrade_membership` 已支持 `duration_days` 参数
- 前端新增时长选择器 UI

---

## Part B: 自主学习模块

### 设计目标

在后台管理新增 `/admin/learning` 页面，提供以下手动操作能力，使管理员无需开发介入即可进行系统迭代：

1. **数据回顾**：查看指定时间段的行情数据、信号分布、胜率趋势
2. **模型权重迭代**：手动触发权重重新计算（可自定义回看天数）
3. **反思复盘触发**：手动触发 ReflectionAgent 对指定币种/时段进行复盘
4. **信号校准**：基于回顾结果调整共识阈值和智能体权重
5. **数据库维护**：清理过期快照、压缩历史数据

---

### Requirement B1: 绩效回顾面板

**User Story:** As a 管理员, I want 查看指定时间段的策略绩效趋势, so that 我能识别系统表现下降的时期并针对性改进

#### Acceptance Criteria

- **Given** 管理员打开自主学习页面
- **When** 选择时间范围（近 7 天 / 30 天 / 90 天 / 自定义）和可选的币种过滤
- **Then** 显示以下数据：
  - 总体胜率趋势折线图（按日）
  - 各智能体信号准确率对比柱状图
  - 信号分布饼图（bullish / bearish / neutral 比例）
  - 各分析模式（scalping/intraday/trend）的独立胜率

#### Implementation Notes

- 后端新增 API `GET /api/admin/learning/performance-review`
  - 参数: `days`, `symbol`(可选), `mode`(可选)
  - 返回: 日粒度胜率趋势、智能体维度准确率、信号分布统计
- 复用 `PerformanceTracker.get_stats()` + `_get_agent_accuracy()` + `get_trend()`
- 前端使用 recharts 或 chart.js 绘制图表

---

### Requirement B2: 手动权重迭代

**User Story:** As a 管理员, I want 手动触发模型权重重新计算并预览结果, so that 我可以在市场风格切换后立即更新权重而非等待 6 小时定时任务

#### Acceptance Criteria

- **Given** 管理员在自主学习页面点击「重新计算权重」
- **When** 可选择回看天数（默认 30 天，可选 7/14/30/60/90）
- **Then** 显示计算进度，完成后展示：
  - 当前权重 vs 新权重对比表
  - 各模型三维度评分（方向准确率、校准度、幅度匹配度）
  - 「应用」按钮确认后写入 Redis 生效

#### Implementation Notes

- 后端新增 API `POST /api/admin/learning/recalculate-weights`
  - 参数: `lookback_days`(默认 30)
  - 返回: 新旧权重对比 + 三维度评分详情
- 复用 `consensus/weights.py` 的 `_query_model_scores()` 和 `calculate_weights()`
- 新增 `POST /api/admin/learning/apply-weights` 写入 Redis

---

### Requirement B3: 手动反思复盘触发

**User Story:** As a 管理员, I want 手动触发反思复盘分析, so that 系统能从近期错误中学习改进

#### Acceptance Criteria

- **Given** 管理员选择目标币种和回顾时段
- **When** 点击「触发复盘」
- **Then** 调用 ReflectionAgent 分析指定时段的历史数据
- **And** 生成复盘报告并显示关键洞察
- **And** 洞察自动注入到后续分析的 system prompt 中

#### Implementation Notes

- 复用已有 `POST /api/reflection/trigger` 端点
- 前端新增批量触发 UI：可选多个币种一次性触发
- 展示最近复盘报告列表 + 点击查看详情

---

### Requirement B4: 信号校准工具

**User Story:** As a 管理员, I want 基于绩效回顾结果调整系统参数, so that 我可以优化信号生成的准确性

#### Acceptance Criteria

- **Given** 管理员查看完绩效回顾后
- **When** 点击「信号校准」面板
- **Then** 显示当前可调参数和建议值：
  - 共识阈值（当前 ±0.35）
  - 最小模型一致数（当前 ≥2）
  - 各智能体权重（回退权重）
- **And** 可直接修改并应用，修改记录写入审计日志

#### Implementation Notes

- 这些参数当前为代码常量，需迁移到 `config_service`
- 新增 config keys: `consensus_signal_threshold`(默认 0.35), `consensus_min_agreement`(默认 2)
- 后端读取这些参数的地方改为从 config_service 动态读取
- 前端展示推荐值（基于回顾数据计算）

---

### Requirement B5: 数据库维护工具

**User Story:** As a 管理员, I want 手动清理过期的历史数据, so that 数据库性能不会随时间下降

#### Acceptance Criteria

- **Given** 管理员打开数据库维护面板
- **When** 可查看各表的数据量统计
- **Then** 可选择清理策略：
  - 清理 N 天前的已结算策略快照（默认保留 180 天）
  - 清理过期的分析缓存
  - 压缩通知日志（默认保留 90 天）
- **And** 清理前显示预估影响（将删除 X 条记录），需二次确认

#### Implementation Notes

- 后端新增 API `GET /api/admin/learning/db-stats` 返回各表行数
- 新增 API `POST /api/admin/learning/cleanup` 执行清理
- 清理操作使用 `DELETE ... WHERE created_at < NOW() - INTERVAL '?? days'`
- 所有清理操作写入审计日志

---

### Requirement B6: 参数变更快照（防新旧数据冲突）

**User Story:** As a 管理员, I want 每次手动迭代参数后系统自动记录变更点, so that 绩效回顾时能区分「旧参数时期」和「新参数时期」的表现

#### 背景（为什么需要）

手动更新权重/校准参数后，所有新分析立即使用新参数，但历史策略是用旧参数生成的。
统计近 30 天胜率时，如果前 25 天用旧权重、后 5 天用新权重，结果是混合的，无法判断新参数是否更好。

#### 解决方案：变更事件日志 + 快照标记

```
params_changelog 表:
| id | changed_at | param_type | old_value | new_value | changed_by |
|----|------------|------------|-----------|-----------|------------|
| 1  | 2026-02-28 | weights    | {tech:0.25,...} | {tech:0.28,...} | admin |
| 2  | 2026-03-01 | threshold  | 0.35      | 0.40      | admin      |
```

#### Acceptance Criteria

- **Given** 管理员通过自主学习页面应用新权重或修改校准参数
- **When** 变更生效时
- **Then** 系统自动在 `params_changelog` 表记录变更事件（时间、参数类型、旧值、新值、操作人）
- **And** 绩效回顾面板显示参数变更竖线标记（vertical marker），管理员可以看到变更前后的胜率对比
- **And** 绩效回顾支持「仅看当前参数版本」的筛选开关

#### 数据流安全性说明

| 场景 | 是否冲突 | 原因 |
|------|----------|------|
| 更新权重后，新分析用新权重 | ✅ 不冲突 | Redis 原子覆盖，下次读取即为新值 |
| 更新权重后，旧策略报告不变 | ✅ 不冲突 | 旧报告是独立快照，已存入 DB |
| 更新阈值后，共识引擎用新阈值 | ✅ 不冲突 | 每次分析实时读取 config_service |
| 触发复盘后，洞察注入智能体 | ✅ 不冲突 | 旧洞察 24h TTL 自然过期，新洞察覆盖 |
| 绩效统计混合新旧参数时期 | ⚠️ 需标记 | 通过 changelog 分段对比解决 |

#### Implementation Notes

- 新建 `params_changelog` 表（无需 Alembic 迁移，可用 `CREATE TABLE IF NOT EXISTS`）
- `apply-weights` 和 `update calibration-params` 端点写入 changelog
- 绩效回顾 API 返回 `changelog_markers` 列表供前端绘制竖线
- 前端图表在变更时间点绘制虚线 + tooltip 标注

---

## Part C: 审查结论（无需开发）

> 以下模块经审查确认设计合理，无需重构，仅作记录。本 Part 无开发任务。

| 模块 | 结论 |
|------|------|
| 编排器（analysis_orchestrator.py） | 3 模式分派 + 并行执行 + 熔断器，架构合理 |
| 共识引擎（consensus/engine.py） | NSED 多模型投票 + 动态权重，已优化 |
| 配额系统（analysis_quota.py） | Redis 计数器 + bonus_credits + 动态配置，完整 |
| 支付流程（payment.py） | NowPayments + Webhook验签 + 幂等，商用就绪 |
| 角色权限体系 | 三级角色 + 路由守卫 + TopNav过滤，完整 |
| 数据源管理（datasource_registry.py） | 组级+子级开关 + 持久化，完整 |
| 模型路由（model_router.py） | 动态映射 + 后台UI切换，完整 |
| 配置服务（config_service.py） | 加密存储 + 缓存 + 审计日志，完整 |

---

## Part D: 剧本演练功能（前台用户功能）

### 设计目标

新增前台页面 `/playbook-sim`，采用模式A（自动匹配）：
- 用户输入币种，系统自动识别当前最可能的剧本
- 展示该剧本的全阶段时间线，标记当前所处阶段
- 每个阶段显示概率、特征、最大几率走向、反制策略
- **付费用户**可看完整推演结果，**免费用户**仅看剧本名称和阶段骨架，详细内容显示「订阅解锁」
- 会员等级阈值由后台 `config_service` 控制（默认 ≥ 专业版）

---

### Requirement D1: 剧本模式结构化扩展

**User Story:** As a 开发者, I want 将 17 种剧本扩展为分阶段结构, so that 前端能渲染阶段时间线并与 phase_tracker 对接

#### Acceptance Criteria

- **Given** 每个 PlaybookPattern
- **When** 系统读取剧本定义
- **Then** 包含结构化的 `stages` 列表，每个阶段包含：
  - 阶段名称、典型持续时间、特征列表、关键指标、下一阶段概率
  - 对应的 `MarketPhase` 枚举值（与 phase_tracker 对接）

#### Implementation Notes

- 扩展 `PlaybookPattern` 模型新增 `stages: list[PlaybookStage]` 字段
- 新增 `PlaybookStage` 模型：
  ```python
  class PlaybookStage(BaseModel):
      name: str                          # 阶段名称
      phase: MarketPhase                 # 对应 phase_tracker 的阶段
      typical_duration: str              # 典型持续时间（如 "3-7天"）
      features: list[str]                # 该阶段特征
      key_indicators: list[str]          # 关键监控指标
      next_stage_probability: float      # 进入下一阶段的基础概率
      failure_signal: str                # 该阶段失效的信号
  ```
- 每个现有剧本补充 3~5 个阶段定义
- `stages` 字段可选（向后兼容），未定义时前端不展示阶段时间线

---

### Requirement D2: 剧本演练 API

**User Story:** As a 用户, I want 输入币种后看到当前最可能的庄家剧本推演, so that 我能提前判断下一步走势

#### Acceptance Criteria

- **Given** 用户请求 `/api/playbook-sim/{symbol}`
- **When** 系统处理请求
- **Then** 返回：
  - 匹配度最高的 top-3 剧本（名称 + 匹配度百分比）
  - 排名第 1 的剧本的完整阶段时间线：
    - 每个阶段的状态（已完成 / 当前 / 未到）
    - 当前阶段的实时匹配度（AI 计算）
    - 下一阶段的最大概率走向（AI 推演）
    - 反制策略建议
  - 当前操盘阶段（来自 phase_tracker）

#### 权限控制

- 免费用户：返回 top-3 剧本名称 + 匹配度 + 阶段名称骨架，但每个阶段的详细内容、AI 推演、反制策略均为 `null`
- 付费用户（≥ 专业版，可配置）：返回完整数据
- 权限阈值通过 `config_service` 读取（key: `playbook_sim_min_level`，默认 1）

#### Implementation Notes

- 新增 `backend/app/api/playbook_sim.py` 路由
- 新增 `backend/app/services/playbook_sim_service.py` 业务逻辑：
  1. 调用 `_collect_market_data()` 获取当前市场数据
  2. 调用 `phase_tracker.get_current_phase()` 获取当前阶段
  3. 遍历 17 个剧本，计算匹配度（特征匹配度 + 阶段匹配度）
  4. 对 top-1 剧本调用 LLM 推演下一阶段概率（复用 PlaybookAgent 的 prompt 模板）
  5. 根据用户会员等级决定返回完整数据或脱敏骨架
- 缓存：Redis TTL 15min（避免重复 LLM 调用）

---

### Requirement D3: 剧本演练前端页面

**User Story:** As a 用户, I want 在前端看到直观的剧本演练时间线, so that 我能快速理解庄家可能的下一步动作

#### Acceptance Criteria

- **Given** 用户打开 `/playbook-sim` 页面
- **When** 选择币种并点击「开始推演」
- **Then** 显示：
  - 剧本匹配卡片（top-3，显示名称 + 匹配度百分比 + 信号方向）
  - 阶段时间线（横向流程图）：
    - 已完成阶段：绿色 ✅
    - 当前阶段：蓝色脉冲 🔵 + 匹配度百分比
    - 未到阶段：灰色 ⬜ + 概率显示
  - 展开当前阶段卡片：特征匹配度、最大概率走向、反制策略、风险信号
- **And** 免费用户看到阶段名称和匹配度，但详情区域显示模糊遮罩 + 「订阅专业版解锁」 按钮

#### UI 草图

```
┌─────────────────────────────────────────────────┐
│  剧本推演  ·  BTCUSDT                            │
├─────────────────────────────────────────────────┤
│  匹配剧本                                         │
│  ┌─────────────┐ ┌────────────┐ ┌─────────────┐ │
│  │ 横盘吸筹    │ │ 二次探底   │ │ 主升浪启动  │ │
│  │ 匹配 82%   │ │ 匹配 65%  │ │ 匹配 41%   │ │
│  │ 🟢 bullish │ │ 🟢 bullish│ │ 🟢 bullish │ │
│  └─────────────┘ └────────────┘ └─────────────┘ │
├─────────────────────────────────────────────────┤
│  「横盘吸筹」阶段时间线                          │
│                                                 │
│  ✅窄幅震荡  →  🔵缩量吸筹  →  ⬜试盘突破  →  ⬜放量拉升  │
│  P:95%        P:82%        P:65%        P:52%  │
│  3-5天        1-2周        1-3天        2-5天  │
├─────────────────────────────────────────────────┤
│  当前阶段：缩量吸筹                              │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │
│  特征匹配: 成交量持续萎缩 ✅ | 巨鲸缓慢增仓 ✅    │
│             交易所余额下降 ✅ | MVRV低估 ✅      │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │
│  最大概率走向: 65% 概率进入「试盘突破」阶段     │
│  → 预计价格尝试突破箱体上沿，成交量小幅放大     │
│  → 若突破失败，回落继续吸筹（35% 概率）       │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │
│  反制策略: 在箱体下沿分批建仓，止损箱体下1.5ATR │
│  风险信号: 吸筹阶段可能持续数月，假突破概率较高 │
└─────────────────────────────────────────────────┘

免费用户看到的版本：
┌─────────────────────────────────────────────────┐
│  匹配剧本: 横盘吸筹 (82%)                        │
│  阶段: 窄幅震荡 → 缩量吸筹 → 试盘突破 → 放量拉升   │
│                                                 │
│  ┌───────────────────────────────────────┐  │
│  │  🔒 订阅专业版解锁完整推演内容           │  │
│  │                                       │  │
│  │  • 各阶段概率走向 • 反制策略          │  │
│  │  • 实时匹配度   • 风险信号          │  │
│  │                                       │  │
│  │     [立即订阅 $99/月]                 │  │
│  └───────────────────────────────────────┘  │
└─────────────────────────────────────────────────┘
```

#### Implementation Notes

- 新建 `frontend/app/(main)/playbook-sim/page.tsx`
- 新建 `frontend/lib/api/playbook-sim.ts` API 客户端
- Sidebar 导航新增「剧本推演」入口（位于「剧本案例」下方）
- 免费用户的模糊遮罩使用 CSS `blur(8px)` + 解锁引导卡片
- 解锁按钮跳转 `/settings/membership`

---

### Requirement D4: 剧本推演权限后台配置

**User Story:** As a 管理员, I want 在后台配置剧本推演功能的最低会员等级, so that 我可以灵活调整这个功能的开放范围

#### Acceptance Criteria

- **Given** 参数设置页面的「会员限制」分组
- **When** 管理员修改 `playbook_sim_min_level` 参数
- **Then** 前端根据新阈值决定是否展示完整内容或解锁引导

#### Implementation Notes

- 前端 `configs/page.tsx` 的会员限制分组新增: `playbook_sim_min_level`（默认 1，0=全部开放，2=仅旗舰）
- API 读取该配置判断返回完整数据还是脱敏骨架
- 前端也可以将 `membership/page.tsx` 的功能对比表加入「剧本推演」行

---

### Requirement D5: 剧本预测持久化 + 阶段自动验证

**User Story:** As a 用户, I want 每次剧本推演的结果被自动记录并跟踪验证, so that 我能看到这个剧本预测最终对了几个阶段、错了几个阶段

#### 核心设计

**数据库表: `playbook_predictions`**

```
| id | symbol | playbook_name | match_pct | current_stage_idx | stages_json | 
|    | created_at | verified_stages | status | final_accuracy |

stages_json 示例:
[
  {"name": "窄幅震荡", "predicted_phase": "accumulation", "status": "verified_correct"},
  {"name": "缩量吸筹", "predicted_phase": "accumulation", "status": "verified_correct"},
  {"name": "试盘突破", "predicted_phase": "testing", "status": "pending_verification"},
  {"name": "放量拉升", "predicted_phase": "markup", "status": "not_reached"}
]
```

**去重逻辑（解决不同时间不同用户问题）**

```
同一币种 + 同一剧本 + 4小时窗口内 → 合并为同一条记录（不重复创建）
同一币种 + 不同剧本 → 各自独立记录（市场变化导致剧本切换）
同一币种 + 同一剧本 + 超过4小时 → 新建独立记录（市场已变化）
```

**自动验证 Worker（Celery Beat 每小时运行）**

```python
# 伪代码
for prediction in active_predictions:  # status = "active"
    current_phase = phase_tracker.get_current_phase(prediction.symbol)
    expected_next = prediction.stages[prediction.current_stage_idx + 1].predicted_phase

    if current_phase == expected_next:
        # 当前阶段标记已验证✅，推进到下一阶段
        mark_stage_correct(prediction)
        prediction.current_stage_idx += 1
    elif phase_contradicts(current_phase, expected_next):
        # 阶段走向矛盾（如预测拉盘但实际出逃）→ 标记错误❌
        mark_stage_incorrect(prediction)
        prediction.status = "completed"
    elif stage_timeout(prediction):
        # 超时未进入下一阶段（根据 typical_duration 判断）
        mark_stage_timeout(prediction)

    # 所有阶段都已验证 → 计算最终准确率
    if all_stages_verified(prediction):
        prediction.final_accuracy = correct_count / total_stages
        prediction.status = "completed"
```

#### Acceptance Criteria

- **Given** 付费用户触发剧本推演
- **When** 推演结果生成
- **Then** 自动保存到 `playbook_predictions` 表
- **And** 4小时内同币种+同剧本的重复请求不会创建新记录
- **And** Celery Worker 每小时自动验证活跃预测的阶段转换
- **And** 阶段验证结果自动更新（✅正确 / ❌错误 / ⏳等待中）
- **And** 所有阶段验证完成后计算最终准确率

#### Implementation Notes

- 新建 DB 表 `playbook_predictions`（需 Alembic 迁移）
- 新建 `backend/workers/playbook_verify_worker.py` — Celery Beat 每小时触发
- `playbook_sim_service.py` 的 `simulate()` 方法在生成结果后自动写入 DB（含去重逻辑）
- 验证逻辑复用 `phase_tracker._detect_phase_from_data()` 和 `_VALID_TRANSITIONS`
- 阶段超时判断：每个阶段的 `typical_duration` 转换为天数上限，超过 2倍视为超时

---

### Requirement D6: 剧本广场页面

**User Story:** As a 用户, I want 在剧本广场看到所有币种的剧本预测及其验证状态, so that 我能参考历史预测的准确率判断系统可信度

#### Acceptance Criteria

- **Given** 用户打开 `/playbook-plaza` 页面
- **When** 页面加载
- **Then** 显示：
  - **顶部概览栏**: 系统总预测数 / 阶段总准确率 / 热门剧本 top-3 准确率
  - **筛选栏**: 按币种 / 按剧本类型 / 按状态（活跃中/已完成）
  - **预测卡片列表**（按时间倒序）：
    - 币种 + 创建时间
    - 匹配剧本名 + 匹配度
    - 阶段时间线（带验证状态图标）
    - 当前准确率
- **And** 免费用户看到卡片列表但详情模糊 + 解锁引导
- **And** 卡片每 60秒 自动刷新验证状态

#### UI 草图

```
┌───────────────────────────────────────────────────────┐
│  剧本广场                                                  │
├───────────────────────────────────────────────────────┤
│  系统战绩                                                  │
│  ┌───────────────┐ ┌───────────────┐ ┌───────────────┐ │
│  │ 总预测数     │ │ 阶段准确率   │ │ 活跃跟踪中   │ │
│  │     128      │ │    71.3%    │ │      23     │ │
│  └───────────────┘ └───────────────┘ └───────────────┘ │
│  热门剧本: 横盘吸筹(78%) > 恐慌洗盘(74%) > 假突破(68%)  │
├───────────────────────────────────────────────────────┤
│  筛选: [全部币种▼] [全部剧本▼] [活跃中|已完成]       │
├───────────────────────────────────────────────────────┤
│                                                       │
│  🟢 BTCUSDT · 横盘吸筹 82% · 2月28日 14:30             │
│  ┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅  │
│  ✅窄幅震荡 → ✅缩量吸筹 → 🔵试盘突破 → ⬜放量拉升   │
│  阶段准确率: 2/2 = 100%  ·  ✉ 跟踪中                │
│  ┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅  │
│                                                       │
│  🔴 ETHUSDT · 假突破诱多 75% · 2月28日 10:15             │
│  ┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅  │
│  ✅放量突破 → ✅回落确认 → ❌加速下跌(未触发)        │
│  阶段准确率: 2/3 = 66.7%  ·  ✅ 已完成              │
│  ┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅  │
│                                                       │
└───────────────────────────────────────────────────────┘
```

#### Implementation Notes

- 新建 `frontend/app/(main)/playbook-plaza/page.tsx`
- 新建 `frontend/lib/api/playbook-plaza.ts` API 客户端
- 后端新增 API:
  - `GET /api/playbook-plaza/feed` — 分页列表（筛选: symbol, playbook, status）
  - `GET /api/playbook-plaza/stats` — 系统总战绩统计
- Sidebar 导航新增「剧本广场」入口（位于「剧本推演」下方）
- 免费用户: 卡片标题+匹配度可见，阶段详情和准确率模糊 + 解锁引导
- 60秒自动刷新（复用 `useQuery` 的 `refetchInterval`）

---

### Requirement D7: 剧本胜率整合到绩效体系

**User Story:** As a 管理员, I want 剧本预测的阶段准确率纳入系统绩效体系, so that 自主学习页面能看到剧本推演的整体表现

#### 胜率维度

| 维度 | 计算方式 | 展示位置 |
|------|----------|----------|
| 单条预测准确率 | 该条预测正确阶段数 / 总阶段数 | 广场卡片 |
| 剧本类型准确率 | 该类剧本所有预测的平均阶段准确率 | 广场顶部 + 学习页绩效回顾 |
| 系统总准确率 | 所有已完成预测的平均阶段准确率 | 广场顶部 + 管理后台 |

#### Acceptance Criteria

- **Given** 管理员打开自主学习页面的绩效回顾 Tab
- **When** 查看绩效数据
- **Then** 除了现有的策略胜率、智能体准确率外，新增「剧本推演准确率」板块：
  - 总阶段准确率
  - 按剧本类型的准确率排名
  - 按币种的准确率排名

#### Implementation Notes

- 学习模块的 `performance-review` API 新增 `playbook_accuracy` 字段
- 从 `playbook_predictions` 表聚合查询
- 前端绩效回顾 Tab 新增剧本准确率板块

---

## Part E: 币种管理功能

### 现状分析

后端 `SymbolRegistry` 已完善（DB 表 + 增/改/禁用 + 错误自动禁用 + 告警），但缺：
- 默认币种只有 5 个，需扩展到 10 个主流币
- 缺少删除 API 端点
- 没有后台管理 UI 页面（当前 14 个 admin 页面，无币种管理）

---

### Requirement E1: 默认币种扩展 + 删除 API

**User Story:** As a 管理员, I want 系统默认支持 10 个主流币并能删除不需要的币种, so that 系统只分析流动性好、不易被控盘的主流币

#### 推荐 10 个主流币

| # | 币种 | 显示名 | 链上数据 | 合约数据 | 状态 |
|---|------|--------|----------|----------|------|
| 1 | BTCUSDT | Bitcoin | ✅ | ✅ | 已有 |
| 2 | ETHUSDT | Ethereum | ✅ | ✅ | 已有 |
| 3 | BNBUSDT | BNB | ✅ | ✅ | 已有 |
| 4 | SOLUSDT | Solana | ✅ | ✅ | 已有 |
| 5 | XRPUSDT | XRP | ✅ | ✅ | 已有 |
| 6 | ADAUSDT | Cardano | ✅ | ✅ | 新增 |
| 7 | DOGEUSDT | Dogecoin | ❌ | ✅ | 新增 |
| 8 | AVAXUSDT | Avalanche | ✅ | ✅ | 新增 |
| 9 | LINKUSDT | Chainlink | ✅ | ✅ | 新增 |
| 10 | DOTUSDT | Polkadot | ✅ | ✅ | 新增 |

> 排除高波动山寨币、新兴小市值币和高度控盘币种。仅保留市值 Top-20 + Binance 高流动性的币种。

#### Acceptance Criteria

- **Given** 系统初始化时
- **When** `symbol_registry` 表为空
- **Then** 自动插入 10 个默认主流币
- **And** 管理员可通过 API 删除币种（设为 disabled，不物理删除，保留历史数据）

#### Implementation Notes

- `symbol_registry.py`: `DEFAULT_SYMBOLS` 扩展为 10 个，每个含完整配置
- 新增 `delete_symbol()` 方法（实际是设置 `enabled = false`，不物理删除）
- `api/symbols.py`: 新增 `DELETE /api/symbols/{symbol}` 端点（require_admin）
- 新增 `PUT /api/symbols/{symbol}` 端点（启用/禁用/修改配置，require_admin）
- 迁移脚本: 向 `symbol_registry` 表插入新增的 5 个币种

---

### Requirement E2: 币种管理后台页面

**User Story:** As a 管理员, I want 在后台有一个币种管理页面, so that 我可以随时增加、删除、启用、禁用币种

#### Acceptance Criteria

- **Given** 管理员打开 `/admin/symbols` 页面
- **When** 页面加载
- **Then** 显示币种列表表格：
  - 币种名称 + 显示名
  - 状态（启用/禁用）开关
  - 链上数据支持（✅/❌）
  - 合约数据支持（✅/❌）
  - 采集间隔
  - 错误计数
  - 操作（编辑/禁用/删除）
- **And** 可点击「添加币种」按钮弹出表单：
  - 币种代码（如 BTCUSDT）
  - 显示名称（如 Bitcoin）
  - 链上数据开关
  - 合约数据开关
  - 采集间隔（秒）
- **And** 禁用操作需二次确认

#### UI 草图

```
┌──────────────────────────────────────────────────────────┐
│  币种管理                                    [添加币种]  │
├──────────────────────────────────────────────────────────┤
│  币种     显示名    状态   链上  合约  间隔  错误  操作  │
├──────────────────────────────────────────────────────────┤
│  BTCUSDT  Bitcoin   🟢    ✅   ✅   60s   0    [编辑]  │
│  ETHUSDT  Ethereum  🟢    ✅   ✅   60s   0    [编辑]  │
│  BNBUSDT  BNB       🟢    ✅   ✅   60s   0    [编辑]  │
│  SOLUSDT  Solana    🟢    ✅   ✅   60s   0    [编辑]  │
│  XRPUSDT  XRP       🟢    ✅   ✅   60s   0    [编辑]  │
│  ADAUSDT  Cardano   🟢    ✅   ✅   60s   0    [编辑]  │
│  DOGEUSDT Dogecoin  🟢    ❌   ✅   60s   0    [编辑]  │
│  AVAXUSDT Avalanche 🟢    ✅   ✅   60s   0    [编辑]  │
│  LINKUSDT Chainlink 🟢    ✅   ✅   60s   0    [编辑]  │
│  DOTUSDT  Polkadot  🟢    ✅   ✅   60s   0    [编辑]  │
└──────────────────────────────────────────────────────────┘
```

#### Implementation Notes

- 新建 `frontend/app/(main)/admin/symbols/page.tsx`
- 新建 `frontend/lib/api/admin-symbols.ts` — 管理员 API 客户端（增删改查）
- Sidebar `adminNavItem.children` 新增「币种管理」入口
- 添加弹窗使用当前 UI 组件风格（dialog + form）
- 禁用/删除操作需二次确认弹窗

---

## Part F: 信号推送增强

### Requirement F1: 剧本阶段转换推送

**User Story:** As a 付费用户, I want 当我关注的币种发生剧本阶段转换时收到推送, so that 我能第一时间知道市场变化

#### Acceptance Criteria

- **Given** `playbook_verify_worker` 检测到阶段转换
- **When** 某币种的剧本从阶段A进入阶段B
- **Then** 通过 WebSocket `alerts` 频道推送通知
- **And** 同时通过 Telegram 推送（如用户已配置）
- **And** 推送内容示例：「BTCUSDT 剧本『横盘吸筹』阶段转换：缩量吸筹 → 试盘突破 (82%匹配)」

#### Implementation Notes

- 复用现有 `publish_stream("alerts", ...)` 和 Telegram 推送框架
- `playbook_verify_worker.py` 阶段转换时调用推送
- 前端 `/settings/push` 新增 `playbook_stage` 事件开关

---

### Requirement F2: 高置信信号推送

**User Story:** As a 付费用户, I want 当系统产生高置信度共识信号时收到推送, so that 我不会错过重要的交易机会

#### Acceptance Criteria

- **Given** 分析完成并产生共识信号
- **When** 信号置信度 ≥ 配置阈值（默认 0.7，后台可调）
- **Then** 推送通知：「ETHUSDT 强烈看涨信号 (置信度 85%，8/10 智能体一致)」
- **And** 推送阈值通过 `config_service` 控制（key: `signal_push_threshold`，默认 0.7）

#### Implementation Notes

- 在 `analysis_orchestrator.py` 共识生成后检查置信度，超阈值则推送
- 前端 `/settings/push` 新增 `high_confidence_signal` 事件开关
- 后台 `configs/page.tsx` 新增 `signal_push_threshold` 参数

---

### Requirement F3: 策略触达推送

**User Story:** As a 付费用户, I want 当我的策略触达止损或目标位时收到推送, so that 我能及时操作

#### Acceptance Criteria

- **Given** `PerformanceTracker.check_and_settle()` 检测到策略触达
- **When** 触达止损或目标位
- **Then** 推送：「SOLUSDT 做多策略已触达目标1 (+5.2%)」 或 「BTCUSDT 做多策略已触达止损 (-2.1%)」

#### Implementation Notes

- 复用现有 `settlement_worker` + 推送框架
- 前端 `/settings/push` 新增 `strategy_settlement` 事件开关

---

## Part G: 策略回测仪表盘

### Requirement G1: 回测统计 API

**User Story:** As a 用户, I want 看到「如果跟着系统做过去30天能赚多少」, so that 我能判断系统是否值得付费

#### Acceptance Criteria

- **Given** 用户打开 `/backtest` 页面
- **When** 选择时间范围和币种
- **Then** 显示：
  - 假设初始资金 $10,000，每次按系统信号操作
  - 总交易次数 / 胜率 / 总收益率
  - 最大回撒 / 盈亏比
  - 收益曲线图（按日）
  - 与「持有不动」的对比（benchmark）
- **And** 免费用户可看 7 天回测，付费用户可看 30/90/180 天

#### Implementation Notes

- 后端新增 `GET /api/backtest/summary` — 从 `strategy_snapshots` 表聚合
- 复用 `PerformanceTracker` 的结算数据，计算累计收益曲线
- 前端新建 `/backtest` 页面，使用 recharts 绘制收益曲线
- 免费用户限制通过 `config_service` 控制（key: `backtest_free_days`，默认 7）

---

## Part H: 免费试用机制

### Requirement H1: 新用户赠送 bonus_credits

**User Story:** As a 新用户, I want 注册后获得几次免费完整分析体验, so that 我能体验完整功能后再决定是否付费

#### 设计原则

- **不赠送专业版会员**，专业版只能付费开通
- 仅赠送 `bonus_credits`（分析次数），让免费用户体验完整模式的分析
- 赠送数量由后台管理员配置，可随时调整

#### Acceptance Criteria

- **Given** 新用户注册成功
- **When** 首次登录
- **Then** 自动获得 N 次 bonus_credits（默认 5 次，后台可调）
- **And** bonus_credits 可用于任意模式的分析（包括 Intraday/Trend）
- **And** 使用完后回到免费用户限制（仅 BTC + Scalping）
- **And** 后台可配置赠送数量（key: `new_user_bonus_credits`，默认 5）
- **And** 后台可配置是否开启赠送（key: `new_user_bonus_enabled`，默认 true）

#### Implementation Notes

- 注册流程中调用 `analysis_quota.add_bonus_credits(user_id, N)`
- N 从 `config_service` 读取（key: `new_user_bonus_credits`）
- 前端 `configs/page.tsx` 会员限制分组新增 2 个参数:
  - `new_user_bonus_credits`（默认 5，单位: 次）
  - `new_user_bonus_enabled`（默认 true）
- 前端注册成功页面显示「🎁 恐喜！赠送您 5 次完整分析体验」提示

---

## Requirements Summary

| # | 需求 | 优先级 | 工作量估算 |
|---|------|--------|-----------|
| A1 | 套餐定价动态化 | P1 | 小（后端 1 处 + 前端 2 处） |
| A2 | 分析配额管理 UI | P1 | 极小（仅前端新增 1 组配置项） |
| A3 | 会员功能对比表动态化 | P2 | 小（新增 1 个 API + 前端改造） |
| A4 | 会员时长多选项 | P2 | 中（支付流程 + 前端 UI） |
| B1 | 绩效回顾面板 | P1 | 中（新增 API + 图表页面） |
| B2 | 手动权重迭代 | P1 | 中（新增 API + 对比 UI） |
| B3 | 手动反思复盘触发 | P2 | 小（复用已有 API + 前端封装） |
| B4 | 信号校准工具 | P2 | 中（参数迁移 + UI） |
| B5 | 数据库维护工具 | P3 | 小（统计 + 清理 API） |
| B6 | 参数变更快照（防新旧冲突） | P1 | 小（changelog 表 + 标记） |
| D1 | 剧本模式结构化扩展 | P1 | 中（17个剧本补充阶段定义） |
| D2 | 剧本演练 API | P1 | 中（新增 Service + 路由） |
| D3 | 剧本演练前端页面 | P1 | 中（时间线 UI + 权限控制） |
| D4 | 剧本推演权限后台配置 | P2 | 小（新增 1 个 config） |
| D5 | 剧本预测持久化 + 自动验证 | P1 | 中（DB表 + Celery Worker） |
| D6 | 剧本广场页面 | P1 | 中（API + 前端页面） |
| D7 | 剧本胜率整合到绩效体系 | P2 | 小（聚合查询 + UI板块） |
| E1 | 默认币种扩展 + 删除 API | P1 | 小（扩展默认列表 + 2个新端点） |
| E2 | 币种管理后台页面 | P1 | 中（新增管理页面） |
| F1 | 剧本阶段转换推送 | P1 | 小（复用推送框架） |
| F2 | 高置信信号推送 | P1 | 小（置信度检查 + 推送） |
| F3 | 策略触达推送 | P1 | 小（复用结算 Worker） |
| G1 | 策略回测仪表盘 | P1 | 中（新增 API + 图表页面） |
| H1 | 新用户赠送 bonus_credits | P1 | 小（注册流程 + 2个 config） |
