# Requirements — 个性化仓位计算器

- **Status**: Reviewed (5-perspective review completed)
- **Implementation**: Not Started

## Scope

- 用户设置资金偏好（可用资金、杠杆倍数）
- 首次使用引导弹窗 + 持久化存储（localStorage，后续可扩展后端）
- 在综合分析 / 剧本推演结果页旁侧展示计算结果
- 在 Dashboard 展开行展示简化版（仅最大亏损）
- 纯数学计算工具，不构成任何投资建议

## Decisions

- 计算模型采用固定分数法（Fixed Fractional）：风险金额 / 止损距离
- 默认风险比例 2%，杠杆 1x，用户可自定义
- 超短线（scalping）模式不显示仓位计算器
- `is_fallback === true` 或 `direction === "neutral"` 时隐藏计算器
- 不做自动风险等级推荐和建议杠杆
- 后端零改动：所有数据已在 `StrategyResult.model_dump()` 中

## Out of Scope

- 后端持久化用户偏好（V1 用 localStorage）
- 自动下单 / 跟单功能
- 杠杆推荐或风险等级自动分类
- 多账户 / 多交易所支持
- 超短线模式的仓位计算

## R1 数据来源

- 综合分析结果页：`AnalysisReport.strategy`（`StrategyResult.model_dump()`）
  - 可用字段：`entry_low`, `entry_high`, `stop_loss`, `targets[]`, `confidence`, `direction`, `risk_reward_ratio`, `is_worth_taking`, `is_fallback`
- 剧本推演结果页：`DefenseStrategy`
  - 可用字段：`entry.price`, `stop_loss.price`, `take_profit[].price`, `confidence`
- Dashboard 展开行：`SymbolOverview`
  - 可用字段：`entry_low`, `entry_high`, `stop_loss`（无 targets）
- 三个数据源结构不同，前端需统一适配层

## R2 计算公式

- 入场中位价 = `(entry_low + entry_high) / 2`
- 止损距离 = `|入场中位价 - stop_loss|`
- 止损距离% = `止损距离 / 入场中位价`
- 风险金额 = `可用资金 × 风险比例`
- 名义仓位 = `风险金额 / 止损距离%`
- 保证金 = `名义仓位 / 杠杆倍数`
- 最大亏损 = `风险金额`（固定值，由用户设定的风险比例决定）
- 各目标盈利 = `名义仓位 × |target[i] - 入场中位价| / 入场中位价`
- 各目标盈亏比 = `|target[i] - 入场中位价| / |入场中位价 - stop_loss|`
- 后端已有 `risk_reward_ratio`（基于 target[0]），前端直接使用，不重复计算

## R3 用户偏好

- 可用资金（USDT）：正数，无上限，默认 10000。引导弹窗中输入框右侧标注 `USDT` 单位，避免与 USD 混淆
- 杠杆倍数：1x / 2x / 3x / 5x / 10x / 20x，默认 1x
- 风险比例：1% / 2% / 3% / 5%，默认 2%
- 存储方式：localStorage key `trade_preferences`
- 格式：`{ capital: number, leverage: number, riskPct: number, agreedDisclaimer: boolean, updatedAt: string }`

## R4 引导流程

- 首次使用（localStorage 无 `trade_preferences`）时触发引导弹窗
- 弹窗仅一步：设置资金 + 杠杆 + 风险比例 + 勾选免责声明
- 免责声明 checkbox 必须勾选才能提交
- 提交后写入 localStorage，后续不再弹出
- 用户可在计算器面板中随时修改偏好（齿轮图标）

## R5 展示规则

| 条件 | 行为 |
|---|---|
| `is_fallback === true` | 隐藏计算器，显示"数据不足，无法计算" |
| `direction === "neutral"` | 隐藏计算器，显示"当前无明确方向" |
| `is_worth_taking === false` | 显示计算结果 + 红色警告"策略盈亏比不足或置信度偏低" |
| 正常策略 | 显示完整计算结果 |
| 超短线（scalping）模式 | 不显示计算器 |
| Dashboard 展开行 | 仅显示简化版：入场价、止损价、最大亏损 |
| 移动端（< 768px） | 计算器从"旁侧"改为策略卡下方折叠面板（默认收起，点击展开） |

## R6 策略质量标签

- 基于后端已有的 `is_worth_taking` 和 `confidence` 字段
- `is_worth_taking && confidence >= 0.7` → "策略质量：优质"（绿色）
- `is_worth_taking && confidence < 0.7` → "策略质量：可参考"（黄色）
- `!is_worth_taking` → "策略质量：谨慎"（红色）

## R7 免责声明

- 首次设置弹窗中必须勾选免责 checkbox 才能使用
- 计算器面板底部常驻一行小字：`"以上为基于您输入参数的数学计算结果，不构成投资建议"`
- 不需要每次打开都重新勾选

## Current Repo Truth

- `AnalysisReport.strategy` 实际为 `StrategyResult.model_dump(mode="json")`，结构已确认（见 `backend/app/services/strategy.py:60-82`）
- 前端类型 `strategy: Record<string, unknown> | null` 需要类型化
- 三个模式（scalping/intraday/trend）+ fallback 都生成策略，链路在 `backend/app/services/analysis_orchestrator.py`
- `DefenseStrategy` 接口定义在 `frontend/lib/api/playbook-sim.ts`
- `SymbolOverview` 接口定义在 `frontend/lib/api/dashboard.ts`，无 targets 字段
- 用户偏好在 `users` 表中无对应字段，V1 用 localStorage

## Glossary

- **Fixed Fractional**：固定分数法，每笔交易风险固定为总资金的一个百分比
- **名义仓位**：不考虑杠杆时的总头寸价值（Position Size = Risk Amount / Stop Distance %）
- **保证金**：考虑杠杆后实际需要的资金（Margin = Position Size / Leverage）
- **Profit Factor**：总盈利 / 总亏损绝对值，衡量策略质量
- **R:R**：Risk-Reward Ratio，盈亏比

## User Stories

- 作为交易者，我希望在查看 AI 策略建议时，能看到基于我资金规模的具体仓位大小和预期盈亏
- 作为新手，我希望首次使用时有引导设置，不需要自己搞清楚所有参数
- 作为风险厌恶者，我希望看到最大亏损金额，让我心里有数
- 作为多币种操作者，我希望同一套偏好自动应用到所有策略
- 作为用户，我希望计算器告诉我策略质量好不好，而不是只给数字
