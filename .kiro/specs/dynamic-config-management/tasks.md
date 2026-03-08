# Implementation Plan: 动态配置管理

## Overview

将系统配置从静态 `.env` 文件迁移到数据库存储，通过 Redis 缓存加速读取，提供管理员 API 和前端界面进行动态管理。实现顺序：数据库迁移 → 加密模块 → ORM 模型 → 管理员权限 → 配置服务 → API 路由 → 系统集成 → 前端界面。

## Tasks

- [x] 1. 数据库迁移与依赖准备
  - [x] 1.1 创建 `backend/migrations/v3_dynamic_config.sql` 迁移脚本
    - 创建 `system_configs` 表（id UUID PK, config_key VARCHAR(100) UNIQUE, encrypted_value TEXT, category VARCHAR(50), description TEXT, is_secret BOOLEAN DEFAULT true, created_at, updated_at）
    - 创建 `config_audit_log` 表（id UUID PK, admin_user_id UUID FK→users, config_key VARCHAR(100), action VARCHAR(20), old_value_masked TEXT, new_value_masked TEXT, created_at）
    - 添加 `users` 表 `is_admin` 列（BOOLEAN DEFAULT false）
    - 创建索引：`idx_system_configs_key`、`idx_system_configs_category`、`idx_audit_log_created`
    - _Requirements: 1.1, 2.1, 2.2, 2.3, 6.1_

  - [x] 1.2 更新 `docker-compose.yml` 挂载新迁移文件
    - 在 postgres 服务的 volumes 中添加 `v3_dynamic_config.sql` 映射
    - _Requirements: 2.1_

  - [x] 1.3 在 `backend/requirements.txt` 中添加 `cryptography` 和 `hypothesis` 依赖
    - `cryptography>=43.0.0`（Fernet 加密）
    - `hypothesis>=6.100.0`（属性测试）
    - _Requirements: 3.1_

- [x] 2. 加密模块与 ORM 模型
  - [x] 2.1 创建 `backend/app/core/encryption.py` — EncryptionModule
    - 实现 `__init__(secret_key: str)` — 使用 `hashlib.sha256` 派生 Fernet 密钥
    - 实现 `encrypt(plaintext: str) -> str` — 返回 base64 Fernet token
    - 实现 `decrypt(ciphertext: str) -> str` — 解密失败记录日志返回空字符串
    - 实现 `mask_value(value: str) -> str` — 长度≥4 返回 `"****" + value[-4:]`，否则返回 `"****"`
    - _Requirements: 3.1, 3.4, 3.5_

  - [x]* 2.2 属性测试：Encryption round-trip
    - **Property 1: Encryption round-trip**
    - 在 `backend/tests/test_config_service.py` 中使用 hypothesis 生成随机字符串，验证 encrypt→decrypt 恒等
    - **Validates: Requirements 3.1, 3.3**

  - [x]* 2.3 属性测试：Value masking format
    - **Property 3: Value masking format**
    - 生成随机字符串，验证 mask_value 输出格式（≥4字符返回 `"****"+last4`，<4字符返回 `"****"`）
    - **Validates: Requirements 3.4**

  - [x] 2.4 在 `backend/app/models/db.py` 中添加 ORM 模型
    - 添加 `SystemConfig` 模型（映射 system_configs 表）
    - 添加 `ConfigAuditLog` 模型（映射 config_audit_log 表）
    - 在 `User` 模型中添加 `is_admin: Mapped[bool]` 字段（server_default false）
    - _Requirements: 1.1, 2.1, 6.1_

- [x] 3. 管理员权限扩展
  - [x] 3.1 更新 `backend/app/core/deps.py`
    - 在 `UserInfo` 模型中添加 `is_admin: bool` 字段
    - 更新 `get_current_user` 的 SQL 查询，新增 `u.is_admin` 字段
    - 新增 `require_admin` 依赖函数：校验 `is_admin=true`，否则返回 403
    - _Requirements: 1.2, 1.3, 1.4_

  - [x]* 3.2 属性测试：Admin-only access enforcement
    - **Property 4: Admin-only access enforcement**
    - 生成随机非管理员用户，验证所有 admin 端点返回 403
    - **Validates: Requirements 1.2, 1.4, 5.6**

- [x] 4. Checkpoint — 确保基础层完成
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. 配置服务层实现
  - [x] 5.1 创建 Pydantic 请求/响应模型
    - 在 `backend/app/services/config_service.py` 顶部定义 `ConfigCreate`、`ConfigUpdate`、`SystemConfigResponse`、`AuditLogResponse`
    - _Requirements: 5.3, 5.4, 6.3_

  - [x] 5.2 实现 `ConfigService` 核心方法
    - `get_config(key, default)` — 缓存优先→数据库→default，解密 is_secret 值，无配置无默认值时记录警告返回空字符串
    - `get_all_configs(category)` — 返回列表，敏感值掩码，支持 category 过滤
    - `get_config_detail(key)` — 返回单条，敏感值掩码
    - `create_config(data, admin_user_id)` — 加密存储 + 写审计日志 + 清缓存
    - `update_config(key, data, admin_user_id)` — 加密更新 + 写审计日志 + 清缓存
    - `delete_config(key, admin_user_id)` — 删除 + 写审计日志 + 清缓存
    - `get_audit_logs(page, size)` — 分页查询审计日志
    - `load_all_to_cache()` — 批量预热 Redis 缓存
    - 缓存键前缀 `sys_config:`，TTL 300 秒
    - 缓存存储 JSON `{"encrypted_value": "...", "is_secret": true}`
    - _Requirements: 3.2, 3.3, 3.4, 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 5.1, 5.2, 5.3, 5.4, 5.5, 5.7, 6.2, 6.4, 7.1, 7.2, 7.5, 9.1, 9.2, 9.3_

  - [x]* 5.3 属性测试：Secret configs stored encrypted
    - **Property 2: Secret configs stored encrypted**
    - 生成随机配置（is_secret=true），验证数据库中 encrypted_value ≠ 明文
    - **Validates: Requirements 3.2**

  - [x]* 5.4 属性测试：Config CRUD round-trip
    - **Property 5: Config CRUD round-trip**
    - 生成随机 key/value/category，验证 create→get→update→get→delete→get(default) 全流程
    - **Validates: Requirements 5.3, 5.4, 5.5, 7.1**

  - [x]* 5.5 属性测试：Cache invalidation on write
    - **Property 6: Cache invalidation on write**
    - 生成随机配置，写入缓存后执行 update/delete，验证 Redis 中 `sys_config:{key}` 已清除
    - **Validates: Requirements 4.5, 9.1**

  - [x]* 5.6 属性测试：Bulk cache loading
    - **Property 7: Bulk cache loading**
    - 生成随机配置集合，调用 load_all_to_cache，验证所有配置在 Redis 中存在
    - **Validates: Requirements 4.6, 7.2**

  - [x]* 5.7 属性测试：Audit log on mutation with masked values
    - **Property 10: Audit log on mutation with masked values**
    - 生成随机配置变更操作，验证审计日志正确记录且敏感值掩码
    - **Validates: Requirements 6.2, 6.4**

- [x] 6. 配置管理 API 路由
  - [x] 6.1 创建 `backend/app/api/admin_configs.py`
    - `GET /api/admin/configs` — 配置列表，支持 `?category=` 过滤
    - `GET /api/admin/configs/audit-log` — 审计日志，支持 `?page=&size=` 分页
    - `GET /api/admin/configs/{key}` — 单条配置详情
    - `POST /api/admin/configs` — 创建配置（409 on duplicate key）
    - `PUT /api/admin/configs/{key}` — 更新配置（404 if not found）
    - `DELETE /api/admin/configs/{key}` — 删除配置（404 if not found）
    - 所有接口通过 `Depends(require_admin)` 校验权限
    - API 层只做参数校验和响应格式化，业务逻辑在 ConfigService
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 6.3_

  - [x] 6.2 在 `backend/main.py` 中注册路由并添加启动缓存预热
    - 导入并注册 `admin_configs_router`
    - 在 lifespan 中调用 `ConfigService.load_all_to_cache()` 预热缓存
    - _Requirements: 7.2_

  - [x]* 6.3 属性测试：API responses mask secret values
    - **Property 8: API responses mask secret values**
    - 生成随机 secret 配置，验证 API 响应中 value 为掩码格式
    - **Validates: Requirements 5.1, 5.2**

  - [x]* 6.4 属性测试：Category filtering correctness
    - **Property 9: Category filtering correctness**
    - 生成随机 category，验证过滤结果只包含该 category
    - **Validates: Requirements 5.7**

- [x] 7. Checkpoint — 确保后端 API 完整
  - Ensure all tests pass, ask the user if questions arise.

- [x] 8. 系统集成与配置迁移
  - [x] 8.1 精简 `backend/app/core/config.py` 的 Settings 类
    - 仅保留基础设施配置：database_url、redis_url、jwt_secret_key、jwt_algorithm、app_env、app_host、app_port
    - 移除 dmx_api_key、dmx_base_url、binance_*、etherscan_*、cryptoquant_*、nowpayments_*、telegram_*、sendgrid_*、sentry_* 等字段
    - _Requirements: 7.3_

  - [x] 8.2 更新 `backend/app/core/llm_client.py` 使用 ConfigService
    - 修改 `UnifiedLLMClient.__init__` 接受 config_service 参数
    - 通过 `config_service.get_config("dmx_api_key")` 和 `config_service.get_config("dmx_base_url")` 获取配置
    - 更新模块级单例初始化方式
    - _Requirements: 7.4_

  - [x] 8.3 更新 `.env.example` 仅保留基础设施配置项
    - 移除已迁移到数据库的配置项，添加注释说明其他配置通过管理界面管理
    - _Requirements: 7.3_

  - [x]* 8.4 单元测试：Settings 类和 LLM 集成
    - 验证 Settings 类保留基础设施配置字段
    - 验证 UnifiedLLMClient 通过 ConfigService 获取配置
    - _Requirements: 7.3, 7.4_

- [x] 9. 前端配置管理界面
  - [x] 9.1 创建 `frontend/lib/api/configs.ts` — API 模块
    - 实现 `fetchConfigs(category?)`, `fetchConfigDetail(key)`, `createConfig(data)`, `updateConfig(key, data)`, `deleteConfig(key)`, `fetchAuditLogs(page?, size?)` 函数
    - 定义 TypeScript 类型：`SystemConfig`, `ConfigCreate`, `ConfigUpdate`, `AuditLogPage`
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.8_

  - [x] 9.2 创建 `frontend/app/settings/configs/page.tsx` — 配置管理页面
    - 按 category 分组展示配置列表（glass-card 风格）
    - 敏感值默认掩码显示，点击切换明文/掩码
    - 内联编辑配置值 + 新增配置表单（键名、值、分类、描述、是否敏感）
    - 删除确认对话框
    - 审计日志折叠面板（底部）
    - 非管理员显示权限不足提示
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7, 8.8_

- [x] 10. Final checkpoint — 全部完成验证
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Property tests use `hypothesis` library, each validates specific design properties
- 缓存存储加密值 + is_secret 标记，解密在 ConfigService 层完成，避免明文存入 Redis
- 基础设施配置（database_url、redis_url、jwt_secret_key 等）始终保留在 `.env` 中
