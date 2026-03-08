# 实施任务：CryptoQuant 链上主数据源

## 概述

本任务包用于把 `CryptoQuant` 正式落为系统 `onchain` 域的一等主真相源，并完成从旧链上混合实现到主 owner 语义的迁移。

默认以保守预算为前提：

- `20 req/min`
- `1年历史`
- `3-4` 个主币种
- `10` 个左右核心指标

## 任务

- [x] 1. 子域规格固化
  - [x] 1.1 建立 `cryptoquant-onchain-source` 的 requirements / design / tasks
  - [x] 1.2 将首阶段币种范围、指标白名单、预算约束写清
  - [x] 1.3 明确 fallback 与降级语义
  - [x] 1.4 明确 `personal_research` 与 `commercial_production` 的许可 gate
  - [x] 1.5 明确当前 `OnchainSnapshot` 与新 capability key 的兼容/迁移关系

- [ ] 2. 注册与主能力矩阵对齐
  - [ ] 2.1 在主能力矩阵中补齐 `cryptoquant` 的 onchain owner 记录
  - [ ] 2.2 为链上核心能力补 `cache_key / consumer / fallback_policy / freshness_sla`
  - [ ] 2.3 在 datasource registry 中新增或对齐 `cryptoquant` 主注册项
  - [ ] 2.4 区分 `cryptoquant owner`、`owner pending` 与 `auxiliary only` 三类字段归属

- [ ] 3. 采集器与预算调度落地
  - [ ] 3.1 新增 `CryptoQuantCollector`
  - [ ] 3.2 增加鉴权、超时、重试、预算控制
  - [ ] 3.3 实现按指标优先级分层调度
  - [ ] 3.4 将高优先级指标控制在 `5-15 分钟` 主区间
  - [ ] 3.5 固化 `capability_key -> endpoint family -> 目标频率 -> 预算优先级` 矩阵
  - [ ] 3.6 将 `online_sync` 与 `backfill` 调度分离，避免历史回填挤占在线预算

- [ ] 4. 链上能力标准化
  - [ ] 4.1 将供应商原始指标映射为系统稳定能力键
  - [ ] 4.2 统一单位、方向语义、missing/fallback 标记
  - [ ] 4.3 对齐时序存储与 Redis 最新快照缓存
  - [ ] 4.4 为现有 `OnchainSnapshot` 字段补兼容别名/迁移说明

- [ ] 5. 下游消费者切换
  - [ ] 5.1 OnchainAgent 优先改读 `cryptoquant` 主快照
  - [ ] 5.2 预警规则系统支持链上主能力键
  - [ ] 5.3 后台与公开状态输出补 `cryptoquant` freshness / health
  - [ ] 5.4 前端链上展示切换为 `CryptoQuant` 主来源语义
  - [ ] 5.5 盘点 `OnchainService`、`playbook_sim_service`、分析编排侧仍直接读取的旧字段

- [ ] 6. fallback 归位
  - [ ] 6.1 将 `GlassNode` 标记为局部链上 fallback
  - [ ] 6.2 将 `Alternative.me` 标记为情绪补充而非链上主事实
  - [ ] 6.3 将 `Etherscan` 标记为地址/事件补充而非链上主 owner
  - [ ] 6.4 主源失效时补全 `onchain` 域降级输出
  - [ ] 6.5 将 `fear_greed_index` 从链上主 owner 集中剥离，保留为辅助情绪字段

- [ ] 7. 许可与可观测性 gate
  - [ ] 7.1 上线前确认当前接入档位是否允许目标部署模式
  - [ ] 7.2 后台/部署说明展示当前 `cryptoquant` 许可模式与档位
  - [ ] 7.3 输出 `request_usage / rate_limit_errors / retry_count / budget_drops`
  - [ ] 7.4 输出 `fallback_activations / capability_missing_ratio / quota_exhausted`

- [ ] 8. 验证与同步
  - [ ] 8.1 校验个人档预算下的调度总量不超限
  - [ ] 8.2 校验 `cryptoquant` 与 fallback 来源不会并列充当主真相源
  - [ ] 8.3 校验后台主源展示与 spec 文案一致
  - [ ] 8.4 输出一份链上域切换审查记录
