# 分析报告 UI 重设计 — 需求文档

> Status: Draft
> Created: 2026-03-09
> Scope: 前端 AnalysisReport 组件拆分 + 三层信息架构 + 分享卡片

---

## 背景

当前 `AnalysisReport.tsx` 存在以下问题：

1. **文件 1749 行**，严重违反 300 行上限规范
2. **信息层级扁平**：Hero 信号卡 → 策略卡 → Tab(概览/智能体/结构/对抗)，用户需自行判断优先级
3. **操作建议和风险提示不醒目**：混在各 agent section 的 reasoning 中
4. **无分享能力**：暗色密集排版不适合截图传播，缺少增长引擎

## 目标

### R1. 三层信息架构

将报告从"数据倾泻"改为"编辑驱动的信息编排"：

| 层 | 内容 | 用户停留时间 |
|----|------|-------------|
| **Layer 1 — 执行摘要** | Hero 信号 + 策略点位前置 + 操作建议色条 + 风险色条（条件显示） | 1-3 秒 |
| **Layer 1.5 — Agent 共识条** | 一行紧凑的 agent 态度标签（可展开，可跳转） | 3-5 秒 |
| **Layer 2 — 关键发现** | 跨 agent 关键发现列表（5-10 条） | 5-15 秒 |
| **Layer 3 — 深度分析** | 各 agent SectionCard（默认折叠） | 按需 |

### R2. 研报色条风格

借鉴金融研报 UI 语言，在暗色主题上适配：

- **操作建议色条**：左侧 3-4px coral 色条 + 浅色底渲染
  - 标题动态生成：`建议做多 · 入场 $67,420 ~ $67,800` / `建议做空 · ...` / `观望等待 · 暂无明确方向`
  - 主体内容：使用 `strategy` 结构化字段（direction + entry_low/entry_high + stop_loss），不依赖 reasoning 文本截断
  - reasoning 作为折叠的补充文本
- **风险色条**：条件显示，低风险不显示，中风险 amber，高风险 red + Tailwind `animate-pulse`
- ~~共识总结条~~：推迟到 P1（NSED 共识报告保留在 Layer 3 SectionCard 中展示）
- 移动端适配：色条从 `border-left` 改为 `border-top`

### R3. Agent 共识条

- 默认收起，仅显示 `N AI 共识 · XX% 置信度`
- 展开后显示各 agent 的方向标签（▲▼●），可点击跳转到 Layer 3 对应 Section
- ~~免费用户看到模糊 + 锁定态~~ → P0 阶段所有用户可见，会员区分在 Layer 3 SectionCard 内容锁定中实现（已有机制）。模糊锁定推迟到 P1

### R4. 风险色条条件显示

从 RiskAgent 输出提取 `risk_level`：

| 风险等级 | UI 表现 |
|----------|---------|
| `low` | 不显示独立风险卡，在共识总结中一句带过 |
| `medium` | amber 色条，正常尺寸 |
| `high` | red 色条 + 加大 padding + 脉冲边框动画 |

### R5. 组件拆分

将 1749 行拆分为：

- `AnalysisReport.tsx` — 编排层（< 150 行）
- `components/analysis/ExecutiveSummary.tsx` — Layer 1
- `components/analysis/AgentConsensusBar.tsx` — Layer 1.5
- `components/analysis/KeyFindings.tsx` — Layer 2（从现有 KeyFindingsSummary 提取）
- `components/analysis/SectionCard.tsx` — Layer 3 单元（从现有代码提取）
- `components/analysis/StrategyCard.tsx` — 策略卡（已存在，需调整位置）
- `components/analysis/helpers.ts` — 工具函数（formatPrice, localizeText, fieldLabel 等）
- `components/analysis/constants.ts` — 常量（FIELD_LABELS, SECTION_ICONS, SECTION_GROUPS）
- `components/analysis/renderers.tsx` — 通用渲染子组件（SignalRow, PriceLevels, DirectionBadge, ReasoningBlock, ObjectArrayTable, CollapsibleSection）

每个文件 < 300 行。SectionCard 本体 + DataPairs 在 `SectionCard.tsx`，通用渲染组件在 `renderers.tsx`，避免单文件超限。

### R6. 分享卡片（P1）

- 白底研报风格，专用 `ShareCard.tsx` 组件
- 内容：方向 + 置信度 + AI 共识概况 + 时效标注
- **不含绝对点位**（避免社交风险）
- 底栏隐蔽品牌：三级可配（仅品牌名 / 品牌+域名 / 品牌+域名+描述）
- 域名以文字形式嵌入（非 URL 格式），避免平台广告检测
- 前端 html2canvas 生成 PNG，一键保存
- 推广等级由后台 system_configs 配置

---

## 约束

- C1. 不改后端 API/模型——后端 `StrategyResult` 已有 `entry_low/entry_high/stop_loss/targets/direction/risk_reward` 结构化字段
- C2. 不改后端 `RiskAgent` 输出——已有 `risk_level` + `key_risks` + `recommendations`
- C3. 遵循现有设计系统：CSS 变量、zinc 色阶、Lucide 图标、framer-motion 动画
- C4. 移动端优先适配（截图场景多为手机端）
- C5. 零 TypeScript 编译错误
