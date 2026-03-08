# 实施计划：一键综合分析面板

## 概述

按分层顺序实现：数据模型 → SMC 指标检测器 → 配额服务 → 编排器 → API 路由 → 前端组件。每个后端模块配套属性测试和单元测试，前端组件在后端完成后实现。

## 任务

- [x] 1. 数据模型与基础类型定义
  - [x] 1.1 创建 `backend/app/models/analysis.py`，定义 AnalysisMode 枚举、MODE_LEVEL_REQUIREMENTS / MODE_CACHE_TTL / MODE_TOTAL_TIMEOUT / MODE_KLINE_INTERVALS 常量映射、AnalysisRequest / QuotaInfo / AnalysisQuotaResponse 请求响应模型、CandlestickPattern / FVGResult / OrderBlockResult SMC 结果模型、ReportSection / AnalysisReport 报告模型、SSEEvent / ProgressEvent / PartialEvent / CompleteEvent / CachedEvent / ErrorEvent SSE 事件模型
    - _需求: 1.1, 3.5, 4.3, 5.4, 6.1, 9.1, 9.2, 11.3, 12.1, 13.3_
  - [x] 1.2 修改 `backend/app/models/market_data.py`，在 MarketData 中新增 `klines_5m: list[KlineData] = []` 和 `klines_30m: list[KlineData] = []` 字段
    - _需求: 3.1_

- [x] 2. SMC 指标检测器实现
  - [x] 2.1 在 `backend/app/data/smc_indicators.py` 中实现 `CandlestickPatternDetector.detect()`，支持吞没形态、Pin Bar、晨星/暮星、刺穿/乌云盖顶、三内部、大阳线/大阴线检测，少于 3 根K线返回空列表
    - _需求: 11.1, 11.2, 11.3, 11.4, 11.6_
  - [x] 2.2 在 `backend/app/data/smc_indicators.py` 中实现 `FVGDetector.detect()`，支持看涨/看跌 FVG 检测、4 种 ATR 过滤模式（Mode 0-3）、回补追踪（mitigated 标记）、ATR 数据不足时回退 Mode 0
    - _需求: 12.1, 12.2, 12.3, 12.4, 12.5, 12.6, 12.7_
  - [x] 2.3 在 `backend/app/data/smc_indicators.py` 中实现 `OrderBlockDetector.detect()`，支持 6 种 OB 类型（Main ChoCh / Sub ChoCh / BoS × Demand / Supply）、阶段感知置信度评分、市场结构不足时返回空列表
    - _需求: 13.1, 13.2, 13.3, 13.4, 13.7, 13.8_
  - [x]* 2.4 在 `backend/tests/test_smc_indicators.py` 中编写 SMC 检测器属性测试 ✅ (29 tests)
    - **Property 10: K线形态检测结构完整性** ✅ TestCandlestickPatternDetector + TestHelpers
    - **验证需求: 11.1, 11.2, 11.3**
    - **Property 11: FVG 检测正确性** ✅ TestFVGDetectionProperty (bullish/bearish/never_raises)
    - **验证需求: 12.1**
    - **Property 12: FVG ATR 过滤单调性** ✅ TestFVGATRMonotonicity (mode_monotonicity + atr_fallback)
    - **验证需求: 12.2, 12.7**
    - **Property 13: FVG 回补追踪** ✅ TestFVGMitigationProperty (partial + full)
    - **验证需求: 12.4**
    - **Property 14: 订单块阶段感知** ✅ TestOrderBlockPhaseProperty (phase nonzero + no_phase zero)
    - **验证需求: 13.4**
    - **Property 16: OB-巨鲸交叉验证** ✅ TestOBWhaleProperty (overlap + no_data + non_overlapping)
    - **验证需求: 5.2, 13.6**
  - [x]* 2.5 在 `backend/tests/test_smc_unit.py` 中编写 SMC 检测器单元测试
    - 边界：少于 3 根K线 → 空结果（需求 11.6）
    - 边界：ATR 数据不足 → 回退 Mode 0（需求 12.7）
    - 边界：市场结构不足 → 空 OB 结果（需求 13.8）
    - 示例：已知吞没形态K线 → 正确识别
    - 示例：已知 FVG 三根K线 → 正确检测

- [x] 3. 检查点 — SMC 指标检测器
  - 确保所有 SMC 检测器测试通过，如有问题请向用户确认。

- [x] 4. 分析配额服务实现
  - [x] 4.1 创建 `backend/app/services/analysis_quota.py`，实现 `AnalysisQuotaService`，包含 `check_and_increment(user_id, level, mode)`、`get_remaining(user_id, level, mode)`、`get_all_quotas(user_id, level)` 方法，复用 ChatQuotaService 的 Redis INCR + TTL 模式，按模式维度独立计数，Redis key 格式 `analysis_quota:{user_id}:{mode}:{date}`
    - _需求: 2.1, 2.2, 2.3, 2.4, 2.5_
  - [x]* 4.2 在 `backend/tests/test_analysis_quota.py` 中编写配额服务属性测试 ✅ (28 tests)
    - **Property 2: 配额计数器独立性与限额执行** ✅ TestQuotaCounterIndependence (exhaustion + independence + locked + remaining + boundary)
    - **验证需求: 2.1, 2.2, 2.3, 2.4, 2.5**
    - **Property 8: 缓存与配额交互** ✅ TestCacheQuotaInteraction (cache_hit + cache_miss + bonus_credits)
    - **验证需求: 7.4, 7.5**

- [x] 5. 分析编排器实现
  - [x] 5.1 创建 `backend/app/services/analysis_orchestrator.py`，实现 `AnalysisOrchestrator` 类，包含 `run_analysis()` 主方法（SSE 事件生成器）、`_run_scalping()` / `_run_intraday()` / `_run_trend()` 三种模式流程、`_safe_call_agent()` 智能体安全调用（60s 超时）、缓存检查/写入逻辑、配额检查/扣减逻辑、SSE 事件推送逻辑
    - 实时短线：并行采集 5m/15m/30m K线 + 技术指标 → CandlestickPatternDetector + FVGDetector → TechnicalAgent → StrategyService
    - 日内博弈：并行调用 TechnicalAgent(15m/1h/4h) + OnchainAgent + RiskAgent + SMC 检测器(含 OB) + 合约数据 → PhaseTracker → 策略
    - 趋势布局：并行调用四智能体 + SMC 检测器 → OB-巨鲸交叉验证 → NSED Engine → StrategyService
    - 总超时控制：scalping=90s, intraday=180s, trend=300s
    - 降级策略：单智能体失败跳过、NSED 失败回退加权平均、总超时返回部分报告
    - _需求: 3.1-3.6, 4.1-4.5, 5.1-5.6, 6.1-6.4, 7.1-7.5, 10.1-10.5_
  - [x]* 5.2 在 `backend/tests/test_orchestrator_property.py` 中编写编排器属性测试 ✅ (26 tests)
    - **Property 1: 模式权限映射正确性** ✅ TestModeConstants (8 tests)
    - **验证需求: 1.2, 1.3, 1.4, 9.4**
    - **Property 3: 报告分段完整性** ✅ TestReportSectionCompleteness (scalping/intraday/trend)
    - **验证需求: 3.5, 4.3, 5.4**
    - **Property 4: 智能体故障降级** ✅ TestAgentFailureDegradation (all_fail_scalping/intraday/partial/trend_nsed)
    - **验证需求: 3.6, 4.4, 10.2**
    - **Property 5: NSED 引擎回退** ✅ TestWeightedAverageFallback + TestAgentFailureDegradation.test_all_agents_fail_trend_nsed_fallback
    - **验证需求: 5.5**
    - **Property 15: 订单块模式限制** ✅ TestOBModeRestriction (scalping无OB/intraday有OB/trend有OB)
    - **验证需求: 13.5**

- [x] 6. 检查点 — 后端核心服务
  - 确保配额服务和编排器所有测试通过，如有问题请向用户确认。

- [x] 7. 分析 API 路由
  - [x] 7.1 创建 `backend/app/api/analysis.py`，实现 `POST /api/analysis/run`（SSE 流式响应，参数校验 422、权限校验 403、配额校验 429）和 `GET /api/analysis/quota`（返回各模式配额信息），复用现有 `get_current_user` 依赖和 `StreamingResponse` 模式
    - _需求: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6_
  - [x] 7.2 修改 `backend/main.py`，导入并注册 analysis_router
    - _需求: 9.1_

- [x] 8. 前端 API 客户端
  - [x] 8.1 创建 `frontend/lib/api/analysis.ts`，实现 SSE 流式分析请求（async generator 解析 SSE 事件）和配额查询 REST 接口，复用 `authHeaders()` 模式
    - _需求: 6.1, 8.1, 9.1, 9.2_

- [x] 9. 前端分析面板组件
  - [x] 9.1 创建 `frontend/components/analysis/AnalysisProgress.tsx`，实现步骤进度指示器：已完成步骤绿色勾选、进行中步骤加载动画、未开始步骤灰色，使用 Framer Motion 动画
    - _需求: 8.3_
  - [x] 9.2 创建 `frontend/components/analysis/AnalysisReport.tsx`，实现结构化报告展示：按维度分段（技术分析、链上数据、合约数据、共识报告、策略建议）、可折叠/展开、信号颜色编码（bullish 绿色、bearish 红色、neutral 灰色）、缓存标注
    - _需求: 8.4, 8.6, 7.3_
  - [x] 9.3 创建 `frontend/components/analysis/AnalysisPanel.tsx`，实现分析面板主组件：交易对选择器 + 模式选择器（含锁定状态和升级提示）+ 配额显示 + 开始分析按钮 + 进度指示器 + 报告展示区 + SSE 连接中断重试 + 响应式布局（<768px 全屏模态）
    - _需求: 1.1, 1.2, 1.3, 1.4, 1.5, 2.6, 2.7, 6.5, 7.3, 7.4, 8.1, 8.2, 8.5_

- [x] 10. 前端集成与布局替换
  - [x] 10.1 修改 `frontend/components/layout/TopNav.tsx`，将 ChatSidebar 引用替换为 AnalysisPanel
    - _需求: 8.1_

- [x] 11. 最终检查点
  - 确保所有后端测试通过，前端组件正确渲染，SSE 流式通信正常工作。如有问题请向用户确认。

## 备注

- 标记 `*` 的子任务为可选，可跳过以加速 MVP 交付
- 每个任务引用具体需求编号以确保可追溯性
- 属性测试验证跨所有输入的通用正确性属性，单元测试验证具体示例和边界条件
- 前端任务（8-10）依赖后端任务（1-7）完成后的 API 端点
