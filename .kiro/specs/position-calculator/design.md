# Design — 个性化仓位计算器

- **Status**: Reviewed (5-perspective review completed)

## Architecture

- 纯前端功能，后端零改动
- 计算逻辑封装在 `lib/utils/position-sizing.ts`
- 用户偏好通过 `lib/hooks/useTradePreferences.ts` 管理（localStorage）
- 三个数据源通过适配器统一为 `PositionInput` 接口

## Data Flow

```
用户设置偏好（localStorage）
         ↓
策略数据（3种来源）→ 适配器 → PositionInput → 计算引擎 → PositionResult → UI 展示
```

## Type Definitions

### StrategyData（类型化 AnalysisReport.strategy）

```typescript
interface StrategyData {
  symbol: string;
  direction: "long" | "short" | "neutral";
  entry_low: number;
  entry_high: number;
  stop_loss: number;
  targets: number[];
  confidence: number;
  valid_until: string;
  reasoning: string;
  risk_reward_ratio: number;
  is_worth_taking: boolean;
  snapped_fields: string[];
  is_fallback: boolean;
}
```

### TradePreferences（用户偏好）

```typescript
interface TradePreferences {
  capital: number;        // USDT，默认 10000
  leverage: number;       // 1/2/3/5/10/20，默认 1
  riskPct: number;        // 0.01/0.02/0.03/0.05，默认 0.02
  agreedDisclaimer: boolean;
  updatedAt: string;      // ISO 8601
}
```

### PositionInput（统一适配接口）

```typescript
interface PositionInput {
  entryPrice: number;     // (entry_low + entry_high) / 2
  stopLoss: number;
  targets: number[];      // 可为空（Dashboard 场景）
  direction: "long" | "short" | "neutral";
}
```

### PositionResult（计算结果）

```typescript
interface PositionResult {
  entryPrice: number;
  stopLoss: number;
  stopDistancePct: number;       // 止损距离百分比
  riskAmount: number;            // 风险金额 = capital × riskPct
  positionSize: number;          // 名义仓位
  margin: number;                // 保证金 = positionSize / leverage
  maxLoss: number;               // 最大亏损 = riskAmount
  targetResults: {
    price: number;
    profit: number;              // 该目标盈利金额
    profitPct: number;           // 盈利百分比
    riskRewardRatio: number;     // 该目标的 R:R
  }[];
}
```

## Adapters

### fromStrategy（综合分析页）

```typescript
function fromStrategy(s: StrategyData): PositionInput {
  return {
    entryPrice: (s.entry_low + s.entry_high) / 2,
    stopLoss: s.stop_loss,
    targets: s.targets,
    direction: s.direction,
  };
}
```

### fromDefenseStrategy（剧本推演页）

```typescript
function fromDefenseStrategy(d: DefenseStrategy): PositionInput {
  return {
    entryPrice: d.entry.price,
    stopLoss: d.stop_loss.price,
    targets: d.take_profit.map(tp => tp.price),
    direction: d.entry.price < d.stop_loss.price ? "short" : "long",
  };
}
```

### fromSymbolOverview（Dashboard 展开行）

```typescript
function fromSymbolOverview(o: SymbolOverview): PositionInput {
  return {
    entryPrice: ((o.entry_low ?? 0) + (o.entry_high ?? 0)) / 2,
    stopLoss: o.stop_loss ?? 0,
    targets: [],  // Dashboard 无 targets
    direction: o.direction as "long" | "short" | "neutral",
  };
}
```

## File Structure

| 文件 | 职责 | 预估行数 |
|---|---|---|
| `frontend/lib/types/strategy.ts` | StrategyData 类型定义 | ~25 |
| `frontend/lib/utils/position-sizing.ts` | 计算引擎 + 3 个适配器 + PositionInput/PositionResult 类型 | ~120 |
| `frontend/lib/hooks/useTradePreferences.ts` | localStorage 读写 hook | ~60 |
| `frontend/components/trade/PositionCalculator.tsx` | 完整版展示组件（分析/剧本页用） | ~180 |
| `frontend/components/trade/PositionSummary.tsx` | 简化版（Dashboard 展开行用，仅最大亏损） | ~50 |
| `frontend/components/trade/PreferenceSetupModal.tsx` | 首次引导弹窗 | ~120 |
| `frontend/components/trade/StrategyQualityBadge.tsx` | 策略质量标签组件 | ~30 |

## Integration Points

- 综合分析结果页（`frontend/app/(main)/consensus/page.tsx`）：策略卡旁侧嵌入 `PositionCalculator`
- 剧本推演结果页（`frontend/app/(main)/playbook-sim/page.tsx`）：反制策略卡旁侧嵌入 `PositionCalculator`
- Dashboard 页（`frontend/app/(main)/dashboard/page.tsx`）：展开行嵌入 `PositionSummary`
- 首次引导弹窗挂载在使用计算器的页面级别，不在全局 layout

## UI Layout（完整版 PositionCalculator）

```
┌──────────────────────────────────────────────┐
│  仓位计算器               ⚙ 修改偏好         │
│                                              │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐        │
│  │ 保证金   │ │ 名义仓位 │ │ 最大亏损 │        │
│  │ $1,200  │ │ $6,000  │ │ $200    │        │
│  └─────────┘ └─────────┘ └─────────┘        │
│                                              │
│  目标收益                                     │
│  TP1: $98,500  →  +$180 (R:R 1.5)           │
│  TP2: $101,000 →  +$520 (R:R 3.9)           │
│  TP3: $104,000 →  +$850 (R:R 6.4)           │
│                                              │
│  策略质量：可参考 🟡                           │
│                                              │
│  ───────────────────────────────────────────  │
│  以上为基于您输入参数的数学计算结果，            │
│  不构成投资建议                                │
└──────────────────────────────────────────────┘
```

## UI Layout（简化版 PositionSummary）

```
┌───────────────────────────────┐
│  若入场：保证金 $1,200         │
│  最大亏损：$200 (2%)          │
└───────────────────────────────┘
```

## Styling

- 遵循现有设计系统：`.card` / `.stat-value` / `.section-label` / `.badge` 类
- 颜色使用 CSS 变量 + Tailwind zinc 色阶
- 盈利用 `text-emerald-400`，亏损用 `text-red-400`
- 质量标签用 `badge` 类 + 对应颜色
- 弹窗用 `framer-motion` 动画，与系统其他弹窗风格一致
