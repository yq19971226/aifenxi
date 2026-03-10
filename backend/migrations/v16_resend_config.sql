-- v16: 邮件服务配置补充 — 新增 Resend API Key 配置项
INSERT INTO system_configs (config_key, encrypted_value, category, description, is_secret)
VALUES
    ('resend_api_key', '', 'notification', 'Resend 邮件服务 API Key（优先于 SendGrid）', true)
ON CONFLICT (config_key) DO NOTHING;
