# 实现任务列表：多数据源管理框架

## 文档状态

- **当前定位**：本任务清单保留为历史运行时管理实现记录。
- **不再代表**：当前产品级主数据源路线图。
- **当前主路线图**：请以 `four-primary-datasources/tasks.md` 为准。

## 状态说明
- ✅ 已完成
- 🔲 待实现

---

## 后端任务

### Task 1 — Pydantic 数据模型 ✅
**文件**：`backend/app/models/datasource.py`
- ✅ DataSourceStatus / DataSourceType / GroupType 枚举
- ✅ DataSourceInfo / DataSourceGroup / OperationResult
- ✅ StandardTrade / StandardLiquidation / StandardTicker / StandardOrderBook / StandardFundingRate / StandardOptionTicker
- ✅ HealthStatus / HealthSummary
- ✅ DataSourceStatusSnapshot / ExchangeStatusItem / DataSourceDetailResponse
- ✅ AnalysisContext（下游智能体置信度降级用）

### Task 2 — StreamRouter ✅
**文件**：`backend/app/data/stream_router.py`
- ✅ `publish(source_id, data_type, message)` — 路由到 `ds:{source_id}:{data_type}`，附加 source_id + received_at
- ✅ `cleanup_source(source_id)` — 清理 `ds:{source_id}:*` 所有 Redis key，返回删除数量
- ✅ maxlen=50000 限制

### Task 3 — DataSourceRegistry ✅
**文件**：`backend/app/data/datasource_registry.py`
- ✅ 静态元信息（4 个交易所 + CoinGlass）
- ✅ `load_from_config()` — 从 ConfigService 加载开关状态
- ✅ `get_all_groups()` / `get_group()` / `get_source()`
- ✅ `update_source_status()` — 同步到 Redis
- ✅ `set_source_enabled()` / `set_combo_enabled()` / `set_coinglass_enabled()` — 持久化到 ConfigService

### Task 4 — 连接器基类 ✅
**文件**：`backend/app/data/connectors/base.py`
- ✅ 抽象方法：`connect()` / `subscribe()` / `_run_loop()`
- ✅ `run_with_reconnect()` — 指数退避 `min(5×2^(n-1), 60)s`，最多 10 次
- ✅ `close()` / `health_check()`
- ✅ `_publish()` — 委托 StreamRouter
- ✅ `_record_message()` / `_check_stale()` / `_calc_message_rate()`

### Task 5 — 各交易所连接器 ✅
- ✅ `connectors/binance.py` — Combined Stream，合约+现货双连接，处理 aggTrade/markPrice/forceOrder
- ✅ `connectors/bybit.py` — V5 API，20s 心跳，处理 trade/liquidation/ticker
- ✅ `connectors/okx.py` — JSON subscribe，处理 trades/tickers/funding-rate/liquidation-orders
- ✅ `connectors/deribit.py` — JSON-RPC 2.0，处理 trade/ticker/option_ticker（含 Greeks）
- ✅ `connectors/coinglass_adapter.py` — 包装 CoinGlassWSClient，保留 TierManager

### Task 6 — DataSourceManager ✅
**文件**：`backend/app/services/datasource_manager.py`
- ✅ `initialize()` — 加载配置，构建连接器，启动已启用数据源
- ✅ `set_combo_enabled()` — 组合级开关
- ✅ `set_exchange_enabled()` — 交易所级开关（含组合 disabled 时拒绝启用检查）
- ✅ `set_coinglass_enabled()` — CoinGlass 独立开关
- ✅ `recalculate_completeness()` — 重算评分 + Redis 缓存 + Pub/Sub 通知
- ✅ `get_status_snapshot()` / `_update_status_snapshot()` — 状态快照缓存
- ✅ `cleanup_redis_cache()` — 关闭时清理缓存
- ✅ `shutdown()` — 停机清理
- ✅ `get_datasource_manager()` 全局单例

### Task 7 — HealthMonitor ✅
**文件**：`backend/app/services/health_monitor.py`
- ✅ `start()` / `stop()` — 30s 心跳检查循环
- ✅ `check_all()` — 检查所有连接器，写入 Redis，触发熔断
- ✅ stale 检测（>60s 无消息）→ 标记 stale + 重算完整度
- ✅ 连续 3 次失败 → CircuitBreaker open → 停止采集
- ✅ `get_health_summary()` — 汇总报告

### Task 8 — API 路由 ✅
**文件**：`backend/app/api/datasources.py`
- ✅ `GET /api/datasources/status` — 公开端点
- ✅ `GET /api/admin/datasources` — 所有数据源组（admin）
- ✅ `GET /api/admin/datasources/health` — 健康汇总（admin）
- ✅ `GET /api/admin/datasources/{source_id}` — 单源详情（admin）
- ✅ `PUT /api/admin/datasources/combo/toggle` — 组合级开关（admin）
- ✅ `PUT /api/admin/datasources/combo/exchanges/{source_id}/toggle` — 交易所级开关（admin）
- ✅ `PUT /api/admin/datasources/coinglass/toggle` — CoinGlass 开关（admin）
- ✅ `GET /api/admin/datasources/{source_id}/metrics` — 消息速率（admin）

### Task 9 — main.py 注册 ✅
**文件**：`backend/main.py`
- ✅ 注册 `datasources_router`
- ✅ lifespan 中初始化 `DataSourceManager` + 启动 `HealthMonitor`
- ✅ shutdown 中停止 `HealthMonitor` + `DataSourceManager`

---

## 前端任务

### Task 10 — API 封装 ✅
**文件**：`frontend/lib/api/datasources.ts`
- ✅ 类型定义：DataSourceStatusSnapshot / ExchangeStatusItem / OperationResult / HealthSummary / SourceMetrics
- ✅ 公开 API：`getDataSourceStatus()`
- ✅ 管理员 API：`listDataSourceGroups()` / `getDataSourceHealth()` / `getDataSourceDetail()` / `toggleCombo()` / `toggleExchange()` / `toggleCoinGlass()` / `getSourceMetrics()`

### Task 11 — 降级横幅组件 ✅
**文件**：`frontend/components/cards/DataSourceBanner.tsx`
- ✅ 轮询 `/api/datasources/status`（30s）
- ✅ score=100% 时隐藏
- ✅ 50%≤score<100% 黄色警告横幅 + 离线交易所列表
- ✅ score<50% 红色危险横幅
- ✅ 手动刷新按钮

### Task 12 — 后台管理页面 ✅
**文件**：`frontend/app/(main)/admin/datasources/page.tsx`
- ✅ CoinGlass_Source 卡片（开关 + 套餐等级 + 说明）
- ✅ Exchange_Direct_Combo 卡片（组合总开关 + 信号完整度进度条）
- ✅ 四个交易所子卡片（独立开关 + 权重 + 状态颜色 + 健康指标 + 可展开说明）
- ✅ 状态颜色说明区块
- ✅ 熔断器说明区块
- ✅ Toast 操作反馈

### Task 13 — 路由权限注册 ✅
- ✅ `AuthGuard.tsx` — 注册 `/admin/datasources` → `["admin"]`
- ✅ `TopNav.tsx` — 管理菜单添加"数据源管理"入口（minRole: admin）
- ✅ `SubNavItem` 类型扩展支持 `minRole` 字段

---

## 已完成（后续阶段）

### ✅ Task 14 — 下游智能体置信度降级
**文件**：
- `backend/app/models/analysis.py` — `AnalysisReport` 新增字段：`data_completeness`、`missing_sources`、`completeness_warning`
- `backend/app/services/analysis_orchestrator.py` — `_dispatch_mode` 调用 `_apply_completeness_degradation()`

**实现逻辑**：
- `_apply_completeness_degradation()` 从 `DataSourceManager.get_completeness_score()` 读取完整度
- `adjusted_confidence = original_confidence × data_completeness`
- completeness < 1.0 时附加 `data_completeness`、`missing_sources` 字段
- completeness < 0.5 时附加 `⚠️ 数据严重不足` 警告标记
- 框架未初始化时安全跳过，不影响现有功能
- **对应需求**：Requirements 4.1-4.5

### ✅ Task 15 — 前端 DataSourceBanner 集成到 Layout
**文件**：`frontend/app/(main)/layout.tsx`
- TopNav 下方引入 `<DataSourceBanner />`，所有主页面自动获得降级提示
- **对应需求**：Requirements 13.1-13.5

### ✅ Task 16 — 属性测试
**文件**：`backend/tests/test_datasource_properties.py`

覆盖 13 个正确性属性，含 hypothesis 属性测试 + 具体边界用例：

| 测试类 | 属性 | hypothesis 迭代数 |
|--------|------|-----------------|
| `TestProperty1ConfigValidation` | Property 1：Pydantic 配置校验 | 单元测试 |
| `TestProperty2SourceIdFormat` | Property 2：source_id 格式 | 200 次 |
| `TestProperty3CompletenessScore` | Property 3：评分计算正确性 | 200 次 |
| `TestProperty4ComboDisabledScoreZero` | Property 4：组合关闭时评分为 0 | 100 次 |
| `TestProperty9ExponentialBackoff` | Property 9：指数退避公式 | 100 次 |
| `TestProperty10BinanceAggTrade` | Property 10：Binance 消息解析 | 200 次 |
| `TestProperty11BybitParse` | Property 11：Bybit 消息解析 | 200 次 |
| `TestProperty12OKXParse` | Property 12：OKX 消息解析 | 200 次 |
| `TestProperty13DeribitOptionGreeks` | Property 13：Deribit Greeks | 200 次 |
| `TestProperty14StreamNaming` | Property 14：Stream 命名格式 | 200 次 |
| `TestProperty23DegradationBannerLogic` | Property 23：前端横幅逻辑 | 500 次 |
| `TestProperty24ConfidenceDegradation` | Property 24：置信度降级 | 500 次 |

### ✅ Task 17 — 消息速率趋势图
**后端修改**：
- `backend/app/data/connectors/base.py` — BaseConnector 新增 `_rate_history` deque（最近 60 分钟）、`get_rate_history()` 方法
- `backend/app/api/datasources.py` — `/metrics` 端点新增 `rate_history` 字段

**前端新增**：
- `frontend/components/cards/RateHistoryChart.tsx` — 纯 SVG 折线图组件（无第三方图表库依赖）
- `frontend/app/(main)/admin/datasources/page.tsx` — 展开交易所详情时异步加载并渲染折线图
- `frontend/lib/api/datasources.ts` — 新增 `RateHistoryPoint` 类型、`SourceMetrics.rate_history` 字段

### ✅ Task 18 — 单元测试（6 个文件）

| 测试文件 | 覆盖范围 | 测试数 |
|---------|---------|-------|
| `test_datasource_registry.py` | 注册中心初始化、配置加载、get/set 方法、Redis 同步、权重验证 | 12 |
| `test_datasource_manager.py` | 双层开关逻辑、完整度评分、组合级/交易所级/CoinGlass 开关、状态快照 | 9 |
| `test_stream_router.py` | publish 命名格式、元数据附加、maxlen、cleanup_source | 8 |
| `test_health_monitor.py` | check_all、stale 检测、健康汇总、字段完整性 | 7 |
| `test_connectors.py` | BaseConnector 初始化/退避/健康检查/消息记录/速率历史/stale/close + 各交易所 source_id + 消息解析示例 | 20+ |
| `test_datasource_api.py` | 公开端点响应格式、管理员参数校验、OperationResult/HealthSummary/Metrics 格式 | 15 |
