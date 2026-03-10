# 分析报告 UI 重设计 — 设计文档

> Status: Draft
> Created: 2026-03-09

---

## D1. 信息架构

```
┌─────────────────────────────────────────────────────────┐
│  Layer 1: ExecutiveSummary                              │
│  ┌───────────────────────────────────────────────────┐  │
│  │  HeroSignal (已有，微调)                           │  │
│  │  方向 + 置信度环 + 币种 + 模式 + 市场状态          │  │
│  └───────────────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────────────┐  │
│  │  StrategyCard (已有，提升位置)                     │  │
│  │  入场/止损/目标/盈亏比/价位分布条                   │  │
│  └───────────────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────────────┐  │
│  │  AccentBorderCard: 操作建议 (新增)                 │  │
│  │  左侧 coral 色条 · 标题动态生成（做多/做空/观望）   │  │
│  │  主体: direction + entry + stop_loss 结构化字段   │  │
│  │  reasoning 折叠补充                                │  │
│  └───────────────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────────────┐  │
│  │  AccentBorderCard: 风险提示 (新增，条件显示)       │  │
│  │  左侧 amber/red 色条 · RiskAgent key_risks 汇总   │  │
│  └───────────────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────────────┐  │
│  │  StatusBanner (已有)                               │  │
│  └───────────────────────────────────────────────────┘  │
├─────────────────────────────────────────────────────────┤
│  Layer 1.5: AgentConsensusBar (新增)                    │
│  默认收起: "10 AI 共识 · 78% 置信度  ▸"               │
│  展开后: 技术▲ 链上▲ 订单流▲ 舆情▼ 风险● 合约▲ ...   │
│  各标签可点击 → DOM id scrollIntoView Layer 3 SectionCard  │
│  P0 所有用户可见，会员模糊锁定推迟 P1                │
├─────────────────────────────────────────────────────────┤
│  Layer 2: KeyFindings (已有，提取为独立组件)            │
│  跨 agent 关键发现列表 (5-10 条)                       │
├─────────────────────────────────────────────────────────┤
│  Layer 3: DeepAnalysis (已有 Tab 系统，保留)            │
│  Tab: 智能体 | 市场结构 | AI 对抗                      │
│  每个 Tab 下 SectionCard 列表 (默认折叠)               │
├─────────────────────────────────────────────────────────┤
│  Footer: 时间戳 + 引擎版本                              │
└─────────────────────────────────────────────────────────┘
```

### 与现有架构的差异

| 现在 | 改后 |
|------|------|
| Hero → Strategy → StatusBanner → Tab(概览/智能体/...) | Hero → Strategy → **操作建议色条** → **风险色条** → StatusBanner → **AgentConsensusBar** → KeyFindings → Tab(智能体/结构/对抗) |
| 概览 Tab 包含 AgentVotingBoard + KeyFindings | AgentVotingBoard 删除，替换为 AgentConsensusBar（更紧凑）；KeyFindings 提升到 Tab 外 |
| 4 个 Tab（概览/智能体/结构/对抗） | 3 个 Tab（智能体/结构/对抗），概览内容上移到主流 |

## D2. AccentBorderCard 组件设计

通用色条卡片组件，接受以下 props：

```typescript
interface AccentBorderCardProps {
  type: 'action' | 'risk-medium' | 'risk-high';
  title: string;
  icon?: LucideIcon;
  children: React.ReactNode;
}
```

**样式映射：**

| type | 桌面端色条 | 移动端色条 | 背景渲染 | 标题色 |
|------|-----------|-----------|---------|--------|
| `action` | `border-l-[3px] border-l-rose-500` | `border-t-[3px] border-t-rose-500` | `bg-rose-500/[0.04]` | `text-rose-400` |
| `risk-medium` | `border-l-[3px] border-l-amber-500` | `border-t-[3px] border-t-amber-500` | `bg-amber-500/[0.04]` | `text-amber-400` |
| `risk-high` | `border-l-[3px] border-l-red-500` + pulse | `border-t-[3px] border-t-red-500` + pulse | `bg-red-500/[0.06]` | `text-red-400` |

**脉冲动画（仅 risk-high）：**
使用 Tailwind `animate-pulse` 类，与项目现有动画风格保持一致，不定义自定义 keyframes。

```tsx
// risk-high 时的容器类
<div className="animate-pulse border-l-[3px] border-l-red-500 bg-red-500/[0.06] ...">
```

## D3. AgentConsensusBar 组件设计

```typescript
interface AgentConsensusBarProps {
  sections: ReportSection[];
  onScrollToSection?: (title: string) => void;
  // scrollTo 实现：为每个 SectionCard 设置 id={`section-${title}`}
  // 点击后 document.getElementById(`section-${title}`)?.scrollIntoView({ behavior: 'smooth' })
}
```

**收起态：**
```
┌──────────────────────────────────────────────┐
│  🤖 10 AI 共识 · 78% 置信度   7涨 2跌 1中性  ▾  │
└──────────────────────────────────────────────┘
```

**展开态：**
```
┌──────────────────────────────────────────────┐
│  🤖 10 AI 共识 · 78% 置信度   7涨 2跌 1中性  ▴  │
│  ─────────────────────────────────────────    │
│  技术▲  链上▲  订单流▲  风险●  新闻▼          │
│  日历●  舆情▼  对抗▲   合谋●  合约▲          │
└──────────────────────────────────────────────┘
```

每个标签 `onClick` → 调用 `onScrollToSection(title)` → Layer 3 对应 SectionCard 滚动到视口并自动展开。

## D4. 数据提取逻辑

### 操作建议内容来源

```
标题动态生成：
  direction === "long"    → "👊 建议做多 · 入场 ${entry_low} ~ ${entry_high}"
  direction === "short"   → "👊 建议做空 · 入场 ${entry_low} ~ ${entry_high}"
  direction === "neutral" → "⏸ 观望等待 · 暂无明确方向"

主体内容：
  止损: report.strategy.stop_loss
  目标: report.strategy.targets[]
  盈亏比: report.strategy.risk_reward

补充文本（折叠）：
  report.strategy.reasoning → 非空且非降级时显示

不显示条件：
  strategy 为 null 或 is_fallback === true
```

### 风险色条内容来源

```
从 report.sections 中找 title === "风险评估" 的 section
→ section.data.risk_level → "high" | "medium" | "low"
→ section.data.key_risks → string[]
→ section.data.recommendations → string[]

如果找不到风险评估 section 或 risk_level === "low" → 不显示
```

### Agent 共识数据

```
从 report.sections 中过滤 status === "completed" 且 data.signal 存在的 section
→ 计算 counts: { bullish, bearish, neutral }
→ 加权置信度: 各 agent confidence 的均值
```

## D5. 文件拆分映射

| 新文件 | 行数预算 | 来源 |
|--------|---------|------|
| `components/analysis/AnalysisReport.tsx` | ≤ 150 | 编排层，组合子组件 |
| `components/analysis/ExecutiveSummary.tsx` | ≤ 200 | HeroSignal + StrategyCard + AccentBorderCards + StatusBanner |
| `components/analysis/AccentBorderCard.tsx` | ≤ 60 | 新建，通用色条卡片 |
| `components/analysis/AgentConsensusBar.tsx` | ≤ 120 | 新建，替代 AgentVotingBoard |
| `components/analysis/KeyFindings.tsx` | ≤ 80 | 提取自现有 KeyFindingsSummary |
| `components/analysis/SectionCard.tsx` | ≤ 250 | 提取自现有 SectionCard + DataPairs |
| `components/analysis/renderers.tsx` | ≤ 200 | SignalRow, PriceLevels, DirectionBadge, ReasoningBlock, ObjectArrayTable, CollapsibleSection |
| `components/analysis/StrategyCard.tsx` | ≤ 250 | 提取自现有 StrategyCard + StrategyRangeBar + ConfidenceRing |
| `components/analysis/DeepAnalysis.tsx` | ≤ 120 | Tab 系统 + SectionCard 列表编排 |
| `components/analysis/helpers.ts` | ≤ 200 | 工具函数：formatPrice, formatValue, localizeText, getSignalStyle 等 |
| `components/analysis/constants.ts` | ≤ 250 | FIELD_LABELS, SECTION_ICONS, SECTION_GROUPS, HIDDEN_FIELDS 等 |

**总计 ~11 个文件，每个 ≤ 300 行，替代原来 1 个 1749 行文件。**

## D6. 分享卡片设计（P1，本期不实现）

- `components/analysis/ShareCard.tsx` — 白底专用布局
- 内容：方向 + 置信度 + AI 共识概况 + 时效标注 + 隐蔽品牌底栏
- **不含绝对点位**
- 底栏三级推广：Level 1 `◇ AXIOM · v3.1` / Level 2 `+ 域名` / Level 3 `+ 描述`
- 使用 html2canvas 生成 PNG
- 推广等级从 system_configs 读取

## D7. 移动端适配

| 元素 | 桌面端 | 移动端 (< 768px) |
|------|--------|------------------|
| AccentBorderCard | `border-l-[3px]` | `border-t-[3px] border-l-0` |
| AgentConsensusBar 展开态 | 单行排列 | 两行折叠 |
| StrategyCard 价格网格 | `grid-cols-3` | `grid-cols-2` |
| Layer 3 Tab | 水平排列 | 可滚动 |
