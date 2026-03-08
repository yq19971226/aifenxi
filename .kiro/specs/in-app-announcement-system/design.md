 # Design — 站内公告系统

- **Status**: Approved

## Architecture

- `announcements`：公告主数据
- `announcement_deliveries`：用户状态与留痕
- 公告相关表结构在实现阶段以 `backend/migrations/init.sql` 为单一 DDL 真理源，不在 `backend/main.py` 启动期重复建表

- `admin announcement api`：后台管理与发布
- `client announcement api`：前台拉取与回写状态

## Rendering Rules

- `blocking_modal`：需显式确认
- `modal`：可关闭或查看详情
- `banner`：非阻断式轻提醒
- 同一时刻最多只允许一个 `blocking_modal` 生效，多个命中时必须按优先级稳定选择其一

## Delivery State

- 记录 `shown` / `closed` / `snoozed` / `confirmed` / `clicked`

## Integration Points

- 前端运行时挂载点放在 `frontend/app/(main)/layout.tsx`
- 用户侧路由新增独立页面，默认设计为 `/announcements`
- 后台入口新增独立 `admin-only` 页面，默认设计为 `/admin/announcements`
- 后端接口前缀对齐现有风格：`/api/announcements` 与 `/api/admin/announcements`

## Data Model

### `announcements`

- `id`: UUID 主键
- `announcement_key`: 跨版本稳定的逻辑主键
- `version`: 整数版本号，从 `1` 开始递增
- `title`: 公告标题
- `summary`: 公告摘要
- `content_md`: 文本 / Markdown 正文
- `display_mode`: `blocking_modal` / `modal` / `banner`
- `priority`: 整数优先级，数值越大越优先
- `status`: `draft` / `scheduled` / `published` / `archived`
- `strong_ack_required`: 是否要求显式确认
- `allow_snooze`: 是否允许稍后提醒
- `action_text` / `action_href`: 主操作按钮文案与跳转链接，可空
- `target_roles_json`: 目标角色数组
- `target_membership_levels_json`: 目标会员等级数组
- `target_path_prefixes_json`: 目标页面前缀数组
- `starts_at` / `ends_at`: 生效与失效时间，可空
- `scheduled_at` / `published_at` / `archived_at`: 生命周期时间戳
- `created_by` / `published_by`: 创建人与发布人用户 ID
- `created_at` / `updated_at`: 标准时间戳

### `announcement_deliveries`

- `id`: UUID 主键
- `announcement_id`: 公告版本主键
- `announcement_key`: 逻辑公告键
- `announcement_version`: 命中的公告版本
- `user_id`: 用户 ID
- `first_shown_at` / `last_shown_at`: 首次与最近展示时间
- `shown_count`: 展示次数
- `last_event`: `shown` / `closed` / `snoozed` / `clicked` / `confirmed`
- `closed_at` / `clicked_at` / `confirmed_at`: 最近交互时间
- `confirmed_by_user_id`: 强确认动作的用户 ID，默认与 `user_id` 一致
- `snooze_until`: 稍后提醒到期时间，可空
- `last_error`: 最近一次状态回写失败信息，可空
- `created_at` / `updated_at`: 标准时间戳
- 唯一键建议为 `announcement_id + user_id`

### `announcement_delivery_events`

- `id`: UUID 主键
- `announcement_id` / `announcement_key` / `announcement_version` / `user_id`: 事件定位字段
- `event_type`: `shown` / `closed` / `snoozed` / `clicked` / `confirmed`
- `pathname` / `metadata_json`: 事件发生上下文
- `occurred_at` / `created_at`: 事件时间与落库时间
- 该表必须是 append-only，不允许用更新覆盖历史事件

### `announcement_audit_logs`

- `id`: UUID 主键
- `announcement_id` / `announcement_key` / `version`: 公告定位字段
- `action`: `create` / `update_draft` / `schedule` / `unschedule` / `publish` / `archive`
- `actor_user_id`: 操作人用户 ID
- `change_summary_json`: 变更摘要
- `created_at`: 审计时间

## init.sql DDL Shape

### `announcements`

- `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
- `announcement_key VARCHAR(100) NOT NULL`
- `version INTEGER NOT NULL`
- `title VARCHAR(200) NOT NULL`
- `summary TEXT`
- `content_md TEXT NOT NULL`
- `display_mode VARCHAR(20) NOT NULL`
- `priority INTEGER NOT NULL DEFAULT 0`
- `status VARCHAR(20) NOT NULL DEFAULT 'draft'`
- `strong_ack_required BOOLEAN DEFAULT FALSE`
- `allow_snooze BOOLEAN DEFAULT TRUE`
- `action_text VARCHAR(80)` / `action_href VARCHAR(500)`
- `target_roles_json JSONB DEFAULT '[]'`、`target_membership_levels_json JSONB DEFAULT '[]'`、`target_path_prefixes_json JSONB DEFAULT '[]'`
- `starts_at TIMESTAMPTZ`、`ends_at TIMESTAMPTZ`、`scheduled_at TIMESTAMPTZ`、`published_at TIMESTAMPTZ`、`archived_at TIMESTAMPTZ`
- `created_by UUID REFERENCES users(id)`、`published_by UUID REFERENCES users(id)`
- `created_at TIMESTAMPTZ DEFAULT NOW()`、`updated_at TIMESTAMPTZ DEFAULT NOW()`
- 约束至少包含：`UNIQUE (announcement_key, version)`、`CHECK (version >= 1)`、`CHECK (display_mode IN ('blocking_modal', 'modal', 'banner'))`、`CHECK (status IN ('draft', 'scheduled', 'published', 'archived'))`
- 索引至少包含：`(status, published_at DESC)`、`(status, scheduled_at DESC)`
- 需要复用现有 `update_updated_at_column()` 为 `updated_at` 建触发器

### `announcement_deliveries`

- `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
- `announcement_id UUID NOT NULL REFERENCES announcements(id) ON DELETE CASCADE`
- `announcement_key VARCHAR(100) NOT NULL`、`announcement_version INTEGER NOT NULL`
- `user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE`
- `first_shown_at TIMESTAMPTZ`、`last_shown_at TIMESTAMPTZ`
- `shown_count INTEGER NOT NULL DEFAULT 0`
- `last_event VARCHAR(20) NOT NULL`
- `closed_at TIMESTAMPTZ`、`clicked_at TIMESTAMPTZ`、`confirmed_at TIMESTAMPTZ`、`confirmed_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL`、`snooze_until TIMESTAMPTZ`
- `last_error TEXT`
- `created_at TIMESTAMPTZ DEFAULT NOW()`、`updated_at TIMESTAMPTZ DEFAULT NOW()`
- 约束至少包含：`UNIQUE (announcement_id, user_id)`、`CHECK (shown_count >= 0)`、`CHECK (last_event IN ('shown', 'closed', 'snoozed', 'clicked', 'confirmed'))`
- 索引至少包含：`(user_id, updated_at DESC)`、`(announcement_id, confirmed_at DESC)`
- 需要复用现有 `update_updated_at_column()` 为 `updated_at` 建触发器

### `announcement_delivery_events`

- `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
- `announcement_id UUID NOT NULL REFERENCES announcements(id) ON DELETE CASCADE`
- `announcement_key VARCHAR(100) NOT NULL`、`announcement_version INTEGER NOT NULL`
- `user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE`
- `event_type VARCHAR(20) NOT NULL`
- `pathname VARCHAR(500)`
- `metadata_json JSONB DEFAULT '{}'`
- `occurred_at TIMESTAMPTZ NOT NULL`
- `created_at TIMESTAMPTZ DEFAULT NOW()`
- 约束至少包含：`CHECK (event_type IN ('shown', 'closed', 'snoozed', 'clicked', 'confirmed'))`
- 索引至少包含：`(announcement_id, user_id, occurred_at DESC)`、`(user_id, created_at DESC)`
- 该表为 append-only 表，不设计 `updated_at`，也不挂更新触发器

### `announcement_audit_logs`

- `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
- `announcement_id UUID REFERENCES announcements(id) ON DELETE SET NULL`
- `announcement_key VARCHAR(100) NOT NULL`、`version INTEGER NOT NULL`
- `action VARCHAR(20) NOT NULL`
- `actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL`
- `change_summary_json JSONB DEFAULT '{}'`
- `created_at TIMESTAMPTZ DEFAULT NOW()`
- 约束至少包含：`CHECK (action IN ('create', 'update_draft', 'schedule', 'unschedule', 'publish', 'archive'))`
- 索引至少包含：`(announcement_key, version, created_at DESC)`、`(actor_user_id, created_at DESC)`
- 审计表只追加不回写，不设计 `updated_at`

## State Machine

- 公告生命周期：`draft -> scheduled -> published -> archived`
- `draft` 允许编辑，不允许产生用户侧 delivery
- `scheduled` 允许撤回到 `draft`，到达排期时间后进入 `published`
- `published` 只允许归档；若内容变更，必须创建新版本并重新发布
- 用户交互状态：`shown -> closed|snoozed|clicked|confirmed`
- `confirmed` 是终态；`closed` 与 `snoozed` 可在后续再次进入 `shown`
- V1 默认不跨版本继承 `closed` 状态；公告升级版本后应重新按新版本判定是否展示

## API Contract

### Client API

- `GET /api/announcements/active?pathname=/dashboard`：返回当前用户在该页面上下文下命中的有效公告列表
- `GET /api/announcements/history?page=1&page_size=20`：返回公告中心所需的历史列表
- `POST /api/announcements/{announcement_id}/events`：回写 `shown` / `closed` / `snoozed` / `clicked` / `confirmed`

### Admin API

- `GET /api/admin/announcements`：分页查询公告列表，支持 `status` / `display_mode` / `search` 过滤
- `POST /api/admin/announcements`：创建草稿
- `PUT /api/admin/announcements/{id}`：编辑草稿或创建新版本草稿
- `POST /api/admin/announcements/{id}/schedule`：设置排期发布时间
- `POST /api/admin/announcements/{id}/unschedule`：撤销排期并回到草稿态
- `POST /api/admin/announcements/{id}/publish`：发布指定草稿版本
- `POST /api/admin/announcements/{id}/archive`：归档已发布版本
- `GET /api/admin/announcements/{id}/deliveries`：分页查询用户留痕与确认状态

### Schema Notes

- `active` 响应项至少包含：`id`、`announcement_key`、`version`、`title`、`summary`、`content_md`、`display_mode`、`priority`、`strong_ack_required`、`allow_snooze`、`action_text`、`action_href`
- `history` 响应项至少包含：`id`、`announcement_key`、`version`、`title`、`summary`、`display_mode`、`published_at`、`last_event`、`confirmed_at`
- `events` 请求体至少包含：`event_type`、`pathname`、`occurred_at`，当 `event_type=snoozed` 时可额外带 `snooze_until`
- 后台创建 / 编辑请求体至少包含：标题、正文、展示类型、优先级、目标规则、时间窗口、强确认配置
- `content_md` 在输出到前端前必须经过白名单清洗或等效安全渲染

## Fail-Soft And Observability

- 前端读取失败时返回空公告列表，不阻断 `(main)` 布局与页面内容渲染
- 事件回写失败时只影响留痕完整度，不影响用户继续操作
- 后台发布前必须校验目标规则、时间窗口与 `display_mode` 约束，失败时返回明确错误
- 关键日志至少覆盖：目标筛选失败、公告查询失败、状态回写失败、发布失败、归档失败
