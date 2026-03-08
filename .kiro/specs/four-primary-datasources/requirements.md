# 需求文档：四大主数据源

## 文档状态

- **当前定位**：本文件是当前产品级主数据源架构的真相源文档。
- **主数据源范围**：`Binance`（盘面）、`CoinGlass`（衍生品）、`CryptoQuant`（链上）、`FRED`（宏观）。
- **替代关系**：产品级主数据源定义以本 spec 为准，不再以 `multi-datasource-management` 中的 `Exchange_Direct_Combo` 作为主架构依据。
- **兼容原则**：旧 spec 保留历史上下文和子域实现细节，但必须明确标注为旧方案、过渡方案或子域 spec，不得继续与本文件并列作为主真相源。

## 简介

构建统一的四大主数据源架构，将系统的一等数据源收敛为四个稳定职责域：

- `Binance`：盘面基础真相源
- `CoinGlass`：衍生品增强真相源
- `CryptoQuant`：链上真相源
- `FRED`：宏观真相源

该架构的目标不是简单罗列更多数据接口，而是明确每个能力域的**唯一 owner**、采集边界、降级策略和后台展示层级，避免旧时代“多个交易所拼成主架构”“新闻替代宏观真相”“辅助源与主源混展示”的长期混乱。

## 术语表

- **Primary_Data_Source**：主数据源，直接承担某一能力域的一等真相责任。
- **Capability_Owner**：能力 owner，某项业务能力的唯一主负责数据源。
- **Domain_Completeness**：域级完整度，分别衡量 market、derivatives、onchain、macro 四个域的可用程度。
- **Primary_Capability_Matrix**：主能力矩阵，记录能力名、owner、缓存键、API、消费者、降级路径和运行状态。
- **Auxiliary_Source**：辅助数据源，可补充信息，但不承担主真相责任。
- **Legacy_Source**：历史数据源或旧抽象，保留恢复可能性，但不应继续作为主配置展示。
- **Freshness**：数据新鲜度，表示数据距最近一次成功更新经过的时间。
- **Fallback_Policy**：降级策略，定义主数据源不可用时是否允许使用替代信号，以及替代后的可信度下降规则。

## 需求

### 需求 1：主数据源收敛与后台展示分层

**用户故事：** 作为系统管理员，我希望后台和规格层只把四个核心数据源当作一等主配置展示，以便系统边界清晰、运维入口干净。

#### 验收标准

1. THE System SHALL 将一等主数据源收敛为 `Binance`、`CoinGlass`、`CryptoQuant`、`FRED` 四个。
2. THE Admin_Panel SHALL 将四个主数据源以一等卡片或一等配置入口展示。
3. THE Admin_Panel SHALL 将其他数据源标记为 `辅助`、`已停用` 或 `后续可恢复`，不得继续与四个主源并列展示为主配置。
4. THE Primary_Data_Source spec SHALL 明确每个主数据源的职责域、缓存命名边界、健康状态和主要消费者。
5. THE System SHALL 为历史数据源和旧抽象保留恢复空间，但不得将其作为当前产品级主真相源。

### 需求 2：能力 owner 唯一化

**用户故事：** 作为系统架构维护者，我希望每个核心能力只由一个主数据源负责，以便避免多真相源冲突和消费者歧义。

#### 验收标准

1. THE Primary_Capability_Matrix SHALL 为每项核心能力指定唯一的 Capability_Owner。
2. THE System SHALL 将 `market` 域的主 owner 指定为 `Binance`。
3. THE System SHALL 将 `derivatives` 域的主 owner 指定为 `CoinGlass`。
4. THE System SHALL 将 `onchain` 域的主 owner 指定为 `CryptoQuant`。
5. THE System SHALL 将 `macro` 域的主 owner 指定为 `FRED`。
6. IF 某能力存在辅助来源，THEN THE Primary_Capability_Matrix SHALL 明确其为 fallback 或补充来源，而非并列主来源。
7. THE System SHALL 禁止继续把 `新闻关键词检测` 标记为宏观主真相源。

### 需求 3：域级完整度与统一降级协议

**用户故事：** 作为交易分析师，我希望看到的是市场域、衍生品域、链上域、宏观域是否完整，而不是旧时代按交易所权重拼凑的完整度分数。

#### 验收标准

1. THE System SHALL 以 `market`、`derivatives`、`onchain`、`macro` 四个域计算完整度，而不是继续以 `Binance/Bybit/OKX/Deribit` 组合权重作为产品主评分模型。
2. THE Analysis_Output SHALL 包含 `data_completeness`、`missing_domains`、`domain_status` 等统一字段。
3. THE Analysis_Output SHALL 在任一主域缺失时附加降级说明和可信度影响。
4. IF `macro` 或 `onchain` 域缺失，THEN THE System SHALL 显式标记为能力域缺失，而非静默忽略。
5. THE System SHALL 为每个域输出最近更新时间和 freshness 状态。

### 需求 4：Binance 作为盘面基础真相源

**用户故事：** 作为交易分析师，我希望盘面行情、成交和基础交易所衍生品信号由一个稳定源统一提供，以便所有上游和下游都围绕同一基线工作。

#### 验收标准

1. THE System SHALL 使用 `Binance` 作为盘面基础真相源。
2. THE Binance domain SHALL 覆盖价格、成交、K 线、最新价缓存、标记价和基础强平事件。
3. THE Binance domain MAY 提供基础资金费率和基础多空比，但其角色 SHALL 被定义为盘面基线而非全网衍生品增强层。
4. THE Primary_Capability_Matrix SHALL 将 `trade`、`ticker`、`kline`、`latest_price` 等核心盘面能力绑定到 `Binance`。
5. THE System SHALL 允许 `CoinGlass` 在衍生品域补充结构化信息，但不得替代 `Binance` 的盘面基础真相角色。

### 需求 5：CoinGlass 作为衍生品增强真相源

**用户故事：** 作为衍生品分析使用者，我希望系统用 CoinGlass 统一承载全网衍生品增强能力，而不是继续让多个旧交易所抽象争夺主解释权。

#### 验收标准

1. THE System SHALL 使用 `CoinGlass` 作为衍生品增强真相源。
2. THE CoinGlass domain SHALL 负责净持仓、主力多空比、Taker 方向、爆仓热力图、资金费率套利、CVD、NetFlow、订单簿增强、大单、期权增强等能力。
3. THE CoinGlass tier baseline SHALL 按 `Standard` 套餐规划主能力范围，作为当前生产目标档位。
4. THE CoinGlass domain SHALL 维护 capability status（如 `available`、`unavailable`、`disabled`、`tier_limited`）。
5. IF CoinGlass API V4 已移除某端点，THEN THE System SHALL 将其显式标记为 `unavailable`，不得继续把该端点当作主能力前提。
6. THE System SHALL 优先补齐已存在但未闭环的 Standard 级能力链路，包括 tier gate、worker、cache、API、consumer 和 capability matrix 的一致性。

### 需求 6：CryptoQuant 作为链上真相源

**用户故事：** 作为链上分析使用者，我希望系统把链上主能力正式收敛到 CryptoQuant，而不是让旧链上实现和历史描述继续漂浮不定。

#### 验收标准

1. THE System SHALL 使用 `CryptoQuant` 作为链上主真相源。
2. THE CryptoQuant domain SHALL 覆盖交易所流入流出、储备、地址/鲸鱼、矿工或其他明确选定的链上核心指标。
3. THE default planning baseline SHALL 按个人档预算设计，即 `20 requests/minute`，除非用户确认更高档位。
4. THE System SHALL 支持针对 `3-4` 个主币种、`10` 个左右核心指标的节流式采集方案。
5. THE Primary_Capability_Matrix SHALL 记录每个链上指标的 owner、缓存键、采集频率和 fallback 行为。
6. IF CryptoQuant 尚未实现，THEN THE spec SHALL 明确其为待落地主源，而非继续让历史辅助源默认承担主链上职责。

### 需求 7：FRED 作为宏观真相源

**用户故事：** 作为趋势分析使用者，我希望系统通过官方宏观数据序列而不是新闻猜测来理解美国宏观环境。

#### 验收标准

1. THE System SHALL 使用 `FRED` 作为宏观主真相源。
2. THE FRED domain SHALL 至少覆盖以下美国宏观序列中的一组核心白名单：CPI、Core CPI、失业率、初请失业金、联邦基金利率、GDP、PCE、PAYEMS。
3. THE FRED domain SHALL 通过官方 observations 接口采集数值时间序列。
4. THE FRED domain SHALL 支持 release 元数据和发布时间管理，用于宏观事件新鲜度判断。
5. THE FRED domain MAY 支持 vintage/revision 能力，但该能力 SHALL 被标记为可选增强，而非第一阶段强制项。
6. THE System SHALL 将新闻宏观关键词识别降级为 `宏观事件解释层` 或 `fallback`，不得继续作为宏观主真相源。

### 需求 8：主能力矩阵与文档一致性

**用户故事：** 作为系统维护者，我希望代码、后台和规格都围绕同一张主能力矩阵工作，以便减少多真相源和历史漂移。

#### 验收标准

1. THE System SHALL 维护一张面向四大主数据源的 Primary_Capability_Matrix。
2. THE Primary_Capability_Matrix SHALL 至少记录：`capability_key`、`owner_source`、`data_domain`、`runtime_writer`、`cache_key`、`api_endpoint`、`primary_consumers`、`fallback_policy`、`status_source`。
3. THE spec package SHALL 明确旧 spec 与当前主真相源 spec 的层级关系。
4. THE documentation cleanup SHALL 在旧 spec 顶部添加状态说明，解释其是否为：主真相源、子域 spec、旧方案或历史实现记录。
5. THE documentation cleanup SHALL 避免删除仍有历史价值的内容，但必须阻止其继续误导后续实施。

### 需求 9：旧文档清理与归位

**用户故事：** 作为后续阅读者，我希望打开旧文档时能立即知道它是否仍然有效、它和新总纲是什么关系，以便不再混用旧方案与当前方案。

#### 验收标准

1. THE spec package `multi-datasource-management` SHALL 被标记为 `旧管理抽象 / 运行时管理层`，不再作为产品级主数据源总纲。
2. THE spec package `whale-position-detection` SHALL 被标记为 `CoinGlass 子域 spec`。
3. THE spec packages `omnimind-system` 和 `omnimind-v2-enhancements` SHALL 被标记为历史阶段文档，其数据源表述不得再被解释为当前主真相源定义。
4. THE new primary spec SHALL 明确引用旧 spec 中仍然有效的子域职责。
5. THE documentation cleanup SHALL 保留最小必要历史上下文，但移除对当前架构有误导性的主叙事地位。
