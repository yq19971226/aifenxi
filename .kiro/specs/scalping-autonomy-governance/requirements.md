# Requirements Document — Analysis Modes 自治治理规范

## Introduction

本规范用于统一 `scalping`、`intraday`、`trend` 三种模式的真实产品语义、执行合同、数据质量协议与自治边界，使后续实施集中在同一套真相与治理框架下。

## Scope

覆盖：模式真相、周期合同、执行计划真相源、输出与状态协议、数据质量协议、标签与评估、自动调优白名单、晋升回滚、版本留痕、LLM 边界。

不覆盖：新增高成本数据源、自动下单执行、无约束扩张模型数量。

---

## Decision Log — 2026-03-07

- `Decision ID = DL-2026-03-07-analysis-modes-governance-v1`
- `Status = Conditional Approved`
- `Requirements = Approved`
- `Design = Approved with mandatory revisions`
- `Tasks = Revise before execution`
- `mode_contract` V1 必须先实现为静态单一真相模块，不引入重型 registry service
- `data_quality_snapshot` V1 仅保留 `interval_completeness`、`freshness`、`capability_state`、`missing_inputs`
- 自动晋升 `shadow/canary/champion` 初期只覆盖 `scalping`
- `intraday` / `trend` 初期只允许 `reliability recalibration`、`gate tuning`、`conservative fallback`
- 正式开发前必须补齐 mode budget、`trend` 分层返回、API 与前端兼容灰度方案

---

## Verification Notes — 2026-03-07

- Requirement `A2` 已按静态 `mode_contract` 冻结，`ALL_MODE_KLINE_INTERVALS` 从合同派生，并被 `multi_symbol_scheduler`、`kline_collector`、`kline_scheduler`、`kline_backfill`、`main.py` 调试入口与 `market.py` warmup 默认值共同消费，`1d/1w` 不再各自硬编码。
- Requirement `A3` 已在后端主链落地：`_dispatch_mode()` 统一构建 `ExecutionPlan` 与 `RunContext`，`trend` 与 `intraday` 均由 `resolved_agents` 驱动，不再分别维护长期分叉的 agent 真相。
- Requirement `A5` 已按 V1 最小集合落地，`calendar` 与 `orderbook` 运行时 capability state 已由 worker 任务写入并被 `data_quality_snapshot` 消费。
- Requirement `B2` 已由 `intraday` 的 `signal × confidence × agent_weight × reliability_weight` 聚合兑现，并允许按 `resolved_agents` 退化执行。
- Requirement `B3` 已由 `trend` 的 `1w bias`、defense / divergence / weekly bias post-agent gates 与“闸门先于策略生成”顺序兑现。

---

## Part A: 宪法层

### Requirement A1: 模式真相必须真实
- `scalping.engine_type` 必须是 `rule_engine`
- `intraday.engine_type` 必须是 `multi_agent_hybrid`
- `trend.engine_type` 必须是 `multi_agent_consensus`
- `trend` 的 `NSED` 与 defense 层必须作为执行链组件表达，不得混淆成前端 AI 数量宣传
- 前端文案、后端输出、日志、监控面板必须共享同一份 `mode_contract`

### Requirement A2: 周期合同必须冻结
- `scalping = 5m trigger / 15m context / 1h bias`
- `intraday = 15m trigger / 1h context / 4h bias`
- `trend = 4h trigger / 1d context / 1w bias`
- 自动系统不得修改三层周期结构
- `bias_interval` 必须进入过滤或闸门，而不只是提示词背景

### Requirement A3: 编排真相源必须统一
- 执行链必须遵循 `mode_contract -> capability_snapshot -> execution_plan -> executor`
- orchestrator 不得绕过合同长期维护分叉的硬编码 agent 列表
- `mode_contract` 必须声明核心 agents、可选 detectors、consensus 层、fallback 策略与预算

### Requirement A4: 输出协议必须统一
- `signal` 只能是 `bullish` / `bearish` / `neutral` / `blocked`
- `status` 只能是 `actionable` / `blocked` / `degraded`
- `blocked` 与 `degraded` 必须带 reason code
- 每条结果必须带 `engine_type`、`policy_version`、`param_set_id`、`mode_contract_version`、`data_quality_snapshot`
- `strategy` 必须含 entry / stop / target / horizon，或在 `blocked` 时明确不可执行

### Requirement A5: 数据质量必须是一等公民
- 每次分析必须生成 `data_quality_snapshot`
- 必须显式记录周期完整度、数据新鲜度、能力可用度、缺失输入清单
- 关键数据缺失时系统必须 `degraded` 或 `blocked`，不得静默忽略

### Requirement A6: 风险红线不得自动放宽
- 最低 RR、最大止损距离、最大回撤阈值、defense 风险阈值必须冻结
- 触发红线时系统必须 `blocked`、降级或回滚

---

## Part B: 算法与评估协议

### Requirement B1: 信号成败必须统一打标
- 每条信号必须使用 Triple Barrier 口径评估
- 必须明确 target / stop / horizon
- 不得用临时脚本各自定义“成功信号”

### Requirement B2: `intraday` 聚合必须纳入置信度与可靠度
- 顶层方向聚合不得只做固定权重投票
- 必须使用 `signal_value × confidence × agent_weight × reliability_weight`
- 缺失数据或降级能力必须反映到 `reliability_weight`

### Requirement B3: `trend` 必须真实消费周线偏置与防御闸门
- `1w bias` 必须参与过滤、降权或 `blocked` 决策
- defense 层必须先于策略生成决定可执行性
- `NSED` 主结论与 fallback 结论必须共享同一候选集和同一口径

### Requirement B4: 核心指标必须可审计
- 必须同时计算 `precision`、`payoff_ratio`、`expectancy`、`max_drawdown`
- `expectancy = WinRate * AvgWin - LossRate * AvgLoss`
- `coverage` 只作为约束，不作为主优化目标

---

## Part C: 自适应层白名单

### Requirement C1: 自动调优只能发生在白名单内
- 机器只能调整白名单参数
- 参数必须受上下限与步长约束
- 不得自动改模式真相、周期合同、风险红线、成本模型、输出协议

### Requirement C2: 调优应优先使用参数包
- 先定义 `conservative` / `balanced` / `aggressive` 等参数包
- 自动系统优先切换参数包，再做小幅微调
- `scalping` 可先落地参数包治理，`intraday` / `trend` 初期只允许可靠度重标定与有限阈值微调
- 不得直接进行无限制散装阈值搜索

### Requirement C3: 4小时快环不得改核心结构
- 快环只允许做小幅门槛调整、参数包切换、`blocked gate` 切换
- 核心权重、核心特征、评分结构只能在慢环调整

---

## Part D: 晋升与回滚

### Requirement D1: 新参数必须经过分级晋升
- 流程固定为 `shadow -> canary -> champion`
- 未通过前不得直接替换线上 champion
- 晋升必须满足样本充足、风险不过线、综合评分更优

### Requirement D2: 系统必须支持自动回滚
- 连续恶化、回撤超阈值、异常数据、低样本失真时必须自动回退
- 模式合同漂移、关键数据缺失、共识分歧过高时也必须支持回退到保守配置
- 回滚后必须冻结问题参数集并记录原因

---

## Part E: 观测、落库与 LLM 边界

### Requirement E1: 每条信号必须可追溯
- 必须落库 `policy_version`、`param_set_id`、`regime_id`、`engine_type`、`mode_contract_version`、`data_freshness_ms`
- 必须可回放任意历史信号对应的参数与市场状态
- 必须可审计本次 `execution_plan`、能力降级与 `blocked_reason`

### Requirement E2: LLM 只能做分析员，不能做生产写手
- LLM 可以做失败归因、异常聚类、建议生成
- LLM 不得直接写生产参数、修改红线、修改周期合同、直接晋升版本
- LLM 输出必须先经过白名单校验与自治流水线

---

## Success Criteria

完成标准：
- `scalping`、`intraday`、`trend` 的产品表达、引擎事实、周期合同完全一致
- 所有模式统一输出 `signal + status + blocked_reason + data_quality_snapshot`
- `intraday` 与 `trend` 的聚合、过滤、fallback 口径统一且可审计
- 自动优化只发生在白名单内，且全程可审计、可回滚
- 指标评估和标签协议统一，不再出现“回测正确、实盘失真”的多口径问题
