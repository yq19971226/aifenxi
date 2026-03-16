-- 用户分析操作日志表
-- 记录每次分析操作：谁、什么时间、分析了什么币种、使用了什么模式

CREATE TABLE IF NOT EXISTS analysis_logs (
    id          BIGSERIAL PRIMARY KEY,
    user_id     UUID NOT NULL,
    email       VARCHAR(255) NOT NULL DEFAULT '',
    symbol      VARCHAR(20) NOT NULL,
    mode        VARCHAR(20) NOT NULL,  -- scalping / intraday / trend
    membership_level INT NOT NULL DEFAULT 0,
    result      VARCHAR(30) NOT NULL DEFAULT 'started',  -- started / completed / failed / quota_exceeded / permission_denied
    detail      TEXT NOT NULL DEFAULT '',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 索引：按用户查询
CREATE INDEX IF NOT EXISTS idx_analysis_logs_user_id ON analysis_logs (user_id);

-- 索引：按时间倒序查询（管理后台最近操作）
CREATE INDEX IF NOT EXISTS idx_analysis_logs_created_at ON analysis_logs (created_at DESC);

-- 索引：按模式+时间查询（统计各模式使用频次）
CREATE INDEX IF NOT EXISTS idx_analysis_logs_mode_created ON analysis_logs (mode, created_at DESC);
