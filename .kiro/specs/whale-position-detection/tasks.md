# 实施计划：庄家建仓/点杀预警系统

## 文档状态

- **当前定位**：本任务清单保留为 `CoinGlass` 子域实施记录。
- **不再代表**：系统级主数据源路线图。
- **当前主路线图**：请以 `four-primary-datasources/tasks.md` 为准。

## 概述

基于 CoinGlass API V4 构建数据采集层和点杀预警引擎。实施顺序：数据库迁移 → 数据模型 → 套餐管理 → API 客户端 → 数据采集模块 → 点杀预警引擎 → Celery Workers → API 路由 → 前端组件 → 集成联调。

## Tasks

- [x] 1. 数据库迁移与 Pydantic 数据模型
  - [x] 1.1 创建 TimescaleDB 迁移脚本 `backend/migrations/v_coinglass.sql`
    - 创建 `oi_snapshots`、`taker_volume_snapshots`、`liquidation_heatmap`、`kill_zone_alerts` 四张时序表及索引
    - 扩展 `derivatives_snapshots` 表新增 `source` 字段和索引
    - _Requirements: 2.3, 3.4, 4.4, 6.7, 5.3_

  - [x] 1.2 创建 Pydantic 数据模型 `backend/app/models/coinglass.py`
    - 定义 OISnapshot、OISurgeEvent、OIExchangeData、TakerVolumeSnapshot、TakerImbalanceEvent、LiquidationZone、BasicLiquidationData、LiquidationRecord、NetPositionSnapshot、TopLongShortRatio、WeightedFundingRate、KillZoneAlert、TierCapabilities、CoinGlassTier 枚举
    - 所有模型使用完整类型注解
    - _Requirements: 2.3, 3.2, 4.3, 6.5, 6.6, 7.2_

- [x] 2. TierManager 套餐管理模块
  - [x] 2.1 实现 TierManager `backend/app/data/coinglass_tier.py`
    - 从 Config_Service 读取 `coinglass_tier` 配置
    - 实现四级套餐能力矩阵（rate_limit、collect_interval、max_symbols、history_depth、features、websocket_enabled）
    - 实现 Redis 滑动窗口限频计数器（key `cg_rate:{minute_ts}`，TTL=60s）
    - 实现端点可用性检查 `is_endpoint_available()` 和功能启用检查 `is_feature_enabled()`
    - 配置不存在或无效时降级为 hobbyist
    - Redis 不可用时允许请求通过
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.6, 7.7, 7.8, 7.9, 7.10, 7.11_

  - [x]* 2.2 属性测试：套餐能力矩阵完整性
    - **Property 14: 套餐能力矩阵完整性**
    - 使用 hypothesis 对所有 CoinGlassTier 枚举值验证 rate_limit_per_minute(30/80/300/1200)、collect_interval_seconds(300/120/60/30)、max_symbols(50/100/300/7000)、history_depth_days(90/180/730/1095) 和 features 字典
    - **Validates: Requirements 7.2, 7.6, 7.8, 7.9, 7.10, 7.11**

  - [x]* 2.3 单元测试 TierManager
    - 测试四级套餐映射、限频计数、端点可用性、降级逻辑、Redis 不可用容错
    - _Requirements: 7.1-7.11_

- [x] 3. CoinGlassClient 统一 API 客户端
  - [x] 3.1 实现 CoinGlassClient `backend/app/data/coinglass_client.py`
    - 使用 httpx.AsyncClient，30s 超时
    - 从 Config_Service 读取 API Key 设置 `CG-API-KEY` 请求头
    - 基础地址 `https://open-api-v4.coinglass.com`
    - 请求前通过 TierManager 检查限频余量和端点可用性
    - HTTP 429 重试（最多 2 次，按 Retry-After 等待）
    - 非 2xx 记录错误日志返回 None
    - API Key 未配置时记录警告返回 None
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 7.4, 7.5_

  - [x]* 3.2 属性测试：非 2xx 状态码返回 None
    - **Property 1: 非 2xx 状态码返回 None**
    - 使用 hypothesis + aioresponses mock 各种非 2xx 状态码，验证返回 None 且不抛异常
    - **Validates: Requirements 1.5**

  - [x]* 3.3 属性测试：限频与端点可用性执行
    - **Property 15: 客户端限频与端点可用性执行**
    - 验证限频达上限时等待、不可用端点返回 None
    - **Validates: Requirements 7.4, 7.5**

  - [x]* 3.4 单元测试 CoinGlassClient
    - 测试 API Key 读取、请求头设置、429 重试逻辑、超时处理、各种错误场景
    - _Requirements: 1.1-1.6_

- [x] 4. Checkpoint - 确保基础设施测试通过
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. OIMonitor 持仓量监控模块
  - [x] 5.1 实现 OIMonitor `backend/app/data/coinglass_oi.py`
    - 实现 collect_oi_ohlc、collect_oi_aggregated、collect_oi_exchange_list
    - 实现 collect_net_position、collect_net_position_v2（Startup+ 套餐门控）
    - 实现 collect_oi_stablecoin_margin、collect_oi_coin_margin（Standard+ 套餐门控）
    - 实现 detect_oi_surge（5 分钟窗口 OI 增幅检测，发布 oi_surge 事件到 Redis Streams）
    - 实现 write_snapshots（写入 TimescaleDB）和 cache_latest（Redis 缓存 TTL=300s）
    - Hobbyist 套餐仅采集 OI 总量和分交易所数据
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 5.7, 5.8_

  - [x]* 5.2 属性测试：OI 数据持久化往返
    - **Property 2: OI 数据持久化往返**
    - 验证 OISnapshot 写入 TimescaleDB 后读取等价、缓存到 Redis 后读取等价
    - **Validates: Requirements 2.3, 2.4**

  - [x]* 5.3 属性测试：OI 突增检测阈值正确性
    - **Property 3: OI 突增检测阈值正确性**
    - 验证 Startup+ 套餐下 OI 变化 > 阈值时返回 OISurgeEvent，Hobbyist 不生成事件
    - **Validates: Requirements 2.5, 2.6**

  - [x]* 5.4 单元测试 OIMonitor
    - 测试各端点采集、DB 写入、缓存、surge 检测、套餐门控
    - _Requirements: 2.1-2.7_

- [x] 6. TakerAnalyzer 主动买卖量分析模块
  - [x] 6.1 实现 TakerAnalyzer `backend/app/data/coinglass_taker.py`
    - 实现 collect_taker_volume、collect_aggregated_taker_volume（Standard+ 套餐门控）
    - 实现 detect_imbalance（Buy/Sell Ratio 偏离检测，发布 taker_imbalance 事件）
    - 实现 write_snapshots（写入 TimescaleDB）
    - Hobbyist/Startup 跳过采集，记录 INFO 日志
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_

  - [x]* 6.2 属性测试：Taker Buy/Sell Ratio 计算精度
    - **Property 4: Taker Buy/Sell Ratio 计算精度**
    - 验证 ratio = round(buy_volume / sell_volume, 4)
    - **Validates: Requirements 3.2**

  - [x]* 6.3 属性测试：Taker 失衡检测与套餐门控
    - **Property 5: Taker 失衡检测与套餐门控**
    - 验证 Standard+ 下 |ratio - 1.0| > threshold 发布事件，低于 Standard 返回 None
    - **Validates: Requirements 3.5, 3.6**

  - [x]* 6.4 单元测试 TakerAnalyzer
    - 测试采集、ratio 计算、imbalance 检测、套餐门控
    - _Requirements: 3.1-3.6_

- [x] 7. HeatmapCollector 爆仓热力图采集模块
  - [x] 7.1 实现 HeatmapCollector `backend/app/data/coinglass_heatmap.py`
    - 实现 collect_heatmap_model1（Startup+）、collect_heatmap_model2/model3（Standard+）
    - 实现 collect_liquidation_history、collect_liquidation_order（Standard+）、collect_liquidation_max_pain（Standard+）
    - 实现 collect_basic_liquidation（Hobbyist：爆仓总量/分多空/分交易所）
    - 实现 write_heatmap（写入 TimescaleDB）和 cache_latest（Redis 缓存 TTL=600s）
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8, 4.9_

  - [x]* 7.2 属性测试：爆仓热力图数据持久化往返
    - **Property 6: 爆仓热力图数据持久化往返**
    - 验证 LiquidationZone 写入 TimescaleDB 后读取等价、缓存到 Redis 后读取等价
    - **Validates: Requirements 4.3, 4.4**

  - [x]* 7.3 属性测试：爆仓密集区解析不变量
    - **Property 7: 爆仓密集区解析不变量**
    - 验证解析后每个 LiquidationZone 满足 price_low < price_high 且 estimated_liq_usd >= 0
    - **Validates: Requirements 4.2**

  - [x]* 7.4 单元测试 HeatmapCollector
    - 测试各模型采集、解析、DB 写入、缓存、套餐门控
    - _Requirements: 4.1-4.9_

- [x] 8. 多空比与净持仓增强采集
  - [x] 8.1 扩展数据采集支持多空比和资金费率端点
    - 在 OIMonitor 中集成全网多空比采集（`/api/futures/global-long-short-account-ratio/history`）
    - 在 OIMonitor 中集成大户账户/持仓多空比采集（Startup+）
    - 在 OIMonitor 中集成持仓加权/成交量加权资金费率采集（Startup+）
    - 在 OIMonitor 中集成资金费率套利采集（Standard+）
    - 将 CoinGlass 多空比数据写入 `derivatives_snapshots` 表，source="coinglass"
    - _Requirements: 5.1, 5.2, 5.3, 5.5, 5.6, 5.9, 5.10, 5.11_

  - [x]* 8.2 属性测试：多空比数据来源区分
    - **Property 8: 多空比数据来源区分**
    - 验证 source="coinglass" 和 source="binance" 数据在同一表中共存且互不干扰
    - **Validates: Requirements 5.3**

  - [x]* 8.3 属性测试：多空比偏差检测
    - **Property 9: 多空比偏差检测**
    - 验证 |cg_ratio - bn_ratio| > 0.2 时记录 ls_ratio_divergence 日志
    - **Validates: Requirements 5.4**

- [x] 9. Checkpoint - 确保数据采集层测试通过
  - Ensure all tests pass, ask the user if questions arise.

- [x] 10. KillDetector 点杀预警引擎
  - [x] 10.1 实现 KillDetector `backend/app/services/kill_detector.py`
    - 实现 evaluate() 方法：读取 TierManager 判断版本 → 从 Redis/DB 读取数据 → 执行检测 → 计算评分 → 去重 → 写入 DB + 发布 Redis Streams
    - 实现 evaluate_all() 批量检测
    - Hobbyist 跳过检测
    - 基础版(Startup)：OI变化率 + 大户多空比 + 净持仓 + 热力图model1 + 加权资金费率
    - 增强版(Standard)：基础版 + Taker方向 + 热力图model2/3 + 爆仓订单明细 + 清算最大痛点 + 资金费率套利
    - 完整版(Professional)：增强版全部能力 + 最高频率 + 全币种覆盖
    - 去重：Redis key `kill_alert_dedup:{symbol}` TTL=600s，评分提升 > 20 分时更新
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.6, 6.7, 6.8, 6.9, 6.10, 6.11_

  - [x] 10.2 实现评分函数
    - compute_basic_score：OI(30%) + 大户多空比(20%) + 净持仓(20%) + 价格接近度(20%) + 加权资金费率(10%)
    - compute_enhanced_score：OI(20%) + Taker(20%) + 价格接近度(15%) + 大户多空比(15%) + 爆仓订单(10%) + 清算最大痛点(10%) + 资金费率套利(10%)
    - compute_full_score：与增强版相同公式
    - 评分结果始终在 [0, 100] 范围内
    - _Requirements: 6.5_

  - [x]* 10.3 属性测试：基础版点杀检测（含方向判断）
    - **Property 10: 基础版点杀检测（含方向判断）**
    - 验证 Startup 套餐下条件满足时生成 basic 版 KillZoneAlert，方向判断：LS ratio > 1.0 → long_kill，< 1.0 → short_kill
    - **Validates: Requirements 6.2, 6.10**

  - [x]* 10.4 属性测试：增强版点杀检测（含方向判断）
    - **Property 11: 增强版点杀检测（含方向判断）**
    - 验证 Standard 套餐下生成 enhanced 版 KillZoneAlert，方向判断：Taker Buy 主导 → long_kill，Sell 主导 → short_kill
    - **Validates: Requirements 6.3, 6.9**

  - [x]* 10.5 属性测试：完整版点杀检测
    - **Property 11b: 完整版点杀检测**
    - 验证 Professional 套餐下生成 full 版 KillZoneAlert
    - **Validates: Requirements 6.4**

  - [x]* 10.6 属性测试：风险评分计算与边界
    - **Property 12: 风险评分计算与边界**
    - 验证基础版/增强版/完整版评分公式权重正确，结果始终在 [0, 100]
    - **Validates: Requirements 6.5**

  - [x]* 10.7 属性测试：点杀预警去重
    - **Property 13: 点杀预警去重**
    - 验证 10 分钟内重复预警被跳过，评分提升 > 20 分时更新
    - **Validates: Requirements 6.7**

  - [x]* 10.8 单元测试 KillDetector
    - 测试三版本检测逻辑、评分计算、去重、方向判断、Hobbyist 跳过
    - _Requirements: 6.1-6.11_

- [x] 11. 预警推送集成
  - [x] 11.1 实现点杀预警推送路由
    - 在现有 Notification_Dispatcher 中新增 kill_zone_warning 类型处理
    - risk_score >= 70 推送给专业版+旗舰版用户
    - 50 <= risk_score < 70 仅推送给旗舰版用户
    - risk_score < 50 不推送
    - 推送消息包含：交易对、点杀方向、风险评分、OI 变化、Taker/多空比、爆仓密集区、预估爆仓量
    - 推送失败 5 分钟后重试一次
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_

  - [ ]* 11.2 属性测试：点杀预警推送路由
    - **Property 16: 点杀预警推送路由**
    - 验证按 risk_score 和会员等级分级推送
    - **Validates: Requirements 8.1, 8.2**

  - [ ]* 11.3 属性测试：预警推送消息完整性
    - **Property 17: 预警推送消息完整性**
    - 验证格式化后的推送消息包含所有必要字段
    - **Validates: Requirements 8.3**

  - [ ]* 11.4 单元测试推送路由
    - 测试按评分和会员等级分级推送、消息格式、失败重试
    - _Requirements: 8.1-8.5_

- [x] 12. Checkpoint - 确保预警引擎测试通过
  - Ensure all tests pass, ask the user if questions arise.

- [x] 13. CoinGlass WebSocket 客户端
  - [x] 13.1 实现 CoinGlassWSClient `backend/app/data/coinglass_ws.py`
    - 连接 `wss://open-api-v4.coinglass.com/ws`
    - Standard 订阅部分接口，Professional 订阅全接口
    - Hobbyist/Startup 跳过连接
    - 指数退避重连：5s 起步，上限 60s，最多 10 次
    - 将实时爆仓事件发布到 Redis Streams `realtime_liquidations`
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5_

  - [ ]* 13.2 属性测试：WebSocket 重连指数退避
    - **Property 18: WebSocket 重连指数退避**
    - 验证第 n 次重连等待 min(5 * 2^(n-1), 60) 秒，超过 10 次停止
    - **Validates: Requirements 11.4**

  - [ ]* 13.3 单元测试 CoinGlassWSClient
    - 测试连接建立、套餐过滤、重连逻辑、消息解析
    - _Requirements: 11.1-11.5_

- [x] 14. Celery Workers 数据采集调度
  - [x] 14.1 实现 Celery Workers `backend/workers/coinglass_worker.py`
    - 实现 `collect_coinglass_data` 定时任务：按顺序采集 OI → Taker → 热力图 → 多空比 → 资金费率
    - 采集频率由 TierManager 决定
    - 单个端点失败继续采集剩余端点
    - 限频不足时按优先级跳过低优先级端点
    - 实现 `evaluate_kill_zone` 定时任务：每 60 秒调用 KillDetector.evaluate_all()
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5_

  - [ ]* 14.2 属性测试：采集任务容错
    - **Property 19: 采集任务容错**
    - 验证任意端点失败时剩余端点继续采集
    - **Validates: Requirements 12.3**

  - [ ]* 14.3 属性测试：限频不足时优先级采集
    - **Property 20: 限频不足时优先级采集**
    - 验证按优先级顺序采集前 N 个端点
    - **Validates: Requirements 12.5**

  - [ ]* 14.4 单元测试 Celery Workers
    - 测试采集顺序、容错、优先级跳过、定时调度
    - _Requirements: 12.1-12.5_

- [x] 15. Checkpoint - 确保后端全部测试通过
  - Ensure all tests pass, ask the user if questions arise.

- [x] 16. API 路由层
  - [x] 16.1 实现 API 路由 `backend/app/api/coinglass.py`
    - GET /api/coinglass/tier-capabilities → 返回当前套餐能力矩阵
    - GET /api/coinglass/oi/{symbol} → OI 快照数据
    - GET /api/coinglass/net-position/{symbol} → 净持仓数据（Startup+）
    - GET /api/coinglass/taker/{symbol} → Taker Volume 数据（Standard+）
    - GET /api/coinglass/heatmap/{symbol} → 爆仓热力图数据
    - GET /api/coinglass/kill-alerts/{symbol} → 点杀预警历史
    - GET /api/coinglass/kill-alerts/latest → 最新点杀预警
    - 路由层只做参数校验和响应格式化，不含业务逻辑
    - _Requirements: 7.11, 9.1-9.6, 10.1_

  - [ ]* 16.2 单元测试 API 路由
    - 测试各端点响应格式、参数校验、套餐门控
    - _Requirements: 7.11, 9.1-9.6_

- [x] 17. 前端 API 封装与组件
  - [x] 17.1 创建前端 API 封装 `frontend/lib/api/coinglass.ts`
    - 封装所有 CoinGlass 后端 API 调用
    - 类型定义与后端 Pydantic 模型对应
    - _Requirements: 9.1-9.6, 10.1_

  - [x] 17.2 实现 TierGate 功能降级组件 `frontend/components/ui/TierGate.tsx`
    - 根据套餐能力矩阵控制子组件显示/隐藏
    - 不可用功能显示升级提示（含目标套餐名称）
    - _Requirements: 10.1-10.8_

  - [x] 17.3 实现 LiquidationHeatmap 爆仓热力图 `frontend/components/charts/LiquidationHeatmap.tsx`
    - 价格 Y 轴、时间 X 轴、颜色深浅表示爆仓密集程度
    - 使用 TradingView Lightweight Charts 渲染
    - _Requirements: 9.1_

  - [x] 17.4 实现 OIChangeChart OI 变化图 `frontend/components/charts/OIChangeChart.tsx`
    - OI 变化折线图 + 价格叠加
    - 支持 1h/4h/1d 时间周期切换
    - _Requirements: 9.2_

  - [x] 17.5 实现 KillZoneCard 点杀预警卡片 `frontend/components/cards/KillZoneCard.tsx`
    - 风险评分仪表盘(0-100)、点杀方向、OI 变化、Taker/多空比、爆仓密集区
    - risk_score >= 70 红色边框 + 闪烁动画
    - 50 <= risk_score < 70 橙色边框
    - 标注预警版本（基础版/增强版/完整版）
    - WebSocket 实时更新
    - _Requirements: 9.3, 9.4, 9.5, 9.6, 10.9_

  - [x] 17.6 实现前端功能降级逻辑
    - 使用 TierGate 包装各功能组件
    - Hobbyist/Startup/Standard/Professional 四级降级展示
    - 按用户会员等级控制点杀预警卡片展示
    - 显示数据更新频率标注
    - 实时爆仓流仅旗舰版用户可见
    - _Requirements: 10.1-10.11, 11.6_

- [x] 18. Final checkpoint - 确保全部测试通过
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- 标记 `*` 的任务为可选测试任务，可跳过以加速 MVP
- 每个任务引用了具体的需求编号以确保可追溯性
- 属性测试覆盖设计文档中定义的全部 20 个正确性属性
- 所有外部 API 调用（CoinGlass、Telegram、SendGrid）在测试中必须 mock
- 遵循项目分层架构：API 路由层 → Service 层 → 数据层，禁止跨层调用
