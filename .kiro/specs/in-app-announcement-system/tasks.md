 # Tasks — 站内公告系统

- **Status**: Done

## P0 数据与接口

- [x] 公告相关表结构以 `backend/migrations/init.sql` 为单一 DDL 真理源，不在 `backend/main.py` 启动期重复建表，也不为同一结构再新增独立 migration
- [x] 新增 `announcements` 数据结构，至少覆盖 `announcement_key`、`version`、`status`、`title`、`summary`、`content_md`、`display_mode`、`priority`、`target_roles_json`、`target_membership_levels_json`、`target_path_prefixes_json`、`strong_ack_required`、`allow_snooze`、`action_text`、`action_href`、`starts_at`、`ends_at`、`scheduled_at`、`published_at`、`archived_at`、`created_by`、`published_by`、`created_at`、`updated_at`
- [x] 新增 `announcement_deliveries` 数据结构，维护每用户每公告版本汇总态，包含 `confirmed_by_user_id` 留痕，并对 `announcement_id + user_id` 建立唯一约束
- [x] 新增 `announcement_delivery_events` append-only 事件表，记录 `shown` / `closed` / `snoozed` / `clicked` / `confirmed`、`pathname`、`metadata_json`、`occurred_at`
- [x] 新增 `announcement_audit_logs` 数据结构，记录 `create` / `update_draft` / `schedule` / `unschedule` / `publish` / `archive` 审计动作
- [x] 为 `announcement_key + version`、`status + published_at`、`status + scheduled_at`、`announcement_id + user_id`、`user_id + updated_at`、`announcement_id + confirmed_at`、`announcement_id + user_id + occurred_at`、`user_id + created_at`、`announcement_key + version + created_at`、`actor_user_id + created_at` 建立索引 / 唯一约束
- [x] 为 `announcements` 与 `announcement_deliveries` 复用现有 `update_updated_at_column()` 触发器，保持 `updated_at` 自动更新时间
- [x] 新增用户端 router（参考 `backend/app/api/tasks.py`）：`GET /api/announcements/active`、`GET /api/announcements/history`、`POST /api/announcements/{id}/events`，统一使用 `get_current_user` 与 `get_db`
- [x] 新增后台 router：`GET /api/admin/announcements`、创建、编辑、`schedule`、`unschedule`、`publish`、`archive`、`deliveries`，统一使用 `require_admin` 与 `get_db`
- [x] 新增 feature service（参考 `backend/app/services/push_service.py`）封装命中计算、历史分页、事件追加写入、delivery 汇总更新、后台状态流转校验
- [x] 在 router 文件内补齐请求 / 响应模型与 `HTTPException` 映射，保证参数校验与错误语义可被前端直接消费
- [x] 在 `backend/main.py` 注册公告 user/admin routers，避免只完成文件实现但未接入主应用
- [x] 新增前端 `frontend/lib/api/announcements.ts`，沿用 `authFetch` 模式封装 `fetchActiveAnnouncements`、`fetchAnnouncementHistory`、`postAnnouncementEvent`
- [x] 完成 P0 最小验收链路：管理员可创建草稿并发布单条 banner；登录用户可拉取 `active`；`shown` / `confirmed` 能同时写入 delivery 汇总和 append-only 事件链

## P1 后台投放

- [x] 提供后台列表筛选：`status`、`display_mode`、关键词、发布时间区间
- [x] 提供草稿创建与草稿编辑，并在发布前校验目标规则、时间窗口、`display_mode` 分级与强确认约束
- [x] 支持排期发布与手动发布
- [x] 支持已发布版本归档，以及"修改已发布内容时自动生成新版本草稿"
- [x] 提供按用户查看 delivery / confirmation 留痕的后台视图

## P2 前台展示

- [x] 在 `frontend/app/(main)/layout.tsx` 挂载公告读取与渲染容器
- [x] 落地 `blocking_modal` / `modal` / `banner` 三类组件与排序规则，并确保同一时刻最多只展示一个 `blocking_modal`
- [x] 新增独立公告中心页面，支持历史回看与分页
- [x] 在受保护主站内提供公告中心可达入口，避免只能手输 URL 访问
- [x] 实现 `shown` / `closed` / `snoozed` / `clicked` / `confirmed` 回写
- [x] 落实版本去重、强确认、稍后提醒与 fail-soft 行为，并确保 V1 默认不跨版本继承 `closed` 状态
- [x] 为 `content_md` 落实白名单清洗或等效安全渲染

## P3 验证与归档

- [x] 验证 `draft -> scheduled -> published -> archived` 生命周期约束
- [x] 验证 append-only 事件链、delivery 查询与客服 / 合规追溯能力
- [x] 验证公告中心可达入口与 `content_md` 安全渲染约束
- [x] 验证读取失败与事件回写失败时的 fail-soft 行为，以及关键错误日志 / 可观测性输出
