-- ============================================================
-- OmniMind V4 角色权限系统 — 数据库迁移脚本
-- 版本: v4.0
-- 描述: 用户表新增 role 字段，实现三级角色模型 (admin/operator/user)
--   - 新增 role VARCHAR(20) DEFAULT 'user' 字段
--   - 将 is_admin=true 的用户迁移为 role='admin'
--   - 添加 CHECK 约束限制 role 取值
--   - 添加 idx_users_role 索引
--   - 保留 is_admin 字段，向后兼容
-- 依赖: v3_dynamic_config.sql 已执行（users 表含 is_admin 字段）
-- ============================================================

BEGIN;

-- ============================================================
-- 一、新增 role 字段
-- ============================================================

ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(20) DEFAULT 'user';

-- ============================================================
-- 二、数据迁移：将 is_admin=true 的用户设为 admin 角色
-- ============================================================

UPDATE users SET role = 'admin' WHERE is_admin = TRUE AND (role IS NULL OR role = 'user');

-- ============================================================
-- 三、添加 CHECK 约束限制 role 取值
-- ============================================================

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_users_role'
    ) THEN
        ALTER TABLE users ADD CONSTRAINT chk_users_role CHECK (role IN ('admin', 'operator', 'user'));
    END IF;
END
$$;

-- ============================================================
-- 四、添加角色索引
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_users_role ON users (role);

COMMIT;
