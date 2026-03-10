# V13 国际化用户偏好 - 数据库迁移

## 概述

此迁移添加 `user_preferences` 表以支持用户界面的多语言功能。

## 变更内容

### 新增表：user_preferences

| 字段 | 类型 | 说明 | 默认值 |
|------|------|------|--------|
| user_id | UUID | 用户ID（主键，外键关联 users.id） | - |
| locale | VARCHAR(10) | 界面语言偏好 | 'zh-CN' |
| theme | VARCHAR(20) | 界面主题 | 'dark' |
| timezone | VARCHAR(50) | 用户时区 | 'UTC' |
| created_at | TIMESTAMPTZ | 创建时间 | NOW() |
| updated_at | TIMESTAMPTZ | 更新时间 | NOW() |

### 支持的语言

- `zh-CN`: 简体中文
- `zh-TW`: 繁体中文
- `en`: 英文

### 约束

- `check_locale_valid`: 确保 locale 字段只能使用支持的三种语言
- 外键约束：user_id 关联到 users 表，级联删除

### 索引

- `idx_user_preferences_locale`: 优化按语言查询的性能

### 触发器

- `update_user_preferences_updated_at`: 自动更新 updated_at 字段

## 执行迁移

### 方法 1: 使用 Bash 脚本（推荐）

```bash
# 确保 Docker 和 PostgreSQL 容器正在运行
docker-compose up -d postgres

# 执行迁移
bash backend/migrations/run_v13_migration.sh
```

### 方法 2: 使用 Python 脚本

```bash
# 确保已安装依赖
pip install sqlalchemy asyncpg

# 设置环境变量（可选，默认使用本地数据库）
export DATABASE_URL=postgresql+asyncpg://omnimind:password@localhost:5432/omnimind

# 执行迁移
python backend/migrations/run_v13_migration.py
```

### 方法 3: 直接使用 Docker

```bash
# 确保 PostgreSQL 容器正在运行
docker exec -i omnimind-postgres-1 psql -U omnimind -d omnimind < backend/migrations/v13_i18n_user_preferences.sql
```

### 方法 4: 使用 psql 客户端

```bash
# 连接到数据库
psql -U omnimind -d omnimind -h localhost -p 5432

# 在 psql 中执行
\i backend/migrations/v13_i18n_user_preferences.sql
```

## 验证迁移

执行以下 SQL 验证表是否创建成功：

```sql
-- 查看表结构
\d user_preferences

-- 查看约束
SELECT conname, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid = 'user_preferences'::regclass;

-- 查看索引
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'user_preferences';

-- 测试插入数据
INSERT INTO user_preferences (user_id, locale)
VALUES ('00000000-0000-0000-0000-000000000001', 'zh-CN')
ON CONFLICT (user_id) DO NOTHING;

-- 测试约束（应该失败）
INSERT INTO user_preferences (user_id, locale)
VALUES ('00000000-0000-0000-0000-000000000002', 'invalid-locale');
-- 预期错误: new row for relation "user_preferences" violates check constraint "check_locale_valid"
```

## 回滚

如需回滚此迁移，执行以下 SQL：

```sql
BEGIN;

-- 删除触发器
DROP TRIGGER IF EXISTS update_user_preferences_updated_at ON user_preferences;

-- 删除表（级联删除所有相关数据）
DROP TABLE IF EXISTS user_preferences CASCADE;

COMMIT;
```

## 依赖

- 依赖 `init.sql` 已执行（users 表和 update_updated_at_column() 函数必须存在）
- PostgreSQL 版本: 12+
- TimescaleDB 扩展（项目已安装）

## 相关文件

- SQL 脚本: `backend/migrations/v13_i18n_user_preferences.sql`
- Python 执行器: `backend/migrations/run_v13_migration.py`
- Bash 执行器: `backend/migrations/run_v13_migration.sh`
- 文档: `backend/migrations/v13_README.md`

## 后续步骤

1. 创建用户偏好服务 (`backend/app/services/user_preference_service.py`)
2. 创建用户偏好 API 路由 (`backend/app/api/user_preferences.py`)
3. 前端集成语言切换功能
4. 更新 AI Agent 使用多语言 Prompt

## 注意事项

- 此表使用 `user_id` 作为主键，每个用户只能有一条偏好记录
- `locale` 字段有 CHECK 约束，只能使用预定义的三种语言
- `updated_at` 字段会在每次更新时自动更新
- 删除用户时会级联删除其偏好设置（ON DELETE CASCADE）
