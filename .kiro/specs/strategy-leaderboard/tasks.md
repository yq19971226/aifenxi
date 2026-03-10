# Tasks — 策略发布与排行榜

- **Status**: Reviewed (5-perspective review completed)

## P0 数据层（DB 迁移 + 链路补全）

- [ ] `strategy_snapshots` 表新增 `user_id UUID REFERENCES users(id)` 列（允许 NULL 兼容历史数据）
- [ ] `strategy_snapshots` 表新增 `analysis_mode VARCHAR(20)` 列（允许 NULL 兼容历史数据）
- [ ] `strategy_snapshots` 表新增 `published BOOLEAN DEFAULT FALSE` 列
- [ ] 新增索引（生产环境必须使用 `CREATE INDEX CONCURRENTLY` 避免锁表）：`idx_snapshots_published`（published + created_at DESC, WHERE published = TRUE）、`idx_snapshots_user`（user_id + created_at DESC）、`idx_snapshots_mode`（analysis_mode + created_at DESC）、`idx_snapshots_dedup`（user_id + symbol + analysis_mode + created_at DESC, WHERE published = TRUE）
- [ ] DDL 写入 `backend/migrations/init.sql`（或 v2_enhancements.sql），同步更新 `backend/init_sqlite.py`
- [ ] `StrategyService.save_strategy()` 新增 `user_id: UUID | None = None` 和 `analysis_mode: str | None = None` 参数（默认 None 向后兼容现有调用方），写入 `strategies` 表时传递
- [ ] `PerformanceTracker.create_snapshot()` 新增 `user_id` 和 `analysis_mode` 参数，写入 `strategy_snapshots` 时填充
- [ ] `AnalysisOrchestrator` 的 `_run_intraday()` / `_run_trend()` / `_run_scalping()` 将 `user_id`（来自 API 层 `get_current_user`）和 `analysis_mode` 传递到 `save_strategy()` → `create_snapshot()` 全链路
- [ ] 确认 API 层（`backend/app/api/analysis.py` 或触发分析的入口）已有 `user_id` 上下文，并传递给 orchestrator

## P1 发布规则引擎

- [ ] 新增 `backend/app/services/publish_rule_engine.py`，实现 `PublishRuleEngine` 类：
  - `should_publish(session, user_id, symbol, mode, strategy_data) -> bool`
  - 检查条件：mode in (intraday, trend) / not is_fallback / direction != neutral / 去重窗口（`is_worth_taking` 不作为发布过滤条件，作为标签展示）
  - `mark_published(session, snapshot_id) -> None`
- [ ] 去重查询：intraday 检查当日（UTC）是否已有同 user_id + symbol + mode 的 published 记录；trend 检查本周（UTC 周一起）
- [ ] 在 `create_snapshot()` 完成后调用 `PublishRuleEngine.should_publish()`，满足条件则 `mark_published()`
- [ ] `mark_published()` 使用 `session.begin_nested()`（savepoint）隔离事务，失败时只回滚 savepoint，不影响外层 snapshot 保存
- [ ] 发布判断失败不影响策略保存主流程（try/except + logger.warning）

## P2 结算周期动态化

- [ ] `PerformanceTracker.check_and_settle()` 中将超时判断从固定 `72h` 改为按 `analysis_mode` 动态：intraday → 24h，trend → 72h，其他/NULL → 72h（兼容历史）
- [ ] 验证 `perf_checkpoints` 的 `CHECKPOINT_HOURS = [1, 4, 24, 72]` 对 24h 结算仍适用（24h 时同时触发 checkpoint 和结算）

## P3 排行榜后端 API

- [ ] 新增 `backend/app/services/leaderboard_service.py`，实现 `LeaderboardService` 类：
  - `get_rankings(session, period, mode, page, page_size, current_user_id) -> dict`：SQL 聚合排行 + Profit Factor 排序（PF 封顶 99.9）+ 当前用户排名
  - `get_my_stats(session, user_id, period) -> dict`：个人战绩统计
  - `get_system_report(session, period) -> dict`：系统周报（各币种表现 + 整体统计 + 按模式分组）
  - 匿名编号生成：`anonymous_trader_name(user_id) -> str`
- [ ] Redis 缓存：排行榜结果缓存 key `leaderboard:{period}:{mode}:{page}`，TTL 300s；系统周报 key `leaderboard:report:{period}`，TTL 300s
- [ ] 新增 `backend/app/api/leaderboard.py`，实现 router：
  - `GET /api/leaderboard`（?period, ?mode, ?page, ?page_size）
  - `GET /api/leaderboard/me`（?period）
  - `GET /api/leaderboard/system-report`（?period）
  - 所有端点使用 `get_current_user` 依赖注入
- [ ] 在 `backend/main.py` 注册 leaderboard router

## P4 前端排行榜页

- [ ] 新增 `frontend/lib/api/leaderboard.ts`：authFetch 封装 `fetchRankings` / `fetchMyStats` / `fetchSystemReport`
- [ ] 新增 `frontend/app/(main)/leaderboard/page.tsx`：排行榜主页面
  - 顶部：SystemReport 组件（系统周报）
  - 个人战绩卡：MyStatsCard 组件
  - Tab 栏：周榜 / 月榜
  - 子 Tab：全部 / 日内 / 趋势 / 剧本
  - 排行列表：RankingList 组件
- [ ] 新增 `frontend/app/(main)/leaderboard/loading.tsx` + `error.tsx`
- [ ] 新增 `frontend/components/leaderboard/SystemReport.tsx`：系统周报卡片（各币种表现 + 整体统计）
- [ ] 新增 `frontend/components/leaderboard/MyStatsCard.tsx`：个人战绩卡（排名/胜率/PF/策略数）
- [ ] 新增 `frontend/components/leaderboard/RankingList.tsx`：排行列表（匿名编号/胜率/PF/策略数，当前用户高亮）
- [ ] PlaybookTab.tsx 延迟到 Phase 2（剧本广场 Phase 1 保留在 playbook-sim 页）
- [ ] 遵循现有设计系统：`.card` / `.stat-value` / `.section-label` / `.badge`，使用 Tailwind zinc 色阶 + CSS 变量

## P5 路由与导航迁移

- [ ] `TopNav.tsx` 导航项 `绩效 → /performance` 改为 `排行榜 → /leaderboard`
- [ ] `Sidebar.tsx`（如有）同步更新
- [ ] `frontend/lib/route-permissions.ts` 新增 `/leaderboard` 权限配置
- [ ] 旧 `/performance` 路由做客户端重定向到 `/leaderboard`（`redirect()` 在 `page.tsx` 中）
- [ ] `/playbook-sim/page.tsx` 中的 Plaza 区块 Phase 1 保留不动（Phase 2 再迁移）

## P6 验证

- [ ] 验证策略发布链路：intraday 分析 → snapshot 创建 → publish 判断 → published = TRUE
- [ ] 验证去重：同用户同币种当日第二次 intraday 分析不再发布
- [ ] 验证 scalping 分析不产生 published 记录
- [ ] 验证 is_worth_taking = false 的策略仍发布，但排行榜中显示“谨慎”标签
- [ ] 验证 intraday 策略 24h 超时结算、trend 策略 72h 超时结算
- [ ] 验证排行榜 API：至少 3 条才上榜、Profit Factor 排序正确、PF 封顶 99.9 时前端显示 `>99`
- [ ] 验证前端显示"数据自 X 日起统计"提示（历史数据无 user_id/mode 不参与排行）
- [ ] 验证匿名编号稳定性：同一 user_id 多次请求返回相同编号
- [ ] 验证 Redis 缓存命中与过期行为
- [ ] 验证旧 `/performance` 路由重定向到 `/leaderboard`
- [ ] `tsc --noEmit` 零错误（前端）
- [ ] `python -m py_compile` 验证新增后端文件
