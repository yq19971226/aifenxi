-- Migration: Add playbook lifecycle fields to playbook_predictions
-- Date: 2026-03-09
-- Purpose: Support hard/soft failure detection, stage entry price tracking
--
-- Run this on the production database BEFORE deploying the new code.
-- These are idempotent (IF NOT EXISTS / safe to re-run on PostgreSQL 9.6+).

-- signal: bearish/bullish/neutral direction of the playbook
ALTER TABLE playbook_predictions ADD COLUMN IF NOT EXISTS signal VARCHAR(20) DEFAULT 'neutral';

-- snapshot_price: market price at the time of initial prediction
ALTER TABLE playbook_predictions ADD COLUMN IF NOT EXISTS snapshot_price FLOAT DEFAULT NULL;

-- stage_entry_price: price when the current stage was entered (updated by verify worker)
ALTER TABLE playbook_predictions ADD COLUMN IF NOT EXISTS stage_entry_price FLOAT DEFAULT NULL;

-- stage_entered_at: timestamp when the current stage was entered (used for per-stage timeout)
ALTER TABLE playbook_predictions ADD COLUMN IF NOT EXISTS stage_entered_at TIMESTAMP DEFAULT NULL;

-- failure_reason: reason text when status='failed' (hard failure)
ALTER TABLE playbook_predictions ADD COLUMN IF NOT EXISTS failure_reason TEXT DEFAULT NULL;

-- risk_flag: soft failure warning flag
ALTER TABLE playbook_predictions ADD COLUMN IF NOT EXISTS risk_flag BOOLEAN DEFAULT FALSE;

-- risk_note: soft failure detail / miss counter
ALTER TABLE playbook_predictions ADD COLUMN IF NOT EXISTS risk_note TEXT DEFAULT NULL;

-- Indexes for query performance
CREATE INDEX IF NOT EXISTS idx_pp_status_created ON playbook_predictions(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pp_symbol_name_created ON playbook_predictions(symbol, playbook_name, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pp_published_created ON playbook_predictions(published, created_at DESC);
