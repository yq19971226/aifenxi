# 分析报告 UI 重设计 — 任务清单

> Status: Draft
> Created: 2026-03-09

---

## Phase 0: 基础拆分（P0，阻塞后续所有任务）

### T0.1 提取常量和工具函数
- [ ] 创建 `components/analysis/constants.ts`
  - 迁移: FIELD_LABELS, HIDDEN_FIELDS, COLLAPSED_FIELDS, SECTION_ICONS, SECTION_GROUPS, BLOCKED_REASON_LABELS, _TEXT_REPLACEMENTS
  - Exit: 文件 < 250 行，类型导出正确
- [ ] 创建 `components/analysis/helpers.ts`
  - 迁移: fieldLabel, getSignalStyle, getSectionStatusStyle, isEmpty, isFallbackReasoning, formatPrice, formatValue, formatDirection, localizeText, formatCachedTime, modeLabel, getSectionIcon, groupSections
  - Exit: 文件 < 200 行，所有函数有正确类型签名

### T0.2 提取子组件
- [ ] 创建 `components/analysis/renderers.tsx`
  - 迁移: SignalRow, PriceLevels, DirectionBadge, ReasoningBlock, ObjectArrayTable, CollapsibleSection
  - Exit: 文件 < 200 行
- [ ] 创建 `components/analysis/StrategyCard.tsx`
  - 迁移: StrategyCard, StrategyRangeBar, ConfidenceRing
  - Exit: 文件 < 250 行
- [ ] 创建 `components/analysis/SectionCard.tsx`
  - 迁移: SectionCard, DataPairs
  - 从 renderers.tsx 导入通用渲染组件
  - 为每个 SectionCard 添加 `id={`section-${section.title}`}`（配合 AgentConsensusBar scrollTo）
  - Exit: 文件 < 250 行
- [ ] 创建 `components/analysis/KeyFindings.tsx`
  - 迁移: KeyFindingsSummary
  - Exit: 文件 < 80 行

### T0.3 验证拆分
- [ ] `AnalysisReport.tsx` 改为从子模块导入，验证功能不变
- [ ] 检查 `AnalysisPanel.tsx` 和 `consensus/page.tsx` 的 import path 是否正确更新
- [ ] `npx tsc --noEmit` 零错误
- [ ] `npm run build` 零错误
- [ ] 现有 Tab 系统和所有 section 渲染行为不变

---

## Phase 1: 三层架构（P0，核心体验改进）

### T1.1 AccentBorderCard 组件
- [ ] 创建 `components/analysis/AccentBorderCard.tsx`
  - Props: type('action'|'risk-medium'|'risk-high'), title, icon?, children
  - 桌面 border-left / 移动 border-top
  - risk-high 脉冲动画
  - Exit: 文件 < 60 行

### T1.2 操作建议色条
- [ ] 在 ExecutiveSummary 中，StrategyCard 下方新增操作建议色条
  - 标题动态生成: `建议做多 · 入场 $X ~ $Y` / `建议做空 · ...` / `观望等待`
  - 主体内容: 使用 strategy 结构化字段（direction + entry_low/entry_high + stop_loss + targets + risk_reward）
  - reasoning 作为折叠补充文本
  - 不显示条件: strategy 为 null 或 is_fallback === true
  - 使用 AccentBorderCard type='action'
  - Exit: 用户 3 秒内可见策略方向、点位和风险收益比

### T1.3 风险色条
- [ ] 从 report.sections 中提取 "风险评估" section 的 risk_level + key_risks
  - risk_level === 'low' → 不显示
  - risk_level === 'medium' → AccentBorderCard type='risk-medium'
  - risk_level === 'high' → AccentBorderCard type='risk-high'
  - 内容: key_risks 列表 + recommendations 首条
  - Exit: 高风险时用户有明确视觉警告

### T1.4 AgentConsensusBar
- [ ] 创建 `components/analysis/AgentConsensusBar.tsx`
  - 收起态: agent 数量 + 加权置信度 + 涨跌中性计数
  - 展开态: 各 agent 方向标签，可点击
  - onClick → `document.getElementById(`section-${title}`)?.scrollIntoView({ behavior: 'smooth' })` + 自动展开对应 SectionCard
  - P0 所有用户可见，会员模糊锁定推迟 P1
  - Exit: 文件 < 120 行

### T1.5 ExecutiveSummary 组合
- [ ] 创建 `components/analysis/ExecutiveSummary.tsx`
  - 组合: HeroSignal + StrategyCard + 操作建议色条 + 风险色条 + StatusBanner
  - Exit: 文件 < 200 行

### T1.6 DeepAnalysis Tab 系统
- [ ] 创建 `components/analysis/DeepAnalysis.tsx`
  - 迁移: Tab 导航 + SectionCard 列表编排
  - 删除 "概览" Tab（内容已上移到主流）
  - 保留 3 Tab: 智能体 / 市场结构 / AI 对抗
  - 支持 scrollTo 锚点（配合 AgentConsensusBar 跳转）
  - Exit: 文件 < 120 行

### T1.7 AnalysisReport 编排层
- [ ] 重写 `AnalysisReport.tsx` 为纯编排层
  - 组合: ExecutiveSummary + AgentConsensusBar + KeyFindings + DeepAnalysis + Footer
  - Exit: 文件 ≤ 150 行
- [ ] `npx tsc --noEmit` 零错误
- [ ] `npm run build` 零错误

---

## Phase 2: 分享卡片（P1，增长功能）

### T2.1 ShareCard 组件
- [ ] 创建 `components/analysis/ShareCard.tsx`
  - 白底研报风格布局
  - 内容: 方向 + 置信度 + AI 共识概况 + 时效标注
  - 不含绝对点位
  - 底栏品牌: 三级可配
- [ ] 安装 html2canvas 依赖
- [ ] ShareCard 组件使用 `next/dynamic` 懒加载，避免 html2canvas 影响首屏加载
- [ ] 分享按钮: 点击 → 弹出预览 → 一键保存 PNG
- [ ] 后台配置: system_configs 中 `share_card_brand_level` (1/2/3)
- [ ] 后台配置: system_configs 中 `share_card_domain` (域名文本)

### T2.2 集成入口
- [ ] AnalysisReport 顶部或 HeroSignal 右上角添加分享按钮图标
- [ ] 弹出 Modal 预览 ShareCard
- [ ] 底部 "保存图片" 按钮

---

## 验证标准

- [ ] 所有新文件 < 300 行
- [ ] AnalysisReport.tsx ≤ 150 行
- [ ] `npx tsc --noEmit` 零错误
- [ ] `npm run build` 零错误
- [ ] 现有分析报告渲染功能完整保留（无功能回退）
- [ ] 移动端 (< 768px) 色条正确显示为 border-top
- [ ] 风险色条条件显示逻辑正确（low 不显示）
