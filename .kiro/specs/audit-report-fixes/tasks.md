# Implementation Plan

- [x] 1. Write bug condition exploration tests
  - **Property 1: Fault Condition** - 基础设施链路断裂与功能缺陷验证
  - **CRITICAL**: This test MUST FAIL on unfixed code - failure confirms the bugs exist
  - **DO NOT attempt to fix the test or the code when it fails**
  - **NOTE**: These tests encode the expected behavior - they will validate the fixes when they pass after implementation
  - **GOAL**: Surface counterexamples that demonstrate the bugs exist across P0/P1 issues
  - **Scoped PBT Approach**: Scope properties to concrete failing cases for each bug group
  - Test file: `backend/tests/test_audit_fault_conditions.py`
  - **Group A - Stream 名称不匹配 (#1.1, #1.13)**:
    - Assert `ws.py` `start_stream_consumers()` consumes `kline_updates` (not `price_updates`)
    - Assert `alert_eval_worker._STREAMS` contains `kline_updates` (not `price_updates`)
    - Expected failure: stream names mismatch, messages lost
  - **Group B - Email SQL (#1.2)**:
    - Mock DB and call `_query_email_recipients()`, assert SQL JOINs `users` table for email
    - Expected failure: SQL references non-existent `push_settings.email` column
  - **Group C - 硬编码配置 (#1.3, #1.4)**:
    - Assert Dashboard reads `membership_level` from `useAuth()` context (not hardcoded 0)
    - Assert CORS `allow_origins` reads from `settings.cors_origins` (not hardcoded list)
  - **Group D - 共识引擎与策略 (#1.5, #1.6)**:
    - Assert `StrategyService` has `generate_from_consensus(ConsensusReport)` method
    - Construct 1 bullish(0.8) + 3 neutral votes, assert consensus is `neutral` (not `bullish`)
    - Assert threshold is ±0.35 with ≥2 models direction-consistent constraint
    - Expected failure: no `generate_from_consensus` method; single model biases consensus
  - Run tests on UNFIXED code
  - **EXPECTED OUTCOME**: Tests FAIL (this is correct - it proves the bugs exist)
  - Document counterexamples found to understand root causes
  - Mark task complete when tests are written, run, and failures are documented
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.13_

- [x] 2. Write preservation property tests (BEFORE implementing fix)
  - **Property 2: Preservation** - 现有功能行为保持验证
  - **IMPORTANT**: Follow observation-first methodology
  - Test file: `backend/tests/test_audit_preservation.py`
  - **Observe on UNFIXED code, then write property-based tests:**
  - **WebSocket alerts 保持 (3.1)**:
    - Observe: `/ws/alerts` consumes `alerts` stream correctly
    - Property: for all alert messages, alerts channel behavior unchanged
  - **Email worker 非邮件类型跳过 (3.2)**:
    - Observe: `alert_type` not in `_EMAIL_EVENT_TYPES` → skip and ACK
    - Property: for all non-email alert types, worker skips processing
  - **免费用户 Dashboard 保持 (3.3)**:
    - Observe: membership_level=0 → DerivativesPanel/PerformanceSummary render as free
    - Property: for all free users, Dashboard renders identically before/after fix
  - **localhost CORS 保持 (3.4)**:
    - Observe: `http://localhost:3000` is always allowed
    - Property: for all requests from localhost:3000, CORS allows through
  - **generate_from_report 保持 (3.5)**:
    - Observe: `generate_from_report(AgentReport)` produces StrategyResult
    - Property: for all valid AgentReport inputs, output unchanged after fix
  - **强共识保持 (3.6)**:
    - Observe: 4 models all bullish → consensus = bullish
    - Property: for all unanimous vote combinations, consensus signal matches direction
  - **现有剧本匹配保持 (3.7)**:
    - Observe: 4 original playbook patterns match correctly
    - Property: for all inputs matching original 4 patterns, matching logic unchanged
  - **等权默认保持 (3.8)**:
    - Observe: no history data → default accuracy 0.5, equal weights
    - Property: for all empty history scenarios, weights are equal and sum to 1.0
  - **支撑/阻力位入场保持 (3.9)**:
    - Observe: with support/resistance data, entry range uses those values
    - Property: for all inputs with support/resistance, entry calculation unchanged
  - **现有采集不受影响 (3.10, 3.11, 3.15)**:
    - Observe: fear_greed_index collection, exchange net flow, indicator_updates/onchain_updates streams work
    - Property: for all existing collector/stream operations, behavior unchanged
  - **风险降级默认值 (3.12)**:
    - Observe: config_service unavailable → use hardcoded defaults
    - Property: for all config failures, risk agent uses fallback values
  - **PnL 曲线保持 (3.13)**:
    - Observe: /performance page renders PnL curve
    - Property: PnL curve rendering unchanged after adding accuracy card
  - **API confidence 格式保持 (3.14)**:
    - Observe: API returns confidence as float
    - Property: for all API responses, confidence field remains raw float
  - Verify all tests PASS on UNFIXED code
  - **EXPECTED OUTCOME**: Tests PASS (this confirms baseline behavior to preserve)
  - Mark task complete when tests are written, run, and passing on unfixed code
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 3.10, 3.11, 3.12, 3.13, 3.14, 3.15_

- [x] 3. P0 — 基础设施恢复修复

  - [x] 3.1 统一 Redis Stream 名称为 kline_updates (#1.1 + #1.13)
    - `backend/app/api/ws.py`: 将 `_consume_stream("price_updates", "price")` 改为 `_consume_stream("kline_updates", "price")`
    - `backend/workers/alert_eval_worker.py`: 将 `_STREAMS` 中 `"price_updates"` 改为 `"kline_updates"`
    - 不修改 `alerts` stream 消费逻辑（Preservation 3.1, 3.11）
    - _Bug_Condition: isBugCondition_StreamMismatch — producer stream "kline_updates" != consumer stream "price_updates"_
    - _Expected_Behavior: ws.py 和 alert_eval_worker.py 消费 "kline_updates"，WebSocket /ws/price 正常广播_
    - _Preservation: /ws/alerts 消费 alerts stream 不变；indicator_updates/onchain_updates 消费不变_
    - _Requirements: 2.1, 2.13_

  - [x] 3.2 修正 email_worker SQL 查询 JOIN users 表 (#1.2)
    - `backend/workers/email_worker.py`: 将 `SELECT email FROM push_settings WHERE ...` 改为 `SELECT u.email FROM push_settings ps JOIN users u ON u.id = ps.user_id WHERE ps.email_enabled = TRUE AND u.email IS NOT NULL AND ps.events @> :event_json`
    - 非邮件类型告警的跳过逻辑不变（Preservation 3.2）
    - _Bug_Condition: isBugCondition_EmailSQL — push_settings 表无 email 列，SQL 报 UndefinedColumn_
    - _Expected_Behavior: SQL JOIN users 表正确获取邮箱，邮件推送恢复_
    - _Preservation: 非邮件类型告警继续跳过并 ACK_
    - _Requirements: 2.2_

  - [x] 3.3 Verify P0 bug condition exploration tests now pass
    - **Property 1: Expected Behavior** - Stream 名称统一 + Email SQL 修正
    - **IMPORTANT**: Re-run the SAME Group A and Group B tests from task 1 - do NOT write new tests
    - Run stream name tests: assert ws.py consumes `kline_updates`, alert_eval_worker._STREAMS contains `kline_updates`
    - Run email SQL test: assert SQL JOINs users table
    - **EXPECTED OUTCOME**: Tests PASS (confirms P0 bugs are fixed)
    - _Requirements: 2.1, 2.2, 2.13_

  - [x] 3.4 Verify P0 preservation tests still pass
    - **Property 2: Preservation** - P0 保持性验证
    - **IMPORTANT**: Re-run the SAME preservation tests from task 2 - do NOT write new tests
    - Verify: /ws/alerts stream 消费不变 (3.1)
    - Verify: 非邮件类型跳过不变 (3.2)
    - Verify: indicator_updates/onchain_updates 消费不变 (3.11)
    - **EXPECTED OUTCOME**: Tests PASS (confirms no regressions)

- [x] 4. P1 — 功能缺陷修复

  - [x] 4.1 Dashboard 会员等级从 useAuth() 读取 (#1.3)
    - `frontend/app/(main)/dashboard/page.tsx`: 移除 `const MEMBERSHIP_LEVEL = 0` 硬编码
    - 导入 `useAuth` hook，通过 `const { user } = useAuth()` 获取用户信息
    - 将 `MEMBERSHIP_LEVEL` 替换为 `user?.membership_level ?? 0`
    - 免费用户（membership_level=0）渲染行为不变（Preservation 3.3）
    - _Bug_Condition: isBugCondition_Hardcoded — user.membership_level > 0 但 MEMBERSHIP_LEVEL_CONST == 0_
    - _Expected_Behavior: DerivativesPanel/PerformanceSummary 按用户实际会员等级渲染_
    - _Preservation: 免费用户 Dashboard 渲染不变_
    - _Requirements: 2.3_

  - [x] 4.2 CORS 从 Settings 配置读取 (#1.4)
    - `backend/app/core/config.py`: Settings 类新增 `cors_origins: str = "http://localhost:3000"`
    - `backend/main.py`: 将 `allow_origins=["http://localhost:3000"]` 改为 `allow_origins=settings.cors_origins.split(",")`
    - localhost:3000 默认包含在配置中（Preservation 3.4）
    - _Bug_Condition: isBugCondition_Hardcoded — deploy_origin != "http://localhost:3000" 且 allow_origins 硬编码_
    - _Expected_Behavior: CORS 从 settings.cors_origins 读取，支持逗号分隔多域名_
    - _Preservation: localhost:3000 始终允许_
    - _Requirements: 2.4_

  - [x] 4.3 策略服务新增 generate_from_consensus() 方法 (#1.5)
    - `backend/app/services/strategy.py`: 导入 ConsensusReport，新增 `generate_from_consensus(report: ConsensusReport, current_price: float) -> StrategyResult`
    - 使用 consensus_signal 确定方向，consensus_confidence 作为基础置信度
    - divergence > 30 时置信度乘以衰减因子 `max(0.3, 1.0 - divergence / 100)`
    - minority_warnings 附加到 reasoning
    - 保留原有 `generate_from_report()` 不变（Preservation 3.5）
    - _Bug_Condition: isBugCondition_ConsensusStrategy — StrategyService 无 generate_from_consensus 方法_
    - _Expected_Behavior: 新方法利用共识信号、置信度和分歧度生成策略_
    - _Preservation: generate_from_report(AgentReport) 继续正常工作_
    - _Requirements: 2.5_

  - [x] 4.4 提高共识阈值并增加多模型一致性约束 (#1.6)
    - `backend/app/consensus/engine.py` `_weighted_aggregate()`: 阈值从 ±0.2 提高到 ±0.35
    - 增加 bullish_count/bearish_count 计数，要求 ≥2 个模型方向一致
    - 4 模型全部一致时共识信号正确输出（Preservation 3.6）
    - _Bug_Condition: isBugCondition_ConsensusStrategy — bullish_count < 2 且 abs(weighted_score) > 0.2 → 误判_
    - _Expected_Behavior: 阈值 ±0.35 + ≥2 模型一致，单模型无法带偏共识_
    - _Preservation: 强共识场景（4模型一致）输出不变_
    - _Requirements: 2.6_

  - [x] 4.5 Verify P1 bug condition exploration tests now pass
    - **Property 1: Expected Behavior** - Dashboard + CORS + 共识策略修正
    - **IMPORTANT**: Re-run the SAME Group C and Group D tests from task 1 - do NOT write new tests
    - Run Dashboard test: assert membership_level from useAuth()
    - Run CORS test: assert origins from settings
    - Run consensus tests: assert generate_from_consensus exists; assert 1 bullish + 3 neutral → neutral
    - **EXPECTED OUTCOME**: Tests PASS (confirms P1 bugs are fixed)
    - _Requirements: 2.3, 2.4, 2.5, 2.6_

  - [x] 4.6 Verify P1 preservation tests still pass
    - **Property 2: Preservation** - P1 保持性验证
    - **IMPORTANT**: Re-run the SAME preservation tests from task 2 - do NOT write new tests
    - Verify: 免费用户 Dashboard 渲染不变 (3.3)
    - Verify: localhost:3000 CORS 不变 (3.4)
    - Verify: generate_from_report 不变 (3.5)
    - Verify: 强共识场景不变 (3.6)
    - **EXPECTED OUTCOME**: Tests PASS (confirms no regressions)

- [x] 5. P2 — 功能补全与质量提升

  - [x] 5.1 扩充剧本知识库至 8 种 (#1.7)
    - `backend/app/agents/playbook_patterns.py`: 新增横盘吸筹、诱空杀空、二次探底、阶梯式拉升 4 种剧本
    - 每种包含 features、aftermath、signal 字段
    - 更新 `PLAYBOOK_SIGNAL_MAP` 和 `VALID_PLAYBOOK_NAMES`
    - `backend/app/agents/playbook.py`: `_build_system_prompt()` 的 `all_probabilities` 包含全部 8 种
    - 现有 4 种剧本匹配逻辑不变（Preservation 3.7）
    - _Bug_Condition: isBugCondition_MissingFeatures — market_pattern NOT IN PLAYBOOK_PATTERNS.names_
    - _Expected_Behavior: 知识库覆盖 8 种核心剧本_
    - _Preservation: 原有 4 种剧本匹配不变_
    - _Requirements: 2.7_

  - [x] 5.2 引入阶段追踪模块 (#1.8)
    - 新建 `backend/app/agents/phase_tracker.py`
    - 定义阶段枚举: accumulation → testing → markup → distribution
    - Redis Hash `phase:{symbol}` 存储当前阶段、进入时间、转换历史
    - `detect_transition(symbol, market_data) -> PhaseTransition | None`
    - 转换时通过 `publish_stream("alerts", ...)` 触发告警
    - `backend/app/agents/playbook.py`: `analyze()` 调用 phase_tracker，注入阶段信息到 prompt
    - _Bug_Condition: isBugCondition_MissingFeatures — NOT exists(phase_tracker) FOR symbol_
    - _Expected_Behavior: 维护每个交易对阶段状态，检测转换并告警_
    - _Requirements: 2.8_

  - [x] 5.3 动态权重增加校准度和幅度匹配度 (#1.9)
    - `backend/app/consensus/weights.py`: 修改 `_ACCURACY_SQL` 增加置信度校准度和幅度匹配度
    - `calculate_weights()` 综合三维度: direction_accuracy * 0.5 + calibration_score * 0.3 + magnitude_score * 0.2
    - 无历史数据时仍用默认准确率 0.5（Preservation 3.8）
    - _Bug_Condition: isBugCondition_MissingFeatures — weightEvaluation ONLY_CONSIDERS "direction_accuracy"_
    - _Expected_Behavior: 三维度综合评分，权重分配更精确_
    - _Preservation: 无历史数据时等权分配不变_
    - _Requirements: 2.9_

  - [x] 5.4 引入 ATR 动态计算入场区间 (#1.10)
    - `backend/app/data/indicators.py`: 新增 `calculate_atr(klines, period=14) -> list[float]`
    - `backend/app/models/market_data.py` IndicatorResult: 新增 `atr: float | None = None`
    - `backend/app/services/strategy.py` `generate_from_report()`: 无支撑/阻力位时用 ATR 计算 entry_range = price ± 1.5*ATR, stop_loss = price - 2.0*ATR
    - 有支撑/阻力位时继续用原逻辑（Preservation 3.9）
    - ATR 不可用时回退到固定百分比（兼容降级）
    - _Bug_Condition: isBugCondition_MissingFeatures — NOT exists(support_resistance) AND uses_fixed_percentage_
    - _Expected_Behavior: ATR 动态入场区间替代固定百分比_
    - _Preservation: 有支撑/阻力位时入场计算不变_
    - _Requirements: 2.10_

  - [x] 5.5 创建 sentiment_worker 并接入分析链路 (#1.11 + #1.15)
    - 新建 `backend/workers/sentiment_worker.py`: Celery 定时任务 `collect_sentiment_task`
    - 调用 `sentiment.py` 的 `fetch_fear_greed_index()` 采集数据
    - 写入 Redis: `set_with_ttl("sentiment:fear_greed", data, 3600)`
    - 在 celery_app beat_schedule 注册，每 30 分钟执行
    - 共识引擎 MarketData 组装: 优先从 Redis 读取 `sentiment:fear_greed` 覆盖 `onchain.fear_greed_index`
    - 现有采集逻辑不受影响（Preservation 3.10, 3.15）
    - _Bug_Condition: isBugCondition_MissingFeatures — NOT exists(sentiment_worker) AND consensus NOT_READS sentiment_
    - _Expected_Behavior: sentiment_worker 定时采集，共识引擎消费 sentiment 数据_
    - _Preservation: 现有 Worker 和采集逻辑不变_
    - _Requirements: 2.11, 2.15_

  - [x] 5.6 接入替代 MVRV 数据源 (#1.12)
    - `backend/app/data/onchain.py`: 新增 `fetch_mvrv(symbol) -> float | None`
    - 接入 CoinGlass/CryptoQuant 免费层 MVRV API，Key 从 config_service 读取
    - `collect_snapshot()` 的 `asyncio.gather` 加入 `fetch_mvrv()`
    - 无 Key 时降级返回 None（兼容现有行为）
    - 现有链上采集不受影响（Preservation 3.10）
    - _Bug_Condition: isBugCondition_MissingFeatures — onchain_snapshot.mvrv IS ALWAYS None_
    - _Expected_Behavior: mvrv 字段从替代数据源获取实际值_
    - _Preservation: 恐慌贪婪指数和交易所净流量采集不变_
    - _Requirements: 2.12_

  - [x] 5.7 风险阈值从动态配置读取 (#1.14)
    - `backend/app/agents/risk.py`: 新增 `_get_risk_thresholds()` 从 config_service 异步读取阈值
    - 保留原硬编码常量作为降级默认值（Preservation 3.12）
    - `check_thresholds()` 改为 async，内部调用 `_get_risk_thresholds()`
    - config_service 不可用时 catch 异常使用默认值
    - _Bug_Condition: isBugCondition_Hardcoded — market_cycle 变化但阈值固定不变_
    - _Expected_Behavior: 阈值从 config_service 读取，支持管理员在线调整_
    - _Preservation: 配置不可用时使用硬编码默认值_
    - _Requirements: 2.14_

  - [x] 5.8 Verify P2 preservation tests still pass
    - **Property 2: Preservation** - P2 保持性验证
    - **IMPORTANT**: Re-run the SAME preservation tests from task 2 - do NOT write new tests
    - Verify: 现有 4 种剧本匹配不变 (3.7)
    - Verify: 无历史数据时等权分配不变 (3.8)
    - Verify: 有支撑/阻力位时入场计算不变 (3.9)
    - Verify: 现有采集和 Worker 不变 (3.10, 3.11, 3.15)
    - Verify: 风险降级默认值不变 (3.12)
    - **EXPECTED OUTCOME**: Tests PASS (confirms no regressions)

- [x] 6. P3 — 低优先级改进

  - [x] 6.1 前端展示智能体准确率 (#1.16)
    - `frontend/app/(main)/performance/page.tsx`: 新增 AgentAccuracyCard 组件
    - 调用 `get_stats()` 返回的 `by_agent` 字段，柱状图/排行榜展示
    - PnL 曲线渲染不变（Preservation 3.13）
    - _Requirements: 2.16_

  - [x] 6.2 置信度语义映射 (#1.17)
    - 新建 `frontend/lib/utils/confidence.ts`: 导出 `mapConfidenceLabel(confidence: number): string`
    - <0.3 → "低置信度 — 仅供参考"，0.3-0.6 → "中等置信度 — 需结合其他信号"，0.6-0.8 → "较高置信度 — 可作为主要参考"，>0.8 → "高置信度 — 多维度信号一致"
    - 在策略卡片、共识页面等组件中调用
    - 后端 API confidence 字段格式不变（Preservation 3.14）
    - _Requirements: 2.17_

  - [x] 6.3 清理 seed_admin.py (#1.18)
    - `backend/scripts/seed_admin.py`: 移除硬编码密码和邮箱，改为从环境变量 `ADMIN_EMAIL`/`ADMIN_PASSWORD` 读取
    - 无环境变量时报错退出，不使用默认值
    - 将 `backend/scripts/seed_admin.py` 加入 `.gitignore`
    - _Requirements: 2.18_

  - [x] 6.4 Docker 前端镜像重建 (#1.19)
    - 运维操作：运行 `docker compose up --build -d frontend` 重建前端镜像
    - 此为手动操作，不涉及代码变更
    - _Requirements: 2.19_

  - [x] 6.5 Verify P3 preservation tests still pass
    - **Property 2: Preservation** - P3 保持性验证
    - **IMPORTANT**: Re-run the SAME preservation tests from task 2 - do NOT write new tests
    - Verify: PnL 曲线渲染不变 (3.13)
    - Verify: API confidence 字段格式不变 (3.14)
    - **EXPECTED OUTCOME**: Tests PASS (confirms no regressions)

- [x] 7. Checkpoint - Ensure all tests pass
  - Run full test suite: `pytest backend/tests/ -v`
  - Ensure all fault condition exploration tests (task 1) now PASS
  - Ensure all preservation property tests (task 2) still PASS
  - Ensure all new unit tests pass (stream names, email SQL, CORS, consensus threshold, ATR, weights, etc.)
  - Verify no regressions in existing test suite
  - Ask the user if questions arise
