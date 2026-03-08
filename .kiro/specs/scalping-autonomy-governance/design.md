# Design Document — Analysis Modes 自治治理设计

## Overview

三种模式共用一套合同驱动治理设计：

- 产品真相冻结在 `mode_contract`
- 执行链由 `execution_plan` 驱动，而不是散落硬编码
- 系统先判定完整性与可执行性，再生成策略
- 自治分阶段推进：`scalping` 先做白名单自治，`intraday` / `trend` 先做收敛与校准

---

## Decision Constraints — 2026-03-07

- `Status = Conditional Approved`
- `Design Status = Approved with mandatory revisions`
- `mode_contract` V1 必须落为静态单一真相模块，不在本阶段引入重型 registry service
- `data_quality_snapshot` V1 必须保持最小集合：`interval_completeness`、`freshness`、`capability_state`、`missing_inputs`
- 自动晋升状态机初期仅绑定 `scalping`
- `intraday` / `trend` 初期仅允许可靠度重标定、闸门阈值微调与保守回退
- 正式实施前必须在设计中补齐 mode budget、`trend` 分层返回与 API / 前端兼容策略

---

## Implementation Notes — 2026-03-07

- `mode_contract` 已作为静态单一真相模块落地，并向下派生 `MODE_KLINE_INTERVALS` 与 `ALL_MODE_KLINE_INTERVALS`。
- `ExecutionPlan` 与 `RunContext` 已成为 orchestrator 主链输入，`_dispatch_mode()` 统一构建 execution plan / data quality / gates，再将上下文传入 `_run_scalping()`、`_run_intraday()`、`_run_trend()`。
- `trend` 已由 `resolved_agents + optional defense + consensus` 共同驱动，post-agent gates 先于 signal aggregation 与 strategy generation 生效，blocked 路径不再生成策略。
- `intraday` 已从手工实例化 agent 列表迁移为 `resolved_agents` 驱动，并保持 `signal × confidence × agent_weight × reliability_weight` 聚合。
- K 线周期全集已由合同派生，并被 scheduler / collector / backfill / debug warmup 入口统一消费，外围入口不再重复维护 `5m/15m/1h/4h/1d/1w`。
- `data_quality_snapshot` 已接入运行时 capability state；`calendar` 与 `orderbook` 通过 worker runtime writer 回写 capability truth source。
- 仍待后续单独收口的约束项：mode budget、`trend` 分层返回、API / 前端兼容灰度方案。

---

## D1. 真相契约

每个模式在注册表中冻结以下字段：

- `mode_id`
- `engine_type`
- `trigger_interval`
- `context_interval`
- `bias_interval`
- `core_agents`
- `optional_detectors`
- `consensus_layer`
- `defense_layer`
- `cost_model_id`
- `risk_profile_id`

当前合同基线：

- `scalping = rule_engine + 5m/15m/1h`
- `intraday = multi_agent_hybrid + 15m/1h/4h`
- `trend = multi_agent_consensus + 4h/1d/1w`

前端文案、后端输出、监控面板必须从同一份 `mode_contract` 派生，而不是各自硬编码。

---

## D2. 执行计划与上下文隔离

运行时统一经过以下流水线：

- `mode_contract`
- `capability_snapshot`
- `execution_plan`
- `executor`
- `report_assembler`

其中 `execution_plan` 至少声明：

- 必跑 agents
- 可选 detectors
- fallback candidate set
- timeout / token budget
- degraded 与 blocked 规则

上下文必须拆分为两类：

- `run_local_context`：本次分析内产生的结果，只服务本次因果链
- `latest_cache_context`：给前端与其他接口读取的最近结果，不得反向污染当前 run 的关键决策

---

## D3. 输出、状态与数据质量契约

每条结果至少包含：

- `signal`
- `status`
- `confidence`
- `entry`
- `stop_loss`
- `target`
- `horizon_minutes`
- `engine_type`
- `policy_version`
- `param_set_id`
- `mode_contract_version`
- `blocked_reason`
- `data_quality_snapshot`

`data_quality_snapshot` 至少包含：

- interval completeness
- data freshness
- capability state
- missing inputs

`status` 语义固定为：

- `actionable`：数据完整且闸门通过
- `degraded`：关键输入部分缺失，但仍允许输出降级判断
- `blocked`：风险、共识或数据条件不满足，禁止生成可执行策略

标签统一使用 Triple Barrier，评估共用同一份入场、成交、手续费、滑点口径。

---

## D4. 模式级算法与闸门

- `scalping` 继续保持 `rule_engine` 主导，只允许在白名单参数和 `blocked gate` 内自治
- `intraday` 顶层分数统一使用 `signal_value × confidence × agent_weight × reliability_weight`
- `intraday` 的 `4h` 作为 bias/filter，不允许退化为仅提示词背景
- `trend` 由 `NSED` 负责主共识，`1w bias` 必须参与过滤、降权或 `blocked`
- defense 层先决定是否可执行，再决定是否生成策略
- fallback 与主流程必须共享同一候选集、同一权重口径与同一 `blocked` 规则

---

## D5. 自适应层与晋升回滚状态机

自动调优分两级：

- 参数包切换：`conservative` / `balanced` / `aggressive`
- 参数包内微调：仅限白名单参数

模式推进策略：

- `scalping` 先落地参数包与门槛白名单
- `intraday` / `trend` 初期只允许可靠度重标定、闸门阈值微调与保守回退

禁止自动修改：

- `engine_type`
- 周期合同
- 成本模型
- 风险红线
- 输出协议
- 用户侧能力宣称

状态：

- `shadow`
- `canary`
- `champion`
- `frozen`
- `rolled_back`

流程：

1. 生成 challenger
2. 离线校验
3. `shadow`
4. `canary`
5. 晋升 `champion`

触发回滚：

- 滚动表现恶化
- 回撤超阈值
- 数据异常
- 低样本假优胜
- 模式合同漂移
- 关键数据缺失或 capability 大面积降级
- 共识分歧过高或 defense 风险超阈值

---

## D6. 观测与留痕

每条信号必须可追溯：

- `policy_version`
- `param_set_id`
- `regime_id`
- `engine_type`
- `mode_contract_version`
- `data_freshness_ms`
- `execution_plan`
- `blocked_reason`

必须支持按版本回放历史信号，并审计一次分析中的降级、过滤与回退路径。
