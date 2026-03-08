-- ============================================================
-- OmniMind V5 通知历史记录 — 数据库迁移脚本
-- 版本: v5.0
-- 描述: 新增通知日志表，记录所有邮件和 Telegram 推送历史
-- 依赖: v4_role_system.sql 已执行
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS notification_log (
    id              UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID            REFERENCES users(id) ON DELETE SET NULL,
    recipient       VARCHAR(255)    NOT NULL,
    channel         VARCHAR(20)     NOT NULL,
    event_type      VARCHAR(50)     NOT NULL,
    subject         VARCHAR(255),
    status          VARCHAR(20)     NOT NULL DEFAULT 'sent',
    error_message   TEXT,
    created_at      TIMESTAMPTZ     DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notification_log_created ON notification_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notification_log_channel ON notification_log (channel, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notification_log_user ON notification_log (user_id, created_at DESC);

DO $
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_notification_channel'
    ) THEN
        ALTER TABLE notification_log ADD CONSTRAINT chk_notification_channel
            CHECK (channel IN ('email', 'telegram'));
    END IF;
END
$;

DO $
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_notification_status'
    ) THEN
        ALTER TABLE notification_log ADD CONSTRAINT chk_notification_status
            CHECK (status IN ('sent', 'failed'));
    END IF;
END
$;

COMMIT;
