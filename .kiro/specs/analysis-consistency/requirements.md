# 需求文档：分析结果一致性保障与反幻觉约束

## 简介

本特性解决多智能体分析系统中三个核心问题：
1. 同一数据窗口内多次分析产生不一致的点位预测（LLM 随机性导致）
2. 多用户并发请求时的缓存击穿与重复 LLM 调用
3. AI 智能体输出幻觉数据（编造不存在的支撑阻力位、虚构链上数据）

通过降低 temperature、引入反幻觉 prompt 硬约束、点位后验校验、吸附逻辑和并发缓存锁，确保分析结果在数据不变时保持稳定且可信。

## 术语表

- **Analysis_Orchestrator**: 分析编排器，协调各智能体执行并管理缓存，位于 `backend/app/services/analysis_orchestrator.py`
- **UnifiedLLMClient**: 统一 LLM 调用客户端，封装所有模型调用，位于 `backend/app/core/llm_client.py`
- **Agent**: 智能体，包括 TechnicalAgent、OnchainAgent、PlaybookAgent、RiskAgent，各自负责单一分析职责
- **StrategyService**: 策略生成服务，从 AgentReport 或 ConsensusReport 生成开仓/止损/止盈点位
- **Point_Snapping**: 点位吸附逻辑，当新计算点位与缓存点位偏差小于阈值时沿用缓存值，减少无意义漂移
- **Post_Validation**: 后验校验，将 LLM 输出的支撑阻力位与实际 K 线数据交叉验证，过滤不合理值
- **Cache_Lock**: 缓存锁，基于 Redis 的分布式锁，防止缓存过期瞬间多个并发请求同时触发 LLM 调用
- **Hallucination**: 幻觉，指 LLM 编造不存在的数据或给出与输入数据矛盾的分析结论

## 需求

### 需求 1：降低 LLM 输出随机性

**用户故事：** 作为交易者，我希望同一数据窗口内多次查看分析结果时点位预测保持一致，以便我能信任系统给出的建议。

#### 验收标准

1. THE UnifiedLLMClient SHALL 将 `call_model` 方法的默认 temperature 参数从 0.3 降低至 0.1
2. THE UnifiedLLMClient SHALL 在 `call_model` 方法中对传入的 temperature 参数进行范围校验，确保值在 0.0 至 1.0 之间
3. IF temperature 参数超出 0.0 至 1.0 范围，THEN THE UnifiedLLMClient SHALL 将其裁剪至最近的合法边界值并记录一条 warning 级别日志

### 需求 2：反幻觉 Prompt 硬约束

**用户故事：** 作为交易者，我希望 AI 分析结论完全基于实际输入数据，不编造任何数据点，以便我能放心依据分析结果做交易决策。

#### 验收标准

1. THE TechnicalAgent SHALL 在 system prompt 中包含以下反幻觉硬约束规则：禁止编造输入数据中不存在的支撑位或阻力位数值；所有输出的价格点位必须可追溯到输入的 K 线或指标数据
2. THE OnchainAgent SHALL 在 system prompt 中包含以下反幻觉硬约束规则：禁止编造链上指标数值；当输入数据标注为"数据缺失"时，对应分析字段必须标注为"数据不足，无法判断"而非给出推测值
3. THE PlaybookAgent SHALL 在 system prompt 中包含以下反幻觉硬约束规则：剧本匹配概率必须基于输入数据中实际存在的特征计算；禁止引用输入中未提供的市场事件或数据
4. THE RiskAgent SHALL 在 system prompt 中包含以下反幻觉硬约束规则：风险评估必须基于实际触发的告警和输入的链上数据；禁止编造未在输入中出现的风险事件
5. WHEN 输入数据中某项指标标注为"数据缺失"时，THE Agent SHALL 在 JSON 输出的 evidence 或 reasoning 字段中明确标注该数据缺失，而非忽略或用推测值替代

### 需求 3：支撑阻力位后验校验

**用户故事：** 作为交易者，我希望系统输出的支撑位和阻力位经过实际 K 线数据验证，以便过滤掉 AI 可能编造的不合理价位。

#### 验收标准

1. WHEN TechnicalAgent 返回 support_levels 和 resistance_levels 时，THE Post_Validation SHALL 将每个点位与最近 30 根 K 线的最高价和最低价范围进行交叉验证
2. IF 某个支撑位或阻力位超出最近 30 根 K 线价格范围的 20% 以外，THEN THE Post_Validation SHALL 丢弃该点位并记录一条 warning 级别日志，包含被丢弃的点位值和合理范围
3. IF 所有支撑位均被后验校验丢弃，THEN THE Post_Validation SHALL 使用最近 K 线的最低价作为回退支撑位
4. IF 所有阻力位均被后验校验丢弃，THEN THE Post_Validation SHALL 使用最近 K 线的最高价作为回退阻力位
5. THE Post_Validation SHALL 在 AgentReport 的 raw_data 中添加 `validation_applied: true` 标记和 `discarded_levels` 列表，记录被丢弃的点位

### 需求 4：点位吸附逻辑

**用户故事：** 作为交易者，我希望在数据未发生实质变化时，开仓/止损/止盈点位不会因 LLM 微小随机性而频繁漂移，以便我能稳定执行交易计划。

#### 验收标准

1. WHEN StrategyService 生成新的策略点位时，THE Point_Snapping SHALL 从 Redis 缓存读取同一交易对的上一次策略点位
2. IF 新计算的 entry_low 与缓存的 entry_low 偏差小于 0.5%，THEN THE Point_Snapping SHALL 沿用缓存的 entry_low 值
3. IF 新计算的 entry_high 与缓存的 entry_high 偏差小于 0.5%，THEN THE Point_Snapping SHALL 沿用缓存的 entry_high 值
4. IF 新计算的 stop_loss 与缓存的 stop_loss 偏差小于 0.5%，THEN THE Point_Snapping SHALL 沿用缓存的 stop_loss 值
5. IF 新计算的 targets 中某个目标位与缓存对应目标位偏差小于 0.5%，THEN THE Point_Snapping SHALL 沿用缓存的该目标位值
6. IF 新策略的 direction 与缓存策略的 direction 不同，THEN THE Point_Snapping SHALL 跳过吸附逻辑，直接使用新计算的全部点位
7. THE Point_Snapping SHALL 在 StrategyResult 中添加 `snapped_fields` 列表，记录哪些字段被吸附到了缓存值

### 需求 5：并发请求缓存锁

**用户故事：** 作为系统运维人员，我希望在缓存过期瞬间多个用户同时请求分析时，只触发一次 LLM 调用，其余请求等待结果或使用缓存，以便节省 API 调用成本并保证结果一致。

#### 验收标准

1. WHEN 缓存未命中且需要执行 LLM 分析时，THE Analysis_Orchestrator SHALL 尝试获取基于 Redis 的分布式锁，锁的 key 格式为 `analysis:lock:{symbol}:{mode}`
2. IF 获取锁成功，THEN THE Analysis_Orchestrator SHALL 执行完整分析流程并将结果写入缓存后释放锁
3. IF 获取锁失败（其他请求正在执行分析），THEN THE Analysis_Orchestrator SHALL 以 500ms 间隔轮询缓存，最多等待 90 秒
4. IF 轮询等待超过 90 秒仍未获取到缓存结果，THEN THE Analysis_Orchestrator SHALL 返回一个 ErrorEvent，code 为 `analysis_busy`，message 说明分析正在进行中请稍后重试
5. THE Cache_Lock SHALL 设置自动过期时间为 120 秒，防止持锁进程崩溃导致死锁
6. WHEN 持锁的分析流程完成或异常退出时，THE Analysis_Orchestrator SHALL 在 finally 块中释放锁

### 需求 6：缓存一致性增强

**用户故事：** 作为交易者，我希望在缓存有效期内所有用户看到的分析结果完全一致，以便系统表现出专业可信的一致性。

#### 验收标准

1. THE Analysis_Orchestrator SHALL 以 `analysis:cache:{symbol}:{mode}` 为 key 缓存完整的 AnalysisReport，TTL 由 MODE_CACHE_TTL 配置决定
2. WHEN 缓存命中时，THE Analysis_Orchestrator SHALL 在返回的 AnalysisReport 中设置 `cached=True` 和 `cached_at` 为原始分析时间戳
3. THE StrategyService SHALL 以 `strategy:latest:{symbol}` 为 key 缓存策略结果，TTL 为 15 分钟
4. WHEN 同一交易对在缓存有效期内被不同用户请求时，THE Analysis_Orchestrator SHALL 返回相同的缓存结果，确保所有用户看到一致的分析报告


### 需求 7：数据指纹缓存失效

**用户故事：** 作为交易者，我希望当市场数据发生实质变化时缓存自动失效并触发新分析，而非等待固定 TTL 过期，以便我能及时获得基于最新数据的分析结果。

#### 验收标准

1. THE Analysis_Orchestrator SHALL 在构建缓存 key 时包含数据指纹（data fingerprint），格式为 `analysis:cache:{symbol}:{mode}:{fingerprint}`
2. THE data fingerprint SHALL 由以下数据计算：当前价格按模式精度取整（短线精度 0.1%，日内精度 0.5%，趋势精度 1%）+ 最近 N 根 K 线的收盘价序列（N 由模式决定：短线 6 根，日内 4 根，趋势 3 根）
3. WHEN 市场价格变动超过模式精度阈值或 K 线收盘价序列发生变化时，THE fingerprint SHALL 自动变化，导致缓存 key 不同从而触发缓存未命中
4. THE Analysis_Orchestrator SHALL 保留 TTL 作为兜底过期机制，即使 fingerprint 未变化，缓存仍会在 TTL 到期后过期
5. THE fingerprint 计算 SHALL 使用 hashlib.md5 对拼接字符串取前 8 位十六进制作为指纹值，确保计算开销极低
