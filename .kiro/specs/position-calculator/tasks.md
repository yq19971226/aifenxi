# Tasks — 个性化仓位计算器

- **Status**: Reviewed (5-perspective review completed)

## P0 核心计算与类型

- [ ] 新增 `frontend/lib/types/strategy.ts`，定义 `StrategyData` 强类型接口，替代 `Record<string, unknown>`
- [ ] 将 `frontend/lib/api/analysis.ts` 中 `AnalysisReport.strategy` 类型从 `Record<string, unknown> | null` 改为 `StrategyData | null`，并导入 `StrategyData`
- [ ] 新增 `frontend/lib/utils/position-sizing.ts`，包含：
  - `PositionInput` / `PositionResult` 类型定义
  - `calculatePosition(input: PositionInput, prefs: TradePreferences): PositionResult` 核心计算函数
  - `fromStrategy(s: StrategyData): PositionInput` 适配器
  - `fromDefenseStrategy(d: DefenseStrategy): PositionInput` 适配器
  - `fromSymbolOverview(o: SymbolOverview): PositionInput` 适配器
- [ ] 新增 `frontend/lib/hooks/useTradePreferences.ts`，提供 `useTradePreferences()` hook：
  - `preferences: TradePreferences | null`（null 表示未设置，触发引导）
  - `savePreferences(prefs: TradePreferences): void`
  - `clearPreferences(): void`
  - localStorage key 为 `trade_preferences`

## P1 UI 组件

- [ ] 新增 `frontend/components/trade/PreferenceSetupModal.tsx`：首次引导弹窗
  - 资金输入（正数校验）、杠杆选择、风险比例选择
  - 免责声明 checkbox（必须勾选才能提交）
  - 使用 `framer-motion` 动画，遵循 `.card` / `.input` / `.btn-primary` 设计类
- [ ] 新增 `frontend/components/trade/StrategyQualityBadge.tsx`：策略质量标签
  - 输入：`is_worth_taking: boolean`, `confidence: number`
  - 输出：绿色"优质" / 黄色"可参考" / 红色"谨慎" badge
- [ ] 新增 `frontend/components/trade/PositionCalculator.tsx`：完整版计算器面板
  - 接收 `PositionInput` + `TradePreferences`
  - 展示：保证金、名义仓位、最大亏损、分档目标盈利与 R:R
  - 齿轮图标打开偏好修改弹窗
  - 底部常驻免责文案
  - 处理展示规则：`is_fallback` / `neutral` / `!is_worth_taking` 对应隐藏或警告
- [ ] 新增 `frontend/components/trade/PositionSummary.tsx`：简化版（Dashboard 用）
  - 仅展示：入场价、止损价、最大亏损金额和百分比
  - 无 targets 无需展示盈利分档

## P2 页面集成

- [ ] 综合分析结果页（`consensus/page.tsx`）：
  - 在策略卡旁侧集成 `PositionCalculator`
  - 超短线模式不显示
  - 首次使用时弹出 `PreferenceSetupModal`
- [ ] 剧本推演结果页（`playbook-sim/page.tsx`）：
  - 在反制策略卡旁侧集成 `PositionCalculator`
  - 使用 `fromDefenseStrategy` 适配器
- [ ] Dashboard 页（`dashboard/page.tsx`）：
  - 展开行中集成 `PositionSummary`
  - 使用 `fromSymbolOverview` 适配器
  - 用户未设置偏好时显示"设置资金偏好后查看仓位建议"提示

## P3 验证

- [ ] 验证计算精度：使用已知策略数据手动验算 positionSize / margin / maxLoss / targetProfit
- [ ] 验证三个适配器分别从 AnalysisReport / DefenseStrategy / SymbolOverview 正确转换
- [ ] 验证展示规则：is_fallback 隐藏、neutral 隐藏、!is_worth_taking 红色警告
- [ ] 验证 localStorage 持久化：刷新页面后偏好保留、清除后触发引导弹窗
- [ ] 验证响应式：移动端 PositionCalculator 堆叠排列，不被截断
- [ ] `tsc --noEmit` 零错误
