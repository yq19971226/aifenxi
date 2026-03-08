# 需求文档：AI 模型层优化

## 简介

对项目 AI 模型调用层（`UnifiedLLMClient`）和 NSED 共识引擎进行全面优化，解决配置兜底缺失、客户端初始化无重试、流式超时不完整、共识引擎 Round 2 token 消耗过大、模型列表硬编码等问题。同时新增 AI 模型管理可视化面板，使管理员能够直观查看每个模型的配置信息、使用场景和调用统计，并支持在线编辑模型配置和启用/禁用操作。此外，系统基于各模型历史预测信号与实际行情对比，计算每个模型的模拟交易盈亏和胜率，在模型管理面板卡片上直观展示模拟账户余额和胜率百分比，帮助管理员评估各模型的实际预测能力。所有模型通过 DMXAPI 统一网关调用，共用一个 API key。目标是提升 LLM 调用层的健壮性、可配置性、可观测性和成本可控性。

## 术语表

- **UnifiedLLMClient**: 统一 LLM 客户端，位于 `app/core/llm_client.py`，所有模型调用必须经过此模块
- **DMXAPI_Gateway**: DMXAPI 统一网关，base_url 为 `https://www.dmxapi.cn/v1`，所有 AI 模型请求通过此网关转发
- **ConfigService**: 动态配置服务，位于 `app/services/config_service.py`，从数据库读取运行时配置并缓存到 Redis
- **Settings**: 应用配置类，位于 `app/core/config.py`，从环境变量和 `.env` 文件读取静态配置
- **NSED_Engine**: 共识引擎，执行三轮结构化评估与辩论（Round 1 独立分析、Round 2 交叉审查、Round 3 加权聚合）
- **Round_2**: NSED 共识引擎的交叉审查阶段，每个模型审阅其他模型的观点后调整自己的判断
- **Fallback_Response**: 降级响应，当 LLM 调用失败时返回的标准格式响应，signal 固定为 `"neutral"`
- **AI_Model_Dashboard**: AI 模型管理面板，位于前端 `/admin/models` 路径，以卡片式布局展示所有 AI 模型的配置信息、使用场景、启用状态和调用统计，支持在线编辑和启用/禁用操作
- **Simulated_PnL**: 模拟盈亏，系统基于各 AI 模型历史预测信号（bullish/bearish/neutral）与实际行情对比，模拟虚拟账户的交易盈亏。每个模型拥有独立的虚拟账户（初始余额 $10,000），每次信号按账户余额 10% 开仓，结算周期由庄家阶段动态决定，仓位受庄家对抗倍数调整，盈亏受多周期共振倍数调整
- **Dynamic_Settlement**: 动态结算周期，根据 `phase_tracker` 当前庄家阶段决定模拟交易的持仓时长：吸筹 72h、试盘 24h、拉盘 12h、派发 6h
- **Playbook_Confrontation**: 庄家推演对抗，将模型信号方向与当前剧本信号方向对比：顺庄（方向一致）仓位 ×1.5，逆庄（方向相反）仓位 ×0.5
- **Multi_Timeframe_Resonance**: 多周期共振，检查 6 个时间周期（5m、15m、30m、1h、4h、1d）的价格变动方向一致性：强共振（≥5 个一致）盈亏 ×1.3，正常（3-4 个）×1.0，分散（<3 个）×0.7
- **Celery_Beat**: Celery 定时任务调度器，位于 `workers/celery_app.py`，管理所有周期性后台任务的执行计划
- **kline_collector**: K 线采集 worker，位于 `workers/kline_collector.py`，定时从 Binance API 获取 K 线数据并写入 `klines` 表

## 需求

### 需求 1：Settings 类增加 AI 相关配置兜底

**用户故事：** 作为运维人员，我希望在数据库不可用时 LLM 客户端仍能通过环境变量初始化，从而避免因 ConfigService 故障导致整个 AI 功能不可用。

#### 验收标准

1. THE Settings SHALL 包含 `dmx_api_key`（str，默认空字符串）和 `dmx_base_url`（str，默认 `"https://www.dmxapi.cn/v1"`）字段，从环境变量读取
2. THE Settings SHALL 包含 `default_model_timeout`（float，默认 30.0）字段，作为 LLM 调用的默认超时秒数
3. THE Settings SHALL 包含 `consensus_round2_enabled`（bool，默认 True）字段，控制 NSED 共识引擎 Round 2 是否启用
4. WHEN UnifiedLLMClient 初始化时，THE UnifiedLLMClient SHALL 优先从 ConfigService 读取 `dmx_api_key` 和 `dmx_base_url`
5. IF ConfigService 读取失败，THEN THE UnifiedLLMClient SHALL 回退到 Settings 中的环境变量值进行初始化
6. IF Settings 中的 `dmx_api_key` 为空字符串且 ConfigService 也不可用，THEN THE UnifiedLLMClient SHALL 记录错误日志并在后续调用中返回 Fallback_Response

### 需求 2：LLM 客户端初始化重试与重置机制

**用户故事：** 作为开发者，我希望 LLM 客户端在首次初始化失败后能自动重试，从而避免因瞬时故障导致客户端永久不可用。

#### 验收标准

1. WHEN `_ensure_client()` 首次初始化失败时，THE UnifiedLLMClient SHALL 在后续调用中重新尝试初始化，而非永久返回失败
2. THE UnifiedLLMClient SHALL 记录每次初始化尝试的结果（成功或失败原因）到日志
3. WHILE UnifiedLLMClient 的 `_client` 为 None，THE UnifiedLLMClient SHALL 在每次 `call_model` 或 `stream_model` 调用时尝试重新初始化
4. WHEN 初始化连续失败超过 3 次时，THE UnifiedLLMClient SHALL 在后续 60 秒内跳过初始化尝试，直接返回 Fallback_Response，60 秒后重新允许初始化尝试
5. THE UnifiedLLMClient SHALL 提供 `reset()` 方法，调用后将 `_client` 置为 None，强制下次调用时重新初始化

### 需求 3：流式调用全程超时保护

**用户故事：** 作为开发者，我希望流式 LLM 调用在读取过程中卡住时也能被超时中断，从而避免连接长时间挂起占用资源。

#### 验收标准

1. WHEN `stream_model()` 被调用时，THE UnifiedLLMClient SHALL 对整个流式读取过程（包括初始连接和逐 chunk 读取）施加超时控制
2. THE UnifiedLLMClient SHALL 使用 `timeout_s` 参数作为整个流式调用的总超时时间
3. IF 流式读取过程中总耗时超过 `timeout_s`，THEN THE UnifiedLLMClient SHALL 终止读取并 yield 超时错误提示 `"[错误] 模型响应超时，请稍后重试"`
4. WHEN 流式调用因超时终止时，THE UnifiedLLMClient SHALL 在日志中记录模型名、已耗时和超时阈值

### 需求 4：NSED 共识引擎 Round 2 可配置化

**用户故事：** 作为运营人员，我希望能动态控制 NSED 共识引擎是否执行 Round 2 交叉审查，从而在 token 成本和分析质量之间灵活权衡。

#### 验收标准

1. THE NSED_Engine SHALL 支持通过动态配置（ConfigService 的 `consensus_round2_enabled` 键）控制 Round 2 是否执行
2. IF 动态配置不可用，THEN THE NSED_Engine SHALL 回退到 Settings 中的 `consensus_round2_enabled` 值
3. WHEN `consensus_round2_enabled` 为 False 时，THE NSED_Engine SHALL 跳过 Round 2 交叉审查，直接将 Round 1 的投票结果传入 Round 3 加权聚合
4. WHEN Round 2 被跳过时，THE NSED_Engine SHALL 在日志中记录 `"Round 2 skipped (disabled by config)"`
5. THE NSED_Engine SHALL 在共识报告中包含一个字段标识本次共识是否执行了 Round 2

### 需求 5：模型列表可配置化

**用户故事：** 作为运维人员，我希望能通过动态配置增减或更换 AI 模型，从而无需修改代码即可调整模型列表。

#### 验收标准

1. THE UnifiedLLMClient SHALL 支持从 ConfigService 读取模型列表配置（键名 `llm_models`，值为 JSON 格式的模型映射）
2. IF ConfigService 中未配置 `llm_models` 或读取失败，THEN THE UnifiedLLMClient SHALL 使用代码中的默认模型列表 `{"deepseek": "deepseek-chat", "gpt4o": "gpt-4o", "claude": "claude-3-5-sonnet-20241022", "gemini": "gemini-1.5-pro"}`
3. WHEN 模型列表从 ConfigService 成功加载时，THE UnifiedLLMClient SHALL 在日志中记录加载的模型数量
4. THE UnifiedLLMClient SHALL 提供 `reload_models()` 方法，调用后从 ConfigService 重新加载模型列表
5. WHEN `call_model` 或 `stream_model` 收到不在当前模型列表中的 `model_key` 时，THE UnifiedLLMClient SHALL 返回 Fallback_Response 并记录错误日志


### 需求 6：AI 模型管理面板

**用户故事：** 作为管理员，我希望在管理后台看到所有 AI 模型的配置信息、使用场景和调用统计，并能在线编辑模型配置和启用/禁用模型，从而清楚掌握每个模型的用途和运行状况。

#### 验收标准

1. THE 后端 SHALL 提供 `GET /api/admin/models` 接口，返回所有模型的列表，每个模型包含 `model_key`（如 `"deepseek"`）、`model_name`（如 `"deepseek-chat"`）、`usage_scenarios`（使用场景列表）、`enabled`（启用状态布尔值）字段
2. THE 后端 SHALL 提供 `GET /api/admin/models/stats` 接口，返回每个模型最近 24 小时的调用统计，包含 `call_count`（调用次数）、`success_rate`（成功率，0-1 浮点数）、`avg_latency_ms`（平均耗时毫秒数）、`total_tokens`（总 token 消耗）字段
3. THE 后端 SHALL 提供 `PUT /api/admin/models/{model_key}` 接口，支持更新指定模型的 `model_name` 和 `enabled` 字段
4. WHEN 管理员通过 `PUT` 接口将模型的 `enabled` 设为 False 时，THE UnifiedLLMClient SHALL 在后续调用中跳过该模型并返回 Fallback_Response
5. WHEN 管理员通过 `PUT` 接口修改模型的 `model_name` 时，THE 后端 SHALL 同步更新 ConfigService 中的 `llm_models` 配置，使 UnifiedLLMClient 在下次调用时使用新的模型名
6. THE AI_Model_Dashboard SHALL 在 `/admin/models` 路径下以卡片式布局展示所有模型，每张卡片包含模型 key、实际模型名、使用场景标签、启用状态开关和调用统计摘要
7. WHEN 管理员在 AI_Model_Dashboard 上切换启用状态开关时，THE AI_Model_Dashboard SHALL 调用 `PUT /api/admin/models/{model_key}` 接口更新状态，并在界面上实时反映变更结果
8. WHEN 管理员在 AI_Model_Dashboard 上编辑模型的实际模型名时，THE AI_Model_Dashboard SHALL 调用 `PUT /api/admin/models/{model_key}` 接口提交变更，成功后更新卡片显示
9. THE AI_Model_Dashboard SHALL 在每张模型卡片上展示最近 24 小时的调用统计（调用次数、成功率、平均耗时、token 消耗），数据从 `GET /api/admin/models/stats` 接口获取
10. THE 后端 SHALL 在所有模型管理接口上校验请求者具有管理员权限（通过 FastAPI `Depends` 注入权限校验），无权限时返回 HTTP 403
11. THE AI_Model_Dashboard SHALL 在页面顶部展示 DMXAPI 网关信息提示，说明所有模型共用一个 API key 通过 DMXAPI 网关（`https://www.dmxapi.cn/v1`）转发


### 需求 7：AI 模型增强模拟盈亏展示

**用户故事：** 作为管理员，我希望看到每个 AI 模型基于历史预测信号的模拟交易盈亏和胜率，并且模拟算法能结合庄家阶段、剧本对抗和多周期共振进行更真实的盈亏推演，从而直观评估各模型在不同市场环境下的实际预测能力，为模型选择和权重调整提供数据依据。

#### 验收标准

##### 基础模拟交易

1. THE 后端 SHALL 提供 `GET /api/admin/models/pnl` 接口，返回每个模型的模拟盈亏数据，每个模型包含 `model_key`（模型标识）、`virtual_balance`（当前虚拟账户余额，浮点数）、`win_rate`（胜率，0-1 浮点数）、`total_trades`（总交易次数，整数）、`profit_loss_ratio`（盈亏比，浮点数）、`settlement_hours`（本次结算周期小时数，整数）、`playbook_multiplier`（庄家对抗仓位倍数，浮点数）、`resonance_multiplier`（多周期共振盈亏倍数，浮点数）字段
2. WHEN 计算模拟盈亏时，THE 后端 SHALL 从 `agent_reports` 表获取各模型的历史预测信号，从 `klines` 表获取对应时间点的实际价格数据
3. WHEN 模型预测信号为 `"bullish"` 时，THE 后端 SHALL 视为模拟做多，以信号发出时的价格为开仓价，按动态结算周期后的价格为平仓价，计算盈亏
4. WHEN 模型预测信号为 `"bearish"` 时，THE 后端 SHALL 视为模拟做空，以信号发出时的价格为开仓价，按动态结算周期后的价格为平仓价，计算盈亏
5. WHEN 模型预测信号为 `"neutral"` 时，THE 后端 SHALL 跳过该信号，不计入模拟交易
6. THE 后端 SHALL 为每个模型维护独立的虚拟账户，初始余额为 10000.0（美元）
7. WHEN 模拟开仓时，THE 后端 SHALL 使用当前虚拟账户余额的 10% 作为基础投入金额，再乘以庄家对抗仓位倍数得到最终投入金额

##### 动态结算周期

8. WHEN 计算模拟盈亏时，THE 后端 SHALL 通过 `phase_tracker.get_current_phase(symbol)` 获取信号发出时刻的庄家阶段，根据阶段确定结算周期
9. WHILE 庄家阶段为 `accumulation`（吸筹）时，THE 后端 SHALL 使用 72 小时作为结算周期
10. WHILE 庄家阶段为 `testing`（试盘）时，THE 后端 SHALL 使用 24 小时作为结算周期
11. WHILE 庄家阶段为 `markup`（拉盘）时，THE 后端 SHALL 使用 12 小时作为结算周期
12. WHILE 庄家阶段为 `distribution`（派发）时，THE 后端 SHALL 使用 6 小时作为结算周期
13. IF `phase_tracker` 返回 None（阶段未知）时，THEN THE 后端 SHALL 回退使用 24 小时作为默认结算周期

##### 庄家推演对抗

14. WHEN 计算模拟盈亏时，THE 后端 SHALL 从 `playbook_patterns.PLAYBOOK_SIGNAL_MAP` 获取当前剧本对应的信号方向
15. WHEN 模型信号方向与当前剧本信号方向一致时，THE 后端 SHALL 将仓位倍数设为 1.5（顺庄加仓）
16. WHEN 模型信号方向与当前剧本信号方向相反时，THE 后端 SHALL 将仓位倍数设为 0.5（逆庄减仓）
17. WHEN 当前无匹配剧本或模型信号为 `"neutral"` 时，THE 后端 SHALL 将仓位倍数设为 1.0（不调整）

##### 多周期共振

18. WHEN 计算模拟盈亏时，THE 后端 SHALL 检查 6 个时间周期（5m、15m、30m、1h、4h、1d）的价格变动方向
19. WHEN 5 个及以上时间周期的价格变动方向一致时（强共振），THE 后端 SHALL 将盈亏倍数设为 1.3
20. WHEN 3 至 4 个时间周期的价格变动方向一致时，THE 后端 SHALL 将盈亏倍数设为 1.0（不调整）
21. WHEN 少于 3 个时间周期的价格变动方向一致时（分散），THE 后端 SHALL 将盈亏倍数设为 0.7
22. THE 后端 SHALL 从 `klines` 表获取各时间周期最近一根 K 线的收盘价与开盘价，收盘价 > 开盘价视为上涨方向，收盘价 < 开盘价视为下跌方向，收盘价 = 开盘价视为中性（不计入方向统计）

##### 缓存、权限与前端展示

23. THE 后端 SHALL 每小时定时计算一次模拟盈亏数据，计算结果缓存到 Redis（键名格式 `model_pnl:{model_key}`，TTL 为 3600 秒）
24. WHEN `GET /api/admin/models/pnl` 被调用时，THE 后端 SHALL 优先从 Redis 缓存读取数据；IF 缓存未命中，THEN THE 后端 SHALL 实时计算并写入缓存后返回
25. THE 后端 SHALL 在模型管理接口 `GET /api/admin/models/pnl` 上校验请求者具有管理员权限（通过 FastAPI `Depends` 注入权限校验），无权限时返回 HTTP 403
26. THE AI_Model_Dashboard SHALL 在需求 6 的每张模型卡片上增加显示模拟账户余额（醒目大字体）和胜率百分比，数据从 `GET /api/admin/models/pnl` 接口获取
27. WHEN 模拟账户余额高于初始值 10000.0 时，THE AI_Model_Dashboard SHALL 以绿色显示余额数字；WHEN 低于初始值时，THE AI_Model_Dashboard SHALL 以红色显示余额数字
28. THE AI_Model_Dashboard SHALL 在胜率百分比旁显示总交易次数（如 `62% (48 trades)`），帮助管理员判断胜率的统计可靠性
29. THE AI_Model_Dashboard SHALL 在每张模型卡片上显示当前结算周期、仓位倍数和共振倍数，帮助管理员理解盈亏计算的调整因子


### 需求 8：补充 5 分钟和 30 分钟 K 线采集

**用户故事：** 作为系统，我需要采集 5 分钟和 30 分钟周期的 K 线数据，从而支持多周期共振分析所需的全部 6 个时间周期（5m、15m、30m、1h、4h、1d）。

#### 验收标准

1. THE Celery_Beat SHALL 在现有 K 线采集定时任务中将采集周期列表从 `["15m", "1h", "4h", "1d"]` 扩展为 `["5m", "15m", "30m", "1h", "4h", "1d"]`
2. WHEN K 线采集任务执行时，THE kline_collector SHALL 对 `5m` 和 `30m` 周期使用与现有周期相同的采集逻辑（调用 Binance API 获取 K 线并写入 `klines` 表）
3. THE `klines` 表 SHALL 支持存储 `5m` 和 `30m` 周期的数据，使用与现有周期相同的表结构（`symbol`、`interval`、`open_time`、`open`、`high`、`low`、`close`、`volume`）
4. WHEN 5 分钟采集周期执行时，THE kline_collector SHALL 在日志中记录采集的周期列表，确认包含 `5m` 和 `30m`
