# Tasks — Analysis Modes 自治治理

## Execution Gate — 2026-03-07

- `Status = Conditional Approved`
- `Tasks Status = Revise before execution`
- 本任务清单允许进入 `P0`、`P1`、`P2`、`P3` 的详细拆分与实现准备
- `P4` 中 `intraday` / `trend` 的自动晋升与深度自治暂缓执行
- 正式启动前必须补齐 mode budget、`trend` 分层返回、API / 前端兼容与灰度方案
- `mode_contract` V1 按静态单一真相模块实施，不在本阶段平台化
- `data_quality_snapshot` V1 仅按最小字段集实施

## Progress Update — 2026-03-07

- 后端已完成并验证：`P1.1`、`P1.2`、`P2.2`、`P3.1`、`P3.2`。
- 后端已显著推进但仍有外部依赖或跨端收尾项：`P0.1`、`P0.2`、`P2.1`、`P3.3`。
- 本轮关闭的关键实现事实：
  - `mode_contract` 已成为静态单一真相，K 线周期全集由合同派生并统一注入 scheduler / collector / backfill / debug warmup。
  - `ExecutionPlan` 与 `RunContext` 已接入 orchestrator 主链；`trend` 与 `intraday` 均由 `resolved_agents` 驱动。
  - `calendar` 与 `orderbook` runtime capability writer 已落地，`data_quality_snapshot.capability_state` 以运行时真相源为准。
  - `trend` 的 post-agent gates 先于 signal aggregation / strategy generation 生效；blocked 路径跳过策略生成。
  - `intraday` 已使用 `signal × confidence × agent_weight × reliability_weight` 聚合，并允许按 `resolved_agents` 退化执行。
- 本轮回归证据：
  - `backend/tests/test_capability_writers.py`
  - `backend/tests/test_capability_worker_tasks.py`
  - `backend/tests/test_kline_interval_contract.py`
  - `backend/tests/test_analysis_orchestrator.py`
  - 定向回归结果：`18 passed`

## P0 模式真相与合同

### Task P0.1
- **Owner**: Product / Frontend / Backend
- [ ] 建立 `scalping`、`intraday`、`trend` 的 `mode_contract` 注册表
- [ ] 前端模式标签、`engine_type`、周期展示统一从合同派生
- **Exit Criteria**: 前后端能力表述一致，不再存在模式真相分叉

### Task P0.2
- **Owner**: Backend / Quant
- [ ] 固定 `5m/15m/1h`、`15m/1h/4h`、`4h/1d/1w`
- [ ] 让 `bias_interval` 真实进入 filter 或 gate
- **Exit Criteria**: 三种模式的周期合同可验证

## P1 编排与上下文

### Task P1.1
- **Owner**: Backend
- [ ] 引入 `capability_snapshot -> execution_plan -> executor` 流水线
- [ ] 用合同驱动的 planner 接管长期硬编码 agent 列表
- **Exit Criteria**: orchestrator 不再维护长期分叉的执行真相

### Task P1.2
- **Owner**: Backend
- [ ] 分离 `run_local_context` 与 `latest_cache_context`
- [ ] 禁止最近缓存参与当前 run 的关键因果决策
- **Exit Criteria**: 当前分析与缓存读取完全隔离

## P2 输出、状态与数据质量

### Task P2.1
- **Owner**: Backend / Frontend
- [ ] 补齐 `status`、`blocked_reason`、`data_quality_snapshot`、`mode_contract_version`
- [ ] 将 `actionable / blocked / degraded` 显式展示到前端
- **Exit Criteria**: 所有模式共享同一输出协议

### Task P2.2
- **Owner**: Backend / Data
- [ ] 生成 interval completeness、freshness、capability state、missing inputs
- [ ] 统一 `AVAILABLE / DEGRADED / UNAVAILABLE / TIER_LIMITED / DISABLED`
- **Exit Criteria**: 数据缺失不再静默吞没

## P3 算法与风控闸门

### Task P3.1
- **Owner**: Backend / Quant
- [ ] 将 `intraday` 改为 `signal × confidence × agent_weight × reliability_weight`
- [ ] 把缺失能力和低质量数据映射到 `reliability_weight`
- **Exit Criteria**: `intraday` 聚合不再是固定权重投票

### Task P3.2
- **Owner**: Backend / Quant
- [ ] 为 `trend` 引入 `1w bias` 过滤或降权
- [ ] 统一 `NSED` 与 fallback 的 candidate set、权重和 `blocked` 规则
- **Exit Criteria**: `trend` 的结构偏置与共识回退真实兑现

### Task P3.3
- **Owner**: Backend / Product
- [ ] 将 defense 层前置到策略闸门
- [ ] 在高风险、数据不全、共识分歧时允许系统拒绝交易
- **Exit Criteria**: 不确定时系统可以输出 `blocked` 而非硬给策略

## P4 评估与受控自治

### Task P4.1
- **Owner**: Backend / Quant
- [ ] 为三种模式统一 Triple Barrier 与成本口径
- [ ] 统一 `precision`、`payoff_ratio`、`expectancy`、`max_drawdown`
- **Exit Criteria**: 回测、影子、灰度、线上评估使用同一口径

### Task P4.2
- **Owner**: Quant / Backend
- [ ] 为 `scalping` 建立参数包、白名单、步长边界
- [ ] 将 `intraday` / `trend` 限制为可靠度重标定、闸门阈值微调与保守回退
- **Exit Criteria**: 自治只发生在白名单内，不做散装搜索

### Task P4.3
- **Owner**: Backend
- [ ] 建立 `Fast Loop`、`Slow Loop`、`shadow/canary/champion`
- [ ] 在合同漂移、关键数据缺失、共识分歧过高时自动回滚
- **Exit Criteria**: 新参数不能直替线上版本，异常时可自动回退

## P5 观测与 LLM 边界

### Task P5.1
- **Owner**: Backend / Product / Quant
- [ ] 落库 `mode_contract_version`、新鲜度、`execution_plan`、`blocked_reason`
- [ ] 支持按版本回放历史信号与审计降级路径
- **Exit Criteria**: 全链路可审计，任意一次分析可回放

### Task P5.2
- **Owner**: Backend / Product / Quant
- [ ] 限制 LLM 只做分析员与建议生成
- [ ] 禁止 LLM 直接改生产参数、红线、周期合同、晋升状态
- **Exit Criteria**: LLM 不直写生产配置，所有建议都经过白名单校验
