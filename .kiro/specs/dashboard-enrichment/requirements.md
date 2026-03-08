# 需求文档：仪表盘内容丰富化

## 简介

当前仪表盘页面包含价格板（PriceBoard）、策略卡片（StrategyCard）、K线图（KlineChart）、合约数据面板（DerivativesPanel）和策略绩效摘要（PerformanceSummary）五个模块。本需求旨在新增三个仪表盘独有的模块，提供其他页面无法获取的综合决策信息：综合信号灯、推测胜率和市场情绪仪表盘。这些模块不与导航菜单中的独立页面（链上分析、共识引擎、预警管理等）内容重复，而是对多维度数据进行二次聚合，生成仪表盘专属的决策辅助视图。

## 术语表

- **Dashboard**：仪表盘主页面，路径 `/dashboard`
- **CompositeSignal**：综合信号灯组件，汇总所有智能体和共识引擎的结论，生成单一做多/做空/观望信号
- **WinRatePrediction**：推测胜率组件，基于历史策略绩效数据推测当前信号的预期胜率
- **MarketSentimentGauge**：市场情绪仪表盘组件，以半圆仪表盘形式可视化恐贪指数
- **ConsensusReport**：共识引擎报告数据模型，包含 consensus_signal（bullish/bearish/neutral）、consensus_confidence（0-1）、divergence（0-100）、model_votes、minority_warnings
- **PerformanceStats**：策略绩效统计数据模型，包含 win_rate、avg_profit_pct、avg_loss_pct、profit_loss_ratio、by_agent（各智能体准确率字典）
- **SentimentCollector**：情绪数据采集器，多源交叉验证获取恐贪指数（0-100）
- **MembershipLevel**：会员等级，0=免费、1=专业、2=旗舰

## 需求

### 需求 1：综合信号灯

**用户故事：** 作为加密货币交易者，我希望在仪表盘看到一个汇总所有智能体和共识引擎结论的综合信号，以便一眼获取"做多/做空/观望"的决策参考。

#### 验收标准

1. WHEN Dashboard 页面加载完成，THE CompositeSignal SHALL 展示一个综合信号，包含信号方向（做多/做空/观望）和综合置信度百分比
2. THE CompositeSignal SHALL 基于 ConsensusReport 的 consensus_signal 和 consensus_confidence 字段生成信号方向和置信度
3. WHEN consensus_signal 为 bullish，THE CompositeSignal SHALL 使用绿色主题并显示"做多"标签；WHEN consensus_signal 为 bearish，THE CompositeSignal SHALL 使用红色主题并显示"做空"标签；WHEN consensus_signal 为 neutral，THE CompositeSignal SHALL 使用灰色主题并显示"观望"标签
4. THE CompositeSignal SHALL 展示 ConsensusReport 的 divergence 值作为分歧度指标，divergence 大于 50 时附加"分歧较大"警示标签
5. WHEN ConsensusReport 数据不可用，THE CompositeSignal SHALL 展示"暂无信号数据"占位状态而非空白区域
6. WHILE MembershipLevel 为 0，THE CompositeSignal SHALL 仅展示信号方向，置信度和分歧度显示为锁定状态并提示升级

### 需求 2：推测胜率

**用户故事：** 作为加密货币交易者，我希望在仪表盘看到基于历史绩效推测的当前信号胜率，以便量化评估当前信号的可靠程度。

#### 验收标准

1. WHEN Dashboard 页面加载完成且 CompositeSignal 信号方向为做多或做空，THE WinRatePrediction SHALL 展示一个推测胜率百分比
2. THE WinRatePrediction SHALL 基于 PerformanceStats 的 by_agent 字段中各智能体准确率，按 ConsensusReport 的 weights 字段加权计算推测胜率
3. THE WinRatePrediction SHALL 同时展示 PerformanceStats 的整体 win_rate 作为历史基准胜率参考
4. THE WinRatePrediction SHALL 展示 PerformanceStats 的 avg_profit_pct 和 avg_loss_pct 作为历史平均盈亏参考
5. WHEN CompositeSignal 信号方向为观望，THE WinRatePrediction SHALL 展示"当前无方向性信号，不计算胜率"提示
6. WHEN PerformanceStats 的 settled_count 小于 5，THE WinRatePrediction SHALL 在胜率数值旁附加"样本不足"警示标签
7. WHEN PerformanceStats 数据不可用，THE WinRatePrediction SHALL 展示"暂无绩效数据"占位状态
8. WHILE MembershipLevel 为 0，THE WinRatePrediction SHALL 显示锁定覆盖层并提示升级

### 需求 3：市场情绪仪表盘

**用户故事：** 作为加密货币交易者，我希望在仪表盘看到一个直观的市场情绪指标可视化，以便一眼判断当前市场的恐慌或贪婪程度。

#### 验收标准

1. WHEN Dashboard 页面加载完成，THE MarketSentimentGauge SHALL 以半圆仪表盘形式可视化恐贪指数（0-100），指针指向当前数值位置
2. THE MarketSentimentGauge SHALL 将恐贪指数分为五个区间并使用对应颜色：极度恐慌（0-20，深红）、恐慌（21-40，红）、中性（41-60，灰）、贪婪（61-80，绿）、极度贪婪（81-100，深绿）
3. THE MarketSentimentGauge SHALL 在仪表盘中央显示当前恐贪指数数值和对应的情绪文字标签
4. WHEN 恐贪指数数据不可用，THE MarketSentimentGauge SHALL 展示"数据缺失"占位状态而非空白区域

### 需求 4：仪表盘布局与集成

**用户故事：** 作为加密货币交易者，我希望新增模块与现有模块布局协调，信息层次清晰，以便高效获取决策信息。

#### 验收标准

1. THE Dashboard SHALL 在 K线图与合约数据面板之间插入新增模块区域，按以下布局排列：综合信号灯与推测胜率并排一行，市场情绪仪表盘紧随其后
2. THE Dashboard SHALL 采用响应式网格布局：在大屏（lg 及以上）CompositeSignal 和 WinRatePrediction 使用两列并排，在移动端使用单列堆叠
3. THE Dashboard SHALL 对所有新增模块使用与现有模块一致的卡片样式（backdrop-blur、border-white/[0.08]、rounded-xl）
4. IF 任一新增数据模块加载失败，THEN THE Dashboard SHALL 在该模块位置展示错误提示卡片，其余模块正常渲染不受影响
5. WHEN 用户切换交易对，THE Dashboard SHALL 刷新 CompositeSignal、WinRatePrediction 和 MarketSentimentGauge 的数据
