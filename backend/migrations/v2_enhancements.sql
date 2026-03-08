-- ============================================================
-- OmniMind V2 增强功能 — 数据库迁移脚本
-- 版本: v2.0
-- 描述: 新增5大增强模块所需的全部表结构
--   - 合约数据时序表 (derivatives_snapshots, liquidation_events)
--   - 币种关联系数时序表 (symbol_correlations)
--   - 币种注册表 (symbol_registry)
--   - 预警规则与触发历史 (alert_rules, alert_triggers)
--   - 策略绩效快照与检查点 (strategy_snapshots, perf_checkpoints)
--   - AI对话会话与消息 (chat_sessions, chat_messages)
-- 依赖: init.sql 已执行（users, strategies 表已存在）
-- ============================================================

BEGIN;

-- ============================================================
-- 一、TimescaleDB 时序表
-- ============================================================

-- 合约数据快照（资金费率、多空比）— 需求11
CREATE TABLE IF NOT EXISTS derivatives_snapshots (
    time                          TIMESTAMPTZ NOT NULL,
    symbol                        VARCHAR(20) NOT NULL,
    funding_rate                  NUMERIC(12,8),
    predicted_funding_rate        NUMERIC(12,8),
    long_short_account_ratio      NUMERIC(10,6),
    long_short_position_ratio     NUMERIC(10,6),
    top_long_short_account_ratio  NUMERIC(10,6),
    top_long_short_position_ratio NUMERIC(10,6)
);
SELECT create_hypertable('derivatives_snapshots', 'time', if_not_exists => TRUE);
CREATE INDEX IF NOT EXISTS idx_deriv_symbol ON derivatives_snapshots (symbol, time DESC);

-- 爆仓事件 — 需求11
CREATE TABLE IF NOT EXISTS liquidation_events (
    time        TIMESTAMPTZ NOT NULL,
    symbol      VARCHAR(20) NOT NULL,
    side        VARCHAR(10) NOT NULL,
    quantity    NUMERIC(20,8) NOT NULL,
    price       NUMERIC(20,8) NOT NULL,
    usd_value   NUMERIC(20,2) NOT NULL
);
SELECT create_hypertable('liquidation_events', 'time', if_not_exists => TRUE);
CREATE INDEX IF NOT EXISTS idx_liq_symbol ON liquidation_events (symbol, time DESC);

-- 币种关联系数 — 需求5
CREATE TABLE IF NOT EXISTS symbol_correlations (
    time        TIMESTAMPTZ NOT NULL,
    symbol_a    VARCHAR(20) NOT NULL,
    symbol_b    VARCHAR(20) NOT NULL,
    correlation NUMERIC(6,4) NOT NULL
);
SELECT create_hypertable('symbol_correlations', 'time', if_not_exists => TRUE);
CREATE INDEX IF NOT EXISTS idx_corr_pair ON symbol_correlations (symbol_a, symbol_b, time DESC);

-- ============================================================
-- 二、PostgreSQL 业务表
-- ============================================================

-- 币种注册表 — 需求3
CREATE TABLE IF NOT EXISTS symbol_registry (
    symbol              VARCHAR(20) PRIMARY KEY,
    display_name        VARCHAR(50) NOT NULL,
    collect_interval_sec INTEGER DEFAULT 60,
    enabled             BOOLEAN DEFAULT true,
    has_onchain         BOOLEAN DEFAULT true,
    has_derivatives     BOOLEAN DEFAULT true,
    error_count         INTEGER DEFAULT 0,
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW()
);

-- 预警规则 — 需求1
CREATE TABLE IF NOT EXISTS alert_rules (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id           UUID REFERENCES users(id) ON DELETE CASCADE,
    name              VARCHAR(100) NOT NULL,
    symbol            VARCHAR(20) NOT NULL,
    expression        JSONB NOT NULL,
    enabled           BOOLEAN DEFAULT true,
    notify_channels   JSONB DEFAULT '["websocket"]',
    last_triggered_at TIMESTAMPTZ,
    created_at        TIMESTAMPTZ DEFAULT NOW(),
    updated_at        TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_alert_rules_user ON alert_rules (user_id);
CREATE INDEX IF NOT EXISTS idx_alert_rules_symbol_enabled ON alert_rules (symbol, enabled) WHERE enabled = true;

-- 预警触发历史 — 需求2
CREATE TABLE IF NOT EXISTS alert_triggers (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rule_id         UUID REFERENCES alert_rules(id) ON DELETE CASCADE,
    triggered_value NUMERIC(20,8) NOT NULL,
    metric_type     VARCHAR(30) NOT NULL,
    notify_channel  VARCHAR(20) NOT NULL,
    notify_status   VARCHAR(20) DEFAULT 'sent',
    triggered_at    TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_alert_triggers_rule ON alert_triggers (rule_id, triggered_at DESC);

-- 策略绩效快照 — 需求6
CREATE TABLE IF NOT EXISTS strategy_snapshots (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    strategy_id         UUID REFERENCES strategies(id) ON DELETE CASCADE,
    symbol              VARCHAR(20) NOT NULL,
    direction           VARCHAR(20) NOT NULL,
    entry_low           NUMERIC(20,8) NOT NULL,
    entry_high          NUMERIC(20,8) NOT NULL,
    stop_loss           NUMERIC(20,8) NOT NULL,
    targets             JSONB NOT NULL,
    confidence          NUMERIC(4,3),
    price_at_generation NUMERIC(20,8) NOT NULL,
    status              VARCHAR(20) DEFAULT 'pending',
    settlement_price    NUMERIC(20,8),
    settlement_time     TIMESTAMPTZ,
    pnl_pct             NUMERIC(10,4),
    created_at          TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_snapshots_status ON strategy_snapshots (status) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_snapshots_symbol ON strategy_snapshots (symbol, created_at DESC);

-- 绩效检查点 — 需求6
CREATE TABLE IF NOT EXISTS perf_checkpoints (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    snapshot_id     UUID REFERENCES strategy_snapshots(id) ON DELETE CASCADE,
    checkpoint_hours INTEGER NOT NULL,
    actual_price    NUMERIC(20,8) NOT NULL,
    recorded_at     TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(snapshot_id, checkpoint_hours)
);

-- 对话会话 — 需求8
CREATE TABLE IF NOT EXISTS chat_sessions (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID REFERENCES users(id) ON DELETE CASCADE,
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    updated_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_chat_sessions_user ON chat_sessions (user_id, updated_at DESC);

-- 对话消息 — 需求8
CREATE TABLE IF NOT EXISTS chat_messages (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id  UUID REFERENCES chat_sessions(id) ON DELETE CASCADE,
    role        VARCHAR(20) NOT NULL,
    content     TEXT NOT NULL,
    token_count INTEGER,
    model_key   VARCHAR(30),
    latency_ms  INTEGER,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_chat_messages_session ON chat_messages (session_id, created_at);

-- ============================================================
-- 三、自动更新 updated_at 触发器
-- ============================================================

CREATE TRIGGER update_symbol_registry_updated_at
    BEFORE UPDATE ON symbol_registry
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_alert_rules_updated_at
    BEFORE UPDATE ON alert_rules
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_chat_sessions_updated_at
    BEFORE UPDATE ON chat_sessions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- 四、种子数据 — 默认交易对
-- ============================================================

INSERT INTO symbol_registry (symbol, display_name, has_onchain, has_derivatives) VALUES
('BTCUSDT', 'BTC/USDT', true, true),
('ETHUSDT', 'ETH/USDT', true, true),
('SOLUSDT', 'SOL/USDT', false, true),
('BNBUSDT', 'BNB/USDT', false, true),
('XRPUSDT', 'XRP/USDT', false, true)
ON CONFLICT (symbol) DO NOTHING;

COMMIT;
