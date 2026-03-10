-- audit_logs：通用审计日志表（数据维护统计与按时间清理用）
CREATE TABLE IF NOT EXISTS audit_logs (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     TEXT,
    action      TEXT,
    detail      TEXT,
    created_at  TIMESTAMPTZ DEFAULT (now())
);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs (user_id) WHERE user_id IS NOT NULL;
