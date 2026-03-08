# Requirements Document — 动态配置管理

## Introduction

当前系统所有 API 密钥和外部服务配置都存储在 `.env` 文件中，部署和修改时需要手动编辑文件并重启服务。本功能将这些配置迁移到数据库存储，通过后台管理界面动态管理，实现无需重启即可更新配置。

基础设施配置（DATABASE_URL、REDIS_URL、JWT_SECRET_KEY 等）仍保留在 `.env` 文件中，因为数据库连接本身依赖这些配置。

## Glossary

- **Config_Service**: 后端配置管理服务层，负责配置的增删改查、加解密和缓存管理
- **Config_API**: 后端配置管理 API 路由层，提供 RESTful 接口供前端调用
- **Config_UI**: 前端配置管理页面，位于设置页面下，供管理员操作
- **System_Config**: 数据库中存储的单条配置记录，包含键名、加密值、分类等字段
- **Config_Cache**: Redis 中缓存的配置数据，避免每次读取都查询数据库
- **Encryption_Module**: 使用 Fernet 对称加密的模块，负责敏感配置值的加解密
- **Admin_User**: 拥有管理员权限（is_admin=true）的用户，是唯一可以管理系统配置的角色
- **Config_Category**: 配置的分类标签，如 ai_model、data_source、payment、notification、monitoring
- **Audit_Log**: 配置变更的审计记录，记录操作人、操作时间、变更内容

## Requirements

### Requirement 1: 管理员角色支持

**User Story:** 作为系统所有者，我希望有管理员角色，以便只有授权用户可以管理系统配置。

#### Acceptance Criteria

1. THE User 数据模型 SHALL 包含 is_admin 布尔字段，默认值为 false
2. WHEN 非管理员用户请求配置管理接口时，THE Config_API SHALL 返回 HTTP 403 状态码和"权限不足"错误信息
3. THE UserInfo 模型 SHALL 包含 is_admin 字段，以便前端根据角色显示管理功能
4. THE deps 模块 SHALL 提供 require_admin 依赖注入函数，校验当前用户的 is_admin 字段为 true

### Requirement 2: 配置数据库存储

**User Story:** 作为管理员，我希望系统配置存储在数据库中，以便通过界面管理而无需编辑文件。

#### Acceptance Criteria

1. THE System_Config 数据表 SHALL 包含以下字段：id（UUID主键）、config_key（唯一字符串）、encrypted_value（加密后的值）、category（分类）、description（描述）、is_secret（是否敏感）、created_at、updated_at
2. THE System_Config 数据表 SHALL 对 config_key 字段建立唯一索引
3. THE System_Config 数据表 SHALL 对 category 字段建立索引
4. WHEN 系统首次部署时，THE Config_Service SHALL 支持通过初始化脚本将 .env 中的配置迁移到数据库

### Requirement 3: 配置值加密

**User Story:** 作为系统所有者，我希望敏感配置值在数据库中加密存储，以防止数据泄露时暴露密钥。

#### Acceptance Criteria

1. THE Encryption_Module SHALL 使用 Fernet 对称加密算法，基于 JWT_SECRET_KEY 派生加密密钥
2. WHEN 保存 is_secret 为 true 的配置时，THE Config_Service SHALL 使用 Encryption_Module 加密配置值后再写入数据库
3. WHEN 读取 is_secret 为 true 的配置供系统内部使用时，THE Config_Service SHALL 解密配置值
4. WHEN 通过 API 返回 is_secret 为 true 的配置时，THE Config_API SHALL 将值掩码为 "****" 加最后4个字符的格式
5. IF 解密失败，THEN THE Config_Service SHALL 记录错误日志并返回空字符串

### Requirement 4: 配置 Redis 缓存

**User Story:** 作为开发者，我希望配置读取有缓存层，以避免频繁查询数据库影响性能。

#### Acceptance Criteria

1. WHEN Config_Service 读取配置时，THE Config_Service SHALL 优先从 Config_Cache 获取
2. IF Config_Cache 中不存在请求的配置，THEN THE Config_Service SHALL 从数据库读取并写入 Config_Cache
3. THE Config_Cache SHALL 使用 "sys_config:" 前缀和配置键名作为 Redis 键
4. THE Config_Cache SHALL 设置 TTL 为 300 秒
5. WHEN 配置被更新或删除时，THE Config_Service SHALL 立即清除对应的 Config_Cache 条目
6. THE Config_Service SHALL 提供批量加载所有配置到缓存的方法，供系统启动时调用

### Requirement 5: 配置管理 API

**User Story:** 作为管理员，我希望通过 API 管理系统配置，以便前端界面可以进行增删改查操作。

#### Acceptance Criteria

1. THE Config_API SHALL 提供 GET /api/admin/configs 接口，返回所有配置列表（敏感值掩码显示）
2. THE Config_API SHALL 提供 GET /api/admin/configs/{key} 接口，返回单条配置详情（敏感值掩码显示）
3. THE Config_API SHALL 提供 PUT /api/admin/configs/{key} 接口，更新指定配置的值
4. THE Config_API SHALL 提供 POST /api/admin/configs 接口，创建新的配置项
5. THE Config_API SHALL 提供 DELETE /api/admin/configs/{key} 接口，删除指定配置项
6. WHEN 任何配置管理接口被调用时，THE Config_API SHALL 通过 require_admin 依赖验证管理员权限
7. THE Config_API SHALL 支持通过 category 查询参数过滤配置列表

### Requirement 6: 配置变更审计

**User Story:** 作为系统所有者，我希望记录所有配置变更操作，以便追踪问题和安全审计。

#### Acceptance Criteria

1. THE Audit_Log 数据表 SHALL 包含以下字段：id（UUID主键）、admin_user_id（操作人）、config_key（配置键名）、action（操作类型：create/update/delete）、old_value_masked（旧值掩码）、new_value_masked（新值掩码）、created_at
2. WHEN 配置被创建、更新或删除时，THE Config_Service SHALL 写入一条 Audit_Log 记录
3. THE Config_API SHALL 提供 GET /api/admin/configs/audit-log 接口，返回审计日志列表，支持分页
4. WHEN 记录审计日志时，THE Config_Service SHALL 对敏感配置的值进行掩码处理后再记录

### Requirement 7: 系统内部配置读取集成

**User Story:** 作为开发者，我希望现有代码可以透明地从数据库读取配置，以最小化代码改动。

#### Acceptance Criteria

1. THE Config_Service SHALL 提供 get_config(key, default) 异步方法，按优先级返回配置值：Config_Cache → 数据库 → default 参数
2. WHEN 系统启动时，THE Config_Service SHALL 批量加载所有数据库配置到 Config_Cache
3. THE Settings 类 SHALL 保留 .env 中的基础设施配置（database_url、redis_url、jwt_secret_key、jwt_algorithm、app_env、app_host、app_port）
4. THE UnifiedLLMClient SHALL 通过 Config_Service 获取 dmx_api_key 和 dmx_base_url 配置
5. IF 数据库中不存在请求的配置且无默认值，THEN THE Config_Service SHALL 记录警告日志并返回空字符串

### Requirement 8: 前端配置管理界面

**User Story:** 作为管理员，我希望在设置页面中管理系统配置，以便直观地查看和修改 API 密钥等参数。

#### Acceptance Criteria

1. THE Config_UI SHALL 在 /settings/configs 路径下提供配置管理页面
2. THE Config_UI SHALL 按 Config_Category 分组显示所有配置项
3. THE Config_UI SHALL 对 is_secret 为 true 的配置值显示掩码，并提供"显示/隐藏"切换按钮（显示时调用专用接口获取明文）
4. WHEN 管理员修改配置值并提交时，THE Config_UI SHALL 调用 PUT 接口更新配置，并显示操作结果反馈
5. THE Config_UI SHALL 提供"新增配置"表单，包含键名、值、分类、描述、是否敏感等字段
6. THE Config_UI SHALL 提供删除配置的确认对话框，防止误操作
7. WHEN 非管理员用户访问配置管理页面时，THE Config_UI SHALL 显示"权限不足"提示并禁止操作
8. THE Config_UI SHALL 提供审计日志查看区域，展示最近的配置变更记录

### Requirement 9: 配置热更新

**User Story:** 作为管理员，我希望修改配置后无需重启服务即可生效，以减少服务中断。

#### Acceptance Criteria

1. WHEN 配置通过 API 更新后，THE Config_Service SHALL 清除对应的 Config_Cache 条目
2. WHEN 下次系统内部读取该配置时，THE Config_Service SHALL 从数据库获取最新值并重新缓存
3. THE Config_Service SHALL 在缓存 TTL 到期后自动从数据库刷新配置值
