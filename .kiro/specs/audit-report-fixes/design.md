# 审查报告问题修复 Bugfix Design

## Overview

本设计文档覆盖系统审查报告（`docs/AUDIT_REPORT.md`）中发现的全部 19 个问题的技术修复方案。问题按优先级分为四类：

- **P0（基础设施断裂）**：Redis Stream 名称不匹配导致实时推送链路断裂（#1.1）、email_worker SQL 查询字段不存在导致邮件推送失效（#1.2）
- **P1（功能缺陷）**：Dashboard 会员等级硬编码（#1.3）、CORS 硬编码 localhost（#1.4）、共识引擎输出未被策略利用（#1.5）、共识阈值过低（#1.6）
- **P2（功能缺失/质量）**：剧本知识库不足（#1.7）、阶段追踪缺失（#1.8）、权重评估维度单一（#1.9）、入场区间固定百分比（#1.10）、情绪数据未调度（#1.11）、MVRV 数据源缺失（#1.12）、alert_eval_worker stream 名称错误（#1.13）、风险阈值硬编码（#1.14）、情绪数据未接入分析链路（#1.15）
- **P3（低优先级）**：准确率未展示（#1.16）、置信度缺少语义映射（#1.17）、seed_admin.py 安全清理（#1.18）、Docker 前端重建（#1.19）

修复策略：最小化变更范围，优先恢复 P0 基础设施链路，逐步修正 P1 功能缺陷，再补全 P2/P3 功能。

## Glossary

- **Bug_Condition (C)**：触发 bug 的输入条件集合，本文档中每个问题有独立的 C(X) 定义
- **Property (P)**：修复后的期望行为，即 C(X) 为真时系统应产生的正确结果
- **Preservation**：修复不应影响的现有正常行为，即 ¬C(X) 时系统行为不变
- **Redis Stream**：Redis 5.0+ 的消息队列数据结构，用于 Worker 间异步通信
- **NSED**：Negotiate-Synthesize-Evaluate-Decide，四轮共识引擎协议
- **ConsensusReport**：共识引擎输出的 Pydantic 模型，含 `consensus_signal`、`consensus_confidence`、`divergence`、`minority_warnings`
- **AgentReport**：单个智能体的分析输出模型，含 `signal`、`confidence`、`reasoning`
- **ATR**：Average True Range，衡量市场波动率的技术指标
- **MVRV**：Market Value to Realized Value，链上估值指标
- **config_service**：动态配置管理服务，支持从数据库读取配置并缓存到 Redis

## Bug Details

### Fault Condition

本次修复涉及 19 个独立问题，按类别归纳为以下故障条件组：

**组 A：Stream 名称不匹配（#1.1, #1.13）**

当 `kline_collector.py` 发布数据到 `kline_updates` stream，而消费端（`ws.py`、`alert_eval_worker.py`）监听 `price_updates` stream 时，消费端永远收不到消息。

```
FUNCTION isBugCondition_StreamMismatch(input)
  INPUT: input of type StreamMessage
  OUTPUT: boolean

  producer_stream := "kline_updates"  // kline_collector.py 实际发布的 stream
  consumer_stream_ws := "price_updates"  // ws.py 消费的 stream
  consumer_stream_alert := "price_updates"  // alert_eval_worker.py 消费的 stream

  RETURN producer_stream != consumer_stream_ws
         OR producer_stream != consumer_stream_alert
END FUNCTION
```

**组 B：SQL 查询字段不存在（#1.2）**

当 `email_worker` 执行 `SELECT email FROM push_settings` 时，`push_settings` 表没有 `email` 列（邮箱在 `users` 表），SQL 执行报错。

```
FUNCTION isBugCondition_EmailSQL(input)
  INPUT: input of type AlertMessage with alert_type IN _EMAIL_EVENT_TYPES
  OUTPUT: boolean

  RETURN tableColumnExists("push_settings", "email") == FALSE
         AND sqlQuery REFERENCES "push_settings.email"
END FUNCTION
```

**组 C：硬编码配置（#1.3, #1.4, #1.14）**

当系统运行在非默认环境（非 localhost、付费用户、非典型市场周期）时，硬编码值导致行为错误。

```
FUNCTION isBugCondition_Hardcoded(input)
  INPUT: input of type SystemContext
  OUTPUT: boolean

  // Dashboard 会员等级
  dashboard_bug := input.user.membership_level > 0
                   AND MEMBERSHIP_LEVEL_CONST == 0

  // CORS
  cors_bug := input.deploy_origin != "http://localhost:3000"
              AND allow_origins == ["http://localhost:3000"]

  // 风险阈值
  risk_bug := input.market_cycle == "bull" AND MVRV > 3.5 持续数周
              OR input.market_cycle == "bear" AND MVRV < 1.0 持续数周

  RETURN dashboard_bug OR cors_bug OR risk_bug
END FUNCTION
```

**组 D：共识引擎与策略断裂（#1.5, #1.6）**

当共识引擎输出 `ConsensusReport` 但策略服务只接受 `AgentReport` 时，共识结果被丢弃；当单个模型高置信度即可超过 ±0.2 阈值时，共识信号被带偏。

```
FUNCTION isBugCondition_ConsensusStrategy(input)
  INPUT: input of type ConsensusReport
  OUTPUT: boolean

  // 策略断裂：共识报告无法被策略服务消费
  strategy_gap := NOT hasMethod(StrategyService, "generate_from_consensus")

  // 阈值过低：单模型可带偏共识
  single_model_bias := countModelsWithSameDirection(input.model_votes) < 2
                       AND abs(input.weighted_score) > 0.2

  RETURN strategy_gap OR single_model_bias
END FUNCTION
```

**组 E：功能缺失（#1.7, #1.8, #1.9, #1.10, #1.11, #1.12, #1.15）**

系统缺少关键功能模块：剧本知识库覆盖不足、阶段追踪缺失、权重评估维度单一、入场区间不自适应、情绪数据未调度、MVRV 数据源缺失。

```
FUNCTION isBugCondition_MissingFeatures(input)
  INPUT: input of type MarketAnalysisContext
  OUTPUT: boolean

  playbook_gap := input.market_pattern NOT IN PLAYBOOK_PATTERNS.names
  phase_gap := NOT exists(phase_tracker) FOR input.symbol
  weight_gap := weightEvaluation ONLY_CONSIDERS "direction_accuracy"
  entry_gap := NOT exists(support_resistance) AND uses_fixed_percentage
  sentiment_gap := NOT exists(sentiment_worker)
  mvrv_gap := onchain_snapshot.mvrv IS ALWAYS None
  sentiment_link_gap := consensus_engine NOT_READS sentiment_from_redis

  RETURN playbook_gap OR phase_gap OR weight_gap OR entry_gap
         OR sentiment_gap OR mvrv_gap OR sentiment_link_gap
END FUNCTION
```

**组 F：前端展示与安全（#1.16, #1.17, #1.18, #1.19）**

前端缺少智能体准确率展示、置信度语义映射；seed_admin.py 含硬编码凭据；Docker 前端镜像未重建。

```
FUNCTION isBugCondition_FrontendSecurity(input)
  INPUT: input of type UIContext
  OUTPUT: boolean

  accuracy_gap := performance_page NOT_SHOWS "by_agent" data
  confidence_gap := confidence_display LACKS semantic_mapping
  seed_admin_risk := file_exists("backend/scripts/seed_admin.py")
                     AND contains_hardcoded_credentials
  docker_stale := frontend_image NOT_REBUILT after code_change

  RETURN accuracy_gap OR confidence_gap OR seed_admin_risk OR docker_stale
END FUNCTION
```

### Examples

- **#1.1**：`kline_collector.py` 发布 `{"symbol":"BTCUSDT"}` 到 `kline_updates`，`ws.py` 监听 `price_updates` → WebSocket 客户端永远收不到价格更新
- **#1.2**：`email_worker` 执行 `SELECT email FROM push_settings WHERE email_enabled = TRUE` → PostgreSQL 报错 `column "email" does not exist`
- **#1.3**：付费用户（membership_level=2）访问 Dashboard → `DerivativesPanel` 和 `PerformanceSummary` 按 level=0 渲染，看不到高级内容
- **#1.4**：部署到 `https://app.omnimind.io` → 所有 API 请求被 CORS 拦截，返回 403
- **#1.5**：共识引擎输出 `ConsensusReport(consensus_signal="bullish", divergence=15.2)` → 策略服务忽略，仍用单个 `AgentReport` 生成策略
- **#1.6**：4 模型中 1 个 bullish(confidence=0.8)、3 个 neutral → 加权分数 >0.2 → 共识判定 bullish（实际应为 neutral）
- **#1.10**：BTC 日波动率 8%，策略入场区间 ±2% → 频繁触发止损
- **#1.14**：牛市 MVRV=4.2 持续 3 个月 → 风险智能体每次分析都触发 MVRV 告警 → 告警疲劳

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**
- WebSocket `/ws/alerts` 端点消费 `alerts` stream 的行为不变（3.1）
- `email_worker` 跳过非邮件类型告警的逻辑不变（3.2）
- 免费用户 Dashboard 渲染行为不变（3.3）
- `localhost:3000` 的 CORS 访问不变（3.4）
- `generate_from_report(AgentReport)` 方法继续正常工作（3.5）
- 所有 4 模型方向一致时共识信号正确输出（3.6）
- 现有 4 种剧本的匹配逻辑不变（3.7）
- 无历史数据时动态权重使用默认准确率 0.5 和等权分配（3.8）
- 有支撑/阻力位数据时继续使用其计算入场区间（3.9）
- 现有链上数据采集（恐慌贪婪、交易所净流量）不受影响（3.10）
- `alert_eval_worker` 消费 `indicator_updates` 和 `onchain_updates` 不变（3.11）
- 风险智能体在配置服务不可用时使用硬编码值作为降级默认值（3.12）
- `/performance` 页面 PnL 曲线渲染不变（3.13）
- 后端 API 返回的 `confidence` 数值字段格式不变（3.14）
- 其他 Celery Worker 正常运行不受 sentiment_worker 影响（3.15）

**Scope:**
所有不涉及上述 19 个问题的系统功能应完全不受影响，包括：认证/授权流程、支付 Webhook 处理、Telegram 推送、案例搜索、关联分析、聊天功能等。

## Hypothesized Root Cause

基于代码审查，各问题的根因分析如下：

1. **Stream 名称不一致（#1.1, #1.13）**：`kline_collector.py` 使用 `kline_updates`，但 `ws.py` 和 `alert_eval_worker.py` 使用早期命名 `price_updates`，开发过程中重命名未同步所有消费端。

2. **SQL 查询错误（#1.2）**：`email_worker` 的 SQL 假设 `push_settings` 表有 `email` 列，但数据库设计将邮箱存储在 `users` 表，开发时未对照 `init.sql` 表结构。

3. **Dashboard 硬编码（#1.3）**：`MEMBERSHIP_LEVEL = 0` 带有 `// TODO` 注释，是开发阶段的占位符，未在会员系统完成后回填真实逻辑。

4. **CORS 硬编码（#1.4）**：`allow_origins=["http://localhost:3000"]` 仅考虑本地开发，`Settings` 类未定义 `cors_origins` 配置项。

5. **策略-共识断裂（#1.5）**：`StrategyService.generate_from_report()` 在共识引擎开发之前就已实现，共识引擎完成后未新增对应的策略生成方法。

6. **共识阈值过低（#1.6）**：`_weighted_aggregate()` 中 ±0.2 阈值在 4 模型等权场景下合理，但引入动态权重后，单个高权重模型可轻易超过阈值。缺少"最少 N 个模型方向一致"的硬性约束。

7. **剧本知识库不足（#1.7）**：初始版本仅实现 4 种核心剧本，未覆盖横盘吸筹、诱空杀空、二次探底、阶梯式拉升等常见手法。

8. **阶段追踪缺失（#1.8）**：`PlaybookAgent.analyze()` 每次调用无状态，不维护历史阶段信息，无法检测阶段转换。

9. **权重评估单一（#1.9）**：`weights.py` 的 `_ACCURACY_SQL` 仅判断信号方向是否正确（涨跌幅 >1%），不评估置信度校准度和预测幅度匹配度。

10. **入场区间固定（#1.10）**：`generate_from_report()` 在无支撑/阻力位时使用 `price * 0.98` / `price * 1.02` 等固定百分比，`indicators.py` 未实现 ATR 计算。

11. **情绪数据未调度（#1.11, #1.15）**：`sentiment.py` 已实现采集逻辑，但无 Worker 调度；共识引擎的 `MarketData` 组装未从 Redis 读取 sentiment 数据。

12. **MVRV 缺失（#1.12）**：`collect_snapshot()` 中 `mvrv=None` 注释 "Glassnode 免费层暂未接入"，需接入替代数据源。

13. **风险阈值硬编码（#1.14）**：所有阈值为模块级常量，不随市场周期调整，牛市/熊市中持续触发无意义告警。

14. **前端展示缺失（#1.16, #1.17）**：后端 `by_agent` 数据已就绪但前端未展示；`confidence` 浮点数直接显示缺少语义映射。

15. **安全隐患（#1.18）**：`seed_admin.py` 硬编码管理员密码 `2219821842` 和邮箱 `2219821842@admin.local`。

16. **Docker 镜像过期（#1.19）**：前端代码变更后未重建 Docker 镜像。

## Correctness Properties

Property 1: Fault Condition - Stream 名称统一后实时数据链路恢复

_For any_ K 线数据由 `kline_collector.py` 发布到 Redis Stream 时，`ws.py` 和 `alert_eval_worker.py` SHALL 能够消费到该消息，WebSocket `/ws/price` 端点正常广播实时价格数据。

**Validates: Requirements 2.1, 2.13**

Property 2: Fault Condition - email_worker SQL 修正后邮件推送恢复

_For any_ 告警消息（`alert_type` 在 `_EMAIL_EVENT_TYPES` 中）被 `email_worker` 处理时，SQL 查询 SHALL 通过 JOIN `users` 表正确获取用户邮箱，不再报 column not found 错误。

**Validates: Requirements 2.2**

Property 3: Fault Condition - Dashboard 按用户实际会员等级渲染

_For any_ 已登录用户访问 Dashboard 页面时，`DerivativesPanel` 和 `PerformanceSummary` SHALL 使用 `useAuth()` 上下文中的 `user.membership_level` 渲染，付费用户看到高级内容。

**Validates: Requirements 2.3**

Property 4: Fault Condition - CORS 从配置读取支持多域名

_For any_ 前端请求来自 `settings.cors_origins` 配置的域名时，CORS 中间件 SHALL 允许该请求通过，不返回 403。

**Validates: Requirements 2.4**

Property 5: Fault Condition - 策略服务消费共识报告

_For any_ `ConsensusReport` 输入，`StrategyService.generate_from_consensus()` SHALL 利用 `consensus_signal`、`consensus_confidence` 和 `divergence` 生成策略，分歧度高时降低置信度。

**Validates: Requirements 2.5**

Property 6: Fault Condition - 共识阈值提高且需多模型一致

_For any_ 加权聚合计算中，共识信号判定 SHALL 要求加权分数超过 ±0.35 且至少 2 个模型方向一致，避免单模型带偏。

**Validates: Requirements 2.6**

Property 7: Preservation - 现有功能不受影响

_For any_ 不涉及上述 bug 条件的输入（如 WebSocket alerts 频道、免费用户 Dashboard、localhost CORS、`generate_from_report` 调用、强共识场景、现有 4 种剧本匹配、无历史数据时的等权分配、有支撑/阻力位时的入场计算），修复后的系统 SHALL 产生与修复前完全相同的行为。

**Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 3.10, 3.11, 3.12, 3.13, 3.14, 3.15**


## Fix Implementation

### Changes Required

以下按优先级分组列出所有修改方案。

---

### P0 — 基础设施恢复

#### #1.1 + #1.13：统一 Redis Stream 名称

**File**: `backend/app/api/ws.py`
**Function**: `start_stream_consumers()`

**Specific Changes**:
1. 将 `_consume_stream("price_updates", "price")` 改为 `_consume_stream("kline_updates", "price")`

**File**: `backend/workers/alert_eval_worker.py`
**Constant**: `_STREAMS`

**Specific Changes**:
1. 将 `_STREAMS` 列表中的 `"price_updates"` 改为 `"kline_updates"`

#### #1.2：修正 email_worker SQL 查询

**File**: `backend/workers/email_worker.py`
**Function**: `_query_email_recipients()`

**Specific Changes**:
1. 将 SQL 从 `SELECT email FROM push_settings WHERE ...` 改为：
   ```sql
   SELECT u.email
   FROM push_settings ps
   JOIN users u ON u.id = ps.user_id
   WHERE ps.email_enabled = TRUE
     AND u.email IS NOT NULL
     AND ps.events @> :event_json
   ```

---

### P1 — 功能修正

#### #1.3：Dashboard 会员等级从用户上下文读取

**File**: `frontend/app/(main)/dashboard/page.tsx`

**Specific Changes**:
1. 移除 `const MEMBERSHIP_LEVEL = 0;` 硬编码常量
2. 导入 `useAuth` hook（从 `@/lib/api/auth` 或对应的 auth context）
3. 在组件内通过 `const { user } = useAuth()` 获取用户信息
4. 将 `MEMBERSHIP_LEVEL` 替换为 `user?.membership_level ?? 0`
5. `DerivativesPanel` 和 `PerformanceSummary` 的 `membershipLevel` prop 使用动态值

#### #1.4：CORS 从 Settings 配置读取

**File**: `backend/app/core/config.py`
**Class**: `Settings`

**Specific Changes**:
1. 新增配置项 `cors_origins: str = "http://localhost:3000"`

**File**: `backend/main.py`

**Specific Changes**:
1. 将 `allow_origins=["http://localhost:3000"]` 改为 `allow_origins=settings.cors_origins.split(",")`

#### #1.5：策略服务新增 `generate_from_consensus()` 方法

**File**: `backend/app/services/strategy.py`
**Class**: `StrategyService`

**Specific Changes**:
1. 导入 `ConsensusReport` 从 `app.consensus.engine`
2. 新增方法 `generate_from_consensus(self, report: ConsensusReport, current_price: float) -> StrategyResult`
3. 方法逻辑：
   - 使用 `report.consensus_signal` 确定方向
   - 使用 `report.consensus_confidence` 作为基础置信度
   - 当 `report.divergence > 30` 时，置信度乘以衰减因子 `max(0.3, 1.0 - report.divergence / 100)`
   - 当存在 `minority_warnings` 时，在 reasoning 中附加少数派警告
   - 入场区间计算复用现有逻辑（后续 #1.10 会改进为 ATR 动态计算）
4. 保留原有 `generate_from_report()` 方法不变（Preservation 3.5）

#### #1.6：提高共识阈值并增加多模型一致性约束

**File**: `backend/app/consensus/engine.py`
**Function**: `_weighted_aggregate()`

**Specific Changes**:
1. 将阈值从 `0.2` 提高到 `0.35`
2. 在判定 bullish/bearish 前，增加"至少 2 个模型方向一致"的检查：
   ```python
   bullish_count = sum(1 for v in votes if v.signal == "bullish")
   bearish_count = sum(1 for v in votes if v.signal == "bearish")

   if weighted_score > 0.35 and bullish_count >= 2:
       consensus_signal = "bullish"
   elif weighted_score < -0.35 and bearish_count >= 2:
       consensus_signal = "bearish"
   else:
       consensus_signal = "neutral"
   ```

---

### P2 — 功能补全 / 质量提升

#### #1.7：扩充剧本知识库至 8 种

**File**: `backend/app/agents/playbook_patterns.py`

**Specific Changes**:
1. 在 `PLAYBOOK_PATTERNS` 列表中新增 4 种剧本：
   - **横盘吸筹**：features=["价格长期窄幅震荡", "成交量持续萎缩", "巨鲸缓慢增仓", "交易所余额下降"], aftermath="突破后放量上涨", signal="bullish"
   - **诱空杀空**：features=["快速下跌5-10%", "空头持仓激增", "资金费率深度负值", "急速反弹收复跌幅"], aftermath="空头被迫平仓推高价格", signal="bullish"
   - **二次探底**：features=["价格回踩前低不破", "成交量缩量", "RSI底背离", "巨鲸未减仓"], aftermath="形成W底后反弹", signal="bullish"
   - **阶梯式拉升**：features=["每次回调不破前高", "逐步抬高底部", "成交量温和放大", "交易所持续流出"], aftermath="持续上涨趋势", signal="bullish"
2. 更新 `PLAYBOOK_SIGNAL_MAP` 和 `VALID_PLAYBOOK_NAMES`（由现有推导逻辑自动更新）
3. 更新 `playbook.py` 中 `_build_system_prompt()` 的 JSON 输出格式，`all_probabilities` 字段包含全部 8 种剧本

#### #1.8：引入阶段追踪模块

**File**: `backend/app/agents/phase_tracker.py`（新建）

**Specific Changes**:
1. 定义阶段枚举：`accumulation`（吸筹）→ `testing`（试盘）→ `markup`（拉盘）→ `distribution`（派发）
2. 使用 Redis Hash `phase:{symbol}` 存储当前阶段、进入时间、转换历史
3. 提供 `async def detect_transition(symbol: str, market_data: MarketData) -> PhaseTransition | None` 方法
4. 阶段转换检测基于链上特征 + 技术形态的组合规则
5. 转换发生时通过 `publish_stream("alerts", ...)` 触发告警

**File**: `backend/app/agents/playbook.py`
**Class**: `PlaybookAgent`

**Specific Changes**:
1. 在 `analyze()` 方法中调用 `phase_tracker.detect_transition()` 获取当前阶段
2. 将阶段信息注入 LLM prompt 的上下文中
3. 在 `AgentReport.raw_data` 中增加 `current_phase` 和 `phase_transition` 字段

#### #1.9：动态权重增加置信度校准度和幅度匹配度

**File**: `backend/app/consensus/weights.py`

**Specific Changes**:
1. 修改 `_ACCURACY_SQL`，增加两个评估维度：
   - **置信度校准度**：`|predicted_confidence - actual_change_pct|` 的平均偏差，偏差越小校准越好
   - **幅度匹配度**：预测方向正确时，`actual_change_pct` 的加权平均值，幅度越大得分越高
2. 修改 `calculate_weights()` 函数，综合三个维度计算准确率：
   ```python
   composite_score = (
       direction_accuracy * 0.5
       + calibration_score * 0.3
       + magnitude_score * 0.2
   )
   ```
3. 无历史数据时仍使用默认准确率 0.5（Preservation 3.8）

#### #1.10：引入 ATR 动态计算入场区间

**File**: `backend/app/data/indicators.py`
**Class**: `IndicatorCalculator`

**Specific Changes**:
1. 新增 `calculate_atr(klines: list[KlineData], period: int = 14) -> list[float]` 静态方法
2. 在 `calculate_all()` 中计算 ATR 并添加到 `IndicatorResult`

**File**: `backend/app/models/market_data.py`
**Class**: `IndicatorResult`

**Specific Changes**:
1. 新增 `atr: float | None = None` 字段

**File**: `backend/app/services/strategy.py`
**Method**: `generate_from_report()`

**Specific Changes**:
1. 当无支撑/阻力位数据时，优先使用 ATR 计算入场区间：
   - `entry_range = price ± 1.5 * ATR`
   - `stop_loss = price - 2.0 * ATR`（long）或 `price + 2.0 * ATR`（short）
2. 有支撑/阻力位数据时继续使用原逻辑（Preservation 3.9）
3. ATR 数据不可用时回退到固定百分比（兼容降级）

#### #1.11 + #1.15：创建 sentiment_worker 并接入分析链路

**File**: `backend/workers/sentiment_worker.py`（新建）

**Specific Changes**:
1. 创建 Celery 定时任务 `collect_sentiment_task`
2. 调用 `sentiment.py` 的 `fetch_fear_greed_index()` 采集数据
3. 写入 Redis：`set_with_ttl("sentiment:fear_greed", data, 3600)`（TTL=1h）
4. 在 `celery_app` 的 beat_schedule 中注册，每 30 分钟执行一次

**File**: 共识引擎 `MarketData` 组装处（调用 `run_nsed` 的 Service 层）

**Specific Changes**:
1. 在组装 `MarketData` 时，优先从 Redis 读取 `sentiment:fear_greed` 数据
2. 如果 Redis 有值，覆盖 `onchain.fear_greed_index`

#### #1.12：接入替代 MVRV 数据源

**File**: `backend/app/data/onchain.py`
**Class**: `OnchainCollector`

**Specific Changes**:
1. 新增 `async def fetch_mvrv(self, symbol: str) -> float | None` 方法
2. 接入 CoinGlass 或 CryptoQuant 免费层 MVRV API
3. API Key 从 `config_service` 读取，无 Key 时降级返回 None
4. 在 `collect_snapshot()` 的 `asyncio.gather` 中加入 `fetch_mvrv()`
5. 将结果赋值给 `snapshot.mvrv`（替代硬编码 `None`）

#### #1.14：风险阈值从动态配置读取

**File**: `backend/app/agents/risk.py`

**Specific Changes**:
1. 将模块级常量改为从 `config_service` 异步读取的函数：
   ```python
   async def _get_risk_thresholds() -> dict[str, float]:
       from app.services.config_service import get_config_value
       return {
           "exchange_inflow_btc": float(await get_config_value(
               "risk_exchange_inflow_btc", str(EXCHANGE_INFLOW_BTC_THRESHOLD)
           )),
           "whale_transfer_usd": float(await get_config_value(
               "risk_whale_transfer_usd", str(WHALE_TRANSFER_USD_THRESHOLD)
           )),
           # ... 其他阈值
       }
   ```
2. 保留原硬编码常量作为降级默认值（Preservation 3.12）
3. `check_thresholds()` 改为 `async def`，内部调用 `_get_risk_thresholds()`
4. `config_service` 不可用时 catch 异常并使用默认值

---

### P3 — 低优先级改进

#### #1.16：前端展示智能体准确率

**File**: `frontend/app/(main)/performance/page.tsx`

**Specific Changes**:
1. 新增 `AgentAccuracyCard` 组件，展示 `by_agent` 字段数据
2. 以柱状图或排行榜形式展示各智能体预测准确率
3. 不影响现有 PnL 曲线（Preservation 3.13）

#### #1.17：置信度语义映射

**File**: `frontend/lib/utils/confidence.ts`（新建）

**Specific Changes**:
1. 导出 `mapConfidenceLabel(confidence: number): string` 函数：
   - `< 0.3` → "低置信度 — 仅供参考"
   - `0.3-0.6` → "中等置信度 — 需结合其他信号"
   - `0.6-0.8` → "较高置信度 — 可作为主要参考"
   - `> 0.8` → "高置信度 — 多维度信号一致"
2. 在策略卡片、共识页面等展示 confidence 的组件中调用
3. 后端 API 返回格式不变（Preservation 3.14）

#### #1.18：清理 seed_admin.py

**File**: `backend/scripts/seed_admin.py`

**Specific Changes**:
1. 移除硬编码密码和邮箱
2. 改为从环境变量读取：`ADMIN_EMAIL`、`ADMIN_PASSWORD`
3. 无环境变量时报错退出，不使用默认值
4. 将 `backend/scripts/seed_admin.py` 加入 `.gitignore`

#### #1.19：Docker 前端镜像重建

**操作**：运行 `docker compose up --build -d frontend` 重建前端镜像。此为运维操作，不涉及代码变更。

## Testing Strategy

### Validation Approach

测试策略分两阶段：先在未修复代码上运行探索性测试确认 bug 存在，再在修复后验证正确性和保持性。

### Exploratory Fault Condition Checking

**Goal**: 在未修复代码上复现 bug，确认根因分析正确。

**Test Plan**: 编写针对每个 bug 条件的测试用例，在未修复代码上运行观察失败模式。

**Test Cases**:
1. **Stream 名称测试**：验证 `ws.py` 的 `start_stream_consumers()` 消费的 stream 名称与 `kline_collector.py` 发布的不一致（will fail on unfixed code）
2. **Email SQL 测试**：mock 数据库执行 `_query_email_recipients()`，验证 SQL 引用不存在的列（will fail on unfixed code）
3. **Dashboard 会员等级测试**：渲染 Dashboard 组件，验证 `membershipLevel` prop 始终为 0（will fail on unfixed code）
4. **CORS 测试**：验证非 localhost 域名的请求被 CORS 拦截（will fail on unfixed code）
5. **共识阈值测试**：构造 1 bullish(0.8) + 3 neutral 的投票，验证共识输出 bullish（will fail on unfixed code — 应为 neutral）
6. **策略-共识断裂测试**：验证 `StrategyService` 没有 `generate_from_consensus` 方法（will fail on unfixed code）

**Expected Counterexamples**:
- `ws.py` 消费 `price_updates` 但 `kline_collector.py` 发布到 `kline_updates` → 消息丢失
- `email_worker` SQL 执行报 `UndefinedColumn` 错误
- 单模型 bullish(0.8) 即可使加权分数超过 0.2 阈值

### Fix Checking

**Goal**: 验证修复后所有 bug 条件下系统产生正确行为。

**Pseudocode:**
```
FOR ALL input WHERE isBugCondition(input) DO
  result := fixedFunction(input)
  ASSERT expectedBehavior(result)
END FOR
```

**具体验证项**:
- Stream 名称统一后，`ws.py` 和 `alert_eval_worker.py` 能消费到 `kline_updates` 消息
- Email SQL JOIN `users` 表后能正确返回用户邮箱
- Dashboard 使用 `useAuth()` 后付费用户看到高级内容
- CORS 从 `settings.cors_origins` 读取后支持多域名
- `generate_from_consensus()` 正确利用共识信号和分歧度
- 阈值 ±0.35 + 2 模型一致约束后，单模型无法带偏共识

### Preservation Checking

**Goal**: 验证修复不影响现有正常功能。

**Pseudocode:**
```
FOR ALL input WHERE NOT isBugCondition(input) DO
  ASSERT originalFunction(input) = fixedFunction(input)
END FOR
```

**Testing Approach**: 属性基测试（PBT）推荐用于保持性验证，因为：
- 自动生成大量测试用例覆盖输入域
- 捕获手动测试可能遗漏的边界情况
- 对"行为不变"提供强保证

**Test Plan**: 先在未修复代码上观察正常行为，再编写 PBT 验证修复后行为一致。

**Test Cases**:
1. **WebSocket alerts 保持**：验证 `/ws/alerts` 端点消费 `alerts` stream 的行为在修复前后一致
2. **免费用户 Dashboard 保持**：验证 membership_level=0 时 Dashboard 渲染在修复前后一致
3. **generate_from_report 保持**：验证原有 `AgentReport` → `StrategyResult` 的生成逻辑在修复前后一致
4. **强共识保持**：验证 4 模型全部 bullish 时共识信号在修复前后一致
5. **现有剧本匹配保持**：验证 4 种原有剧本的匹配逻辑在修复前后一致
6. **等权默认保持**：验证无历史数据时权重分配在修复前后一致

### Unit Tests

- **P0**: `test_ws_stream_name` — 验证 `start_stream_consumers` 使用 `kline_updates`
- **P0**: `test_email_worker_sql_join` — 验证 SQL JOIN `users` 表获取邮箱
- **P0**: `test_alert_eval_streams` — 验证 `_STREAMS` 包含 `kline_updates` 而非 `price_updates`
- **P1**: `test_cors_from_settings` — 验证 CORS origins 从 `settings.cors_origins` 读取
- **P1**: `test_generate_from_consensus` — 验证新方法正确处理 `ConsensusReport`
- **P1**: `test_consensus_threshold_035` — 验证阈值 ±0.35 和 2 模型一致约束
- **P1**: `test_single_model_cannot_bias` — 验证单模型 bullish(0.8) + 3 neutral → neutral
- **P2**: `test_playbook_8_patterns` — 验证知识库包含 8 种剧本
- **P2**: `test_phase_tracker_transition` — 验证阶段转换检测逻辑
- **P2**: `test_weight_composite_score` — 验证三维度综合评分
- **P2**: `test_atr_calculation` — 验证 ATR 计算正确性
- **P2**: `test_atr_entry_range` — 验证 ATR 动态入场区间
- **P2**: `test_sentiment_worker` — 验证情绪数据采集和 Redis 写入
- **P2**: `test_mvrv_fetch` — 验证 MVRV 数据源接入
- **P2**: `test_risk_thresholds_from_config` — 验证风险阈值从配置读取
- **P2**: `test_risk_thresholds_fallback` — 验证配置不可用时降级到默认值
- **P3**: `test_confidence_label_mapping` — 验证置信度语义映射
- **P3**: `test_seed_admin_env_vars` — 验证 seed_admin 从环境变量读取

### Property-Based Tests

- **PBT-1**: 生成随机 `ConsensusReport`（随机 model_votes、weights、divergence），验证 `generate_from_consensus()` 输出的 `direction` 与 `consensus_signal` 一致，`confidence` 在 [0, 1] 范围内，且 divergence 高时 confidence 降低
- **PBT-2**: 生成随机 4 模型投票组合，验证新阈值下单模型无法带偏共识（当 bullish_count < 2 时 consensus_signal != "bullish"）
- **PBT-3**: 生成随机 `AgentReport`，验证 `generate_from_report()` 在修复前后输出一致（Preservation）
- **PBT-4**: 生成随机 K 线数据，验证 ATR 计算结果为正数且在合理范围内
- **PBT-5**: 生成随机风险阈值配置，验证 `check_thresholds()` 使用配置值而非硬编码值
- **PBT-6**: 生成随机准确率数据，验证 `_normalize_weights()` 输出权重之和为 1.0 且每个权重 >= MIN_WEIGHT

### Integration Tests

- **INT-1**: 端到端测试 K 线采集 → Redis Stream → WebSocket 广播链路
- **INT-2**: 端到端测试告警 → email_worker → 邮件发送链路
- **INT-3**: 端到端测试共识引擎 → 策略生成 → 策略保存链路
- **INT-4**: 端到端测试 sentiment_worker → Redis → 共识引擎数据组装链路
- **INT-5**: 端到端测试 phase_tracker 阶段转换 → 告警触发链路
