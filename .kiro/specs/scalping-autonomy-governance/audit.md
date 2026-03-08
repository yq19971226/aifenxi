# Audit Notes — Analysis Modes Governance Closure

## Audit Scope

本次审计记录覆盖以下治理闭环：

- `calendar` / `orderbook` runtime capability writer 补齐
- `data_quality_snapshot.capability_state` 运行时真相源闭环
- `mode_contract` 周期合同对 `1d/1w` 的统一派生与调度收敛
- `ExecutionPlan` / `RunContext` 在 orchestrator 主链中的实际落地
- `trend` 与 `intraday` 的合同驱动执行收敛

## Closed Findings

### 1. Runtime capability truth source closed

- `calendar_worker.py` 与 `orderbook_worker.py` 已在任务级路径写入运行时 capability state。
- `calendar` 使用实际存在的配置字段 `settings.coinmarketcal_api_key`。
- `data_quality_snapshot` 已按运行时 capability truth source 读取 `calendar` / `orderbook` 状态。

### 2. K-line truth source unified

- `ALL_MODE_KLINE_INTERVALS` 已从 `mode_contract` 派生。
- 下列入口已统一消费合同派生周期全集：
  - `workers/multi_symbol_scheduler.py`
  - `workers/kline_collector.py`
  - `workers/kline_backfill.py`
  - `app/services/kline_scheduler.py`
  - `main.py` 调试 / 检查入口
  - `app/api/market.py` warmup 默认值
- `1d` / `1w` 不再由 scheduler / collector / debug warmup 各自维护独立硬编码全集。

### 3. Orchestrator execution truth unified

- `_dispatch_mode()` 已统一构建 `ExecutionPlan` 与 `RunContext`。
- `_run_trend()` 已由 `ExecutionPlan.resolved_agents` 驱动，并在 post-agent gates 之后才允许 strategy generation。
- blocked 的 `trend` 路径已跳过 signal aggregation / strategy generation。
- `_run_intraday()` 已由手工实例化 agent 列表迁移为 `resolved_agents` 驱动，不再保留长期分叉执行真相。

### 4. Aggregation and gating semantics aligned

- `intraday` 已使用 `signal × confidence × agent_weight × reliability_weight` 聚合。
- `trend` 已真实消费 `1w bias`、defense / divergence / weekly bias gates。
- `trend` 的闸门顺序已满足“先判定可执行性，再生成策略”。

## Verification Evidence

### Tests

- `backend/tests/test_capability_writers.py`
- `backend/tests/test_capability_worker_tasks.py`
- `backend/tests/test_kline_interval_contract.py`
- `backend/tests/test_analysis_orchestrator.py`

### Latest targeted regression

- Command intent: targeted pytest for governance + capability + kline truth source regressions
- Result: `18 passed`

## Code Evidence

- `backend/app/core/mode_contract.py`
- `backend/app/services/analysis_orchestrator.py`
- `backend/app/api/market.py`
- `backend/app/services/kline_scheduler.py`
- `backend/workers/multi_symbol_scheduler.py`
- `backend/workers/kline_collector.py`
- `backend/workers/kline_backfill.py`
- `backend/workers/calendar_worker.py`
- `backend/workers/orderbook_worker.py`

## Remaining Open Items

- `mode budget` 尚未在本规范闭环内落地
- `trend` 分层返回协议仍待单独设计 / 实现
- API / 前端兼容与灰度方案仍待跨端同步

## Archive Status

- 本次代码、规格、任务、审计记录已同步完成。
- 仓库内未发现 `change-check.sh`、既有 archive 目录或明确的仓内归档搬运脚本，因此未执行“严格闸门检查后移动归档目录”的仓内动作。
- 当前状态可视为：**文档闭环已完成，正式归档搬运依赖仓库后续补充归档基础设施。**
