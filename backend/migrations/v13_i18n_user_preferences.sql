-- ============================================================
-- OmniMind V13 国际化用户偏好 — 数据库迁移脚本
-- 版本: v13.0
-- 描述: 添加用户偏好表以支持多语言界面
--   - 用户偏好表 (user_preferences)
--   - 支持三种语言：zh-CN（简体中文）、zh-TW（繁体中文）、en（英文）
-- 依赖: init.sql 已执行（users 表及 update_updated_at_column() 函数已存在）
-- ============================================================

BEGIN;

-- ============================================================
-- 一、用户偏好表
-- ============================================================

CREATE TABLE IF NOT EXISTS user_preferences (
    user_id         UUID            PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    locale          VARCHAR(10)     NOT NULL DEFAULT 'zh-CN',
    theme           VARCHAR(20)     DEFAULT 'dark',
    timezone        VARCHAR(50)     DEFAULT 'UTC',
    created_at      TIMESTAMPTZ     DEFAULT NOW(),
    updated_at      TIMESTAMPTZ     DEFAULT NOW(),
    
    -- 约束：确保只能使用支持的语言
    CONSTRAINT check_locale_valid CHECK (locale IN ('zh-CN', 'zh-TW', 'en'))
);

-- 添加注释
COMMENT ON TABLE user_preferences IS '用户偏好设置表';
COMMENT ON COLUMN user_preferences.locale IS '用户界面语言偏好：zh-CN（简体中文）、zh-TW（繁体中文）、en（英文）';
COMMENT ON COLUMN user_preferences.theme IS '界面主题：dark（深色）、light（浅色）';
COMMENT ON COLUMN user_preferences.timezone IS '用户时区';

-- ============================================================
-- 二、索引优化
-- ============================================================

-- 优化语言查询性能
CREATE INDEX IF NOT EXISTS idx_user_preferences_locale ON user_preferences(locale);

-- ============================================================
-- 三、自动更新 updated_at 触发器
-- ============================================================

CREATE TRIGGER update_user_preferences_updated_at
    BEFORE UPDATE ON user_preferences
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMIT;
