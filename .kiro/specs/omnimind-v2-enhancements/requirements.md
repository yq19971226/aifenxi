# 需求文档：OmniMind V2 增强功能

## 文档状态

- **当前定位**：本文件保留为 OmniMind V2 历史增强需求文档。
- **不再承担**：当前产品级主数据源定义。
- **说明**：文中出现的链上、合约、对话和多币种增强需求属于历史阶段扩展，不应直接替代当前四主源总纲。
- **当前主真相源**：请以 `four-primary-datasources` spec 为准。

## 简介

本文档定义 OmniMind 加密货币多智能体分析系统 V2 版本的五大增强功能模块需求。V2 在现有系统（4个智能体、NSED共识引擎、三级会员、推送模块）基础上，新增自定义预警规则、多币种支持、策略绩效追踪、AI对话助手和合约数据接入，全面提升系统的灵活性、覆盖面和可信度。

## 术语表

- **Alert_Rule_Engine**：预警规则引擎，负责解析、存储和评估用户自定义的预警条件
- **Alert_Rule**：用户创建的单条预警规则，包含条件表达式和通知配置
- **Condition_Expression**：预警条件表达式，由指标类型、比较运算符和阈值组成的结构化条件
- **Multi_Symbol_Scheduler**：多币种调度器，负责管理多个交易对的数据采集和分析任务
- **Symbol_Registry**：币种注册表，维护系统支持的交易对列表及其采集配置
- **Correlation_Analyzer**：关联分析器，计算币种间的价格和指标相关性
- **Performance_Tracker**：绩效追踪器，记录策略建议的后续市场表现并计算统计指标
- **Strategy_Snapshot**：策略快照，策略生成时刻的完整市场状态和建议参数的不可变记录
- **Chat_Agent**：AI对话智能体，处理用户自然语言查询并调用系统数据生成回答
- **Chat_Session**：对话会话，维护单个用户的对话上下文和历史消息
- **Derivatives_Collector**：合约数据采集器，从交易所获取资金费率、多空比和爆仓数据
- **Funding_Rate**：资金费率，永续合约多空双方定期交换的费用比率
- **Long_Short_Ratio**：多空比，持有多头与空头仓位的账户或金额比率
- **Liquidation_Event**：爆仓事件，因保证金不足被交易所强制平仓的记录
- **OmniMind_System**：OmniMind 系统整体，包含所有后端服务、智能体和前端界面

---

## 需求

### 需求 1：自定义预警规则创建与管理

**用户故事：** 作为加密货币交易者，我希望自定义监控条件（如"BTC跌破某个价位时通知我"），以便替代硬编码阈值，获得个性化的预警服务。

#### 验收标准

1. WHEN 用户提交包含指标类型、比较运算符和阈值的预警规则创建请求, THE Alert_Rule_Engine SHALL 验证条件表达式的合法性并将规则持久化到数据库
2. THE Alert_Rule_Engine SHALL 支持以下指标类型作为条件维度：价格（price）、RSI、MACD、EMA、布林带（bb_upper/bb_lower）、交易所净流入（exchange_netflow）、巨鲸持仓变化（whale_change_24h）、恐慌贪婪指数（fear_greed_index）、MVRV、资金费率（funding_rate）
3. THE Alert_Rule_Engine SHALL 支持以下比较运算符：大于（gt）、小于（lt）、大于等于（gte）、小于等于（lte）、穿越上方（cross_above）、穿越下方（cross_below）
4. WHEN 用户提交包含多个条件的预警规则, THE Alert_Rule_Engine SHALL 支持 AND 和 OR 逻辑组合，组合层级限制为2层
5. WHEN 用户请求查看预警规则列表, THE Alert_Rule_Engine SHALL 返回该用户所有规则，包含规则名称、条件描述、启用状态和最近触发时间
6. WHEN 用户请求修改或删除某条预警规则, THE Alert_Rule_Engine SHALL 仅允许操作该用户自己创建的规则
7. WHILE 用户会员等级为免费, THE Alert_Rule_Engine SHALL 限制该用户最多创建 3 条预警规则
8. WHILE 用户会员等级为专业, THE Alert_Rule_Engine SHALL 限制该用户最多创建 20 条预警规则
9. WHILE 用户会员等级为旗舰, THE Alert_Rule_Engine SHALL 限制该用户最多创建 100 条预警规则
10. IF 用户提交的条件表达式包含不支持的指标类型或运算符, THEN THE Alert_Rule_Engine SHALL 返回明确的错误信息，指出具体的非法字段


### 需求 2：预警规则实时评估与触发

**用户故事：** 作为加密货币交易者，我希望系统实时评估我的预警条件并在满足时立即通知我，以便及时做出交易决策。

#### 验收标准

1. WHEN 新的市场数据（价格、指标、链上快照）写入系统, THE Alert_Rule_Engine SHALL 在 5 秒内评估所有与该数据相关的已启用预警规则
2. WHEN 某条预警规则的条件被满足, THE Alert_Rule_Engine SHALL 通过用户已配置的推送渠道（WebSocket、Telegram、邮件）发送通知
3. WHEN 预警通知发送成功, THE Alert_Rule_Engine SHALL 记录触发时间、触发时的指标值和通知渠道到触发历史表
4. WHEN 某条预警规则在过去 5 分钟内已触发过, THE Alert_Rule_Engine SHALL 抑制重复触发，避免通知轰炸
5. WHEN 使用 cross_above 或 cross_below 运算符时, THE Alert_Rule_Engine SHALL 比较当前值与前一个数据点的值来判断穿越方向
6. IF Alert_Rule_Engine 在评估过程中遇到数据缺失（某指标无最新值）, THEN THE Alert_Rule_Engine SHALL 跳过该条件并记录警告日志，不触发该规则
7. WHEN 用户请求查看触发历史, THE Alert_Rule_Engine SHALL 返回最近 100 条触发记录，包含规则名称、触发时间、触发值和通知状态

### 需求 3：多币种数据采集与调度

**用户故事：** 作为加密货币交易者，我希望同时监控多个交易对（如 BTC、ETH、SOL），以便全面掌握市场动态。

#### 验收标准

1. THE Symbol_Registry SHALL 维护系统支持的交易对列表，每个交易对包含：交易对名称、采集间隔、启用状态和数据源配置
2. WHEN 管理员向 Symbol_Registry 添加新交易对, THE Multi_Symbol_Scheduler SHALL 在下一个调度周期内开始采集该交易对的行情数据
3. THE Multi_Symbol_Scheduler SHALL 为每个已启用的交易对独立运行 K线采集、指标计算和链上数据采集任务
4. WHILE 多个交易对的采集任务同时运行, THE Multi_Symbol_Scheduler SHALL 通过 Celery 任务队列并行执行，单个交易对的采集失败不影响其他交易对
5. WHEN 用户请求查看某个交易对的行情数据, THE OmniMind_System SHALL 返回与现有单币种接口格式一致的数据，通过 symbol 参数区分
6. THE Multi_Symbol_Scheduler SHALL 默认支持以下交易对：BTCUSDT、ETHUSDT、SOLUSDT、BNBUSDT、XRPUSDT
7. WHILE 用户会员等级为免费, THE OmniMind_System SHALL 限制该用户仅可查看 BTCUSDT 的数据
8. WHILE 用户会员等级为专业或旗舰, THE OmniMind_System SHALL 允许该用户查看所有已启用交易对的数据
9. IF 某个交易对的数据源连续 3 次采集失败, THEN THE Multi_Symbol_Scheduler SHALL 将该交易对标记为异常状态并发送告警通知给管理员

### 需求 4：多币种智能体分析与共识

**用户故事：** 作为加密货币交易者，我希望每个监控的交易对都能获得独立的智能体分析和共识报告，以便对不同币种做出针对性决策。

#### 验收标准

1. WHEN 某个交易对的最新数据采集完成, THE OmniMind_System SHALL 为该交易对独立触发 TechnicalAgent、OnchainAgent、PlaybookAgent 和 RiskAgent 的分析流程
2. WHEN 4 个智能体对某交易对的分析完成, THE OmniMind_System SHALL 为该交易对独立运行 NSED 三轮共识引擎
3. THE OmniMind_System SHALL 将每个交易对的智能体报告和共识结果分别存储，通过 symbol 字段区分
4. WHEN 用户请求查看策略或共识报告, THE OmniMind_System SHALL 支持按交易对筛选，默认返回用户关注列表中所有交易对的最新结果
5. IF 某个交易对缺少链上数据（如部分山寨币无 MVRV 数据）, THEN THE OnchainAgent SHALL 使用可用数据进行分析，并在报告中标注数据完整度


### 需求 5：币种关联分析

**用户故事：** 作为加密货币交易者，我希望了解不同币种之间的价格联动关系，以便发现跨币种的交易机会和风险传导。

#### 验收标准

1. THE Correlation_Analyzer SHALL 每小时计算所有已启用交易对之间的价格相关系数（Pearson），使用最近 7 天的 1 小时 K线收盘价
2. WHEN 两个交易对的相关系数绝对值超过 0.8, THE Correlation_Analyzer SHALL 将该关联关系标记为强相关
3. WHEN 两个交易对的相关系数在 30 分钟内变化超过 0.3, THE Correlation_Analyzer SHALL 生成关联异动告警
4. WHEN 用户请求查看关联分析, THE OmniMind_System SHALL 返回关联矩阵热力图数据，包含所有交易对两两之间的相关系数
5. WHILE 用户会员等级为免费, THE OmniMind_System SHALL 不提供关联分析功能
6. WHILE 用户会员等级为专业或旗舰, THE OmniMind_System SHALL 提供完整的关联分析功能

### 需求 6：策略绩效快照记录

**用户故事：** 作为加密货币交易者，我希望系统记录每次策略建议发出时的完整市场状态，以便后续准确评估策略表现。

#### 验收标准

1. WHEN OmniMind_System 生成一条新策略, THE Performance_Tracker SHALL 创建一条 Strategy_Snapshot，包含：策略ID、交易对、方向、入场区间、止损位、目标位、置信度、生成时价格、生成时间
2. THE Performance_Tracker SHALL 在策略生成后的 1小时、4小时、24小时、72小时 四个时间点自动记录该交易对的实际价格
3. WHEN 实际价格触达策略的止损位或任一目标位, THE Performance_Tracker SHALL 记录触达时间和触达价格，并将该策略标记为已结算
4. IF 策略在 72 小时内未触达止损位或目标位, THEN THE Performance_Tracker SHALL 以 72 小时后的价格作为最终结算价格，将该策略标记为超时结算
5. THE Performance_Tracker SHALL 为每条已结算策略计算盈亏百分比，计算公式为：(结算价格 - 入场中位价) / 入场中位价 × 100%（做空方向取反）

### 需求 7：策略绩效统计与展示

**用户故事：** 作为加密货币交易者，我希望查看系统策略建议的历史胜率和盈亏比，以便评估系统的实际准确率和可信度。

#### 验收标准

1. THE Performance_Tracker SHALL 计算以下统计指标：总策略数、已结算策略数、胜率（盈利策略数/已结算策略数）、平均盈利百分比、平均亏损百分比、盈亏比（平均盈利/平均亏损绝对值）
2. WHEN 用户请求查看绩效统计, THE OmniMind_System SHALL 支持按交易对、时间范围（7天/30天/90天/全部）和策略方向（多头/空头/全部）筛选
3. THE OmniMind_System SHALL 在仪表盘页面展示最近 30 天的胜率趋势折线图和累计盈亏曲线
4. WHEN 用户请求查看单条策略的绩效详情, THE OmniMind_System SHALL 返回该策略的完整快照、各时间点的实际价格和最终盈亏结果
5. THE OmniMind_System SHALL 按智能体维度统计各 Agent 的信号准确率，用于 NSED 共识引擎的动态权重调整
6. WHILE 用户会员等级为免费, THE OmniMind_System SHALL 仅展示最近 7 天的绩效摘要（胜率和总策略数）
7. WHILE 用户会员等级为专业或旗舰, THE OmniMind_System SHALL 展示完整的绩效统计和详情


### 需求 8：AI 对话助手核心交互

**用户故事：** 作为加密货币交易者，我希望通过自然语言直接向系统提问（如"BTC现在适合入场吗？"），以便快速获取分析结论而无需手动查看多个面板。

#### 验收标准

1. WHEN 用户发送自然语言消息, THE Chat_Agent SHALL 在 10 秒内返回基于系统实时数据的回答
2. THE Chat_Agent SHALL 支持以下查询类型：价格查询（"BTC现在多少钱"）、分析查询（"ETH适合入场吗"）、链上查询（"最近有大额转账吗"）、策略查询（"当前策略是什么"）、解释查询（"解释一下最近的链上异动"）
3. WHEN 用户提出分析类查询, THE Chat_Agent SHALL 调用相关智能体的最新报告和共识结果，综合生成回答
4. THE Chat_Agent SHALL 在回答中引用具体数据来源（如"根据最新链上数据，交易所净流入为 X BTC"），不生成无数据支撑的臆测
5. WHEN 用户的查询涉及特定交易对, THE Chat_Agent SHALL 自动识别交易对名称（支持 BTC、Bitcoin、比特币等别名映射）
6. IF 用户查询的交易对不在系统支持列表中, THEN THE Chat_Agent SHALL 返回提示信息，列出当前支持的交易对
7. THE Chat_Session SHALL 维护最近 20 条消息的上下文，支持多轮对话（如"那 ETH 呢？"承接上文的分析请求）

### 需求 9：AI 对话助手权限与限流

**用户故事：** 作为系统运营者，我希望对话助手的使用量按会员等级控制，以便合理分配 AI 调用资源。

#### 验收标准

1. WHILE 用户会员等级为免费, THE Chat_Agent SHALL 限制该用户每日最多 5 次对话查询
2. WHILE 用户会员等级为专业, THE Chat_Agent SHALL 限制该用户每日最多 50 次对话查询
3. WHILE 用户会员等级为旗舰, THE Chat_Agent SHALL 限制该用户每日最多 200 次对话查询
4. WHEN 用户的对话查询次数达到当日上限, THE Chat_Agent SHALL 返回友好提示，告知剩余额度和重置时间
5. THE Chat_Agent SHALL 使用 Redis 计数器记录每个用户的当日查询次数，计数器在每日 UTC 00:00 重置
6. THE Chat_Agent SHALL 记录每次对话的模型调用耗时和 token 用量，用于成本监控

### 需求 10：AI 对话前端界面

**用户故事：** 作为加密货币交易者，我希望在系统界面中有一个便捷的聊天窗口，以便随时与 AI 助手交互。

#### 验收标准

1. THE OmniMind_System SHALL 在前端提供可折叠的聊天侧边栏组件，默认收起状态，点击展开
2. WHEN 聊天侧边栏展开时, THE OmniMind_System SHALL 显示当前会话的历史消息，用户消息右对齐，AI回复左对齐
3. THE OmniMind_System SHALL 在 AI 回复中支持 Markdown 渲染，包括代码块、表格和加粗文本
4. WHEN Chat_Agent 正在生成回复时, THE OmniMind_System SHALL 显示流式打字效果（逐字显示）
5. WHEN 用户发送新消息, THE OmniMind_System SHALL 在输入框下方显示当日剩余查询次数
6. THE OmniMind_System SHALL 在聊天界面提供"新建会话"按钮，清空当前上下文并开始新对话

### 需求 11：合约数据采集

**用户故事：** 作为加密货币交易者，我希望系统接入永续合约的资金费率、多空比和爆仓数据，以便更全面地判断市场情绪和杠杆风险。

#### 验收标准

1. THE Derivatives_Collector SHALL 每 5 分钟从 Binance Futures API 采集以下数据：当前资金费率、预测资金费率、多空账户比、多空持仓量比、大户多空账户比、大户多空持仓量比
2. THE Derivatives_Collector SHALL 每 1 分钟从 Binance Futures API 采集最近的强制平仓（爆仓）订单数据
3. THE Derivatives_Collector SHALL 将资金费率和多空比数据写入 TimescaleDB 的 derivatives_snapshots 时序表
4. THE Derivatives_Collector SHALL 将爆仓事件写入 TimescaleDB 的 liquidation_events 时序表，每条记录包含：时间、交易对、方向（多/空）、数量、价格
5. THE Derivatives_Collector SHALL 为所有已启用交易对采集合约数据，采集范围与 Symbol_Registry 保持一致
6. IF Binance Futures API 调用失败, THEN THE Derivatives_Collector SHALL 记录错误日志并在下一个采集周期重试，连续 3 次失败后发送告警
7. THE Derivatives_Collector SHALL 将最新合约数据缓存到 Redis，资金费率 TTL 为 5 分钟，爆仓数据 TTL 为 1 分钟

### 需求 12：合约数据分析与智能体集成

**用户故事：** 作为加密货币交易者，我希望系统的智能体能综合合约数据进行分析，以便识别杠杆过热、轧空/轧多等市场信号。

#### 验收标准

1. WHEN 资金费率绝对值超过 0.1%, THE RiskAgent SHALL 生成资金费率异常告警，正值标记为多头过热，负值标记为空头过热
2. WHEN 1 小时内累计爆仓金额超过 5000 万美元, THE RiskAgent SHALL 生成大规模爆仓告警，包含多空方向和爆仓总额
3. WHEN 多空账户比偏离 1.0 超过 0.5（即大于 1.5 或小于 0.5）, THE RiskAgent SHALL 生成多空失衡告警
4. THE TechnicalAgent SHALL 在分析 Prompt 中包含最新的资金费率和多空比数据，作为辅助判断依据
5. THE PlaybookAgent SHALL 将合约数据纳入剧本匹配条件，资金费率极端值作为"假突破诱多"和"恐慌洗盘"剧本的辅助特征
6. THE OmniMind_System SHALL 在 MarketData 模型中新增 derivatives 字段，包含资金费率、多空比和近期爆仓汇总

### 需求 13：合约数据前端展示

**用户故事：** 作为加密货币交易者，我希望在界面上直观查看资金费率、多空比和爆仓数据，以便快速感知市场杠杆状态。

#### 验收标准

1. THE OmniMind_System SHALL 在仪表盘页面新增合约数据面板，展示当前资金费率（百分比，正值绿色负值红色）、多空账户比（柱状图）和 24 小时累计爆仓金额
2. THE OmniMind_System SHALL 提供资金费率历史趋势图，支持 7 天和 30 天时间范围切换
3. THE OmniMind_System SHALL 提供实时爆仓流水列表，展示最近 50 条爆仓事件，包含时间、交易对、方向、数量和价格
4. WHEN 发生大额爆仓事件（单笔超过 100 万美元）, THE OmniMind_System SHALL 在爆仓流水列表中高亮显示该条记录
5. WHILE 用户会员等级为免费, THE OmniMind_System SHALL 仅展示资金费率当前值，不提供历史趋势和爆仓流水
6. WHILE 用户会员等级为专业或旗舰, THE OmniMind_System SHALL 展示完整的合约数据面板和历史数据
