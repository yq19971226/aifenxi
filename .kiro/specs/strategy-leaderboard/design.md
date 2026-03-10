# Design — 策略发布与排行榜

- **Status**: Reviewed (5-perspective review completed)

## Architecture

### 后端改动

1. **DB 迁移**：`strategy_snapshots` 表新增 3 列
2. **策略链路**：`save_strategy()` → `create_snapshot()` 传递 `user_id` + `analysis_mode`
3. **发布规则引擎**：新增 `PublishRuleEngine` service
4. **结算周期动态化**：`check_and_settle()` 按 `analysis_mode` 区分超时
5. **排行榜 API**：新增 router，SQL 聚合 + Redis 缓存

### 前端改动

1. **新页面** `/leaderboard` 替代 `/performance`
2. **导航更新**：TopNav 绩效 → 排行榜
3. **剧本广场迁移**：从 playbook-sim 页移到排行榜的 tab

## Data Model Changes

### ALTER strategy_snapshots

```sql
-- 新增列（V1 迁移）
ALTER TABLE strategy_snapshots ADD COLUMN user_id UUID REFERENCES users(id);
ALTER TABLE strategy_snapshots ADD COLUMN analysis_mode VARCHAR(20);  -- 'scalping' / 'intraday' / 'trend'
ALTER TABLE strategy_snapshots ADD COLUMN published BOOLEAN DEFAULT FALSE;

-- 索引
-- 生产环境必须使用 CONCURRENTLY 避免锁表
CREATE INDEX CONCURRENTLY idx_snapshots_published ON strategy_snapshots (published, created_at DESC) WHERE published = TRUE;
CREATE INDEX CONCURRENTLY idx_snapshots_user ON strategy_snapshots (user_id, created_at DESC);
CREATE INDEX CONCURRENTLY idx_snapshots_mode ON strategy_snapshots (analysis_mode, created_at DESC);

-- 去重检查用复合索引
CREATE INDEX CONCURRENTLY idx_snapshots_dedup ON strategy_snapshots (user_id, symbol, analysis_mode, created_at DESC) WHERE published = TRUE;
```

不新建额外表。排行榜通过 `strategy_snapshots` 聚合查询实现。

## Backend Services

### PublishRuleEngine（新增）

```
backend/app/services/publish_rule_engine.py

class PublishRuleEngine:
    async def should_publish(
        session, user_id, symbol, mode, strategy_data
    ) -> bool:
        """
        检查是否满足发布条件：
        1. mode in ('intraday', 'trend')
        2. not is_fallback
        3. direction != 'neutral'
        4. is_worth_taking == True
        5. 去重窗口检查（intraday: 当日 / trend: 本周）
        """

    async def mark_published(session, snapshot_id) -> None:
        """将 snapshot 标记为 published = TRUE。
        使用 savepoint (session.begin_nested()) 隔离事务，
        失败不影响外层 snapshot 保存。
        """
```

### PerformanceTracker 修改

```python
# check_and_settle() 超时判断改为：
timeout_hours = {
    "intraday": 24,
    "trend": 72,
}.get(snapshot["analysis_mode"], 72)  # 默认 72h 兼容历史数据

if elapsed_hours >= timeout_hours:
    return await self._settle(...)
```

### LeaderboardService（新增）

```
backend/app/services/leaderboard_service.py

class LeaderboardService:
    async def get_rankings(
        session, period: str, mode: str | None, page: int, page_size: int
    ) -> dict:
        """
        SQL 聚合查询 strategy_snapshots WHERE published = TRUE
        返回：rankings[], total, my_rank (if user_id provided)
        缓存：Redis key = leaderboard:{period}:{mode}:{page}，TTL 300s
        """

    async def get_my_stats(session, user_id, period) -> dict:
        """个人战绩统计"""

    async def get_system_report(session, period) -> dict:
        """系统周报：各币种表现 + 整体统计"""
```

### Ranking SQL（核心查询）

```sql
WITH settled AS (
    SELECT
        user_id,
        analysis_mode,
        pnl_pct,
        symbol,
        direction,
        status,
        created_at
    FROM strategy_snapshots
    WHERE published = TRUE
      AND status != 'pending'
      AND created_at >= :period_start
      AND (:mode IS NULL OR analysis_mode = :mode)
),
user_stats AS (
    SELECT
        user_id,
        COUNT(*) AS total_trades,
        SUM(CASE WHEN pnl_pct > 0 THEN 1 ELSE 0 END)::FLOAT
            / NULLIF(COUNT(*), 0) AS win_rate,
        COALESCE(SUM(CASE WHEN pnl_pct > 0 THEN pnl_pct ELSE 0 END), 0) AS total_profit,
        COALESCE(ABS(SUM(CASE WHEN pnl_pct <= 0 THEN pnl_pct ELSE 0 END)), 0.0001) AS total_loss
    FROM settled
    GROUP BY user_id
    HAVING COUNT(*) >= 3
)
SELECT
    user_id,
    total_trades,
    win_rate,
    total_profit,
    total_loss,
    LEAST(ROUND(total_profit / total_loss, 2), 99.9) AS profit_factor  -- PF 封顶 99.9
FROM user_stats
ORDER BY profit_factor DESC, total_trades DESC
LIMIT :page_size OFFSET :offset
```

## Backend API

```
GET /api/leaderboard
    ?period=week|month
    &mode=intraday|trend          (可选)
    &page=1&page_size=20
    → { rankings: [...], total: int, my_rank: int | null }

GET /api/leaderboard/me
    ?period=week|month
    → { rank, win_rate, total_pnl, profit_factor, total_trades, recent: [...] }

GET /api/leaderboard/system-report
    ?period=week|month
    → { overall: {...}, by_symbol: [...], by_mode: [...] }
```

所有端点使用 `get_current_user` 依赖注入。

## Strategy Pipeline Changes

### save_strategy 链路

```
API layer (user_id from get_current_user, mode from request)
  → AnalysisOrchestrator._dispatch_mode()
    → StrategyService.save_strategy(session, strategy, user_id=uid, analysis_mode=mode)  ← 新增可选参数（默认 None，向后兼容）
      → PerformanceTracker.create_snapshot(strategy_id, user_id=uid, analysis_mode=mode)  ← 新增可选参数
        → PublishRuleEngine.should_publish(session, user_id, symbol, mode, strategy_data)
          → if True: mark_published(session, snapshot_id)
```

### analysis_orchestrator.py 改动点

- `_run_intraday()` / `_run_trend()` / `_run_scalping()`：在调用 `save_strategy` 时传入 `user_id` 和 `analysis_mode`
- `user_id` 来源：从 API 层通过参数传递（已有 `get_current_user`）

## Frontend

### 页面结构

```
/leaderboard
├── SystemReport（系统周报卡片）
│   ├── 本周整体：策略数 / 胜率 / PF
│   └── 各币种表现列表
├── MyStatsCard（个人战绩卡片，登录可见）
│   └── 排名 / 胜率 / 累计收益 / PF / 策略数
├── Tabs: [周榜] [月榜]
├── SubTabs: [全部] [日内] [趋势]  -- Phase 1 不做剧本 Tab
├── RankingList（排行列表）
│   ├── 排名 / 匿名编号 / 胜率 / PF / 策略数
│   └── 当前用户条目高亮 + "我的位置"锚点
└── (剧本 tab — Phase 2)
```

### File Structure

| 文件 | 职责 | 预估行数 |
|---|---|---|
| `frontend/app/(main)/leaderboard/page.tsx` | 排行榜主页面 | ~250 |
| `frontend/app/(main)/leaderboard/loading.tsx` | 加载骨架屏 | ~30 |
| `frontend/app/(main)/leaderboard/error.tsx` | 错误边界 | ~20 |
| `frontend/components/leaderboard/SystemReport.tsx` | 系统周报组件 | ~120 |
| `frontend/components/leaderboard/MyStatsCard.tsx` | 个人战绩卡 | ~80 |
| `frontend/components/leaderboard/RankingList.tsx` | 排行列表组件 | ~150 |
| `frontend/components/leaderboard/PlaybookTab.tsx` | 剧本 tab（Phase 2，Phase 1 不创建） | ~100 |
| `frontend/lib/api/leaderboard.ts` | API 客户端 | ~60 |
| `backend/app/services/publish_rule_engine.py` | 发布规则引擎 | ~80 |
| `backend/app/services/leaderboard_service.py` | 排行榜服务 | ~150 |
| `backend/app/api/leaderboard.py` | 排行榜 API router | ~80 |

### Anonymous ID Generation

```typescript
function anonymousTraderName(userId: string): string {
  // 稳定哈希：取 userId 前 8 字符转数字
  const hash = userId.replace(/-/g, '').slice(0, 8);
  const num = parseInt(hash, 16) % 10000;
  return `交易员 #${String(num).padStart(4, '0')}`;
}
```

后端生成，前端只展示。

### Styling

- 遵循现有设计系统：`.card` / `.stat-value` / `.section-label` / `.badge`
- 排名前三名用 `text-amber-400`（金）/ `text-zinc-300`（银）/ `text-amber-600`（铜）
- 当前用户行用 `bg-indigo-500/10 border-indigo-500/20` 高亮
- 盈利 `text-emerald-400`，亏损 `text-red-400`
- Tab 切换用 `Tabs` 组件，与系统其他 tab 风格一致

## Migration Strategy

- 现有 `strategy_snapshots` 中的历史数据：`user_id` / `analysis_mode` / `published` 全为 NULL/FALSE
- 历史数据不参与排行榜（因为缺少 user_id 和 mode）
- 排行榜从迁移后新产生的数据开始计算
- 旧 `/performance` 路由做 301 重定向到 `/leaderboard`
- `PerformanceTracker` 现有方法保留，不删除（`get_stats` / `get_trend_data` 仍用于内部统计）
