# Requirements — 策略发布与排行榜

- **Status**: Reviewed (5-perspective review completed)
- **Implementation**: Not Started

## Scope

- AI 策略自动发布（去重）+ 自动结算 + 排行榜
- 替代现有 `/performance` 绩效页，路由变为 `/leaderboard`
- 系统整体表现周报 + 个人战绩卡 + 用户排名
- 剧本广场数据在排行榜中以独立 tab 展示

## Decisions

- 超短线（scalping）策略不发布、不计入排行
- 日内博弈（intraday）每币种每天最多发布 1 条
- 趋势布局（trend）每币种每周最多发布 1 条
- `is_worth_taking === false` 或 `is_fallback === true` 的策略不发布
- 排名指标：Profit Factor（总盈利 / 总亏损绝对值），至少 3 条已结算策略才上榜
- 用户身份匿名化：`交易员 #XXXX`（基于 user_id 哈希），零社交摩擦
- 日内策略结算周期调整为 24h（现有 72h 不适用）
- 趋势策略结算周期保持 72h

## Out of Scope

- 用户自定义策略发布（UGC）
- 社交功能：关注、评论、复制交易
- 成就系统 / 徽章（Phase 2）
- 实时浮动盈亏（pending 策略只显示静态入场价+方向）
- 剧本广场数据迁移（保持 `playbook_predictions` 独立，排行榜只读）

## R1 策略发布规则

- 策略由系统在分析完成时自动判断是否发布，用户无需手动操作
- 发布条件必须全部满足：
  1. `analysis_mode` 为 `intraday` 或 `trend`（scalping 排除）
  2. `is_fallback === false`（非回退策略）
  3. `direction !== "neutral"`（有明确方向）
  4. 去重检查通过（同用户+同币种+同模式在窗口期内无已发布记录）
- `is_worth_taking` 不作为发布过滤条件，而是作为排行榜中的策略质量标签展示
- 去重窗口：
  - intraday：当日 00:00 UTC ~ 23:59 UTC
  - trend：本周一 00:00 UTC ~ 周日 23:59 UTC

## R2 结算周期

- 现有结算逻辑保留（止损/止盈触达立即结算）
- 超时结算按 `analysis_mode` 区分：
  - intraday：24h 超时结算
  - trend：72h 超时结算（保持现有）
- 结算状态不变：`hit_target` / `hit_stop_loss` / `timeout`
- 结算后 `pnl_pct` 写入，排行榜聚合查询使用

## R3 排行榜排名

- 排名指标：**Profit Factor = SUM(正 pnl_pct) / ABS(SUM(负 pnl_pct))**
- PF 极值处理：当总亏损为 0 时，PF 封顶为 99.9，前端展示为 `>99`
- 上榜门槛：该周期内至少 3 条已结算策略
- 排行周期：周榜（7天）/ 月榜（30天）
- 按模式筛选：全部 / 日内 / 趋势
- 相同 Profit Factor 时按已结算策略数多者优先
- 排行榜数据缓存：Redis，TTL 5 分钟

## R4 系统周报

- 排行榜页面顶部展示系统整体表现：
  - 本周各币种策略表现（每币种：方向、结果、pnl_pct）
  - 本周总策略数 / 已结算数 / 整体胜率 / 整体 Profit Factor
- 按模式分组展示（日内 / 趋势各自独立统计）
- 数据来源：`strategy_snapshots WHERE published = TRUE`

## R5 个人战绩卡

- 展示在排行榜顶部（登录用户可见自己的）
- 指标：排名、胜率、累计收益%、Profit Factor、策略数
- 可切换周期：本周 / 本月
- 替代现有 `/performance` 页面的 `PerformanceSummary` 组件功能

## R6 用户身份

- 排行榜中用户显示为 `交易员 #XXXX`
- `XXXX` 为 `user_id` 的稳定哈希（同一用户始终显示同一编号）
- 当前用户自己的条目高亮显示
- 不展示头像、昵称、个人主页

## R7 剧本 Tab（Phase 2）

- Phase 1 不做剧本 Tab，剧本广场保留在 `/playbook-sim` 页面
- Phase 2 待日内/趋势数据稳定后，再将剧本数据合并到排行榜
- 原因：`playbook_predictions` 用 `final_accuracy` 指标，与策略快照的 `pnl_pct` 体系不同，强行合并会造成指标混乱

## Current Repo Truth

- `strategy_snapshots` 表**缺少 `user_id` 字段**（关键缺陷），无法按用户聚合
- `strategy_snapshots` 表**缺少 `analysis_mode` 字段**，无法区分模式
- `strategy_snapshots` 表**缺少 `published` 字段**，无法区分是否进入排行
- `PerformanceTracker.check_and_settle()` 超时固定 72h，需按模式动态化
- `StrategyService.save_strategy()` 不接收 `user_id` 参数
- `AnalysisOrchestrator` 在生成策略时有 `user_id` 上下文（来自 API 层的 `get_current_user`），但未传递到快照创建
- 现有 `/performance` 页面（`frontend/app/(main)/performance/page.tsx`）仍使用旧霓虹风格，需全面重写
- 导航栏 TopNav 中绩效入口为 `{ label: "绩效", href: "/performance" }`，需改为 `/leaderboard`
- 现有 `playbook_predictions` 表有 `published` 字段和 plaza feed/stats API，Phase 1 保留在 playbook-sim 页，Phase 2 再考虑合并
- 排行榜只统计迁移后新产生的数据（历史 snapshot 缺 user_id/mode），前端需显示"数据自 X 日起统计"提示
- `perf_checkpoints` 表的 checkpoint 时间点（1h/4h/24h/72h）对日内 24h 结算仍适用

## Glossary

- **Profit Factor (PF)**：总盈利除以总亏损绝对值，PF > 1 表示盈利系统，PF > 2 表示优秀
- **Published Strategy**：满足发布条件并通过去重检查的策略快照
- **Settlement**：策略到达止损/止盈/超时后的盈亏确认
- **System Weekly Report**：系统所有已发布策略的本周聚合表现
- **Anonymous Trader ID**：基于 user_id 哈希的匿名编号，格式 `交易员 #XXXX`

## User Stories

- 作为交易者，我希望看到系统 AI 策略的真实历史表现，建立对系统的信任
- 作为用户，我希望看到自己在所有用户中的排名，知道自己选择的分析时机是否优于平均
- 作为新用户，我希望看到本周各币种的策略表现概览，快速判断系统是否靠谱
- 作为付费用户，我希望排行榜证明付费分析的价值（日内+趋势的胜率和收益）
- 作为隐私敏感用户，我希望排行榜不暴露我的身份信息
