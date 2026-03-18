-- v3_leaderboard_apply.sql
-- 生产环境补丁：为 strategy_snapshots 添加 v3_leaderboard.sql 遗漏的三列
-- 问题：v3_leaderboard.sql 在生产库从未执行，导致 snapshot 写入全部失败
-- 执行方式：docker exec -i axiom-db-1 psql -U postgres -d postgres < /path/to/this.sql

BEGIN;

ALTER TABLE strategy_snapshots
    ADD COLUMN IF NOT EXISTS user_id        UUID REFERENCES users(id),
    ADD COLUMN IF NOT EXISTS analysis_mode  VARCHAR(20),
    ADD COLUMN IF NOT EXISTS published      BOOLEAN DEFAULT FALSE;

-- 补建索引（与 v3_leaderboard.sql 一致）
CREATE INDEX IF NOT EXISTS idx_snapshots_published
    ON strategy_snapshots (published, created_at DESC) WHERE published = TRUE;

CREATE INDEX IF NOT EXISTS idx_snapshots_user_id
    ON strategy_snapshots (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_snapshots_mode
    ON strategy_snapshots (analysis_mode, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_snapshots_user_symbol_mode
    ON strategy_snapshots (user_id, symbol, analysis_mode, created_at DESC)
    WHERE published = TRUE;

COMMIT;
