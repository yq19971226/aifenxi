-- v15: 邮箱归一化 — 全部转小写 + 功能索引加速 LOWER(email) 查询
--
-- 背景：代码层已统一 .lower().strip()，此迁移处理存量数据。
-- 若存在大小写不同的重复邮箱（如 Alice@x.com 和 alice@x.com），
-- UPDATE 会因 UNIQUE 约束失败；需人工决定保留哪个账号。

-- 1. 小写化所有存量邮箱（无重复时安全执行）
UPDATE users SET email = LOWER(email) WHERE email != LOWER(email);

-- 2. 创建功能索引，让 WHERE LOWER(email) = :email 走索引
CREATE INDEX IF NOT EXISTS idx_users_email_lower ON users(LOWER(email));
