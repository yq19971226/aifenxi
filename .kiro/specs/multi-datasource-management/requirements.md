# 需求文档：多数据源管理框架

## 文档状态

- **当前定位**：本文件保留为运行时数据源管理抽象与历史过渡方案说明。
- **不再承担**：产品级主数据源总纲定义。
- **当前主真相源**：请以 `four-primary-datasources` spec 为准，系统的一等主数据源已收敛为 `Binance / CoinGlass / CryptoQuant / FRED`。
- **保留原因**：本文件中关于开关控制、健康监控、缓存清理、状态 API 的设计仍对现有实现有参考价值。

## 简介

本文件描述的是一套历史形成的多数据源运行时管理框架，核心围绕 CoinGlass 与 Exchange Direct Combo 的开关、健康和状态管理展开。该抽象仍可作为运行时管理层参考，但不再代表当前产品级主数据源架构；当前主数据源收敛方案请参见 `four-primary-datasources`。

## 术语表

- **DataSource_Registry**：数据源注册中心，管理所有数据源组和子数据源的元信息、状态和配置
- **DataSource_Connector**：数据源连接器，每个交易所对应一个连接器实例，负责 WebSocket 连接和数据采集
- **DataSource_Manager**：数据源管理服务，协调所有连接器的生命周期（启动、停止、重连）
- **Exchange_Direct_Combo**：交易所直连组合，由 Binance、Bybit、OKX、Deribit 四个交易所组成的单一逻辑数据源组，免费使用
- **CoinGlass_Source**：CoinGlass 数据源组，付费数据源，通过 TierManager 管理套餐分层
- **Signal_Completeness_Score**：信号完整度评分，反映交易所直连组合中已启用交易所的加权覆盖率（0%~100%）
- **Health_Monitor**：健康监控模块，定期检查各数据源连接状态并上报指标
- **Stream_Router**：数据流路由器，将各数据源采集的数据按来源标记后发布到对应的 Redis Stream
- **Config_Service**：已有的动态配置管理服务，支持 Redis 缓存 + DB 持久化
- **Circuit_Breaker**：已有的熔断器模块，基于 Redis 的跨进程熔断保护
- **Admin_Panel**：后台管理界面，管理员通过该界面操作数据源的启用/关闭
- **User_Dashboard**：用户前端仪表盘，展示分析结果和数据源状态

## 需求

### 需求 1：数据源注册与元信息管理

**用户故事：** 作为系统管理员，我希望有一个统一的数据源注册中心，以便集中查看和管理两大数据源组（CoinGlass 和交易所直连组合）的配置信息。

#### 验收标准

1. THE DataSource_Registry SHALL 维护两个数据源组：CoinGlass_Source（付费，分层套餐）和 Exchange_Direct_Combo（免费，由 Binance、Bybit、OKX、Deribit 组成）
2. THE DataSource_Registry SHALL 为每个数据源组维护元信息，包括：组名称、组类型（paid/free）、包含的子数据源列表、组级启用状态
3. THE DataSource_Registry SHALL 为每个子数据源维护元信息，包括：数据源名称、类型（websocket/rest）、基础 URL、可订阅频道列表、认证方式、当前状态（enabled/disabled/error）
4. WHEN 系统启动时，THE DataSource_Registry SHALL 从数据库加载所有已注册数据源组和子数据源的配置信息
5. THE DataSource_Registry SHALL 通过 pydantic 模型校验每个数据源的配置完整性
6. WHEN 管理员请求数据源列表时，THE DataSource_Registry SHALL 返回两个数据源组的元信息、子数据源详情及实时连接状态
7. THE DataSource_Registry SHALL 为每个子数据源分配唯一标识符（source_id），格式为小写字母加下划线（如 binance_futures、coinglass）

### 需求 2：双层开关控制（组合级 + 交易所级）

**用户故事：** 作为系统管理员，我希望通过组合级和交易所级双层开关灵活控制数据采集范围，以便在不影响整体架构的前提下精细调整数据源。

#### 验收标准

1. THE DataSource_Manager SHALL 提供组合级开关，支持一键启用或关闭整个 Exchange_Direct_Combo
2. WHEN 管理员关闭 Exchange_Direct_Combo 的组合级开关时，THE DataSource_Manager SHALL 停止该组合内所有交易所（Binance、Bybit、OKX、Deribit）的 WebSocket 连接和数据采集
3. WHEN 管理员开启 Exchange_Direct_Combo 的组合级开关时，THE DataSource_Manager SHALL 仅启动该组合内交易所级开关为 enabled 的交易所
4. THE DataSource_Manager SHALL 提供交易所级开关，支持在组合内单独启用或关闭某个交易所（如关闭 OKX 但保留 Binance、Bybit、Deribit）
5. WHILE Exchange_Direct_Combo 的组合级开关处于 disabled 状态，THE DataSource_Manager SHALL 忽略所有交易所级开关的变更操作
6. THE DataSource_Manager SHALL 将组合级和交易所级开关状态持久化到 Config_Service，确保系统重启后恢复上次状态
7. WHEN 启用一个交易所失败时（如网络不可达），THE DataSource_Manager SHALL 返回明确的错误信息并将该交易所状态标记为 error，不影响组合内其他交易所
8. THE DataSource_Manager SHALL 对 CoinGlass_Source 提供独立的启用/关闭控制，保留其 TierManager 套餐分层逻辑

### 需求 3：信号完整度评分机制

**用户故事：** 作为交易分析师，我希望系统能量化当前数据源的覆盖程度，以便了解分析结果的可靠性。

#### 验收标准

1. THE DataSource_Manager SHALL 为 Exchange_Direct_Combo 内每个交易所分配分析价值权重：Binance 30%、Deribit 30%、Bybit 20%、OKX 20%
2. THE DataSource_Manager SHALL 根据已启用交易所的权重之和计算 Signal_Completeness_Score（0%~100%）
3. WHEN 某个交易所被关闭时，THE DataSource_Manager SHALL 立即重新计算 Signal_Completeness_Score 并更新到 Redis 缓存（key: `ds:combo:completeness_score`，TTL 300 秒）
4. WHEN 某个交易所被启用时，THE DataSource_Manager SHALL 立即重新计算 Signal_Completeness_Score 并更新到 Redis 缓存
5. THE DataSource_Manager SHALL 在 Signal_Completeness_Score 变化时，通过 Redis Pub/Sub 发布变更事件，通知下游消费者
6. WHILE Exchange_Direct_Combo 的组合级开关处于 disabled 状态，THE DataSource_Manager SHALL 将 Signal_Completeness_Score 设为 0%

### 需求 4：下游智能体置信度降级

**用户故事：** 作为交易分析师，我希望当部分数据源离线时，智能体的分析结果能反映数据不完整的事实，以便我做出更审慎的交易决策。

#### 验收标准

1. WHEN Signal_Completeness_Score 低于 100% 时，THE DataSource_Manager SHALL 在传递给下游智能体的数据上下文中附加 `data_completeness` 字段（值为当前 Signal_Completeness_Score）
2. WHEN 智能体接收到 `data_completeness` 低于 100% 的数据上下文时，THE 智能体 SHALL 在分析输出中包含 `data_completeness` 字段，反映数据完整度
3. WHEN Signal_Completeness_Score 低于 100% 时，THE 智能体 SHALL 在分析输出中降低置信度评分，降低幅度与缺失数据的权重成正比
4. THE 智能体 SHALL 在分析输出中注明哪些交易所数据缺失，以便用户了解分析盲区
5. IF Signal_Completeness_Score 低于 50%，THEN THE 智能体 SHALL 在分析输出中附加警告标记，提示分析结果可靠性显著降低

### 需求 5：Binance 交易所 WebSocket 数据源

**用户故事：** 作为交易分析师，我希望接入 Binance 现货和合约的实时数据流，以便捕捉散户情绪和庄家拉盘行为。

#### 验收标准

1. THE DataSource_Connector（Binance）SHALL 连接以下 WebSocket 端点：
   - 合约：wss://fstream.binance.com/ws
   - 现货：wss://stream.binance.com:9443/ws
2. THE DataSource_Connector（Binance）SHALL 支持订阅以下频道：aggTrade、markPrice、forceOrder（强平）、depth、ticker、kline
3. WHEN 收到 aggTrade 消息时，THE DataSource_Connector（Binance）SHALL 解析为标准化的 Trade 模型并发布到 Redis Stream
4. WHEN 收到 forceOrder 消息时，THE DataSource_Connector（Binance）SHALL 解析为标准化的 Liquidation 模型并发布到 Redis Stream
5. THE DataSource_Connector（Binance）SHALL 与已有的 BinanceWebSocket K线采集器共存，通过 source_id 区分数据来源，避免重复写入
6. IF Binance WebSocket 连接断开，THEN THE DataSource_Connector（Binance）SHALL 使用指数退避策略重连，初始等待 5 秒，最大等待 60 秒，最多重试 10 次
7. THE DataSource_Connector（Binance）SHALL 使用 Combined Stream 方式（单连接多频道）减少连接数

### 需求 6：Bybit 交易所 WebSocket 数据源

**用户故事：** 作为交易分析师，我希望接入 Bybit 合约深度和强平数据流，以便精准识别爆仓连锁反应。

#### 验收标准

1. THE DataSource_Connector（Bybit）SHALL 连接 WebSocket 端点：wss://stream.bybit.com/v5/public/linear（USDT 永续）
2. THE DataSource_Connector（Bybit）SHALL 支持订阅以下频道：trade、orderbook、ticker、liquidation、kline
3. WHEN 收到 liquidation 消息时，THE DataSource_Connector（Bybit）SHALL 解析为标准化的 Liquidation 模型并发布到 Redis Stream
4. WHEN 收到 trade 消息时，THE DataSource_Connector（Bybit）SHALL 解析为标准化的 Trade 模型并发布到 Redis Stream
5. IF Bybit WebSocket 连接断开，THEN THE DataSource_Connector（Bybit）SHALL 使用指数退避策略重连，参数与 Binance 一致
6. THE DataSource_Connector（Bybit）SHALL 按照 Bybit V5 API 规范发送心跳 ping 消息，间隔不超过 20 秒

### 需求 7：OKX 交易所 WebSocket 数据源

**用户故事：** 作为交易分析师，我希望接入 OKX 的成交和资金费率数据流，以便判断主力真实吃单意图。

#### 验收标准

1. THE DataSource_Connector（OKX）SHALL 连接 WebSocket 端点：wss://ws.okx.com:8443/ws/v5/public
2. THE DataSource_Connector（OKX）SHALL 支持订阅以下频道：trades、tickers、books、liquidation-orders、funding-rate、open-interest
3. WHEN 收到 trades 消息时，THE DataSource_Connector（OKX）SHALL 解析为标准化的 Trade 模型并发布到 Redis Stream
4. WHEN 收到 funding-rate 消息时，THE DataSource_Connector（OKX）SHALL 解析为标准化的 FundingRate 模型并发布到 Redis Stream
5. IF OKX WebSocket 连接断开，THEN THE DataSource_Connector（OKX）SHALL 使用指数退避策略重连，参数与 Binance 一致
6. THE DataSource_Connector（OKX）SHALL 按照 OKX V5 API 规范，在订阅时发送 JSON 格式的 subscribe 操作消息

### 需求 8：Deribit 交易所 WebSocket 数据源

**用户故事：** 作为交易分析师，我希望接入 Deribit 期权市场数据，以便通过 GEX 和 Max Pain 预测 BTC 大周期目标位。

#### 验收标准

1. THE DataSource_Connector（Deribit）SHALL 连接 WebSocket 端点：wss://www.deribit.com/ws/api/v2
2. THE DataSource_Connector（Deribit）SHALL 支持订阅以下频道：trades、ticker、book、chart（期权+期货）
3. WHEN 收到期权 ticker 消息时，THE DataSource_Connector（Deribit）SHALL 解析出 Greeks（delta、gamma、vega、theta）并发布到 Redis Stream
4. THE DataSource_Connector（Deribit）SHALL 采集期权链数据，支持计算 GEX（Gamma Exposure）和 Max Pain 指标
5. IF Deribit WebSocket 连接断开，THEN THE DataSource_Connector（Deribit）SHALL 使用指数退避策略重连，参数与 Binance 一致
6. THE DataSource_Connector（Deribit）SHALL 使用 JSON-RPC 2.0 格式发送订阅请求，符合 Deribit API 规范

### 需求 9：数据隔离与标准化

**用户故事：** 作为系统开发者，我希望各数据源的数据互不干扰且格式统一，以便下游智能体能无差别消费任意数据源的数据。

#### 验收标准

1. THE Stream_Router SHALL 为每个数据源分配独立的 Redis Stream，命名格式为 `ds:{source_id}:{data_type}`（如 `ds:binance_futures:trade`、`ds:coinglass:liquidation`）
2. THE Stream_Router SHALL 在每条消息中附加 `source_id` 和 `received_at` 字段，标识数据来源和接收时间
3. THE DataSource_Connector SHALL 将各交易所的原始数据解析为统一的 pydantic 标准模型（Trade、Liquidation、Ticker、OrderBook、FundingRate）
4. WHEN 同一交易对在多个数据源中出现时，THE Stream_Router SHALL 保持各数据源的数据独立存储，不做合并
5. THE Stream_Router SHALL 为每个 Redis Stream 设置 maxlen 上限（默认 50000 条），防止内存溢出
6. THE DataSource_Connector SHALL 将 CoinGlass 现有数据纳入统一的标准模型体系，保持向后兼容

### 需求 10：关闭数据源时清理 Redis 缓存

**用户故事：** 作为系统开发者，我希望数据源关闭后其缓存数据被及时清理，以防止下游消费者读取到过期的陈旧数据。

#### 验收标准

1. WHEN 管理员关闭某个交易所的交易所级开关时，THE DataSource_Manager SHALL 清理该交易所在 Redis 中的所有缓存数据，使用模式匹配删除 `ds:{source_id}:*` 格式的所有 key
2. WHEN 管理员关闭 Exchange_Direct_Combo 的组合级开关时，THE DataSource_Manager SHALL 清理该组合内所有交易所的 Redis 缓存数据
3. THE DataSource_Manager SHALL 在清理缓存前记录待删除 key 的数量到日志，便于审计追踪
4. IF Redis 缓存清理操作失败，THEN THE DataSource_Manager SHALL 记录错误日志并触发告警，不阻塞数据源关闭流程
5. THE DataSource_Manager SHALL 在缓存清理完成后，发布 `ds:cache_cleared:{source_id}` 事件到 Redis Pub/Sub，通知下游消费者刷新本地缓存

### 需求 11：健康监控与熔断保护

**用户故事：** 作为系统管理员，我希望实时了解各数据源的连接健康状况，并在异常时自动熔断保护系统稳定性。

#### 验收标准

1. THE Health_Monitor SHALL 每 30 秒检查一次各数据源的连接状态，并将结果缓存到 Redis（TTL 60 秒）
2. WHEN 某个数据源连续 3 次健康检查失败时，THE Health_Monitor SHALL 触发 Circuit_Breaker 将该数据源熔断
3. WHILE 某个数据源处于熔断状态，THE DataSource_Manager SHALL 停止该数据源的数据采集，并每 120 秒尝试一次探测恢复
4. THE Health_Monitor SHALL 记录每个数据源的以下指标：连接状态、最后消息时间、消息速率（条/秒）、重连次数、错误计数
5. WHEN 管理员请求健康状态时，THE Health_Monitor SHALL 返回所有数据源的实时健康指标汇总
6. IF 某个数据源超过 60 秒未收到任何消息，THEN THE Health_Monitor SHALL 将该数据源标记为 stale 并记录告警日志

### 需求 12：前端数据源状态查询 API

**用户故事：** 作为前端开发者，我希望有一个公开（非管理员）的 API 端点查询当前数据源启用状态，以便前端展示数据源覆盖情况和降级提示。

#### 验收标准

1. THE DataSource_Manager SHALL 提供一个公开的 GET API 端点（无需管理员权限），返回当前数据源组的启用状态
2. THE API SHALL 返回以下信息：Exchange_Direct_Combo 的组合级开关状态、组合内每个交易所的启用状态和名称、当前 Signal_Completeness_Score
3. THE API SHALL 返回 CoinGlass_Source 的启用状态和当前套餐等级
4. THE API SHALL 从 Redis 缓存读取数据源状态，响应时间低于 100ms
5. WHEN 数据源状态发生变化时，THE DataSource_Manager SHALL 更新 Redis 缓存中的状态快照，确保 API 返回最新数据

### 需求 13：前端降级提示

**用户故事：** 作为交易分析师，我希望在部分数据源离线时前端能清晰提示，以便我了解当前分析结果的数据覆盖范围。

#### 验收标准

1. WHEN Exchange_Direct_Combo 内任意交易所处于 disabled 或 error 状态时，THE User_Dashboard SHALL 在页面顶部展示 "⚠️ 部分数据源离线" 警告横幅
2. THE User_Dashboard SHALL 在警告横幅中展示具体离线的交易所名称列表和当前 Signal_Completeness_Score 百分比
3. WHILE Signal_Completeness_Score 为 100% 时，THE User_Dashboard SHALL 隐藏降级警告横幅
4. WHEN Signal_Completeness_Score 低于 50% 时，THE User_Dashboard SHALL 将警告横幅样式从黄色（warning）升级为红色（danger），提示数据严重不足
5. THE User_Dashboard SHALL 通过轮询需求 12 的公开 API（间隔 30 秒）获取最新数据源状态，实时更新降级提示

### 需求 14：后台管理界面

**用户故事：** 作为系统管理员，我希望通过后台界面直观地管理所有数据源组，以便快速操作和排查问题。

#### 验收标准

1. THE Admin_Panel SHALL 展示数据源组列表页面，分别展示 CoinGlass_Source 和 Exchange_Direct_Combo 两个数据源组
2. THE Admin_Panel SHALL 为 Exchange_Direct_Combo 提供组合级总开关，以及组合内每个交易所的独立开关
3. THE Admin_Panel SHALL 在 Exchange_Direct_Combo 区域展示当前 Signal_Completeness_Score 和每个交易所的权重标识
4. THE Admin_Panel SHALL 展示每个数据源的详情页面，包含可订阅频道列表、当前订阅频道、连接参数、健康指标
5. WHEN 管理员切换任意开关时，THE Admin_Panel SHALL 调用后端 API 并在 3 秒内反馈操作结果
6. THE Admin_Panel SHALL 使用颜色编码区分数据源状态：绿色（connected）、灰色（disabled）、红色（error）、黄色（stale）
7. THE Admin_Panel SHALL 展示各数据源最近 1 小时的消息速率趋势图

### 需求 15：与现有系统的兼容性

**用户故事：** 作为系统开发者，我希望新的多数据源框架与现有的 CoinGlass 和 Binance K线采集器无缝兼容，以便平滑迁移不影响现有功能。

#### 验收标准

1. THE DataSource_Manager SHALL 将现有 CoinGlass WebSocket 客户端（CoinGlassWSClient）纳入 CoinGlass_Source 数据源组统一管理，保留其 TierManager 套餐分层逻辑
2. THE DataSource_Manager SHALL 将现有 Binance K线采集器（BinanceWebSocket）纳入 Exchange_Direct_Combo 统一管理，保留其 TimescaleDB 写入逻辑
3. WHEN 新框架启动时，THE DataSource_Manager SHALL 自动检测并加载已有的 CoinGlass 和 Binance 数据源配置
4. THE DataSource_Registry SHALL 通过 Config_Service 读取数据源配置，复用已有的 Redis 缓存 + DB 持久化机制
5. IF 新框架初始化失败，THEN THE DataSource_Manager SHALL 回退到直接使用现有采集器，确保数据采集不中断