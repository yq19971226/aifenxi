# Requirements Document

## Introduction

本特性旨在通过增加量价分析维度和丰富链上数据指标，提升庄家视角多智能体分析系统的分析准确率和信号命中率。当前系统技术指标仅覆盖价格维度（EMA/RSI/MACD/布林带/ATR），缺少成交量分析；链上数据仅有 4 个字段（exchange_netflow, whale_change_24h, fear_greed_index, mvrv），维度不足以支撑精准的庄家行为判断。

## Glossary

- **Indicator_Calculator**: 技术指标计算模块，负责基于 K 线数据计算各类技术指标，纯 Python + numpy 实现
- **OBV**: On-Balance Volume，能量潮指标，通过累积成交量判断资金流向
- **VWAP**: Volume Weighted Average Price，成交量加权均价，衡量机构交易成本
- **Volume_Ratio**: 量比，当前成交量与过去 N 周期平均成交量的比值，衡量交易活跃度变化
- **Volume_Price_Divergence**: 量价背离，价格创新高/新低但成交量未同步放大的现象，是趋势反转的核心信号
- **Onchain_Collector**: 链上数据采集模块，负责从外部 API 获取链上指标数据
- **Sentiment_Collector**: 情绪数据采集模块，负责从多个数据源获取市场情绪指标
- **Technical_Agent**: 技术分析智能体，基于技术指标数据调用 LLM 生成交易信号
- **Onchain_Agent**: 链上解读智能体，基于链上数据调用 LLM 解读庄家行为阶段
- **Playbook_Agent**: 剧本推演智能体，综合多维数据匹配庄家操盘剧本
- **Consensus_Analyzer**: 共识引擎分析器，4 个模型各司其职进行多维分析
- **IndicatorResult**: 技术指标结果数据模型
- **OnchainSnapshot**: 链上数据快照数据模型
- **MarketData**: 市场数据聚合模型，包含 K 线、指标、链上、合约等全部数据

## Requirements

### Requirement 1: OBV（能量潮）指标计算

**User Story:** As a 交易者, I want 系统计算 OBV 指标, so that 我能通过累积成交量判断资金流入流出方向

#### Acceptance Criteria

1. WHEN 一组包含收盘价和成交量的 K 线数据被提供, THE Indicator_Calculator SHALL 计算 OBV 序列，规则为：当收盘价高于前一根收盘价时累加成交量，低于时累减成交量，相等时 OBV 不变
2. THE Indicator_Calculator SHALL 返回与输入 K 线等长的 OBV 列表，第一个值为该根 K 线的成交量
3. IF 输入 K 线列表为空, THEN THE Indicator_Calculator SHALL 返回空列表
4. WHEN calculate_all 方法被调用, THE Indicator_Calculator SHALL 在返回的 IndicatorResult 中包含最新的 OBV 值

### Requirement 2: VWAP（成交量加权均价）指标计算

**User Story:** As a 交易者, I want 系统计算 VWAP 指标, so that 我能判断当前价格相对于机构平均成本的位置

#### Acceptance Criteria

1. WHEN 一组包含最高价、最低价、收盘价和成交量的 K 线数据被提供, THE Indicator_Calculator SHALL 计算 VWAP 序列，公式为：累积(典型价格 × 成交量) / 累积(成交量)，其中典型价格 = (最高价 + 最低价 + 收盘价) / 3
2. THE Indicator_Calculator SHALL 返回与输入 K 线等长的 VWAP 列表
3. IF 某根 K 线的累积成交量为零, THEN THE Indicator_Calculator SHALL 对该位置返回 NaN
4. WHEN calculate_all 方法被调用, THE Indicator_Calculator SHALL 在返回的 IndicatorResult 中包含最新的 VWAP 值

### Requirement 3: 量比指标计算

**User Story:** As a 交易者, I want 系统计算量比指标, so that 我能快速判断当前交易活跃度是否异常

#### Acceptance Criteria

1. WHEN 一组 K 线数据和回看周期 N（默认 20）被提供, THE Indicator_Calculator SHALL 计算量比序列，公式为：当前成交量 / 过去 N 根 K 线的平均成交量
2. THE Indicator_Calculator SHALL 返回与输入 K 线等长的量比列表，前 N 个值为 NaN
3. IF 过去 N 根 K 线的平均成交量为零, THEN THE Indicator_Calculator SHALL 对该位置返回 NaN
4. WHEN calculate_all 方法被调用, THE Indicator_Calculator SHALL 在返回的 IndicatorResult 中包含最新的量比值

### Requirement 4: 量价背离检测

**User Story:** As a 交易者, I want 系统自动检测量价背离, so that 我能及时发现趋势可能反转的信号

#### Acceptance Criteria

1. WHEN 一组 K 线数据和回看窗口（默认 20 根）被提供, THE Indicator_Calculator SHALL 检测顶背离：价格创窗口内新高但 OBV 未创新高
2. WHEN 一组 K 线数据和回看窗口被提供, THE Indicator_Calculator SHALL 检测底背离：价格创窗口内新低但 OBV 未创新低
3. THE Indicator_Calculator SHALL 返回背离检测结果，包含背离类型（"bullish_divergence" 表示底背离看涨、"bearish_divergence" 表示顶背离看跌、"none" 表示无背离）
4. WHEN calculate_all 方法被调用, THE Indicator_Calculator SHALL 在返回的 IndicatorResult 中包含最新的量价背离检测结果

### Requirement 5: IndicatorResult 数据模型扩展

**User Story:** As a 开发者, I want IndicatorResult 模型包含量价分析字段, so that 下游智能体能获取完整的量价数据

#### Acceptance Criteria

1. THE IndicatorResult SHALL 包含以下新增可选字段：obv（float 类型）、vwap（float 类型）、volume_ratio（float 类型）、volume_price_divergence（string 类型，取值为 "bullish_divergence"、"bearish_divergence" 或 "none"）
2. THE IndicatorResult SHALL 对所有新增字段设置默认值 None，保持与现有代码的向后兼容性
3. FOR ALL 有效的 IndicatorResult 对象, 序列化为字典再反序列化 SHALL 产生等价的 IndicatorResult 对象（round-trip 属性）

### Requirement 6: OnchainSnapshot 数据模型扩展

**User Story:** As a 开发者, I want OnchainSnapshot 模型包含更丰富的链上数据字段, so that 链上分析智能体能获得更多维度的数据支撑

#### Acceptance Criteria

1. THE OnchainSnapshot SHALL 包含以下新增可选字段：active_addresses（int 类型，活跃地址数）、new_addresses（int 类型，新增地址数）、exchange_balance（float 类型，交易所余额绝对值）、large_tx_count（int 类型，大额转账笔数）、large_tx_volume（float 类型，大额转账总金额）、miner_reserve_change（float 类型，矿工持仓变化百分比）
2. THE OnchainSnapshot SHALL 对所有新增字段设置默认值 None，保持与现有代码的向后兼容性
3. FOR ALL 有效的 OnchainSnapshot 对象, 序列化为字典再反序列化 SHALL 产生等价的 OnchainSnapshot 对象（round-trip 属性）

### Requirement 7: 链上数据采集扩展

**User Story:** As a 系统运维, I want 系统采集更多维度的链上数据, so that 分析智能体有足够的数据支撑判断

#### Acceptance Criteria

1. WHEN 链上数据采集任务被触发, THE Onchain_Collector SHALL 采集活跃地址数、新增地址数、交易所余额、大额转账笔数和金额、矿工持仓变化数据
2. THE Onchain_Collector SHALL 对每个外部 API 调用设置 30 秒超时控制
3. IF 某个链上数据源请求失败, THEN THE Onchain_Collector SHALL 记录错误日志并对该字段返回 None，其余字段的采集不受影响
4. THE Onchain_Collector SHALL 将采集到的链上数据写入 TimescaleDB onchain_snapshots 表

### Requirement 8: 多源情绪数据交叉验证

**User Story:** As a 交易者, I want 情绪数据来自多个独立数据源, so that 单一数据源的偏差不会误导分析判断

#### Acceptance Criteria

1. WHEN 情绪数据采集任务被触发, THE Sentiment_Collector SHALL 从至少两个独立数据源获取市场情绪指标
2. WHEN 多个数据源均返回有效数据, THE Sentiment_Collector SHALL 计算加权平均值作为综合情绪指数
3. IF 所有情绪数据源均请求失败, THEN THE Sentiment_Collector SHALL 记录错误日志并返回 None
4. IF 仅部分数据源返回有效数据, THEN THE Sentiment_Collector SHALL 使用可用数据源的值作为情绪指数，并在日志中记录缺失的数据源

### Requirement 9: Technical_Agent Prompt 量价分析增强

**User Story:** As a 交易者, I want 技术分析智能体能分析量价关系, so that 技术分析信号更加可靠

#### Acceptance Criteria

1. WHEN MarketData 中的 IndicatorResult 包含量价指标（OBV、VWAP、量比、量价背离）, THE Technical_Agent SHALL 将这些指标注入用户 prompt 中
2. THE Technical_Agent SHALL 在系统 prompt 中增加量价关系分析指导，要求 LLM 结合量价数据判断趋势真假
3. WHEN 量价背离被检测到, THE Technical_Agent SHALL 在 prompt 中标注背离信号并要求 LLM 重点关注

### Requirement 10: Onchain_Agent Prompt 链上数据增强

**User Story:** As a 交易者, I want 链上解读智能体利用更丰富的链上数据, so that 庄家行为阶段判断更加精准

#### Acceptance Criteria

1. WHEN MarketData 中的 OnchainSnapshot 包含扩展字段（活跃地址数、新增地址数、交易所余额、大额转账、矿工持仓变化）, THE Onchain_Agent SHALL 将这些数据注入用户 prompt 中
2. THE Onchain_Agent SHALL 在系统 prompt 中增加扩展链上指标的解读指导，包含各指标与庄家行为阶段的关联规则
3. WHEN 大额转账数据可用, THE Onchain_Agent SHALL 在 prompt 中标注大额转账信息并要求 LLM 分析其对庄家行为的指示意义

### Requirement 11: Playbook_Agent 和 Consensus_Analyzer 数据注入

**User Story:** As a 交易者, I want 剧本推演和共识引擎也能利用新增的量价和链上数据, so that 整个分析链路的准确率同步提升

#### Acceptance Criteria

1. WHEN MarketData 包含量价指标和扩展链上数据, THE Playbook_Agent SHALL 在用户 prompt 中包含量价指标摘要和扩展链上数据
2. WHEN MarketData 包含量价指标和扩展链上数据, THE Consensus_Analyzer 的各模型分析器 SHALL 在各自的用户 prompt 中包含与其职责相关的新增数据
3. THE Consensus_Analyzer 的 DeepSeek 分析器 SHALL 在链上数据部分注入扩展链上字段
4. THE Consensus_Analyzer 的 Gemini 分析器 SHALL 在模式匹配部分注入量价指标数据

### Requirement 12: TimescaleDB 存储扩展

**User Story:** As a 系统运维, I want 数据库能存储新增的链上数据字段, so that 历史数据可用于回测和趋势分析

#### Acceptance Criteria

1. THE onchain_snapshots 表 SHALL 包含以下新增列：active_addresses（INTEGER）、new_addresses（INTEGER）、exchange_balance（DOUBLE PRECISION）、large_tx_count（INTEGER）、large_tx_volume（DOUBLE PRECISION）、miner_reserve_change（DOUBLE PRECISION），所有新增列允许 NULL
2. THE 数据库迁移脚本 SHALL 使用 ALTER TABLE ADD COLUMN IF NOT EXISTS 语法，确保对已有数据库的安全升级
