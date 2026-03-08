# 需求文档：FRED 宏观主数据源

## 文档状态

- **当前定位**：本文件是 `four-primary-datasources` 下的 `FRED` 子域需求文档。
- **主职责域**：`macro`
- **上位真相源**：系统级主数据源定义请以 `four-primary-datasources` 为准。
- **设计重点**：用官方宏观数列替代“仅靠新闻关键词识别宏观”的旧主叙事。

## 简介

本文件定义 `FRED` 作为系统宏观主真相源的需求边界。目标是把系统对美国宏观环境的理解，从“新闻里提到了 CPI / FOMC / 非农”提升为“系统持有官方宏观时间序列、发布时间信息和可解释降级语义”。

在该架构下：

- `FRED` 负责宏观主事实
- 当前 `macro_event_detector` 保留为**解释层 / fallback**，不再承担宏观主真相职责
- 趋势分析、风险提示、后台状态页和公开数据质量输出，都必须围绕 `FRED` 的主 owner 角色对齐

## 术语表

- **FRED_Domain**：FRED 能力域，指系统内由 FRED 负责的宏观官方时间序列集合。
- **Series_Whitelist**：宏观序列白名单，定义当前阶段正式纳入主系统的 FRED series。
- **Observation**：数列观测值，即某 series 在某日期对应的官方值。
- **Release_Metadata**：发布元数据，描述某 series 所属 release 与发布时间信息。
- **Vintage_Data**：修订版本数据，用于识别历史值何时被修正。
- **Macro_Freshness**：宏观新鲜度，表示距离最近一次官方发布时间或成功同步时间的差值。
- **Macro_Interpretation_Layer**：宏观解释层，用新闻、文本和事件检测补充数列解释，但不替代主事实。
- **MacroSnapshot**：宏观事实聚合快照，供系统下游统一消费的宏观主能力视图。
- **Release_Window**：发布时间窗口，指某个 series 在其天然频率下合理预期的发布时间区间。
- **Macro_Section_Contract**：宏观 section 契约，规定事实层与解释层在分析输出中的呈现结构与降级语义。

## 需求

### 需求 1：FRED 主源角色固化

**用户故事：** 作为系统维护者，我希望宏观主能力明确由 FRED 负责，以便避免新闻关键词检测继续被误当作宏观主真相源。

#### 验收标准

1. THE System SHALL 将 `FRED` 定义为 `macro` 域的主真相源。
2. THE Primary_Capability_Matrix SHALL 将宏观核心能力的 `owner_source` 指向 `fred`。
3. THE System SHALL 将 `macro_event_detector` 标记为 `interpretation layer` 或 `fallback`，而非宏观主 owner。
4. THE Admin_Panel SHALL 将 `FRED` 以一等主源展示在宏观域位置。
5. THE documentation SHALL 明确 `FRED` 是当前主方案，而不是附属可选增强。

### 需求 2：宏观序列白名单

**用户故事：** 作为产品维护者，我希望宏观主域先从一组有限且高价值的美国序列开始，以便系统边界清晰且后续易于维护。

#### 验收标准

1. THE System SHALL 为 `FRED` 定义受控的 `Series_Whitelist`。
2. THE first rollout SHALL 至少覆盖以下一组核心美国宏观序列：
   - `CPI`
   - `Core CPI`
   - `UNRATE`
   - `ICSA`
   - `FEDFUNDS`
   - `GDPC1`
   - `PCEPI`
   - `PAYEMS`
3. THE whitelist SHALL 为每个 series 记录：`series_id`、中文语义、频率、默认展示单位、主要消费者。
4. IF 某 series 更新频率较低或发布时间滞后，THEN THE System SHALL 在 freshness 语义中显式反映，而不是简单视为异常。

### 需求 3：官方 observations 数列采集

**用户故事：** 作为宏观分析消费者，我希望系统直接持有官方时间序列值，以便趋势分析和风险提示基于数值事实而不是文本猜测。

#### 验收标准

1. THE FRED domain SHALL 通过官方 `series/observations` 能力采集宏观数列值。
2. THE collector SHALL 支持按 `series_id` 拉取 observations。
3. THE collector SHALL 支持最小必要的时间区间过滤能力，如 `observation_start` 与 `observation_end`。
4. THE collector SHALL 支持必要的频率转换或单位转换参数，但不得隐藏原始官方语义。
5. THE System SHALL 将最新 observation 与历史 observation 写入统一的时序存储。

### 需求 4：release 元数据与发布时间语义

**用户故事：** 作为趋势分析使用者，我希望系统知道数据何时正式发布，以便区分“尚未更新”与“数据过期”这两类情况。

#### 验收标准

1. THE FRED domain SHALL 记录每个核心 series 对应的 release 元数据。
2. THE System SHALL 支持通过 release 能力获取发布时间信息。
3. THE System SHALL 在宏观域 freshness 计算中同时参考最近成功同步时间与官方发布时间语义。
4. IF 某 series 因其天然发布频率尚未到达下一个更新窗口，THEN THE System SHALL 不将其误标为错误。
5. THE Admin_Panel SHALL 能展示宏观数列最近值、最近发布日期和 freshness 状态。
6. THE scheduler SHALL 按 `daily / weekly / monthly / quarterly` 对核心 series 分层建模，而不是共用单一同步策略。
7. THE freshness policy SHALL 为不同频率 series 设定不同的 `Release_Window` 与容忍窗口。

### 需求 5：revision / vintage 语义

**用户故事：** 作为系统维护者，我希望为后续回测和版本追踪保留修订能力空间，但不把它错误升级成第一阶段必须完成项。

#### 验收标准

1. THE FRED domain MAY 支持 `vintage` / `revision` 数据语义。
2. THE spec SHALL 将 `vintage` 能力标记为可选增强项，而非第一阶段强制项。
3. IF 启用 vintage 能力，THEN THE System SHALL 能识别某个 series 在不同发布日期下的历史修订版本。
4. THE first rollout SHALL 不因未实现 vintage 而阻塞宏观主源落地。

### 需求 6：宏观能力标准化

**用户故事：** 作为下游消费者，我希望 FRED 的宏观数据以稳定能力键暴露给系统，而不是直接耦合 FRED 原始 series id。

#### 验收标准

1. THE System SHALL 将 FRED series 映射为稳定系统能力键，如 `macro_cpi`、`macro_core_cpi`、`macro_rate`、`macro_unemployment`、`macro_jobless_claims`、`macro_growth`、`macro_pce`、`macro_payrolls`。
2. THE System SHALL 为每个能力键定义单位、发布时间语义、freshness 规则和 fallback 行为。
3. THE cache key naming SHALL 与主能力矩阵保持一致。
4. THE System SHALL 为每个宏观能力记录 `source_id=fred` 与 `owner_source=fred`。

### 需求 7：数据源注册、开关与健康状态

**用户故事：** 作为管理员，我希望在后台中独立管理 FRED 的启用、健康和 freshness 状态，以便宏观域可观测且可降级。

#### 验收标准

1. THE DataSource_Registry SHALL 为 `fred` 建立独立主源注册项。
2. THE Health_Monitor SHALL 对 `fred` 输出 `fresh / stale / missing / error` 等状态。
3. THE Admin_Panel SHALL 能独立展示 `fred` 的启用状态、最近同步时间、最近官方发布日期和错误计数。
4. WHEN `fred` 不可用时，THE System SHALL 将 `macro` 域标记为降级，而不是静默继续输出完整宏观结论。
5. THE observability output SHALL 至少包含 `last_release_at`、`last_sync_at`、`release_delay`、`missing_series_ratio` 与 `scheduled_wait_count`。

### 需求 8：解释层与 fallback 归位

**用户故事：** 作为系统维护者，我希望保留当前新闻宏观事件识别能力，但它只能做解释补充，不能继续伪装成宏观主事实层。

#### 验收标准

1. THE existing `macro_event_detector` SHALL 被归位为 `Macro_Interpretation_Layer`。
2. THE Macro_Interpretation_Layer MAY 使用新闻源与关键词模式识别 FOMC、CPI、NFP、GDP、PCE 等事件。
3. THE Macro_Interpretation_Layer SHALL 不得继续在无 FRED 主事实时被表述为 `macro 已完整可用`。
4. WHEN `fred` 缺失而解释层仍有事件检测结果时，THE output SHALL 明示 `macro 主源缺失，仅有解释层信号`。
5. THE System SHALL 禁止将新闻关键词命中直接等价为官方宏观数据更新。

### 需求 9：下游消费者对齐

**用户故事：** 作为趋势和风险分析消费者，我希望系统的宏观结论基于官方数列，并在解释层与事实层之间有清晰分工。

#### 验收标准

1. THE analysis pipeline SHALL 优先消费 `FRED` 产出的宏观主能力快照。
2. THE risk / trend outputs SHALL 能引用具体宏观能力键与最新官方值。
3. THE frontend / admin views SHALL 以 `FRED` 作为宏观主展示来源。
4. THE System SHALL 在 `fred` 不可用时显式输出宏观域降级说明。
5. THE interpretation layer SHALL 作为说明性补充，而不是取代宏观主数据路径。

### 需求 10：事实层输出契约与解释层接线

**用户故事：** 作为后端与编排层维护者，我希望宏观事实层和解释层有统一输出契约，以便当前 `analysis_orchestrator -> detect_macro_events()` 路径能平滑过渡到 FRED 主事实优先的结构。

#### 验收标准

1. THE System SHALL 定义 `MacroSnapshot` 作为宏观主事实聚合契约。
2. THE `MacroSnapshot` SHALL 至少包含：`capabilities`、`last_release_at`、`last_sync_at`、`freshness_state`、`missing_capabilities`。
3. THE analysis pipeline SHALL 先读取 `MacroSnapshot`，再叠加 `Macro_Interpretation_Layer` 输出。
4. THE existing `macro_event_detector` result SHALL 被视为解释层 section，而非事实层 section。
5. WHEN 仅有解释层信号而无 FRED 主事实时，THE output SHALL 明示 `macro 主源缺失，仅有解释层信号`。
6. THE `Macro_Section_Contract` SHALL 明确区分 `macro_fact` 与 `macro_events` 两类输出 section。

### 需求 11：现状冲突清理

**用户故事：** 作为后续开发者，我希望仓库中当前“宏观=新闻检测”的旧现实被明确记录下来，以便后续接入 FRED 时不再误判系统现状。

#### 验收标准

1. THE spec SHALL 明确记录当前仓库已有 `macro_event_detector`，其职责是新闻关键词检测而非官方宏观数列采集。
2. THE spec SHALL 将这种状态标记为 `宏观解释层存在，宏观主源尚未正式落地完成`。
3. THE rollout tasks SHALL 覆盖 registry、collector、cache、consumer、admin 展示与降级语义的对齐工作。
4. THE documentation SHALL 阻止后续继续把新闻宏观事件识别误读为 `FRED 已接入完成`。
