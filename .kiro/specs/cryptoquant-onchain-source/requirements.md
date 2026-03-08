# 需求文档：CryptoQuant 链上主数据源

## 文档状态

- **当前定位**：本文件是 `four-primary-datasources` 下的 `CryptoQuant` 子域需求文档。
- **主职责域**：`onchain`
- **上位真相源**：系统级主数据源定义请以 `four-primary-datasources` 为准。
- **当前档位**：CryptoQuant Professional ($109/月)，`20 req/min`、仅按天分辨率、最长1天API历史、`1年`数据保留、仅限个人使用。

## 简介

本文件定义 `CryptoQuant` 作为系统链上主真相源的需求边界。目标不是把所有链上指标一次性接满，而是在预算可控、语义明确的前提下，为系统建立一套**可解释、可降级、可运维**的链上主能力面。

在该架构下：

- `CryptoQuant` 负责链上主事实
- 旧有 `GlassNode / Alternative.me / Etherscan` 只能作为辅助或过渡来源
- `OnchainAgent`、预警规则、后台数据源状态页都必须围绕 `CryptoQuant` 的主 owner 角色对齐

## 术语表

- **CQ_Domain**：CryptoQuant 能力域，指系统内由 CryptoQuant 负责的链上事实集合。
- **Capability_Owner**：能力 owner，某项链上能力的唯一主负责来源。
- **Metric_Whitelist**：受控指标白名单，当前版本允许采集和展示的 CryptoQuant 指标集合。
- **Symbol_Plan**：交易对/币种采集计划，规定首阶段覆盖的主币种范围。
- **Onchain_Freshness**：链上新鲜度，表示最近一次成功采集距当前的时间差。
- **Fallback_Source**：辅助/降级来源，主源不可用时允许提供有限参考的来源。
- **Onchain_Completeness**：链上域完整度，表示链上主能力当前是否可用于生产分析。
- **License_Mode**：许可模式，区分 `personal_research` 与 `commercial_production` 两类部署前提。
- **Current_Onchain_Model**：当前链上模型，指仓库现有 `OnchainSnapshot` 字段集合与其 Redis / DB 消费语义。

## 需求

### 需求 1：CryptoQuant 主源角色固化

**用户故事：** 作为系统维护者，我希望链上主能力明确由 CryptoQuant 负责，以便避免历史链上来源和当前主架构继续混淆。

#### 验收标准

1. THE System SHALL 将 `CryptoQuant` 定义为 `onchain` 域的主真相源。
2. THE Primary_Capability_Matrix SHALL 将链上核心能力的 `owner_source` 指向 `cryptoquant`。
3. THE System SHALL 将 `GlassNode`、`Alternative.me`、`Etherscan` 标记为 `fallback`、`auxiliary` 或 `legacy`，不得继续默认充当链上主 owner。
4. THE Admin_Panel SHALL 将 `CryptoQuant` 以一等主源展示在链上域位置。
5. THE documentation SHALL 明确 `CryptoQuant` 是当前主方案，而不是只存在于历史 spec 的预期目标。

### 需求 2：首阶段覆盖范围与白名单约束

**用户故事：** 作为产品维护者，我希望首阶段只覆盖有限且高价值的链上指标与主币种，以便在个人档预算内稳定运行。

#### 验收标准

1. THE System SHALL 为 `CryptoQuant` 定义受控的 `Metric_Whitelist`。
2. THE first rollout SHALL 默认覆盖 `3-4` 个主币种，建议基线为 `BTC`、`ETH`、`SOL`、`BNB`，除非后续产品决策调整。
3. THE first rollout SHALL 以 `10` 个左右核心指标为目标上限，而非无控制扩张。
4. THE whitelist SHALL 优先覆盖以下能力类别：
   - 交易所净流入 / 净流出 / 净流量
   - 交易所储备或余额变化
   - 鲸鱼或大额地址活动
   - 稳定币流向或储备变化
   - BTC 专属矿工相关指标（如适用）
5. IF 某指标仅适用于部分币种，THEN THE whitelist SHALL 显式标记适用范围，而不是假定所有币种都能提供相同链上能力。

### 需求 3：预算与调度策略

**用户故事：** 作为系统运营者，我希望链上采集在个人档限额下仍能稳定运行，以便避免频繁限流和超配设计。

#### 验收标准

1. THE default collection budget SHALL 按 `20 req/min` 进行容量规划。
2. THE first rollout SHALL 使用节流式调度，而不是高频并发轮询。
3. THE System SHALL 将首阶段链上采集频率控制在 `5-15 分钟` 主区间内，并允许部分低频指标使用 `30-60 分钟` 调度。
4. THE System SHALL 支持按指标类别和币种分层调度，而不是所有指标同频采集。
5. IF 发生限流或额度不足，THEN THE collector SHALL 优先保留高价值主指标，延后低优先级指标采集。
6. THE design SHALL 为后续升级到更高 CryptoQuant 档位保留扩容空间，但不得以高档位假设反向污染当前默认方案。
7. THE runtime SHALL 输出至少以下预算可观测项：`request_usage`、`rate_limit_errors`、`retry_count`、`budget_drops`。

### 需求 4：链上能力标准化与存储

**用户故事：** 作为智能体和 API 的消费者，我希望 CryptoQuant 产出的链上数据具有稳定能力键与缓存语义，以便下游不依赖供应商私有表达。

#### 验收标准

1. THE System SHALL 将 CryptoQuant 原始返回映射为稳定的系统能力键，如 `exchange_netflow`、`exchange_inflow`、`exchange_outflow`、`exchange_reserve`、`whale_activity`、`stablecoin_flow`、`miner_activity` 等。
2. THE System SHALL 为每个能力键定义单位、方向语义、最近更新时间和 freshness 规则。
3. THE collector SHALL 将链上快照写入系统统一的时序存储，并在 Redis 中缓存最新快照。
4. THE cache key naming SHALL 与主能力矩阵保持一致，不得为同一能力并存多个互斥命名真相。
5. THE System SHALL 为每个能力键记录 `source_id` 与 `owner_source=cryptoquant`，便于下游追踪来源。

### 需求 5：数据源注册、开关与健康状态

**用户故事：** 作为管理员，我希望在后台中独立管理 CryptoQuant 的启用、健康和降级状态，以便清晰区分链上域是否真的可用。

#### 验收标准

1. THE DataSource_Registry SHALL 为 `cryptoquant` 建立独立主源注册项。
2. THE Admin_Panel SHALL 支持独立查看 `cryptoquant` 的启用状态、最近成功时间、错误计数和 freshness。
3. THE Health_Monitor SHALL 对 `cryptoquant` 输出 `fresh / stale / missing / error` 等状态。
4. WHEN `cryptoquant` 不可用时，THE System SHALL 将 `onchain` 域标记为降级，而不是静默保持正常。
5. THE public datasource status output SHALL 能区分 `CryptoQuant 主源缺失` 与 `辅助链上源仍有局部数据` 这两种不同情况。
6. THE observability output SHALL 额外暴露 `fallback_activations`、`capability_missing_ratio` 与 `quota_exhausted` 等运行信号。

### 需求 6：下游消费者对齐

**用户故事：** 作为链上分析消费者，我希望智能体、预警与前端都围绕 CryptoQuant 主能力工作，而不是继续依赖旧链上路径的混合结果。

#### 验收标准

1. THE OnchainAgent SHALL 优先消费 `CryptoQuant` 产出的链上主能力快照。
2. THE alerting system SHALL 能基于 `CryptoQuant` 的主能力键定义规则和阈值。
3. THE frontend / admin views SHALL 用 `CryptoQuant` 作为链上主数据展示来源。
4. THE analysis pipeline SHALL 在 `CryptoQuant` 不可用时显式输出链上域降级说明。
5. THE System SHALL 避免继续将 `Alternative.me` 的情绪值与真正链上主事实混写为同一主域结论。
6. THE System SHALL 明确 `fear_greed_index` 不属于 `CryptoQuant` 的链上主 owner 能力，不得计入 `onchain` 主域完整度。

### 需求 7：降级与辅助来源边界

**用户故事：** 作为系统维护者，我希望主源故障时允许有限降级，但又不让旧辅助源重新篡位成新的主真相源。

#### 验收标准

1. IF `CryptoQuant` 不可用，THEN THE System MAY 使用 `GlassNode / Alternative.me / Etherscan` 提供局部参考，但 SHALL 将其标记为 fallback。
2. WHEN fallback 被使用时，THE analysis output SHALL 明示 `onchain` 域缺失主 owner。
3. THE fallback policy SHALL 定义哪些能力可以降级、哪些能力必须标记为缺失。
4. THE System SHALL 禁止把辅助源拼接后的结果伪装成 `CryptoQuant 完整能力已可用`。

### 需求 8：现状冲突清理

**用户故事：** 作为后续开发者，我希望历史 spec、当前注释和现有实现中的链上表述差异被明确揭示，以便后续接入不会继续踩进多真相源问题。

#### 验收标准

1. THE spec SHALL 明确记录当前仓库中 `CryptoQuant` 主要存在于历史 spec 与少量注释层，而当前链上采集主路径仍偏向 `GlassNode / Alternative.me`。
2. THE spec SHALL 将这种状态标记为 `主源已确定，运行时尚未完全对齐`。
3. THE rollout tasks SHALL 覆盖 registry、collector、worker、cache、consumer 和 admin 展示的对齐工作。
4. THE documentation SHALL 阻止后续继续把历史链上方案误读为当前已完成状态。
5. THE spec SHALL 明确给出当前 `OnchainSnapshot` 字段与新 capability key 的兼容/迁移关系。

### 需求 9：许可与部署门槛

**用户故事：** 作为系统负责人，我希望 `CryptoQuant` 的许可模式被写成显式部署门槛，以便个人研究档不会被误当成可直接商用的生产方案。

#### 验收标准

1. THE documentation SHALL 将默认方案标记为 `personal_research` 前提，而非默认商业生产前提。
2. IF 部署目标为多用户产品、会员服务或商业化生产环境，THEN THE rollout SHALL 先确认 `commercial_production` 许可或更高可商用档位。
3. THE tasks SHALL 包含一个上线前许可确认 gate，未通过时不得把 `CryptoQuant` 作为正式生产主源启用。
4. THE Admin_Panel / deployment notes SHALL 能标识当前 `cryptoquant` 接入所依据的档位或许可模式。
