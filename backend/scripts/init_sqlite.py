"""Create all tables in SQLite — converted from PostgreSQL schema.

Usage: python init_sqlite.py
"""
import sqlite3
import os

DB_PATH = os.environ.get("SQLITE_DB", "test.db")

SCHEMA = """
-- ============================================================
-- Core tables (from init.sql)
-- ============================================================

CREATE TABLE IF NOT EXISTS users (
    id              TEXT PRIMARY KEY DEFAULT (gen_random_uuid()),
    email           TEXT UNIQUE NOT NULL,
    password_hash   TEXT NOT NULL,
    is_active       INTEGER DEFAULT 1,
    is_admin        INTEGER DEFAULT 0,
    role            TEXT DEFAULT 'user',
    membership_level INTEGER DEFAULT 0,
    referral_code   TEXT UNIQUE,
    referred_by     TEXT,
    referred_at     TEXT,
    created_at      TEXT DEFAULT (NOW()),
    updated_at      TEXT DEFAULT (NOW())
);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_referral_code ON users(referral_code);

CREATE TABLE IF NOT EXISTS memberships (
    id              TEXT PRIMARY KEY DEFAULT (gen_random_uuid()),
    user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    level           INTEGER DEFAULT 0,
    expires_at      TEXT,
    query_count_today INTEGER DEFAULT 0,
    query_reset_at  TEXT DEFAULT (date('now')),
    created_at      TEXT DEFAULT (NOW()),
    updated_at      TEXT DEFAULT (NOW()),
    CONSTRAINT memberships_user_unique UNIQUE (user_id)
);
CREATE INDEX IF NOT EXISTS idx_memberships_user_id ON memberships(user_id);

CREATE TABLE IF NOT EXISTS payments (
    id              TEXT PRIMARY KEY DEFAULT (gen_random_uuid()),
    payment_id      TEXT UNIQUE NOT NULL,
    user_id         TEXT NOT NULL REFERENCES users(id),
    plan            INTEGER NOT NULL,
    amount_usd      REAL NOT NULL,
    network         TEXT,
    pay_address     TEXT,
    pay_amount      REAL,
    pay_currency    TEXT,
    status          TEXT DEFAULT 'pending',
    provider_status TEXT,
    status_reason   TEXT,
    provider_payload_json TEXT,
    provider_observed_at TEXT,
    provider_observation_source TEXT,
    duration_months INTEGER DEFAULT 1,
    created_at      TEXT DEFAULT (NOW()),
    updated_at      TEXT DEFAULT (NOW())
);
CREATE INDEX IF NOT EXISTS idx_payments_user_id ON payments(user_id);
CREATE INDEX IF NOT EXISTS idx_payments_payment_id ON payments(payment_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);

CREATE TABLE IF NOT EXISTS agent_reports (
    id          TEXT PRIMARY KEY DEFAULT (gen_random_uuid()),
    agent_id    TEXT NOT NULL,
    symbol      TEXT NOT NULL,
    signal      TEXT NOT NULL,
    confidence  REAL,
    reasoning   TEXT,
    findings    TEXT,
    raw_data    TEXT,
    created_at  TEXT DEFAULT (NOW())
);
CREATE INDEX IF NOT EXISTS idx_agent_reports_symbol ON agent_reports(symbol, created_at);
CREATE INDEX IF NOT EXISTS idx_agent_reports_agent_id ON agent_reports(agent_id, created_at);

CREATE TABLE IF NOT EXISTS strategies (
    id          TEXT PRIMARY KEY DEFAULT (gen_random_uuid()),
    symbol      TEXT NOT NULL,
    direction   TEXT NOT NULL,
    entry_low   REAL,
    entry_high  REAL,
    stop_loss   REAL,
    targets     TEXT,
    confidence  REAL,
    valid_until TEXT,
    created_at  TEXT DEFAULT (NOW())
);
CREATE INDEX IF NOT EXISTS idx_strategies_symbol ON strategies(symbol, created_at);

CREATE TABLE IF NOT EXISTS consensus_reports (
    id              TEXT PRIMARY KEY DEFAULT (gen_random_uuid()),
    symbol          TEXT NOT NULL,
    final_signal    TEXT NOT NULL,
    confidence      REAL,
    divergence      REAL,
    model_votes     TEXT,
    minority_alert  INTEGER DEFAULT 0,
    created_at      TEXT DEFAULT (NOW())
);
CREATE INDEX IF NOT EXISTS idx_consensus_symbol ON consensus_reports(symbol, created_at);

CREATE TABLE IF NOT EXISTS cases (
    id                  TEXT PRIMARY KEY DEFAULT (gen_random_uuid()),
    case_name           TEXT NOT NULL,
    date                TEXT NOT NULL,
    symbol              TEXT NOT NULL,
    pattern_type        TEXT NOT NULL,
    description         TEXT,
    similarity_features TEXT,
    max_gain_pct        REAL,
    max_loss_pct        REAL,
    created_at          TEXT DEFAULT (NOW())
);
CREATE INDEX IF NOT EXISTS idx_cases_pattern_type ON cases(pattern_type);

CREATE TABLE IF NOT EXISTS push_settings (
    id              TEXT PRIMARY KEY DEFAULT (gen_random_uuid()),
    user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    email_enabled   INTEGER DEFAULT 1,
    tg_enabled      INTEGER DEFAULT 0,
    tg_chat_id      TEXT,
    tg_bind_token   TEXT UNIQUE,
    events          TEXT DEFAULT '["strategy_update","risk_alert"]',
    created_at      TEXT DEFAULT (NOW()),
    updated_at      TEXT DEFAULT (NOW()),
    CONSTRAINT push_settings_user_unique UNIQUE (user_id)
);

CREATE TABLE IF NOT EXISTS announcements (
    id                            TEXT PRIMARY KEY DEFAULT (gen_random_uuid()),
    announcement_key              TEXT NOT NULL,
    version                       INTEGER NOT NULL,
    title                         TEXT NOT NULL,
    summary                       TEXT,
    content_md                    TEXT NOT NULL,
    display_mode                  TEXT NOT NULL,
    priority                      INTEGER NOT NULL DEFAULT 0,
    status                        TEXT NOT NULL DEFAULT 'draft',
    strong_ack_required           INTEGER DEFAULT 0,
    allow_snooze                  INTEGER DEFAULT 1,
    action_text                   TEXT,
    action_href                   TEXT,
    target_roles_json             TEXT DEFAULT '[]',
    target_membership_levels_json TEXT DEFAULT '[]',
    target_path_prefixes_json     TEXT DEFAULT '[]',
    starts_at                     TEXT,
    ends_at                       TEXT,
    scheduled_at                  TEXT,
    published_at                  TEXT,
    archived_at                   TEXT,
    created_by                    TEXT REFERENCES users(id),
    published_by                  TEXT REFERENCES users(id),
    created_at                    TEXT DEFAULT (NOW()),
    updated_at                    TEXT DEFAULT (NOW()),
    CONSTRAINT announcements_key_version_unique UNIQUE (announcement_key, version),
    CONSTRAINT announcements_version_check CHECK (version >= 1),
    CONSTRAINT announcements_display_mode_check CHECK (display_mode IN ('blocking_modal', 'modal', 'banner')),
    CONSTRAINT announcements_status_check CHECK (status IN ('draft', 'scheduled', 'published', 'archived'))
);
CREATE INDEX IF NOT EXISTS idx_announcements_status_published_at ON announcements(status, published_at DESC);
CREATE INDEX IF NOT EXISTS idx_announcements_status_scheduled_at ON announcements(status, scheduled_at DESC);

CREATE TABLE IF NOT EXISTS announcement_deliveries (
    id                      TEXT PRIMARY KEY DEFAULT (gen_random_uuid()),
    announcement_id         TEXT NOT NULL REFERENCES announcements(id) ON DELETE CASCADE,
    announcement_key        TEXT NOT NULL,
    announcement_version    INTEGER NOT NULL,
    user_id                 TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    first_shown_at          TEXT,
    last_shown_at           TEXT,
    shown_count             INTEGER NOT NULL DEFAULT 0,
    last_event              TEXT NOT NULL,
    closed_at               TEXT,
    clicked_at              TEXT,
    confirmed_at            TEXT,
    confirmed_by_user_id    TEXT REFERENCES users(id) ON DELETE SET NULL,
    snooze_until            TEXT,
    last_error              TEXT,
    created_at              TEXT DEFAULT (NOW()),
    updated_at              TEXT DEFAULT (NOW()),
    CONSTRAINT announcement_deliveries_announcement_user_unique UNIQUE (announcement_id, user_id),
    CONSTRAINT announcement_deliveries_shown_count_check CHECK (shown_count >= 0),
    CONSTRAINT announcement_deliveries_last_event_check CHECK (last_event IN ('shown', 'closed', 'snoozed', 'clicked', 'confirmed'))
);
CREATE INDEX IF NOT EXISTS idx_announcement_deliveries_user_updated_at ON announcement_deliveries(user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_announcement_deliveries_announcement_confirmed_at ON announcement_deliveries(announcement_id, confirmed_at DESC);

CREATE TABLE IF NOT EXISTS announcement_delivery_events (
    id                      TEXT PRIMARY KEY DEFAULT (gen_random_uuid()),
    announcement_id         TEXT NOT NULL REFERENCES announcements(id) ON DELETE CASCADE,
    announcement_key        TEXT NOT NULL,
    announcement_version    INTEGER NOT NULL,
    user_id                 TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    event_type              TEXT NOT NULL,
    pathname                TEXT,
    metadata_json           TEXT DEFAULT '{}',
    occurred_at             TEXT NOT NULL,
    created_at              TEXT DEFAULT (NOW()),
    CONSTRAINT announcement_delivery_events_event_type_check CHECK (event_type IN ('shown', 'closed', 'snoozed', 'clicked', 'confirmed'))
);
CREATE INDEX IF NOT EXISTS idx_announcement_delivery_events_announcement_user_occurred_at ON announcement_delivery_events(announcement_id, user_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_announcement_delivery_events_user_created_at ON announcement_delivery_events(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS announcement_audit_logs (
    id                      TEXT PRIMARY KEY DEFAULT (gen_random_uuid()),
    announcement_id         TEXT REFERENCES announcements(id) ON DELETE SET NULL,
    announcement_key        TEXT NOT NULL,
    version                 INTEGER NOT NULL,
    action                  TEXT NOT NULL,
    actor_user_id           TEXT REFERENCES users(id) ON DELETE SET NULL,
    change_summary_json     TEXT DEFAULT '{}',
    created_at              TEXT DEFAULT (NOW()),
    CONSTRAINT announcement_audit_logs_action_check CHECK (action IN ('create', 'update_draft', 'schedule', 'unschedule', 'publish', 'archive'))
);
CREATE INDEX IF NOT EXISTS idx_announcement_audit_logs_key_version_created_at ON announcement_audit_logs(announcement_key, version, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_announcement_audit_logs_actor_created_at ON announcement_audit_logs(actor_user_id, created_at DESC);

CREATE TRIGGER IF NOT EXISTS update_announcements_updated_at
AFTER UPDATE ON announcements
FOR EACH ROW
WHEN NEW.updated_at = OLD.updated_at
BEGIN
    UPDATE announcements
    SET updated_at = NOW()
    WHERE id = OLD.id;
END;

CREATE TRIGGER IF NOT EXISTS update_announcement_deliveries_updated_at
AFTER UPDATE ON announcement_deliveries
FOR EACH ROW
WHEN NEW.updated_at = OLD.updated_at
BEGIN
    UPDATE announcement_deliveries
    SET updated_at = NOW()
    WHERE id = OLD.id;
END;

-- ============================================================
-- v2: Enhanced tables
-- ============================================================

CREATE TABLE IF NOT EXISTS liquidation_events (
    time        TEXT NOT NULL,
    symbol      TEXT NOT NULL,
    side        TEXT NOT NULL,
    quantity    REAL NOT NULL,
    price       REAL NOT NULL,
    usd_value   REAL NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_liq_symbol ON liquidation_events(symbol, time);

CREATE TABLE IF NOT EXISTS symbol_correlations (
    time        TEXT NOT NULL,
    symbol_a    TEXT NOT NULL,
    symbol_b    TEXT NOT NULL,
    correlation REAL NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_corr_pair ON symbol_correlations(symbol_a, symbol_b, time);

CREATE TABLE IF NOT EXISTS symbol_registry (
    symbol              TEXT PRIMARY KEY,
    display_name        TEXT NOT NULL,
    collect_interval_sec INTEGER DEFAULT 60,
    enabled             INTEGER DEFAULT 1,
    has_onchain         INTEGER DEFAULT 1,
    has_derivatives     INTEGER DEFAULT 1,
    error_count         INTEGER DEFAULT 0,
    created_at          TEXT DEFAULT (NOW()),
    updated_at          TEXT DEFAULT (NOW())
);

CREATE TABLE IF NOT EXISTS alert_rules (
    id                TEXT PRIMARY KEY DEFAULT (gen_random_uuid()),
    user_id           TEXT REFERENCES users(id) ON DELETE CASCADE,
    name              TEXT NOT NULL,
    symbol            TEXT NOT NULL,
    expression        TEXT NOT NULL,
    enabled           INTEGER DEFAULT 1,
    notify_channels   TEXT DEFAULT '["websocket"]',
    last_triggered_at TEXT,
    created_at        TEXT DEFAULT (NOW()),
    updated_at        TEXT DEFAULT (NOW())
);
CREATE INDEX IF NOT EXISTS idx_alert_rules_user ON alert_rules(user_id);

CREATE TABLE IF NOT EXISTS alert_triggers (
    id              TEXT PRIMARY KEY DEFAULT (gen_random_uuid()),
    rule_id         TEXT REFERENCES alert_rules(id) ON DELETE CASCADE,
    triggered_value REAL NOT NULL,
    metric_type     TEXT NOT NULL,
    notify_channel  TEXT NOT NULL,
    notify_status   TEXT DEFAULT 'sent',
    triggered_at    TEXT DEFAULT (NOW())
);
CREATE INDEX IF NOT EXISTS idx_alert_triggers_rule ON alert_triggers(rule_id, triggered_at);

CREATE TABLE IF NOT EXISTS strategy_snapshots (
    id                  TEXT PRIMARY KEY DEFAULT (gen_random_uuid()),
    strategy_id         TEXT REFERENCES strategies(id) ON DELETE CASCADE,
    symbol              TEXT NOT NULL,
    direction           TEXT NOT NULL,
    entry_low           REAL NOT NULL,
    entry_high          REAL NOT NULL,
    stop_loss           REAL NOT NULL,
    targets             TEXT NOT NULL,
    confidence          REAL,
    price_at_generation REAL NOT NULL,
    status              TEXT DEFAULT 'pending',
    settlement_price    REAL,
    settlement_time     TEXT,
    pnl_pct             REAL,
    created_at          TEXT DEFAULT (NOW())
);
CREATE INDEX IF NOT EXISTS idx_snapshots_symbol ON strategy_snapshots(symbol, created_at);

CREATE TABLE IF NOT EXISTS perf_checkpoints (
    id              TEXT PRIMARY KEY DEFAULT (gen_random_uuid()),
    snapshot_id     TEXT REFERENCES strategy_snapshots(id) ON DELETE CASCADE,
    checkpoint_hours INTEGER NOT NULL,
    actual_price    REAL NOT NULL,
    recorded_at     TEXT DEFAULT (NOW()),
    UNIQUE(snapshot_id, checkpoint_hours)
);

CREATE TABLE IF NOT EXISTS chat_sessions (
    id          TEXT PRIMARY KEY DEFAULT (gen_random_uuid()),
    user_id     TEXT REFERENCES users(id) ON DELETE CASCADE,
    created_at  TEXT DEFAULT (NOW()),
    updated_at  TEXT DEFAULT (NOW())
);
CREATE INDEX IF NOT EXISTS idx_chat_sessions_user ON chat_sessions(user_id, updated_at);

CREATE TABLE IF NOT EXISTS chat_messages (
    id          TEXT PRIMARY KEY DEFAULT (gen_random_uuid()),
    session_id  TEXT REFERENCES chat_sessions(id) ON DELETE CASCADE,
    role        TEXT NOT NULL,
    content     TEXT NOT NULL,
    token_count INTEGER,
    model_key   TEXT,
    latency_ms  INTEGER,
    created_at  TEXT DEFAULT (NOW())
);
CREATE INDEX IF NOT EXISTS idx_chat_messages_session ON chat_messages(session_id, created_at);

-- ============================================================
-- v3: Dynamic config
-- ============================================================

CREATE TABLE IF NOT EXISTS system_configs (
    id              TEXT PRIMARY KEY DEFAULT (gen_random_uuid()),
    config_key      TEXT UNIQUE NOT NULL,
    encrypted_value TEXT NOT NULL,
    category        TEXT NOT NULL,
    description     TEXT,
    is_secret       INTEGER DEFAULT 1,
    created_at      TEXT DEFAULT (NOW()),
    updated_at      TEXT DEFAULT (NOW())
);
CREATE INDEX IF NOT EXISTS idx_system_configs_key ON system_configs(config_key);
CREATE INDEX IF NOT EXISTS idx_system_configs_category ON system_configs(category);

CREATE TABLE IF NOT EXISTS config_audit_log (
    id                  TEXT PRIMARY KEY DEFAULT (gen_random_uuid()),
    admin_user_id       TEXT NOT NULL REFERENCES users(id),
    config_key          TEXT NOT NULL,
    action              TEXT NOT NULL,
    old_value_masked    TEXT,
    new_value_masked    TEXT,
    created_at          TEXT DEFAULT (NOW())
);
CREATE INDEX IF NOT EXISTS idx_audit_log_created ON config_audit_log(created_at);

-- ============================================================
-- v5: Notification log
-- ============================================================

CREATE TABLE IF NOT EXISTS notification_log (
    id              TEXT PRIMARY KEY DEFAULT (gen_random_uuid()),
    user_id         TEXT REFERENCES users(id) ON DELETE SET NULL,
    recipient       TEXT NOT NULL,
    channel         TEXT NOT NULL,
    event_type      TEXT NOT NULL,
    subject         TEXT,
    status          TEXT NOT NULL DEFAULT 'sent',
    error_message   TEXT,
    created_at      TEXT DEFAULT (NOW())
);
CREATE INDEX IF NOT EXISTS idx_notification_log_created ON notification_log(created_at);
CREATE INDEX IF NOT EXISTS idx_notification_log_channel ON notification_log(channel, created_at);
CREATE INDEX IF NOT EXISTS idx_notification_log_user ON notification_log(user_id, created_at);

-- ============================================================
-- v7: Accuracy enhancement (onchain_snapshots)
-- ============================================================

CREATE TABLE IF NOT EXISTS onchain_snapshots (
    time                TEXT NOT NULL,
    symbol              TEXT NOT NULL,
    exchange_netflow    REAL,
    whale_change_24h    REAL,
    fear_greed_index    INTEGER,
    mvrv                REAL,
    PRIMARY KEY (time, symbol)
);
CREATE INDEX IF NOT EXISTS idx_onchain_symbol ON onchain_snapshots(symbol, time);

-- ============================================================
-- v8: Growth system
-- ============================================================

CREATE TABLE IF NOT EXISTS task_templates (
    id                  TEXT PRIMARY KEY DEFAULT (gen_random_uuid()),
    title               TEXT NOT NULL,
    platform            TEXT NOT NULL,
    icon                TEXT,
    description         TEXT,
    rules               TEXT,
    reward_mode         TEXT NOT NULL DEFAULT 'scalping',
    reward_amount       INTEGER NOT NULL DEFAULT 5,
    min_views           INTEGER NOT NULL DEFAULT 200,
    verify_window_hours INTEGER NOT NULL DEFAULT 72,
    sort_order          INTEGER NOT NULL DEFAULT 0,
    is_active           INTEGER NOT NULL DEFAULT 1,
    created_at          TEXT NOT NULL DEFAULT (NOW()),
    updated_at          TEXT NOT NULL DEFAULT (NOW())
);

CREATE TABLE IF NOT EXISTS task_submissions (
    id              TEXT PRIMARY KEY DEFAULT (gen_random_uuid()),
    user_id         TEXT NOT NULL REFERENCES users(id),
    template_id     TEXT NOT NULL REFERENCES task_templates(id),
    post_url        TEXT NOT NULL UNIQUE,
    screenshot_url  TEXT NOT NULL,
    status          TEXT NOT NULL DEFAULT 'pending',
    reject_reason   TEXT,
    reward_granted  INTEGER NOT NULL DEFAULT 0,
    reviewed_by     TEXT REFERENCES users(id),
    reviewed_at     TEXT,
    submitted_at    TEXT NOT NULL DEFAULT (NOW())
);
CREATE INDEX IF NOT EXISTS idx_task_submissions_user ON task_submissions(user_id);
CREATE INDEX IF NOT EXISTS idx_task_submissions_status ON task_submissions(status);
CREATE INDEX IF NOT EXISTS idx_task_submissions_template ON task_submissions(template_id);

CREATE TABLE IF NOT EXISTS bonus_credit_logs (
    id          TEXT PRIMARY KEY DEFAULT (gen_random_uuid()),
    user_id     TEXT NOT NULL REFERENCES users(id),
    source_type TEXT NOT NULL,
    source_id   TEXT,
    mode        TEXT NOT NULL,
    amount      INTEGER NOT NULL,
    note        TEXT,
    created_at  TEXT NOT NULL DEFAULT (NOW())
);
CREATE INDEX IF NOT EXISTS idx_bonus_credit_logs_user ON bonus_credit_logs(user_id);

CREATE TABLE IF NOT EXISTS commissions (
    id                  TEXT PRIMARY KEY DEFAULT (gen_random_uuid()),
    partner_id          TEXT NOT NULL REFERENCES users(id),
    referee_id          TEXT NOT NULL REFERENCES users(id),
    payment_id          TEXT NOT NULL REFERENCES payments(id),
    payment_amount_usd  REAL NOT NULL,
    commission_rate     REAL NOT NULL,
    commission_amount   REAL NOT NULL,
    status              TEXT NOT NULL DEFAULT 'pending',
    created_at          TEXT NOT NULL DEFAULT (NOW())
);
CREATE INDEX IF NOT EXISTS idx_commissions_partner ON commissions(partner_id);
CREATE INDEX IF NOT EXISTS idx_commissions_referee ON commissions(referee_id);
CREATE INDEX IF NOT EXISTS idx_commissions_status ON commissions(status);

CREATE TABLE IF NOT EXISTS partner_wallets (
    id              TEXT PRIMARY KEY DEFAULT (gen_random_uuid()),
    user_id         TEXT NOT NULL REFERENCES users(id) UNIQUE,
    trc20_address   TEXT NOT NULL,
    is_verified     INTEGER NOT NULL DEFAULT 0,
    created_at      TEXT NOT NULL DEFAULT (NOW()),
    updated_at      TEXT NOT NULL DEFAULT (NOW())
);

CREATE TABLE IF NOT EXISTS withdrawals (
    id              TEXT PRIMARY KEY DEFAULT (gen_random_uuid()),
    user_id         TEXT NOT NULL REFERENCES users(id),
    amount          REAL NOT NULL,
    trc20_address   TEXT NOT NULL,
    status          TEXT NOT NULL DEFAULT 'pending',
    tx_hash         TEXT,
    reject_reason   TEXT,
    reviewed_by     TEXT REFERENCES users(id),
    reviewed_at     TEXT,
    created_at      TEXT NOT NULL DEFAULT (NOW())
);
CREATE INDEX IF NOT EXISTS idx_withdrawals_user ON withdrawals(user_id);
CREATE INDEX IF NOT EXISTS idx_withdrawals_status ON withdrawals(status);

-- ============================================================
-- v_coinglass: OI snapshots (already created by alembic, skip)
-- ============================================================

CREATE TABLE IF NOT EXISTS oi_snapshots (
    ts              TEXT NOT NULL,
    symbol          TEXT NOT NULL,
    exchange        TEXT,
    open_interest   REAL NOT NULL,
    oi_change_1h    REAL,
    oi_change_4h    REAL,
    oi_change_24h   REAL,
    source          TEXT DEFAULT 'coinglass',
    PRIMARY KEY (ts, symbol)
);
CREATE INDEX IF NOT EXISTS idx_oi_snapshots_symbol ON oi_snapshots(symbol, ts DESC);

CREATE TABLE IF NOT EXISTS taker_volume_snapshots (
    ts              TEXT NOT NULL,
    symbol          TEXT NOT NULL,
    buy_volume      REAL NOT NULL,
    sell_volume     REAL NOT NULL,
    buy_sell_ratio  REAL,
    source          TEXT DEFAULT 'coinglass',
    PRIMARY KEY (ts, symbol)
);
CREATE INDEX IF NOT EXISTS idx_taker_volume_symbol ON taker_volume_snapshots(symbol, ts DESC);

CREATE TABLE IF NOT EXISTS liquidation_heatmap (
    ts                  TEXT NOT NULL,
    symbol              TEXT NOT NULL,
    price_low           REAL NOT NULL,
    price_high          REAL NOT NULL,
    estimated_liq_usd   REAL NOT NULL,
    model               TEXT NOT NULL,
    side                TEXT,
    PRIMARY KEY (ts, symbol, model, price_low)
);
CREATE INDEX IF NOT EXISTS idx_liq_heatmap_symbol ON liquidation_heatmap(symbol, ts DESC, model);

CREATE TABLE IF NOT EXISTS kill_zone_alerts (
    ts              TEXT NOT NULL,
    symbol          TEXT NOT NULL,
    direction       TEXT NOT NULL,
    risk_score      REAL NOT NULL,
    version         TEXT NOT NULL,
    oi_change_pct   REAL,
    taker_ratio     REAL,
    ls_ratio        REAL,
    nearest_liq_usd REAL,
    details         TEXT,
    PRIMARY KEY (ts, symbol)
);
CREATE INDEX IF NOT EXISTS idx_kill_alerts_symbol ON kill_zone_alerts(symbol, ts DESC);
CREATE INDEX IF NOT EXISTS idx_kill_alerts_score ON kill_zone_alerts(risk_score DESC);
"""

SEED_DATA = """
-- Symbol registry seed
INSERT OR IGNORE INTO symbol_registry (symbol, display_name, has_onchain, has_derivatives) VALUES
('BTCUSDT', 'BTC/USDT', 1, 1),
('ETHUSDT', 'ETH/USDT', 1, 1),
('SOLUSDT', 'SOL/USDT', 0, 1),
('BNBUSDT', 'BNB/USDT', 0, 1),
('XRPUSDT', 'XRP/USDT', 0, 1),
('ADAUSDT', 'ADA/USDT', 0, 1),
('DOGEUSDT', 'DOGE/USDT', 0, 1),
('AVAXUSDT', 'AVAX/USDT', 0, 1),
('DOTUSDT', 'DOT/USDT', 0, 1),
('MATICUSDT', 'MATIC/USDT', 0, 1);

-- Growth system config seed (uses random hex as id)
INSERT OR IGNORE INTO system_configs (id, config_key, encrypted_value, category, description, is_secret) VALUES
(hex(randomblob(16)), 'site_brand_name', '', 'site', '品牌名称', 0),
(hex(randomblob(16)), 'site_brand_url', '', 'site', '品牌官网域名', 0),
(hex(randomblob(16)), 'task_feature_enabled', 'true', 'task', '任务中心总开关', 0),
(hex(randomblob(16)), 'task_promo_templates', '[]', 'task', '推广文案模板', 0),
(hex(randomblob(16)), 'partner_feature_enabled', 'true', 'partner', '合伙人系统总开关', 0),
(hex(randomblob(16)), 'partner_commission_rate', '0.10', 'partner', '合伙人分成比例', 0),
(hex(randomblob(16)), 'partner_min_withdrawal', '50', 'partner', '最低提现金额', 0),
(hex(randomblob(16)), 'partner_withdrawal_cooldown_days', '7', 'partner', '提现冷却期', 0),
(hex(randomblob(16)), 'partner_address_cooldown_hours', '24', 'partner', '地址修改冷却期', 0),
(hex(randomblob(16)), 'register_referral_required', 'false', 'registration', '强制邀请码注册开关', 0);
"""

def main():
    print(f"Initializing SQLite database: {DB_PATH}")
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    # Register PostgreSQL-compatible functions
    import uuid as _uuid
    from datetime import datetime as _dt, timezone as _tz
    conn.create_function("gen_random_uuid", 0, lambda: str(_uuid.uuid4()))
    conn.create_function("NOW", 0, lambda: _dt.now(_tz.utc).isoformat())

    # Enable foreign keys
    cursor.execute("PRAGMA foreign_keys = ON;")

    # Create all tables
    print("Creating tables...")
    cursor.executescript(SCHEMA)

    # Insert seed data
    print("Inserting seed data...")
    cursor.executescript(SEED_DATA)

    conn.commit()

    # Verify
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
    tables = [r[0] for r in cursor.fetchall()]
    print(f"\nCreated {len(tables)} tables:")
    for t in tables:
        cursor.execute(f"SELECT COUNT(*) FROM [{t}]")
        count = cursor.fetchone()[0]
        print(f"  {t}: {count} rows")

    conn.close()
    print("\nDone!")

if __name__ == "__main__":
    main()
