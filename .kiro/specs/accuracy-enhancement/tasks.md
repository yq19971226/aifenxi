# Implementation Plan: accuracy-enhancement（分析准确率增强）

## Overview

按照数据模型 → 指标计算 → 数据采集 → 智能体 Prompt → 数据库迁移的顺序，逐步增强系统的量价分析和链上数据维度。每个步骤构建在前一步之上，确保增量可验证。

## Tasks

- [x] 1. 扩展数据模型（IndicatorResult + OnchainSnapshot）
  - [x] 1.1 在 `IndicatorResult` 中新增 4 个可选字段：`obv`、`vwap`、`volume_ratio`、`volume_price_divergence`，默认值 `None`
    - 文件：`backend/app/models/market_data.py`
    - `volume_price_divergence` 类型为 `Optional[str]`，取值 `"bullish_divergence"` | `"bearish_divergence"` | `"none"`
    - _Requirements: 5.1, 5.2_
  - [x] 1.2 在 `OnchainSnapshot` 中新增 6 个可选字段：`active_addresses`、`new_addresses`、`exchange_balance`、`large_tx_count`、`large_tx_volume`、`miner_reserve_change`，默认值 `None`
    - 文件：`backend/app/models/market_data.py`
    - _Requirements: 6.1, 6.2_
  - [x]* 1.3 编写属性测试：IndicatorResult 序列化 round-trip
    - **Property 7: IndicatorResult 序列化 round-trip**
    - **Validates: Requirements 5.3**
  - [x]* 1.4 编写属性测试：OnchainSnapshot 序列化 round-trip
    - **Property 8: OnchainSnapshot 序列化 round-trip**
    - **Validates: Requirements 6.3**

- [x] 2. 实现量价指标计算方法
  - [x] 2.1 在 `IndicatorCalculator` 中实现 `calculate_obv` 静态方法
    - 文件：`backend/app/data/indicators.py`
    - 规则：close[i] > close[i-1] 累加 volume，< 累减，== 不变；第一个值为 volume[0]；空列表返回空列表
    - _Requirements: 1.1, 1.2, 1.3_
  - [x]* 2.2 编写属性测试：OBV 累积规则正确性
    - **Property 1: OBV 累积规则正确性**
    - **Validates: Requirements 1.1, 1.2**
  - [x]* 2.3 编写属性测试：OBV 输出长度不变量
    - **Property 2: OBV 输出长度不变量**
    - **Validates: Requirements 1.2, 1.3**
  - [x] 2.4 在 `IndicatorCalculator` 中实现 `calculate_vwap` 静态方法
    - 文件：`backend/app/data/indicators.py`
    - 公式：累积(典型价格 × 成交量) / 累积(成交量)；累积成交量为零时返回 NaN
    - _Requirements: 2.1, 2.2, 2.3_
  - [x]* 2.5 编写属性测试：VWAP 公式正确性
    - **Property 3: VWAP 公式正确性**
    - **Validates: Requirements 2.1, 2.2**
  - [x] 2.6 在 `IndicatorCalculator` 中实现 `calculate_volume_ratio` 静态方法
    - 文件：`backend/app/data/indicators.py`
    - 公式：当前成交量 / 过去 N 根平均成交量；前 N 个值为 NaN；平均为零时返回 NaN
    - _Requirements: 3.1, 3.2, 3.3_
  - [x]* 2.7 编写属性测试：量比公式正确性与 NaN 前缀
    - **Property 4: 量比公式正确性与 NaN 前缀**
    - **Validates: Requirements 3.1, 3.2**
  - [x] 2.8 在 `IndicatorCalculator` 中实现 `detect_volume_price_divergence` 静态方法
    - 文件：`backend/app/data/indicators.py`
    - 顶背离：价格创窗口新高但 OBV 未创新高 → `"bearish_divergence"`；底背离反之 → `"bullish_divergence"`；否则 `"none"`
    - 空列表或数据不足返回 `"none"`
    - _Requirements: 4.1, 4.2, 4.3_
  - [x]* 2.9 编写属性测试：量价背离检测正确性
    - **Property 5: 量价背离检测正确性**
    - **Validates: Requirements 4.1, 4.2, 4.3**

- [x] 3. 集成量价指标到 calculate_all
  - [x] 3.1 修改 `IndicatorCalculator.calculate_all` 方法，在现有计算流程末尾调用 4 个新方法，将最新值填入 `IndicatorResult` 的新增字段
    - 文件：`backend/app/data/indicators.py`
    - 每个量价计算用 try/except 包裹，异常时对应字段设为 None，记录 warning 日志
    - _Requirements: 1.4, 2.4, 3.4, 4.4_
  - [x]* 3.2 编写属性测试：calculate_all 量价指标集成
    - **Property 6: calculate_all 量价指标集成**
    - **Validates: Requirements 1.4, 2.4, 3.4, 4.4**

- [x] 4. Checkpoint - 量价指标计算验证
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. 扩展链上数据采集（OnchainCollector）
  - [x] 5.1 在 `OnchainCollector` 中新增 5 个采集方法：`fetch_active_addresses`、`fetch_new_addresses`、`fetch_exchange_balance`、`fetch_large_transactions`、`fetch_miner_reserve_change`
    - 文件：`backend/app/data/onchain.py`
    - 每个方法 30s 超时（`asyncio.wait_for`），失败返回 None 并记录日志
    - _Requirements: 7.1, 7.2, 7.3_
  - [x] 5.2 修改 `OnchainCollector.collect_snapshot` 方法，在 `asyncio.gather` 中并行加入新增采集任务（`return_exceptions=True`），将结果填入 `OnchainSnapshot` 新增字段
    - 文件：`backend/app/data/onchain.py`
    - _Requirements: 7.1, 7.3, 7.4_
  - [x]* 5.3 编写属性测试：链上采集器单源故障隔离
    - **Property 9: 链上采集器单源故障隔离**
    - **Validates: Requirements 7.3**

- [x] 6. 重构 SentimentCollector 支持多源交叉验证
  - [x] 6.1 将 `backend/app/data/sentiment.py` 中的函数重构为 `SentimentCollector` 类，现有 `fetch_fear_greed_index` 逻辑迁移为 `fetch_fear_greed_alternative` 方法
    - 新增 `fetch_fear_greed_coinglass` 方法（CoinGlass 数据源，30s 超时）
    - 新增 `collect_sentiment` 方法：并行采集两源，两源有效时加权平均（Alternative 0.6 + CoinGlass 0.4），仅一源有效时使用该源值，全部失败返回 None
    - _Requirements: 8.1, 8.2, 8.3, 8.4_
  - [x] 6.2 更新 `OnchainCollector.collect_snapshot` 中对情绪数据的调用，改为使用 `SentimentCollector.collect_sentiment`
    - 确保 `fear_greed_index` 字段使用新的多源交叉验证结果
    - _Requirements: 8.2_
  - [x]* 6.3 编写属性测试：情绪数据加权平均
    - **Property 10: 情绪数据加权平均**
    - **Validates: Requirements 8.2, 8.4**

- [x] 7. Checkpoint - 数据采集层验证
  - Ensure all tests pass, ask the user if questions arise.

- [x] 8. TechnicalAgent Prompt 量价分析增强
  - [x] 8.1 修改 `_SYSTEM_PROMPT`，增加量价关系分析指导段落（要求 LLM 结合量价数据判断趋势真假）
    - 文件：`backend/app/agents/technical.py`
    - _Requirements: 9.2_
  - [x] 8.2 修改 `_build_user_prompt`，当 `IndicatorResult` 包含非 None 的量价字段时注入 OBV、VWAP、量比值；当 `volume_price_divergence != "none"` 时标注 `⚠️ 量价背离信号`
    - 文件：`backend/app/agents/technical.py`
    - _Requirements: 9.1, 9.3_
  - [x]* 8.3 编写属性测试：TechnicalAgent 量价 Prompt 注入
    - **Property 11: TechnicalAgent 量价 Prompt 注入**
    - **Validates: Requirements 9.1, 9.3**

- [x] 9. OnchainAgent Prompt 链上数据增强
  - [x] 9.1 修改 `_SYSTEM_PROMPT`，增加扩展链上指标解读指导（活跃地址、大额转账、矿工持仓与庄家阶段关联规则）
    - 文件：`backend/app/agents/onchain.py`
    - _Requirements: 10.2_
  - [x] 9.2 修改 `_build_user_prompt`，当 `OnchainSnapshot` 包含非 None 的扩展字段时注入对应数据；当 `large_tx_count` 可用时标注 `⚠️ 大额转账活跃`
    - 文件：`backend/app/agents/onchain.py`
    - _Requirements: 10.1, 10.3_
  - [x]* 9.3 编写属性测试：OnchainAgent 扩展数据 Prompt 注入
    - **Property 12: OnchainAgent 扩展数据 Prompt 注入**
    - **Validates: Requirements 10.1, 10.3**

- [x] 10. PlaybookAgent 和 ConsensusAnalyzer 数据注入
  - [x] 10.1 修改 `PlaybookAgent._build_user_prompt`，在技术指标段增加量价指标摘要，在链上数据段增加扩展字段
    - 文件：`backend/app/agents/playbook.py`
    - _Requirements: 11.1_
  - [x] 10.2 修改 `_build_deepseek_user_prompt`，在链上数据部分注入扩展字段（活跃地址、大额转账、矿工持仓等）
    - 文件：`backend/app/consensus/analyzers.py`
    - _Requirements: 11.2, 11.3_
  - [x] 10.3 修改 `_build_gemini_user_prompt`，在模式匹配部分注入量价指标数据（OBV、VWAP、量比、背离信号）
    - 文件：`backend/app/consensus/analyzers.py`
    - _Requirements: 11.2, 11.4_
  - [x]* 10.4 编写属性测试：PlaybookAgent 新增数据 Prompt 注入
    - **Property 13: PlaybookAgent 新增数据 Prompt 注入**
    - **Validates: Requirements 11.1**
  - [x]* 10.5 编写属性测试：ConsensusAnalyzer 专责数据注入
    - **Property 14: ConsensusAnalyzer 专责数据注入**
    - **Validates: Requirements 11.2, 11.3, 11.4**

- [x] 11. Checkpoint - 智能体 Prompt 增强验证
  - Ensure all tests pass, ask the user if questions arise.

- [x] 12. TimescaleDB 数据库迁移
  - [x] 12.1 创建迁移脚本 `backend/migrations/v7_accuracy_enhancement.sql`，使用 `ALTER TABLE onchain_snapshots ADD COLUMN IF NOT EXISTS` 为 6 个新增链上字段添加列
    - 列：`active_addresses INTEGER`、`new_addresses INTEGER`、`exchange_balance DOUBLE PRECISION`、`large_tx_count INTEGER`、`large_tx_volume DOUBLE PRECISION`、`miner_reserve_change DOUBLE PRECISION`
    - _Requirements: 12.1, 12.2_
  - [x] 12.2 更新 `OnchainCollector.collect_snapshot` 中写入 TimescaleDB 的逻辑，确保新增字段被持久化
    - _Requirements: 7.4, 12.1_

- [x] 13. Final Checkpoint - 全量验证
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- 属性测试使用 Hypothesis 库，测试文件：`backend/tests/test_accuracy_properties.py`
- 所有新增字段默认 None，保持向后兼容，不影响现有功能
- 链上采集方法遵循 30s 超时 + 降级模式，单源失败不影响其他
- Prompt 注入仅在字段非 None 时生效，None 字段不注入或标注"数据缺失"
