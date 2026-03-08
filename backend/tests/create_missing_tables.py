"""Create missing tables in SQLite for dev/test environment."""
import sqlite3

conn = sqlite3.connect("test.db")
c = conn.cursor()

# playbook_predictions table
c.execute("""
CREATE TABLE IF NOT EXISTS playbook_predictions (
    id              TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    symbol          TEXT NOT NULL,
    playbook_name   TEXT NOT NULL,
    match_pct       REAL DEFAULT 0,
    current_stage_idx INTEGER DEFAULT -1,
    stages_json     TEXT,
    status          TEXT DEFAULT 'active',
    final_accuracy  REAL,
    verified_stages INTEGER DEFAULT 0,
    published       BOOLEAN DEFAULT 0,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    signal          TEXT DEFAULT 'neutral',
    snapshot_price  REAL,
    stage_entry_price REAL,
    stage_entered_at TIMESTAMP,
    failure_reason  TEXT,
    risk_flag       BOOLEAN DEFAULT 0,
    risk_note       TEXT
)
""")
print("Created: playbook_predictions")

# klines table
c.execute("""
CREATE TABLE IF NOT EXISTS klines (
    time        TIMESTAMP NOT NULL,
    symbol      TEXT NOT NULL,
    interval    TEXT NOT NULL,
    open        REAL NOT NULL,
    high        REAL NOT NULL,
    low         REAL NOT NULL,
    close       REAL NOT NULL,
    volume      REAL NOT NULL,
    PRIMARY KEY (time, symbol, interval)
)
""")
print("Created: klines")

# params_changelog table (used by learning_service)
c.execute("""
CREATE TABLE IF NOT EXISTS params_changelog (
    id          TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    param_type  TEXT,
    param_key   TEXT,
    old_value   TEXT,
    new_value   TEXT,
    changed_by  TEXT,
    changed_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    note        TEXT
)
""")
print("Created: params_changelog")

# audit_logs table (used by learning_service cleanup)
c.execute("""
CREATE TABLE IF NOT EXISTS audit_logs (
    id          TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    user_id     TEXT,
    action      TEXT,
    detail      TEXT,
    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
)
""")
print("Created: audit_logs")

conn.commit()
conn.close()
print("Done - all missing tables created.")
