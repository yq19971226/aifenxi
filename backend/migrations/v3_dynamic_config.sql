-- ============================================================
-- OmniMind V3 动态配置管理 — 数据库迁移脚本
-- 版本: v3.0
-- 描述: 动态配置管理所需的表结构
--   - 系统配置表 (system_configs)
--   - 配置审计日志表 (config_audit_log)
--   - 用户表新增 is_admin 字段
-- 依赖: init.sql 已执行（users 表及 update_updated_at_column() 函数已存在）
-- ============================================================

BEGIN;

-- ============================================================
-- 一、系统配置表
-- ============================================================

CREATE TABLE IF NOT EXISTS system_configs (
    id              UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    config_key      VARCHAR(100)    UNIQUE NOT NULL,
    encrypted_value TEXT            NOT NULL,
    category        VARCHAR(50)     NOT NULL,
    description     TEXT,
    is_secret       BOOLEAN         DEFAULT true,
    created_at      TIMESTAMPTZ     DEFAULT NOW(),
    updated_at      TIMESTAMPTZ     DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_system_configs_key ON system_configs (config_key);
CREATE INDEX IF NOT EXISTS idx_system_configs_category ON system_configs (category);

-- ============================================================
-- 二、配置审计日志表
-- ============================================================

CREATE TABLE IF NOT EXISTS config_audit_log (
    id                  UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_user_id       UUID            NOT NULL REFERENCES users(id),
    config_key          VARCHAR(100)    NOT NULL,
    action              VARCHAR(20)     NOT NULL,
    old_value_masked    TEXT,
    new_value_masked    TEXT,
    created_at          TIMESTAMPTZ     DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_log_created ON config_audit_log (created_at DESC);

-- ============================================================
-- 三、用户表新增管理员字段
-- ============================================================

ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT false;

-- ============================================================
-- 四、自动更新 updated_at 触发器
-- ============================================================

CREATE TRIGGER update_system_configs_updated_at
    BEFORE UPDATE ON system_configs
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMIT;
