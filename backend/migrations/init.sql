-- OmniMind 数据库初始化脚本
-- 需要 TimescaleDB 扩展

CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE;
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- TimescaleDB 时序表
-- ============================================================

-- K线数据
CREATE TABLE IF NOT EXISTS klines (
    time        TIMESTAMPTZ     NOT NULL,
    symbol      VARCHAR(20)     NOT NULL,
    interval    VARCHAR(5)      NOT NULL,
    open        NUMERIC(20,8)   NOT NULL,
    high        NUMERIC(20,8)   NOT NULL,
    low         NUMERIC(20,8)   NOT NULL,
    close       NUMERIC(20,8)   NOT NULL,
    volume      NUMERIC(30,8)   NOT NULL,
    CONSTRAINT klines_pkey PRIMARY KEY (time, symbol, interval)
);
SELECT create_hypertable('klines', 'time', if_not_exists => TRUE);
CREATE INDEX IF NOT EXISTS idx_klines_symbol_interval ON klines (symbol, interval, time DESC);

-- 技术指标
CREATE TABLE IF NOT EXISTS indicators (
    time            TIMESTAMPTZ     NOT NULL,
    symbol          VARCHAR(20)     NOT NULL,
    interval        VARCHAR(5)      NOT NULL,
    ema7            NUMERIC(20,8),
    ema25           NUMERIC(20,8),
    ema99           NUMERIC(20,8),
    rsi             NUMERIC(8,4),
    macd            NUMERIC(20,8),
    macd_signal     NUMERIC(20,8),
    macd_histogram  NUMERIC(20,8),
    bb_upper        NUMERIC(20,8),
    bb_middle       NUMERIC(20,8),
    bb_lower        NUMERIC(20,8),
    CONSTRAINT indicators_pkey PRIMARY KEY (time, symbol, interval)
);
SELECT create_hypertable('indicators', 'time', if_not_exists => TRUE);
CREATE INDEX IF NOT EXISTS idx_indicators_symbol_interval ON indicators (symbol, interval, time DESC);

-- 链上快照
CREATE TABLE IF NOT EXISTS onchain_snapshots (
    time                TIMESTAMPTZ     NOT NULL,
    symbol              VARCHAR(20)     NOT NULL,
    exchange_netflow    NUMERIC(20,4),
    whale_change_24h    NUMERIC(8,4),
    fear_greed_index    INTEGER,
    mvrv                NUMERIC(8,4),
    CONSTRAINT onchain_snapshots_pkey PRIMARY KEY (time, symbol)
);
SELECT create_hypertable('onchain_snapshots', 'time', if_not_exists => TRUE);
CREATE INDEX IF NOT EXISTS idx_onchain_symbol ON onchain_snapshots (symbol, time DESC);

-- ============================================================
-- PostgreSQL 业务表
-- ============================================================

-- 用户表
CREATE TABLE IF NOT EXISTS users (
    id              UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    email           VARCHAR(255)    UNIQUE NOT NULL,
    password_hash   VARCHAR(255)    NOT NULL,
    is_active       BOOLEAN         DEFAULT TRUE,
    created_at      TIMESTAMPTZ     DEFAULT NOW(),
    updated_at      TIMESTAMPTZ     DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_users_email ON users (email);

-- 会员表
CREATE TABLE IF NOT EXISTS memberships (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    level               INTEGER     DEFAULT 0,  -- 0=免费 1=专业 2=旗舰
    expires_at          TIMESTAMPTZ,
    query_count_today   INTEGER     DEFAULT 0,
    query_reset_at      DATE        DEFAULT CURRENT_DATE,
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT memberships_user_unique UNIQUE (user_id)
);
CREATE INDEX IF NOT EXISTS idx_memberships_user_id ON memberships (user_id);

-- 支付表（payment_id 为幂等键）
CREATE TABLE IF NOT EXISTS payments (
    id              UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    payment_id      VARCHAR(100)    UNIQUE NOT NULL,
    user_id         UUID            NOT NULL REFERENCES users(id),
    plan            INTEGER         NOT NULL,
    amount_usd      NUMERIC(10,2)   NOT NULL,
    network         VARCHAR(20),
    status          VARCHAR(20)     DEFAULT 'pending',
    created_at      TIMESTAMPTZ     DEFAULT NOW(),
    updated_at      TIMESTAMPTZ     DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_payments_user_id ON payments (user_id);
CREATE INDEX IF NOT EXISTS idx_payments_payment_id ON payments (payment_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments (status);

-- 智能体报告表
CREATE TABLE IF NOT EXISTS agent_reports (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id    VARCHAR(50) NOT NULL,
    symbol      VARCHAR(20) NOT NULL,
    signal      VARCHAR(20) NOT NULL,
    confidence  NUMERIC(4,3),
    reasoning   TEXT,
    findings    JSONB,
    raw_data    JSONB,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_agent_reports_symbol ON agent_reports (symbol, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_reports_agent_id ON agent_reports (agent_id, created_at DESC);

-- 策略表
CREATE TABLE IF NOT EXISTS strategies (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    symbol      VARCHAR(20) NOT NULL,
    direction   VARCHAR(20) NOT NULL,
    entry_low   NUMERIC(20,8),
    entry_high  NUMERIC(20,8),
    stop_loss   NUMERIC(20,8),
    targets     JSONB,
    confidence  NUMERIC(4,3),
    valid_until TIMESTAMPTZ,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_strategies_symbol ON strategies (symbol, created_at DESC);

-- 共识报告表
CREATE TABLE IF NOT EXISTS consensus_reports (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    symbol          VARCHAR(20) NOT NULL,
    final_signal    VARCHAR(20) NOT NULL,
    confidence      NUMERIC(4,3),
    divergence      NUMERIC(4,3),
    model_votes     JSONB,
    minority_alert  BOOLEAN     DEFAULT FALSE,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_consensus_symbol ON consensus_reports (symbol, created_at DESC);

-- 历史案例表
CREATE TABLE IF NOT EXISTS cases (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    case_name           VARCHAR(200) NOT NULL,
    date                DATE        NOT NULL,
    symbol              VARCHAR(20) NOT NULL,
    pattern_type        VARCHAR(50) NOT NULL,
    description         TEXT,
    similarity_features JSONB,
    max_gain_pct        NUMERIC(8,4),
    max_loss_pct        NUMERIC(8,4),
    created_at          TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_cases_pattern_type ON cases (pattern_type);

-- 推送设置表
CREATE TABLE IF NOT EXISTS push_settings (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    email_enabled   BOOLEAN     DEFAULT TRUE,
    tg_enabled      BOOLEAN     DEFAULT FALSE,
    tg_chat_id      VARCHAR(50),
    tg_bind_token   VARCHAR(100) UNIQUE,
    events          JSONB       DEFAULT '["strategy_update","risk_alert"]',
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT push_settings_user_unique UNIQUE (user_id)
);

CREATE TABLE IF NOT EXISTS announcements (
    id                            UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    announcement_key              VARCHAR(100)    NOT NULL,
    version                       INTEGER         NOT NULL,
    title                         VARCHAR(200)    NOT NULL,
    summary                       TEXT,
    content_md                    TEXT            NOT NULL,
    display_mode                  VARCHAR(20)     NOT NULL,
    priority                      INTEGER         NOT NULL DEFAULT 0,
    status                        VARCHAR(20)     NOT NULL DEFAULT 'draft',
    strong_ack_required           BOOLEAN         DEFAULT FALSE,
    allow_snooze                  BOOLEAN         DEFAULT TRUE,
    action_text                   VARCHAR(80),
    action_href                   VARCHAR(500),
    target_roles_json             JSONB           DEFAULT '[]',
    target_membership_levels_json JSONB           DEFAULT '[]',
    target_path_prefixes_json     JSONB           DEFAULT '[]',
    starts_at                     TIMESTAMPTZ,
    ends_at                       TIMESTAMPTZ,
    scheduled_at                  TIMESTAMPTZ,
    published_at                  TIMESTAMPTZ,
    archived_at                   TIMESTAMPTZ,
    created_by                    UUID            REFERENCES users(id),
    published_by                  UUID            REFERENCES users(id),
    created_at                    TIMESTAMPTZ     DEFAULT NOW(),
    updated_at                    TIMESTAMPTZ     DEFAULT NOW(),
    CONSTRAINT announcements_key_version_unique UNIQUE (announcement_key, version),
    CONSTRAINT announcements_version_check CHECK (version >= 1),
    CONSTRAINT announcements_display_mode_check CHECK (display_mode IN ('blocking_modal', 'modal', 'banner')),
    CONSTRAINT announcements_status_check CHECK (status IN ('draft', 'scheduled', 'published', 'archived'))
);
CREATE INDEX IF NOT EXISTS idx_announcements_status_published_at ON announcements (status, published_at DESC);
CREATE INDEX IF NOT EXISTS idx_announcements_status_scheduled_at ON announcements (status, scheduled_at DESC);

CREATE TABLE IF NOT EXISTS announcement_deliveries (
    id                      UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    announcement_id         UUID            NOT NULL REFERENCES announcements(id) ON DELETE CASCADE,
    announcement_key        VARCHAR(100)    NOT NULL,
    announcement_version    INTEGER         NOT NULL,
    user_id                 UUID            NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    first_shown_at          TIMESTAMPTZ,
    last_shown_at           TIMESTAMPTZ,
    shown_count             INTEGER         NOT NULL DEFAULT 0,
    last_event              VARCHAR(20)     NOT NULL,
    closed_at               TIMESTAMPTZ,
    clicked_at              TIMESTAMPTZ,
    confirmed_at            TIMESTAMPTZ,
    confirmed_by_user_id    UUID            REFERENCES users(id) ON DELETE SET NULL,
    snooze_until            TIMESTAMPTZ,
    last_error              TEXT,
    created_at              TIMESTAMPTZ     DEFAULT NOW(),
    updated_at              TIMESTAMPTZ     DEFAULT NOW(),
    CONSTRAINT announcement_deliveries_announcement_user_unique UNIQUE (announcement_id, user_id),
    CONSTRAINT announcement_deliveries_shown_count_check CHECK (shown_count >= 0),
    CONSTRAINT announcement_deliveries_last_event_check CHECK (last_event IN ('shown', 'closed', 'snoozed', 'clicked', 'confirmed'))
);
CREATE INDEX IF NOT EXISTS idx_announcement_deliveries_user_updated_at ON announcement_deliveries (user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_announcement_deliveries_announcement_confirmed_at ON announcement_deliveries (announcement_id, confirmed_at DESC);

CREATE TABLE IF NOT EXISTS announcement_delivery_events (
    id                      UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    announcement_id         UUID            NOT NULL REFERENCES announcements(id) ON DELETE CASCADE,
    announcement_key        VARCHAR(100)    NOT NULL,
    announcement_version    INTEGER         NOT NULL,
    user_id                 UUID            NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    event_type              VARCHAR(20)     NOT NULL,
    pathname                VARCHAR(500),
    metadata_json           JSONB           DEFAULT '{}',
    occurred_at             TIMESTAMPTZ     NOT NULL,
    created_at              TIMESTAMPTZ     DEFAULT NOW(),
    CONSTRAINT announcement_delivery_events_event_type_check CHECK (event_type IN ('shown', 'closed', 'snoozed', 'clicked', 'confirmed'))
);
CREATE INDEX IF NOT EXISTS idx_announcement_delivery_events_announcement_user_occurred_at ON announcement_delivery_events (announcement_id, user_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_announcement_delivery_events_user_created_at ON announcement_delivery_events (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS announcement_audit_logs (
    id                      UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    announcement_id         UUID            REFERENCES announcements(id) ON DELETE SET NULL,
    announcement_key        VARCHAR(100)    NOT NULL,
    version                 INTEGER         NOT NULL,
    action                  VARCHAR(20)     NOT NULL,
    actor_user_id           UUID            REFERENCES users(id) ON DELETE SET NULL,
    change_summary_json     JSONB           DEFAULT '{}',
    created_at              TIMESTAMPTZ     DEFAULT NOW(),
    CONSTRAINT announcement_audit_logs_action_check CHECK (action IN ('create', 'update_draft', 'schedule', 'unschedule', 'publish', 'archive'))
);
CREATE INDEX IF NOT EXISTS idx_announcement_audit_logs_key_version_created_at ON announcement_audit_logs (announcement_key, version, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_announcement_audit_logs_actor_created_at ON announcement_audit_logs (actor_user_id, created_at DESC);

-- ============================================================
-- 触发器：自动更新 updated_at
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_memberships_updated_at
    BEFORE UPDATE ON memberships
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_payments_updated_at
    BEFORE UPDATE ON payments
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_push_settings_updated_at
    BEFORE UPDATE ON push_settings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_announcements_updated_at
    BEFORE UPDATE ON announcements
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_announcement_deliveries_updated_at
    BEFORE UPDATE ON announcement_deliveries
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
