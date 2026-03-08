# 实施计划：OmniMind V2 增强功能

## 文档状态

- **当前定位**：本任务清单保留为 OmniMind V2 历史增强实施记录。
- **不再代表**：当前主数据源与能力收敛路线图。
- **当前主路线图**：请以 `four-primary-datasources/tasks.md` 与相关现行子域 spec 为准。

## 概述

基于现有 OmniMind 系统（4个智能体、NSED共识引擎、三级会员、推送模块），按模块递进实施5大增强功能。每个模块从数据库迁移 → 后端模型/服务 → API路由 → Worker → 前端组件的顺序推进，确保每一步都可验证。

## 任务

- [x] 1. 数据库迁移 — 新增所有 V2 表结构
  - [x] 1.1 创建 V2 数据库迁移文件 `backend/migrations/v2_enhancements.sql`
    - 新增 TimescaleDB 时序表：`derivatives_snapshots`、`liquidation_events`、`symbol_correlations`
    - 新增 PostgreSQL 业务表：`symbol_registry`、`alert_rules`、`alert_triggers`、`strategy_snapshots`、`perf_checkpoints`、`chat_sessions`、`chat_messages`
    - 创建所有索引（参考设计文档第四节）
    - 插入默认交易对种子数据：BTCUSDT、ETHUSDT、SOLUSDT、BNBUSDT、XRPUSDT
    - _需求: 1.1, 3.1, 3.6, 6.1, 8.7, 11.3, 11.4_

- [x] 2. 自定义预警规则模块（后端）
  - [x] 2.1 创建预警数据模型 `backend/app/models/alert.py`
    - 实现 `MetricType`、`Operator`、`LogicGroup` 枚举
    - 实现 `Condition`、`ConditionExpression`（含2层嵌套校验）、`AlertRuleCreate`、`AlertRuleResponse` pydantic 模型
    - _需求: 1.2, 1.3, 1.4, 1.10_

  - [x] 2.2 实现预警规则引擎 `backend/app/services/alert_engine.py`
    - 实现 `AlertRuleEngine` 类：`create_rule`（含会员额度校验）、`evaluate`、`_check_condition`（含 cross_above/cross_below 穿越判断）、`_check_expression`（递归 AND/OR 评估）
    - 实现冷却期检查（Redis key `alert_cooldown:{rule_id}`, TTL=300s）
    - 实现数据缺失时跳过条件并记录警告日志
    - 实现 CRUD 操作：列表查询、修改、删除（仅限本人规则）
    - 实现触发历史记录和查询（最近100条）
    - _需求: 1.1, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9, 1.10, 2.1, 2.3, 2.4, 2.5, 2.6, 2.7_

  - [ ]* 2.3 编写预警规则引擎单元测试 `backend/tests/test_alert_engine.py`
    - 测试条件评估逻辑（各运算符、AND/OR组合、穿越判断）
    - 测试会员额度限制（免费3条、专业20条、旗舰100条）
    - 测试冷却期抑制重复触发
    - 测试数据缺失跳过逻辑
    - _需求: 1.2, 1.3, 1.4, 1.7, 1.8, 1.9, 2.4, 2.5, 2.6_

  - [x] 2.4 实现预警评估 Worker `backend/workers/alert_eval_worker.py`
    - 消费 Redis Streams 数据更新事件（price_updates / indicator_updates / onchain_updates）
    - 调用 `AlertRuleEngine.evaluate()` 评估匹配规则
    - 触发时写入 `alert_triggers` 表并通过推送模块发送通知
    - 确保5秒内完成评估
    - _需求: 2.1, 2.2, 2.3_

  - [x] 2.5 实现预警规则 API 路由 `backend/app/api/alerts.py`
    - `POST /api/alerts/rules` — 创建规则
    - `GET /api/alerts/rules` — 获取当前用户规则列表
    - `PUT /api/alerts/rules/{rule_id}` — 修改规则（权限校验）
    - `DELETE /api/alerts/rules/{rule_id}` — 删除规则（权限校验）
    - `GET /api/alerts/triggers` — 获取触发历史（最多100条）
    - 在 `backend/main.py` 中注册路由
    - _需求: 1.1, 1.5, 1.6, 2.7_

  - [ ]* 2.6 编写预警 API 集成测试 `backend/tests/test_alert_api.py`
    - 测试规则 CRUD 完整流程
    - 测试权限校验（不能操作他人规则）
    - 测试会员额度限制返回错误
    - _需求: 1.5, 1.6, 1.7, 1.8, 1.9_

- [x] 3. 检查点 — 预警模块验证
  - 确保所有测试通过，如有问题请向用户确认。

- [x] 4. 多币种支持模块（后端）
  - [x] 4.1 实现币种注册表 `backend/app/services/symbol_registry.py`
    - 实现 `SymbolConfig` pydantic 模型
    - 实现 `SymbolRegistry` 类：`list_symbols`、`add_symbol`、`update_symbol`、`mark_error`（连续3次失败自动禁用+告警）
    - 定义 `DEFAULT_SYMBOLS` 列表
    - _需求: 3.1, 3.6, 3.9_

  - [x] 4.2 实现多币种调度器 `backend/workers/multi_symbol_scheduler.py`
    - 实现 `schedule_all_symbols` Celery Beat 任务（每分钟触发）
    - 实现 `collect_symbol_data` 任务：并行执行 K线采集、指标计算、链上采集、合约采集
    - 单个交易对失败不影响其他交易对，失败计数递增
    - _需求: 3.2, 3.3, 3.4, 3.9_

  - [x] 4.3 扩展现有数据采集模块支持 symbol 参数
    - 修改 `backend/app/data/binance.py` 支持多交易对 K线采集
    - 修改 `backend/app/data/indicators.py` 支持按 symbol 计算指标
    - 修改 `backend/app/data/onchain.py` 支持多币种链上数据（部分币种无链上数据时标注完整度）
    - 修改 `backend/app/services/market.py` 的查询接口支持 symbol 参数
    - _需求: 3.3, 3.5, 4.5_

  - [x] 4.4 扩展智能体和共识引擎支持多币种
    - 修改 `backend/app/agents/technical.py`、`onchain.py`、`playbook.py`、`risk.py` 的分析流程接受 symbol 参数
    - 修改 `backend/app/consensus/engine.py` 按 symbol 独立运行三轮共识
    - 智能体报告和共识结果通过 symbol 字段区分存储
    - _需求: 4.1, 4.2, 4.3, 4.4_

  - [x] 4.5 实现关联分析器 `backend/app/services/correlation.py`
    - 实现 `CorrelationAnalyzer` 类：`compute_matrix`（Pearson 相关系数，7天1小时K线）、`detect_anomalies`（30分钟内变化>0.3告警）
    - 结果缓存到 Redis（`correlation_matrix`, TTL=3600s）
    - 强相关标记（|r| > 0.8）
    - _需求: 5.1, 5.2, 5.3_

  - [x] 4.6 实现多币种和关联分析 API 路由 `backend/app/api/symbols.py`
    - `GET /api/symbols/` — 获取交易对列表（免费用户仅 BTCUSDT）
    - `POST /api/symbols/` — 添加交易对（管理员）
    - `GET /api/symbols/correlations` — 获取关联矩阵（专业+旗舰）
    - 在 `backend/main.py` 中注册路由
    - _需求: 3.5, 3.7, 3.8, 5.4, 5.5, 5.6_

  - [ ]* 4.7 编写多币种模块测试
    - `backend/tests/test_symbol_registry.py` — 测试注册表 CRUD 和错误标记逻辑
    - `backend/tests/test_correlation.py` — 测试 Pearson 相关系数计算和异动检测
    - _需求: 3.1, 3.9, 5.1, 5.3_

- [x] 5. 检查点 — 多币种模块验证
  - 确保所有测试通过，如有问题请向用户确认。

- [x] 6. 策略绩效追踪模块（后端）
  - [x] 6.1 创建绩效数据模型 `backend/app/models/performance.py`
    - 实现 `SettlementStatus`、`StrategyDirection` 枚举
    - 实现 `StrategySnapshotCreate`、`PerfCheckpoint`、`SettlementResult`、`PerformanceStats` pydantic 模型
    - _需求: 6.1, 6.5, 7.1_

  - [x] 6.2 实现绩效追踪器 `backend/app/services/performance.py`
    - 实现 `PerformanceTracker` 类：`create_snapshot`（策略生成时创建快照）、`check_and_settle`（检查止损/目标/超时）、`_calc_pnl_pct`（盈亏计算，做空取反）、`_record_checkpoint`（1h/4h/24h/72h 记录）
    - 实现 `get_stats`（统计指标：胜率、盈亏比等，支持按交易对/时间/方向筛选）
    - 实现按智能体维度统计信号准确率
    - 使用 SQL 聚合查询，避免应用层数据聚合
    - _需求: 6.1, 6.2, 6.3, 6.4, 6.5, 7.1, 7.2, 7.5_

  - [x] 6.3 集成绩效快照到策略生成流程
    - 修改 `backend/app/services/strategy.py`，在策略生成后调用 `PerformanceTracker.create_snapshot()`
    - _需求: 6.1_

  - [x] 6.4 实现绩效结算 Worker `backend/workers/perf_settle_worker.py`
    - Celery Beat 每分钟触发，检查所有未结算策略
    - 检查止损/目标触达 → 记录结算
    - 72小时超时 → 强制结算
    - 在 checkpoint 时间点记录实际价格
    - _需求: 6.2, 6.3, 6.4_

  - [x] 6.5 实现绩效 API 路由 `backend/app/api/performance.py`
    - `GET /api/performance/stats` — 绩效统计（免费用户仅7天摘要）
    - `GET /api/performance/snapshots/{snapshot_id}` — 单条策略详情（专业+旗舰）
    - `GET /api/performance/trend` — 胜率趋势和累计盈亏曲线
    - 在 `backend/main.py` 中注册路由
    - _需求: 7.1, 7.2, 7.3, 7.4, 7.6, 7.7_

  - [ ]* 6.6 编写绩效追踪模块测试 `backend/tests/test_performance.py`
    - 测试盈亏百分比计算（多头/空头方向）
    - 测试止损/目标触达结算逻辑
    - 测试72小时超时结算
    - 测试统计指标计算（胜率、盈亏比）
    - _需求: 6.3, 6.4, 6.5, 7.1_

- [x] 7. 检查点 — 绩效追踪模块验证
  - 确保所有测试通过，如有问题请向用户确认。

- [x] 8. AI 对话助手模块（后端）
  - [x] 8.1 实现对话会话管理 `backend/app/services/chat_session.py`
    - 实现 `ChatSessionService` 类：`create_session`、`get_or_create_session`、`get_history`（最近20条）、`add_message`、`clear_session`
    - _需求: 8.7, 10.6_

  - [x] 8.2 实现对话限流服务 `backend/app/services/chat_quota.py`
    - 实现 `ChatQuotaService` 类：`check_and_increment`（Redis 计数器）
    - 每日 UTC 00:00 重置（TTL 到次日午夜）
    - 记录模型调用耗时和 token 用量
    - _需求: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6_

  - [x] 8.3 实现 ChatAgent 智能体 `backend/app/agents/chat.py`
    - 继承 `BaseAgent`，实现 `respond` 方法（流式返回）
    - 实现交易对别名映射（BTC/Bitcoin/比特币 → BTCUSDT 等）
    - 实现意图分类（价格查询、分析查询、链上查询、策略查询、解释查询）
    - 实现 `_gather_context`：根据意图查询最新行情、智能体报告、共识结果
    - 回答中引用具体数据来源，不生成无数据支撑的臆测
    - 不支持的交易对返回提示信息
    - 通过 `UnifiedLLMClient.stream_model` 流式调用 LLM
    - _需求: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6_

  - [x] 8.4 实现对话 API 路由 `backend/app/api/chat.py`
    - `POST /api/chat/message` — 发送消息（SSE 流式返回）
    - `POST /api/chat/sessions` — 创建新会话
    - `GET /api/chat/sessions/{session_id}/messages` — 获取历史消息
    - `GET /api/chat/quota` — 获取当日剩余次数
    - 在 `backend/main.py` 中注册路由
    - _需求: 8.1, 9.4, 10.5_

  - [ ]* 8.5 编写 ChatAgent 单元测试 `backend/tests/test_chat_agent.py`
    - Mock LLM 调用，测试意图分类和交易对识别
    - 测试限流逻辑（各等级额度、超限提示）
    - 测试会话上下文加载（最近20条）
    - _需求: 8.2, 8.5, 8.6, 9.1, 9.2, 9.3, 9.4_

- [x] 9. 检查点 — AI 对话助手模块验证
  - 确保所有测试通过，如有问题请向用户确认。

- [x] 10. 合约数据接入模块（后端）
  - [x] 10.1 实现合约数据模型
    - 在 `backend/app/models/market_data.py` 中新增 `DerivativesData`、`DerivativesSnapshot`、`LiquidationEvent` pydantic 模型
    - 扩展现有 `MarketData` 模型新增 `derivatives` 字段
    - _需求: 11.1, 11.4, 12.6_

  - [x] 10.2 实现合约数据采集器 `backend/app/data/derivatives.py`
    - 实现 `DerivativesCollector` 类：`collect_snapshot`（资金费率+多空比，每5分钟）、`collect_liquidations`（爆仓数据，每1分钟）
    - 调用 Binance Futures API，带30秒超时
    - 写入 TimescaleDB 时序表
    - 缓存到 Redis（资金费率 TTL=300s，爆仓 TTL=60s）
    - 失败重试，连续3次失败告警
    - _需求: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6, 11.7_

  - [x] 10.3 实现合约数据采集 Worker `backend/workers/derivatives_worker.py`
    - `collect_derivatives_snapshot_task` — Celery Beat 每5分钟触发
    - `collect_liquidations_task` — Celery Beat 每1分钟触发
    - 为所有已启用交易对采集，范围与 Symbol_Registry 一致
    - _需求: 11.1, 11.2, 11.5_

  - [x] 10.4 集成合约数据到现有智能体
    - 修改 `backend/app/agents/risk.py`：新增资金费率异常告警（|rate|>0.1%）、大规模爆仓告警（1h>$50M）、多空失衡告警（偏离1.0超过0.5）
    - 修改 `backend/app/agents/technical.py`：分析 Prompt 中包含资金费率和多空比
    - 修改 `backend/app/agents/playbook.py`：合约数据纳入剧本匹配条件（假突破诱多、恐慌洗盘）
    - _需求: 12.1, 12.2, 12.3, 12.4, 12.5_

  - [x] 10.5 实现合约数据 API 路由 `backend/app/api/derivatives.py`
    - `GET /api/derivatives/snapshot/{symbol}` — 最新合约快照（免费用户仅资金费率当前值）
    - `GET /api/derivatives/funding-history/{symbol}` — 资金费率历史（专业+旗舰）
    - `GET /api/derivatives/liquidations/{symbol}` — 爆仓流水（专业+旗舰，最多50条）
    - 在 `backend/main.py` 中注册路由
    - _需求: 13.1, 13.2, 13.3, 13.5, 13.6_

  - [ ]* 10.6 编写合约数据模块测试
    - `backend/tests/test_derivatives_collector.py` — Mock Binance API，测试数据采集和解析
    - `backend/tests/test_risk_derivatives.py` — 测试 RiskAgent 合约风险告警阈值逻辑
    - _需求: 11.1, 11.6, 12.1, 12.2, 12.3_

- [x] 11. 检查点 — 合约数据模块验证
  - 确保所有测试通过，如有问题请向用户确认。

- [x] 12. 前端 — 预警规则管理页面
  - [x] 12.1 创建预警 API 封装 `frontend/lib/api/alerts.ts`
    - 实现 `alertsApi`：`createRule`、`listRules`、`updateRule`、`deleteRule`、`listTriggers`
    - 定义 TypeScript 类型：`AlertRuleCreate`、`AlertRuleResponse`、`AlertTriggerResponse`、`MetricType`、`Operator`
    - _需求: 1.1, 1.5, 2.7_

  - [x] 12.2 实现预警规则表单组件 `frontend/components/alerts/AlertRuleForm.tsx`
    - 指标类型下拉选择（10种指标）
    - 运算符下拉选择（6种运算符）
    - 阈值数字输入
    - AND/OR 逻辑组合（最多2层嵌套）
    - 通知渠道多选（WebSocket/Telegram/邮件）
    - 支持创建和编辑模式
    - _需求: 1.2, 1.3, 1.4_

  - [x] 12.3 实现预警规则列表和触发历史组件
    - `frontend/components/alerts/AlertRuleList.tsx` — 规则列表（启用/禁用切换、编辑、删除）
    - `frontend/components/alerts/AlertTriggerHistory.tsx` — 触发历史列表（规则名、时间、触发值、通知状态）
    - _需求: 1.5, 1.6, 2.7_

  - [x] 12.4 创建预警管理页面 `frontend/app/alerts/page.tsx`
    - 整合规则表单、规则列表、触发历史组件
    - 显示当前等级的规则额度使用情况
    - _需求: 1.5, 1.7, 1.8, 1.9_

- [x] 13. 前端 — 合约数据面板
  - [x] 13.1 创建合约数据 API 封装 `frontend/lib/api/derivatives.ts`
    - 实现 `derivativesApi`：`getSnapshot`、`getFundingHistory`、`getLiquidations`
    - 定义 TypeScript 类型：`DerivativesSnapshot`、`LiquidationEvent`
    - _需求: 13.1, 13.2, 13.3_

  - [x] 13.2 实现合约数据面板组件 `frontend/components/derivatives/DerivativesPanel.tsx`
    - 资金费率显示（百分比，正值绿色负值红色）
    - 多空账户比柱状图
    - 24小时累计爆仓金额
    - 免费用户仅显示资金费率当前值
    - _需求: 13.1, 13.5, 13.6_

  - [x] 13.3 实现资金费率趋势图 `frontend/components/derivatives/FundingRateChart.tsx`
    - 使用 TradingView Lightweight Charts
    - 支持 7天/30天时间范围切换
    - _需求: 13.2_

  - [x] 13.4 实现爆仓流水列表 `frontend/components/derivatives/LiquidationFeed.tsx`
    - 最近50条爆仓事件（时间、交易对、方向、数量、价格）
    - 单笔 > $1M 高亮显示（红色边框 + 闪烁动画）
    - _需求: 13.3, 13.4_

  - [x] 13.5 集成合约面板到仪表盘
    - 修改 `frontend/app/dashboard/page.tsx`，新增合约数据面板区域
    - 根据会员等级控制显示内容
    - _需求: 13.1, 13.5, 13.6_

- [x] 14. 前端 — 策略绩效看板
  - [x] 14.1 创建绩效 API 封装 `frontend/lib/api/performance.ts`
    - 实现 `performanceApi`：`getStats`、`getSnapshotDetail`、`getTrend`
    - 定义 TypeScript 类型：`PerformanceStats`、`SnapshotDetail`
    - _需求: 7.1, 7.2, 7.4_

  - [x] 14.2 实现绩效摘要卡片 `frontend/components/performance/PerformanceSummary.tsx`
    - 展示胜率、总策略数、盈亏比
    - 免费用户仅显示胜率和总策略数
    - _需求: 7.1, 7.6, 7.7_

  - [x] 14.3 实现胜率趋势和盈亏曲线图表
    - `frontend/components/performance/WinRateTrend.tsx` — 最近30天胜率趋势折线图
    - `frontend/components/performance/PnlCurve.tsx` — 累计盈亏曲线
    - 使用 TradingView Lightweight Charts
    - _需求: 7.3_

  - [x] 14.4 创建绩效详情页 `frontend/app/performance/page.tsx`
    - 整合绩效摘要、趋势图表
    - 支持按交易对、时间范围（7天/30天/90天/全部）、方向筛选
    - 单条策略详情展示（快照、各时间点价格、盈亏结果）
    - _需求: 7.2, 7.3, 7.4_

  - [x] 14.5 集成绩效摘要到仪表盘
    - 修改 `frontend/app/dashboard/page.tsx`，新增绩效摘要卡片区域
    - _需求: 7.3_

- [x] 15. 前端 — AI 对话侧边栏
  - [x] 15.1 创建对话 API 封装 `frontend/lib/api/chat.ts`
    - 实现 `chatApi`：`sendMessage`（SSE EventSource）、`createSession`、`getMessages`、`getQuota`
    - 定义 TypeScript 类型：`ChatMessageRequest`、`ChatMessageResponse`、`ChatSessionResponse`、`ChatQuotaResponse`
    - _需求: 8.1, 9.4, 10.5_

  - [x] 15.2 实现聊天消息组件 `frontend/components/chat/ChatMessage.tsx`
    - 用户消息右对齐，AI回复左对齐
    - AI回复支持 Markdown 渲染（react-markdown：代码块、表格、加粗）
    - _需求: 10.2, 10.3_

  - [x] 15.3 实现聊天输入框组件 `frontend/components/chat/ChatInput.tsx`
    - 文本输入框 + 发送按钮
    - 底部显示当日剩余查询次数
    - _需求: 10.5_

  - [x] 15.4 实现可折叠聊天侧边栏 `frontend/components/chat/ChatSidebar.tsx`
    - 默认收起，点击展开
    - 展开时显示历史消息
    - 流式打字效果（SSE EventSource 逐字显示）
    - "新建会话"按钮清空上下文
    - _需求: 10.1, 10.2, 10.4, 10.6_

  - [x] 15.5 集成聊天侧边栏到全局布局
    - 修改 `frontend/app/layout.tsx`，添加 ChatSidebar 组件
    - 全局可用，所有页面均可展开聊天
    - _需求: 10.1_

- [x] 16. 前端 — 多币种与关联分析
  - [x] 16.1 扩展现有前端支持多交易对切换
    - 修改 `frontend/app/dashboard/page.tsx` 添加交易对选择器
    - 修改 `frontend/app/onchain/page.tsx` 支持按 symbol 查询
    - 修改 `frontend/app/consensus/page.tsx` 支持按 symbol 筛选
    - 免费用户仅可选择 BTCUSDT
    - _需求: 3.5, 3.7, 3.8, 4.4_

  - [x] 16.2 实现关联分析热力图
    - `frontend/components/correlation/CorrelationHeatmap.tsx` — 热力图组件（-1红 → 0白 → 1绿，强相关加粗边框）
    - `frontend/app/correlation/page.tsx` — 关联分析页面
    - 专业+旗舰可用，免费用户不可访问
    - _需求: 5.4, 5.5, 5.6_

- [x] 17. 全局集成与路由注册
  - [x] 17.1 更新前端导航
    - 修改 `frontend/components/layout/` 中的导航组件，添加预警管理、绩效看板、关联分析的导航入口
    - _需求: 全局_

  - [x] 17.2 更新 Celery Beat 调度配置
    - 在 `backend/workers/celery_app.py` 中注册新的定时任务：`schedule_all_symbols`（每分钟）、`settle_strategies`（每分钟）、`collect_derivatives_snapshot`（每5分钟）、`collect_liquidations`（每分钟）、`compute_correlations`（每小时）
    - _需求: 3.2, 5.1, 6.2, 11.1, 11.2_

  - [x] 17.3 更新 WebSocket 广播支持多币种和预警通知
    - 修改 `backend/app/api/ws.py`，支持按 symbol 订阅和预警触发推送
    - _需求: 2.2, 3.5_

- [x] 18. 最终检查点 — 全模块集成验证
  - 确保所有测试通过，如有问题请向用户确认。

## 备注

- 标记 `*` 的子任务为可选测试任务，可跳过以加速 MVP 交付
- 每个任务引用了对应的需求编号，确保需求全覆盖
- 检查点任务用于阶段性验证，确保增量可用
- 后端使用 Python（FastAPI + Celery），前端使用 TypeScript（Next.js 14）
- 所有 AI 调用经过 `UnifiedLLMClient`，所有外部 API 调用带30秒超时
