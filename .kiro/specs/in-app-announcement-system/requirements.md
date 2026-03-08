 # Requirements — 站内公告系统

 - **Status**: Approved
 - **Implementation**: Not Started

## Scope

- 站内公告展示：`blocking_modal` / `modal` / `banner`
- 后台投放：草稿、排期、发布、归档
- 用户状态：关闭、已知晓、稍后提醒、版本去重
- 公告中心：支持历史回看

## Decisions

- 仅重要信息允许弹窗
- 公告系统独立于 `alerts` / `admin_notifications`

## Out of Scope

- 邮件 / Telegram / WebSocket 站外推送
- 交易告警规则与 `alerts` 事件通知
- 富媒体、轮播、复杂营销编排

## R1 领域边界

- 公告系统独立于 `alerts` / `admin_notifications`

## R2 展示分级

- 支持 `blocking_modal` / `modal` / `banner`
- 高风险或协议/计费变更才允许 `blocking_modal`

## R3 投放

- V1 支持按 `role`、会员层级、页面上下文投放

## R4 生命周期

- 支持 `draft` / `scheduled` / `published` / `archived`

## R5 用户状态与审计

- 支持关闭、已知晓、确认、点击、展示留痕
- 客服 / 合规可见的用户交互留痕必须保留 append-only 事件链，不能只保留最后状态

## Current Repo Truth

- `frontend/app/(main)/layout.tsx` 当前统一挂载 `OfflineBanner`、`TopNav` 与 `DataSourceBanner`
- `TopNav` 右上角铃铛当前跳转到 `/alerts`，其语义是预警，不是公告
- `frontend/app/(main)/alerts/page.tsx` 是预警规则与触发历史页面
- `frontend/app/(main)/settings/push/page.tsx` 是推送渠道与订阅偏好设置页面
- `frontend/app/(main)/admin/notifications/page.tsx` 是邮件 / Telegram 推送历史页面
- `backend/app/api/admin_notifications.py` 只提供通知历史查询，不是站内公告投放
- `frontend/lib/route-permissions.ts` 当前将 `/admin/*` 默认限制为 `admin`，仅 `/admin/orders` 放宽到 `operator`
- 当前 `(main)` 区域由 `AuthGuard` 保护，因此 V1 公告系统以已登录站内用户为范围，不把匿名访客作为默认必做范围

## Glossary

- **Announcement**：一条站内公告主记录
- **Display_Mode**：公告展示方式，取值为 `blocking_modal` / `modal` / `banner`
- **Announcement_Center**：用户可回看公告历史与已读状态的页面
- **Target_Rule**：投放匹配规则，按角色、会员等级、页面上下文筛选可见用户
- **Delivery_Record**：公告对某用户的展示与交互留痕
- **Strong_Ack**：强确认语义，要求用户显式点击“已知晓/同意/确认”
- **Soft_Dismiss**：普通关闭语义，仅代表用户暂时关闭，不等于已确认
- **Snooze**：稍后提醒语义，在一段时间后允许再次展示
- **Versioned_Announcement**：带版本号的公告，同一公告内容更新时必须提升版本号而不是静默覆盖

## User Stories

- 作为普通用户，我希望只在真正重要时被弹窗打断，而不是被普通运营信息频繁骚扰
- 作为会员用户，我希望与会员权益、计费、套餐变更相关的公告能准确命中，不漏发也不误发
- 作为运营 / 管理员，我希望能够在后台创建、排期、发布、归档公告，并知道实际覆盖到哪些用户
- 作为客服，我希望能查询某用户是否已看见、关闭、确认某公告，以便解释争议
- 作为风控 / 合规，我希望风险提示与协议变更有完整审计链路，能证明何时发布、谁发布、谁确认
- 作为工程，我希望公告系统与 `alerts`、`push settings`、`admin_notifications` 保持边界清晰，避免领域污染

## R6 展示语义与频控

- `blocking_modal` 必须提供显式确认动作，不能只给关闭按钮
- `modal` 必须允许关闭，且可选“查看详情”或“稍后提醒”
- `banner` 必须是非阻断式，不得遮挡主流程核心操作
- 同一用户同一公告版本默认不得重复弹出，除非该公告开启 `Strong_Ack` 且用户尚未确认
- 同一时刻最多允许一个 `blocking_modal` 生效，防止多重阻断
- 当多个普通公告同时命中时，V1 必须按 `priority` 与发布时间稳定排序，而不是随机展示
- V1 不支持基于设备指纹、地域、A/B 实验的复杂频控

## R7 版本化与变更约束

- 已发布公告被修改时必须生成新版本，旧版本不得被静默覆盖
- 用户确认状态必须与公告版本绑定，不能沿用到新版本
- 关闭状态可按产品策略选择是否跨版本继承，V1 默认不继承

## R8 V1 范围与权限

- V1 默认面向 `frontend/app/(main)` 下的已登录用户，不把匿名访客作为默认必做范围
- V1 公告管理后台默认使用 `/admin/*` 权限模型，因此管理入口必须是 `admin-only`
- 若后续允许 `operator` 参与公告投放，必须同步修改前端路由权限与后端依赖，不允许只改单侧
- V1 至少支持按 `role`、`membership_level`、`pathname context` 投放
- `settings/push` 中的渠道偏好不得直接影响站内公告是否展示，两者必须保持独立

## R9 公告中心

- V1 必须提供独立的 `Announcement_Center`，用于回看当前有效公告与近期历史公告
- 公告中心不得复用 `/alerts` 页面，因为该页面当前是真实的预警规则与触发历史
- 公告中心不得复用 `/admin/notifications` 页面，因为该页面当前是真实的站外推送历史
- V1 不要求复用 `TopNav` 当前铃铛入口；该铃铛继续服务预警能力
- 站内必须提供明确可达入口，不能要求用户手输 URL 才能进入公告中心

## R10 后台管理面

- V1 必须提供独立的后台公告管理面，不得把公告配置塞进 `通知历史` 页面
- 后台至少支持列表、筛选、创建草稿、编辑草稿、发布、归档、查看用户确认状态
- 已发布公告若需修改内容，后台必须引导生成新版本而不是原地覆盖

## R11 强确认与合规边界

- `Strong_Ack` 代表有明确确认记录，但不等于真正的授权门禁或协议准入机制
- 若业务需要“未确认不得继续使用系统”的门禁，必须建设独立的 acceptance gate，不能把普通公告弹窗误当授权边界
- 风险提示、计费变化、协议更新类公告必须支持 `confirmed_at`、`confirmed_by_user_id`、`announcement_version` 级别留痕

## R12 Fail-Soft 与可观测性

- 公告服务读取失败时，系统必须降级为“不展示公告但主页面可继续使用”，不得拖垮 `TopNav` 与主内容渲染
- 客户端回写失败不得阻塞用户主流程，但必须记录错误并允许后续重试
- 后台与前台接口必须输出可观测日志，至少覆盖查询失败、发布失败、状态回写失败、目标规则解析失败

## R13 内容渲染安全

- V1 若使用 `content_md`，必须采用白名单渲染或等效清洗策略，防止脚本注入与危险 HTML 透传
