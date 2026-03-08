-- v8: 增长体系 — 任务中心 + 合伙人系统
-- 新增 6 张表 + users 表扩展 3 个字段

-- ============================================================
-- users 表新增字段
-- ============================================================
ALTER TABLE users ADD COLUMN IF NOT EXISTS referral_code VARCHAR(20) UNIQUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS referred_by UUID REFERENCES users(id);
ALTER TABLE users ADD COLUMN IF NOT EXISTS referred_at TIMESTAMPTZ;
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_referral_code ON users(referral_code);

-- ============================================================
-- 任务模板（运营后台管理）
-- ============================================================
CREATE TABLE IF NOT EXISTS task_templates (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title               VARCHAR(200)   NOT NULL,
    platform            VARCHAR(30)    NOT NULL,
    icon                VARCHAR(50),
    description         TEXT,
    rules               TEXT,
    reward_mode         VARCHAR(20)    NOT NULL DEFAULT 'scalping',
    reward_amount       INTEGER        NOT NULL DEFAULT 5,
    min_views           INTEGER        NOT NULL DEFAULT 200,
    verify_window_hours INTEGER        NOT NULL DEFAULT 72,
    sort_order          INTEGER        NOT NULL DEFAULT 0,
    is_active           BOOLEAN        NOT NULL DEFAULT true,
    created_at          TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 任务提交（每用户每天限 1 次）
-- ============================================================
CREATE TABLE IF NOT EXISTS task_submissions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID           NOT NULL REFERENCES users(id),
    template_id     UUID           NOT NULL REFERENCES task_templates(id),
    post_url        VARCHAR(500)   NOT NULL,
    screenshot_url  VARCHAR(500)   NOT NULL,
    status          VARCHAR(20)    NOT NULL DEFAULT 'pending',
    reject_reason   TEXT,
    reward_granted  BOOLEAN        NOT NULL DEFAULT false,
    reviewed_by     UUID           REFERENCES users(id),
    reviewed_at     TIMESTAMPTZ,
    submitted_at    TIMESTAMPTZ    NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_post_url UNIQUE (post_url)
);
CREATE INDEX IF NOT EXISTS idx_task_submissions_user       ON task_submissions(user_id);
CREATE INDEX IF NOT EXISTS idx_task_submissions_status     ON task_submissions(status);
CREATE INDEX IF NOT EXISTS idx_task_submissions_template   ON task_submissions(template_id);
CREATE INDEX IF NOT EXISTS idx_task_submissions_submitted  ON task_submissions(user_id, submitted_at);

-- ============================================================
-- 奖励次数记录（审计用，实际计数在 Redis）
-- ============================================================
CREATE TABLE IF NOT EXISTS bonus_credit_logs (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID           NOT NULL REFERENCES users(id),
    source_type VARCHAR(30)    NOT NULL,
    source_id   UUID,
    mode        VARCHAR(20)    NOT NULL,
    amount      INTEGER        NOT NULL,
    note        TEXT,
    created_at  TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_bonus_credit_logs_user ON bonus_credit_logs(user_id);

-- ============================================================
-- 佣金记录
-- ============================================================
CREATE TABLE IF NOT EXISTS commissions (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    partner_id          UUID           NOT NULL REFERENCES users(id),
    referee_id          UUID           NOT NULL REFERENCES users(id),
    payment_id          UUID           NOT NULL REFERENCES payments(id),
    payment_amount_usd  NUMERIC(10,2)  NOT NULL,
    commission_rate     NUMERIC(5,4)   NOT NULL,
    commission_amount   NUMERIC(10,2)  NOT NULL,
    status              VARCHAR(20)    NOT NULL DEFAULT 'pending',
    created_at          TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_commissions_partner ON commissions(partner_id);
CREATE INDEX IF NOT EXISTS idx_commissions_referee ON commissions(referee_id);
CREATE INDEX IF NOT EXISTS idx_commissions_status  ON commissions(status);

-- ============================================================
-- 合伙人钱包
-- ============================================================
CREATE TABLE IF NOT EXISTS partner_wallets (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID           NOT NULL REFERENCES users(id) UNIQUE,
    trc20_address   VARCHAR(100)   NOT NULL,
    is_verified     BOOLEAN        NOT NULL DEFAULT false,
    created_at      TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 提现记录
-- ============================================================
CREATE TABLE IF NOT EXISTS withdrawals (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID           NOT NULL REFERENCES users(id),
    amount          NUMERIC(10,2)  NOT NULL,
    trc20_address   VARCHAR(100)   NOT NULL,
    status          VARCHAR(20)    NOT NULL DEFAULT 'pending',
    tx_hash         VARCHAR(200),
    reject_reason   TEXT,
    reviewed_by     UUID           REFERENCES users(id),
    reviewed_at     TIMESTAMPTZ,
    created_at      TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_withdrawals_user   ON withdrawals(user_id);
CREATE INDEX IF NOT EXISTS idx_withdrawals_status ON withdrawals(status);

-- ============================================================
-- 增长体系动态配置种子数据
-- ============================================================
INSERT INTO system_configs (config_key, encrypted_value, category, description, is_secret)
VALUES
    ('site_brand_name', '', 'site', '品牌名称，用于文案、长图、邀请页等', false),
    ('site_brand_url', '', 'site', '品牌官网域名，用于邀请链接拼接', false),
    ('task_feature_enabled', 'true', 'task', '任务中心总开关', false),
    ('task_promo_templates', '[]', 'task', '推广文案模板（JSON数组，支持 {brand_name} 占位符）', false),
    ('partner_feature_enabled', 'true', 'partner', '合伙人系统总开关', false),
    ('partner_commission_rate', '0.10', 'partner', '合伙人分成比例', false),
    ('partner_min_withdrawal', '50', 'partner', '最低提现金额 (USDT)', false),
    ('partner_withdrawal_cooldown_days', '7', 'partner', '提现冷却期（天）', false),
    ('partner_address_cooldown_hours', '24', 'partner', '地址修改冷却期（小时）', false),
    ('register_referral_required', 'false', 'registration', '强制邀请码注册开关（true=必须填写有效邀请码才能注册）', false)
ON CONFLICT (config_key) DO NOTHING;
