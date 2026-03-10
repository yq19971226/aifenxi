-- ============================================================
-- v3_leaderboard.sql — 策略排行榜：strategy_snapshots 扩展
-- 依赖: v2_enhancements.sql (strategy_snapshots 表已存在)
-- ============================================================

BEGIN;

-- 1. 新增列
ALTER TABLE strategy_snapshots
    ADD COLUMN IF NOT EXISTS user_id        UUID REFERENCES users(id),
    ADD COLUMN IF NOT EXISTS analysis_mode  VARCHAR(20),
    ADD COLUMN IF NOT EXISTS published      BOOLEAN DEFAULT FALSE;

-- 2. 索引（生产环境使用 CONCURRENTLY，此处包在事务中用普通索引）
--    生产部署时请改为：
--    CREATE INDEX CONCURRENTLY idx_snapshots_published ON strategy_snapshots ...
CREATE INDEX IF NOT EXISTS idx_snapshots_published
    ON strategy_snapshots (published, created_at DESC) WHERE published = TRUE;

CREATE INDEX IF NOT EXISTS idx_snapshots_user
    ON strategy_snapshots (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_snapshots_mode
    ON strategy_snapshots (analysis_mode, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_snapshots_dedup
    ON strategy_snapshots (user_id, symbol, analysis_mode, created_at DESC)
    WHERE published = TRUE;

COMMIT;
