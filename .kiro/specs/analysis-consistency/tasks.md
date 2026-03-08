# 实施计划：分析结果一致性保障与反幻觉约束

## 概述

按依赖顺序实施：先改基础层（LLM 客户端、指纹计算），再改智能体层（反幻觉 prompt），然后新增服务层（后验校验、点位吸附），最后改编排层（缓存锁 + 指纹缓存集成）。每个阶段包含对应的属性测试和单元测试。

## 任务

- [x] 1. UnifiedLLMClient temperature 改动与指纹计算器
  - [x] 1.1 修改 `backend/app/core/llm_client.py` 的 `call_model` 方法
    - 将 `temperature` 默认值从 `0.3` 改为 `0.1`
    - 在方法开头新增范围校验：`temperature` 超出 `[0.0, 1.0]` 时裁剪至边界值
    - 裁剪时记录 warning 级别日志，包含原始值和裁剪后的值
    - _需求: 1.1, 1.2, 1.3_

  - [x]* 1.2 编写 temperature 裁剪属性测试
    - **Property 1: Temperature 裁剪幂等性**
    - 在 `backend/tests/test_llm_temperature.py` 中使用 hypothesis 生成任意 float 作为 temperature
    - 验证实际使用值等于 `max(0.0, min(1.0, t))`
    - **验证: 需求 1.2, 1.3**

  - [x] 1.3 创建 `backend/app/services/fingerprint.py` — FingerprintCalculator
    - 实现 `MODE_PRECISION` 和 `MODE_KLINE_COUNT` 常量字典
    - 实现 `round_price_by_precision(price, precision)` 函数
    - 实现 `compute_fingerprint(price, klines, mode)` 函数，返回 8 位十六进制字符串
    - 使用 `hashlib.md5` 对拼接字符串取前 8 位
    - _需求: 7.2, 7.5_

  - [x]* 1.4 编写指纹确定性属性测试
    - **Property 5: 指纹确定性**
    - 在 `backend/tests/test_fingerprint.py` 中使用 hypothesis 生成随机价格、K 线列表和模式
    - 验证相同输入始终产生相同的 8 位十六进制字符串
    - **验证: 需求 7.2, 7.5**

  - [x]* 1.5 编写指纹价格敏感性属性测试
    - **Property 6: 指纹对价格变动的敏感性**
    - 生成价格对 `(p, p+delta)`，确保 `round_price_by_precision` 取整后不同
    - 验证两个指纹不相等
    - **验证: 需求 7.3**

  - [x]* 1.6 编写指纹 K 线敏感性属性测试
    - **Property 7: 指纹对 K 线变化的敏感性**
    - 生成两个收盘价序列不同的 K 线列表
    - 验证相同价格下两个指纹不相等
    - **验证: 需求 7.3**

- [x] 2. 检查点 — 确保所有测试通过
  - 确保所有测试通过，如有问题请询问用户。

- [x] 3. 反幻觉 Prompt 注入
  - [x] 3.1 修改 `backend/app/agents/technical.py` 的 `_SYSTEM_PROMPT`
    - 在 system prompt 末尾追加【硬约束 - 反幻觉规则】段落
    - 包含：禁止编造支撑阻力位、价格点位必须可追溯、数据缺失时标注"数据不足，无法判断"
    - _需求: 2.1, 2.5_

  - [x] 3.2 修改 `backend/app/agents/onchain.py` 的 `_SYSTEM_PROMPT`
    - 在 system prompt 末尾追加【硬约束 - 反幻觉规则】段落
    - 包含：禁止编造链上指标数值、数据缺失时禁止推测、evidence 必须引用具体数值
    - _需求: 2.2, 2.5_

  - [x] 3.3 修改 `backend/app/agents/playbook.py` 的 `_SYSTEM_PROMPT`
    - 在 system prompt 末尾追加【硬约束 - 反幻觉规则】段落
    - 包含：概率必须基于实际特征、禁止引用未提供的事件、数据不足时说明影响
    - _需求: 2.3, 2.5_

  - [x] 3.4 修改 `backend/app/agents/risk.py` 的 `_SYSTEM_PROMPT`
    - 在 system prompt 末尾追加【硬约束 - 反幻觉规则】段落
    - 包含：风险评估基于实际告警、禁止编造风险事件、risk_factors 引用具体数值
    - _需求: 2.4, 2.5_

  - [x]* 3.5 编写反幻觉 prompt 单元测试
    - 在 `backend/tests/test_anti_hallucination.py` 中验证 4 个 Agent 的 system prompt 包含反幻觉规则关键词
    - 验证每个 Agent 的 prompt 包含"数据缺失"相关处理指令
    - _需求: 2.1, 2.2, 2.3, 2.4, 2.5_

- [x] 4. PostValidator 后验校验器
  - [x] 4.1 创建 `backend/app/services/post_validator.py`
    - 实现 `PostValidator` 类，`RANGE_TOLERANCE = 0.20`
    - 实现 `validate_levels(report, klines, n_klines=30)` 方法
    - 取最近 30 根 K 线的 `[min(low), max(high)]` 作为合理范围，扩展 20% 后过滤
    - 超出范围的点位丢弃并记录 warning 日志
    - 全部支撑位被丢弃时用 `min(low)` 回退；全部阻力位被丢弃时用 `max(high)` 回退
    - 在 `raw_data` 中添加 `validation_applied: true` 和 `discarded_levels` 列表
    - K 线数据为空时跳过校验，`validation_applied: false`
    - _需求: 3.1, 3.2, 3.3, 3.4, 3.5_

  - [x]* 4.2 编写后验校验属性测试
    - **Property 2: 后验校验保留点位均在合理范围内**
    - 在 `backend/tests/test_post_validator.py` 中使用 hypothesis 生成随机 K 线价格和点位列表
    - 验证校验后所有保留点位在 `[min_low * 0.8, max_high * 1.2]` 范围内
    - 验证 `validation_applied` 和 `discarded_levels` 字段正确设置
    - **验证: 需求 3.1, 3.2, 3.3, 3.4, 3.5**

  - [x]* 4.3 编写后验校验单元测试
    - 在 `backend/tests/test_post_validator.py` 中测试：正常范围内点位保留、超出范围点位丢弃、全部丢弃时回退、K 线为空时跳过
    - _需求: 3.1, 3.2, 3.3, 3.4, 3.5_

- [x] 5. PointSnapper 点位吸附器
  - [x] 5.1 扩展 `backend/app/services/strategy.py` 的 `StrategyResult` 模型
    - 新增 `snapped_fields: list[str] = Field(default_factory=list)` 字段
    - _需求: 4.7_

  - [x] 5.2 创建 `backend/app/services/point_snapper.py`
    - 实现 `PointSnapper` 类，`SNAP_THRESHOLD = 0.005`
    - 实现 `async snap(new_strategy, symbol)` 方法
    - 从 Redis 读取 `strategy:latest:{symbol}` 获取上一次策略
    - 逐字段比较 `entry_low`, `entry_high`, `stop_loss`, `targets`，偏差 < 0.5% 时沿用缓存值
    - `direction` 不同时跳过吸附，直接使用新值
    - 记录 `snapped_fields` 列表
    - Redis 读取失败或缓存不存在时跳过吸附，记录 warning 日志
    - _需求: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7_

  - [x]* 5.3 编写点位吸附阈值属性测试
    - **Property 3: 点位吸附阈值一致性**
    - 在 `backend/tests/test_point_snapper.py` 中使用 hypothesis 生成两个同方向 StrategyResult
    - 验证偏差 < 0.5% 时沿用缓存值，偏差 >= 0.5% 时使用新值
    - 验证 `snapped_fields` 准确记录被吸附字段
    - **验证: 需求 4.2, 4.3, 4.4, 4.5, 4.7**

  - [x]* 5.4 编写方向变化跳过吸附属性测试
    - **Property 4: 方向变化跳过吸附**
    - 在 `backend/tests/test_point_snapper.py` 中生成两个不同方向的 StrategyResult
    - 验证吸附后策略与新策略完全相同，`snapped_fields` 为空
    - **验证: 需求 4.6**

  - [x]* 5.5 编写点位吸附单元测试
    - 在 `backend/tests/test_point_snapper.py` 中测试：缓存不存在时跳过、Redis 异常时降级、targets 列表长度不同时的处理
    - _需求: 4.1, 4.2, 4.6_

- [x] 6. 检查点 — 确保所有测试通过
  - 确保所有测试通过，如有问题请询问用户。

- [x] 7. 缓存锁机制与指纹缓存集成
  - [x] 7.1 修改 `backend/app/services/analysis_orchestrator.py` — 集成 FingerprintCalculator
    - 在 `run_analysis` 方法中，采集市场数据后调用 `compute_fingerprint(price, klines, mode)` 计算指纹
    - 将缓存 key 格式从 `analysis:cache:{symbol}:{mode}` 改为 `analysis:cache:{symbol}:{mode}:{fingerprint}`
    - 保留 TTL 作为兜底过期机制
    - _需求: 7.1, 7.2, 7.3, 7.4_

  - [x] 7.2 修改 `backend/app/services/analysis_orchestrator.py` — 新增 Redis 分布式缓存锁
    - 缓存未命中时尝试获取锁，key 格式 `analysis:lock:{symbol}:{mode}`，`NX=True, EX=120`
    - 获取锁成功：执行完整分析流程，结果写入缓存后在 `finally` 块中释放锁
    - 获取锁失败：以 500ms 间隔轮询缓存，最多等待 90 秒
    - 轮询超时：返回 `ErrorEvent(code="analysis_busy", message="分析正在进行中，请稍后重试")`
    - _需求: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6_

  - [x] 7.3 修改 `backend/app/services/analysis_orchestrator.py` — 缓存一致性增强
    - 缓存命中时在返回的 AnalysisReport 中设置 `cached=True` 和 `cached_at` 为原始分析时间戳
    - 确保同一交易对在缓存有效期内返回相同结果
    - _需求: 6.1, 6.2, 6.4_

  - [x] 7.4 修改 `backend/app/services/analysis_orchestrator.py` — 集成 PostValidator
    - 在 Agent 返回 AgentReport 后、传入 StrategyService 前，调用 `PostValidator.validate_levels`
    - 将最近 K 线数据传入校验器
    - _需求: 3.1, 3.2, 3.3, 3.4, 3.5_

  - [x] 7.5 修改 `backend/app/services/strategy.py` — 集成 PointSnapper
    - 在 `generate_from_report` 和 `generate_from_consensus` 方法中，生成策略后调用 `PointSnapper.snap`
    - 以 `strategy:latest:{symbol}` 为 key 缓存策略结果，TTL 为 15 分钟
    - _需求: 4.1, 6.3_

  - [x]* 7.6 编写缓存锁单元测试
    - 在 `backend/tests/test_cache_lock.py` 中 mock Redis，测试锁获取/释放、轮询等待、超时处理
    - _需求: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6_

  - [x]* 7.7 编写缓存一致性单元测试
    - 在 `backend/tests/test_cache_consistency.py` 中测试缓存 key 格式含指纹、TTL 设置、缓存命中标记
    - _需求: 6.1, 6.2, 6.4, 7.1_

- [x] 8. 最终检查点 — 确保所有测试通过
  - 确保所有测试通过，如有问题请询问用户。

## 备注

- 标记 `*` 的子任务为可选，可跳过以加速 MVP 交付
- 每个任务引用了具体需求编号，确保可追溯性
- 属性测试验证系统在所有合法输入下的正确性保证
- 单元测试覆盖边界条件和错误降级场景
