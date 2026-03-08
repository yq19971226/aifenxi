# 实施任务：FRED 宏观主数据源

## 概述

本任务包用于把 `FRED` 正式落为系统 `macro` 域的一等主真相源，并完成从新闻解释层主叙事到官方宏观事实层主叙事的迁移。

首阶段重点：

- 核心美国宏观 series 白名单
- observations 主数值链路
- release / release dates freshness 语义
- `macro_event_detector` 归位为解释层

## 任务

- [x] 1. 子域规格固化
  - [x] 1.1 建立 `fred-macro-source` 的 requirements / design / tasks
  - [x] 1.2 固化核心美国宏观 series 白名单
  - [x] 1.3 明确事实层与解释层边界
  - [x] 1.4 明确 `MacroSnapshot` 与 `Macro_Section_Contract`
  - [x] 1.5 明确当前 `analysis_orchestrator -> detect_macro_events()` 的过渡接线关系

- [ ] 2. 注册与主能力矩阵对齐
  - [ ] 2.1 在主能力矩阵中补齐 `fred` 的 macro owner 记录
  - [ ] 2.2 为宏观核心能力补 `cache_key / consumer / fallback_policy / freshness_sla`
  - [ ] 2.3 在 datasource registry 中新增或对齐 `fred` 主注册项
  - [ ] 2.4 区分事实层主 owner 能力与解释层 section 能力

- [ ] 3. 采集器与事实层落地
  - [ ] 3.1 新增 `FredCollector`
  - [ ] 3.2 对接 observations 主链路
  - [ ] 3.3 对接 release / release dates 元数据
  - [ ] 3.4 预留 vintagedates 能力，但不阻塞一期落地
  - [ ] 3.5 按 `daily / weekly / monthly / quarterly` 分层设计同步策略

- [ ] 4. 宏观能力标准化
  - [ ] 4.1 将 FRED series id 映射为系统稳定能力键
  - [ ] 4.2 统一单位、发布日期语义与 freshness 状态
  - [ ] 4.3 对齐时序存储与 Redis 最新快照缓存
  - [ ] 4.4 落地系统级 `MacroSnapshot` 聚合模型

- [ ] 5. 解释层归位
  - [ ] 5.1 将 `macro_event_detector` 标记为 `Macro_Interpretation_Layer`
  - [ ] 5.2 编排层改为优先消费 FRED 主快照，再叠加解释层信号
  - [ ] 5.3 当 `fred` 缺失时输出 `macro 主源缺失，仅有解释层信号`
  - [ ] 5.4 禁止将新闻关键词命中等价为官方宏观数据更新
  - [ ] 5.5 将现有 `宏观事件` section 归位为 `macro_events` 解释层输出

- [ ] 6. 下游消费者与展示对齐
  - [ ] 6.1 趋势 / 风险输出支持引用具体宏观官方值
  - [ ] 6.2 后台状态页补 `fred` 的 freshness / 最近发布日期 / 最近同步时间
  - [ ] 6.3 前端宏观展示切换为 `FRED` 主来源语义
  - [ ] 6.4 新增 `macro_fact` 事实层 section，并定义与 `macro_events` 的并存规则

- [ ] 7. 可观测性与窗口规则
  - [ ] 7.1 为不同频率 series 定义 `Release_Window` 与容忍窗口
  - [ ] 7.2 输出 `last_release_at / last_sync_at / release_delay`
  - [ ] 7.3 输出 `missing_series_ratio / scheduled_wait_count / sync_error_count`

- [ ] 8. 验证与同步
  - [ ] 8.1 校验 `FRED` 与解释层不会并列充当主真相源
  - [ ] 8.2 校验低频 series 的 freshness 规则不会误报异常
  - [ ] 8.3 校验后台一等主源展示与 spec 文案一致
  - [ ] 8.4 输出一份宏观域切换审查记录
