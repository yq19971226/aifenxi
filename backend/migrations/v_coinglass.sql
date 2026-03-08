-- ============================================================
-- OmniMind CoinGlass 数据采集层 — 数据库迁移脚本
-- 描述: 新增 CoinGlass 数据采集所需的时序表结构
--   - OI 快照表 (oi_snapshots)
--   - Taker Volume 快照表 (taker_volume_snapshots)
--   - 爆仓热力图表 (liquidation_heatmap)
--   - 点杀预警记录表 (kill_zone_alerts)
--   - 扩展 derivatives_snapshots 表新增 source 字段
-- 依赖: init.sql, v2_enhancements.sql 已执行
-- ============================================================

BEGIN;

-- ============================================================
-- 一、OI 快照表（持仓量时序数据）
-- ============================================================

CREATE TABLE IF NOT EXISTS oi_snapshots (
    ts              TIMESTAMPTZ     NOT NULL,
    symbol          VARCHAR(32)     NOT NULL,
    exchange        VARCHAR(32),
    open_interest   NUMERIC         NOT NULL,
    oi_change_1h    NUMERIC,
    oi_change_4h    NUMERIC,
    oi_change_24h   NUMERIC,
    source          VARCHAR(16)     DEFAULT 'coinglass',
    CONSTRAINT oi_snapshots_pkey PRIMARY KEY (ts, symbol)
);

SELECT create_hypertable('oi_snapshots', 'ts', if_not_exists => TRUE);
CREATE INDEX IF NOT EXISTS idx_oi_snapshots_symbol ON oi_snapshots (symbol, ts DESC);

-- ============================================================
-- 二、Taker Volume 快照表（主动买卖量时序数据）
-- ============================================================

CREATE TABLE IF NOT EXISTS taker_volume_snapshots (
    ts              TIMESTAMPTZ     NOT NULL,
    symbol          VARCHAR(32)     NOT NULL,
    buy_volume      NUMERIC         NOT NULL,
    sell_volume     NUMERIC         NOT NULL,
    buy_sell_ratio  NUMERIC,
    source          VARCHAR(16)     DEFAULT 'coinglass',
    CONSTRAINT taker_volume_snapshots_pkey PRIMARY KEY (ts, symbol)
);

SELECT create_hypertable('taker_volume_snapshots', 'ts', if_not_exists => TRUE);
CREATE INDEX IF NOT EXISTS idx_taker_volume_symbol ON taker_volume_snapshots (symbol, ts DESC);

-- ============================================================
-- 三、爆仓热力图表
-- ============================================================

CREATE TABLE IF NOT EXISTS liquidation_heatmap (
    ts                  TIMESTAMPTZ     NOT NULL,
    symbol              VARCHAR(32)     NOT NULL,
    price_low           NUMERIC         NOT NULL,
    price_high          NUMERIC         NOT NULL,
    estimated_liq_usd   NUMERIC         NOT NULL,
    model               VARCHAR(16)     NOT NULL,
    side                VARCHAR(8),
    CONSTRAINT liquidation_heatmap_pkey PRIMARY KEY (ts, symbol, model, price_low)
);

SELECT create_hypertable('liquidation_heatmap', 'ts', if_not_exists => TRUE);
CREATE INDEX IF NOT EXISTS idx_liq_heatmap_symbol ON liquidation_heatmap (symbol, ts DESC, model);

-- ============================================================
-- 四、点杀预警记录表
-- ============================================================

CREATE TABLE IF NOT EXISTS kill_zone_alerts (
    ts              TIMESTAMPTZ     NOT NULL,
    symbol          VARCHAR(32)     NOT NULL,
    direction       VARCHAR(16)     NOT NULL,
    risk_score      NUMERIC         NOT NULL CHECK (risk_score >= 0 AND risk_score <= 100),
    version         VARCHAR(16)     NOT NULL,
    oi_change_pct   NUMERIC,
    taker_ratio     NUMERIC,
    ls_ratio        NUMERIC,
    nearest_liq_usd NUMERIC,
    details         JSONB,
    CONSTRAINT kill_zone_alerts_pkey PRIMARY KEY (ts, symbol)
);

SELECT create_hypertable('kill_zone_alerts', 'ts', if_not_exists => TRUE);
CREATE INDEX IF NOT EXISTS idx_kill_alerts_symbol ON kill_zone_alerts (symbol, ts DESC);
CREATE INDEX IF NOT EXISTS idx_kill_alerts_score ON kill_zone_alerts (risk_score DESC);

-- ============================================================
-- 五、扩展 derivatives_snapshots 表新增 source 字段
-- ============================================================

ALTER TABLE derivatives_snapshots ADD COLUMN IF NOT EXISTS source VARCHAR(16) DEFAULT 'binance';
CREATE INDEX IF NOT EXISTS idx_derivatives_source ON derivatives_snapshots (source);

COMMIT;
