-- 邮件抑制列表：存储退信和投诉地址，发送时自动跳过
CREATE TABLE IF NOT EXISTS email_suppression (
    email       VARCHAR(255) PRIMARY KEY,
    reason      VARCHAR(50)  NOT NULL DEFAULT 'bounce',
    detail      TEXT         DEFAULT '',
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Resend webhook secret 配置
INSERT INTO system_configs (config_key, encrypted_value, category, description, is_secret)
VALUES ('resend_webhook_secret', '', 'notification', 'Resend Webhook 签名密钥（从 Resend 仪表盘获取）', true)
ON CONFLICT (config_key) DO NOTHING;
