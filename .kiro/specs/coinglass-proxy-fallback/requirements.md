# Requirements Document — CoinGlass 双通道代理接入

## Document Status

- **当前定位**：本文件是 `CoinGlass` REST 双通道方案的需求真相源，涵盖基线能力与 T7 硬化。
- **实现状态**：`coinglass_client.py`、`coinglass_tier.py`、`admin_configs.py`、`datasources.py`、`datasource_registry.py`、`celery_app.py`、`coinglass_worker.py`、`sentiment.py`。双通道基线（T1–T6）与运行级硬化（T7.1–T7.4）均已完成。
- **归档状态**：`Done`。以下需求条款既是设计原则，也是已落地约束。

## Introduction

本规范定义 CoinGlass 数据源从官方直连切换为 **AlphaNode 代理优先 + 官方直连 fallback** 的双通道架构。目标是提高数据获取稳定性，同时保留官方通道作为兜底。

## Scope

覆盖：REST API 双通道切换、限频适配、配额保护、健康探测、配置管理、运行态可观测性、WebSocket 通道隔离。

不覆盖：新增 CoinGlass 数据端点、前端 UI 改造、大规模数据模型重构。

---

## 背景事实（2026-03-07 测试验证）

| 维度 | CoinGlass 官方 | AlphaNode 代理 |
|---|---|---|
| REST Base URL | `https://open-api-v4.coinglass.com` | `https://api.alphanode.work` |
| Auth Header | `CG-API-KEY` | `x-key` |
| Path 结构 | `/api/futures/...` | `/open-api-v4.coinglass.com/api/futures/...` |
| WebSocket | `wss://open-api-v4.coinglass.com/ws` | 不支持 |
| Standard 限频 | 300 次/分 | 50 次/分 |
| **总配额** | 无月度上限 | **1,000,000 次/月（≈33,333 次/天）** |
| 用量查询 | 无 | `/usage/me` |
| API Key | CoinGlass 官方 Key | AlphaNode 独立 Key |

### 配额预算分析

每个币种每轮采集约 **18 次 API 调用**。采集间隔从 2 分钟调整为 **3 分钟**。

| 场景 | 日消耗 | 100万配额可撑 |
|---|---|---|
| 3 币种 × 每 3 分钟 | 54×480 = 25,920/天 | **38.6 天** ✅ |
| 4 币种 × 每 3 分钟 | 72×480 = 34,560/天 | 28.9 天 ⚠️ |
| 5 币种 × 每 3 分钟 | 90×480 = 43,200/天 | 23.1 天 ❌ |

**结论：proxy 作为默认主通道的稳定保障范围为 ≤3 个已启用衍生品币种。**
**当已启用衍生品币种 >3 时，系统必须发出预算风险告警，并由运维切换或锁定 official 通道。**

---

## Requirement R1: REST 双通道必须透明

- `CoinGlassClient` 必须支持两个 REST 通道（proxy / official）
- 通道切换对上层调用方（`coinglass_oi.py`、`coinglass_flow.py` 等）完全透明
- 上层调用方不得感知通道差异，不得修改调用签名
- 新增配置项 `alphanode_api_key` 用于代理平台鉴权

## Requirement R2: Fallback 策略必须自动

- **默认优先使用 proxy 通道**（配额 100万/月，3 分钟间隔下安全够用）
- proxy 通道不可用（Key 未配置 / 连续失败 / 超时 / 日配额耗尽）时自动降级到 official 通道
- 降级到 official 后必须定期重新探测 proxy 可用性，恢复则自动切回
- proxy 日配额保护必须启用（见 R8），避免超额使用
- 通道状态必须持久化到 Redis，避免每次请求都探测
- 连续失败计数必须按通道独立持久化（`cg_channel:failures:{channel}`），不得共享计数器
- 两个通道的 Key 均未配置时，行为与当前单通道无 Key 一致（返回 None）
- 自动恢复包含两种机制：**request-driven probe**（由业务请求流量触发，切换原因 `probe_recovery`）和 **scheduled probe**（由 Celery Beat 每 5 分钟触发，切换原因 `scheduled_probe_recovery`，T7.3 已落地）。两者共享 `cg_channel:probing` 分布式锁。

## Requirement R3: 限频必须按通道区分

- proxy 通道使用 proxy 限频（Standard: 50 次/分）
- official 通道使用官方限频（Standard: 300 次/分）
- 通道切换时限频计数器必须隔离，不得混用
- **突发限频问题（P0）**：单轮采集 3 币种 × 18 次 = 54 次，如果在 1 分钟内完成会超过 proxy 的 50 次/分限频
- 必须在 proxy 通道下对请求加入 throttle（请求间隔 ≥ 1.2秒），确保单分钟不超 50 次
- **P0 补强**：进程内 throttle 只能作为单实例缓冲，**不得**被表述为多 worker / 并发场景下的全局限频保证
- 生产级 proxy 限频保证 SHALL 通过 Redis 原子预留、令牌桶或等价的跨 worker 协调机制实现，而不是仅依赖实例内 `_last_request_time`

## Requirement R4: WebSocket 不受影响

- AlphaNode 不支持 WebSocket
- `coinglass_ws.py` 和 `coinglass_adapter.py` 保持走官方直连
- WebSocket 使用原有 `coinglass_api_key`，与 REST 通道选择完全独立
- 不得因 REST 通道切换影响 WebSocket 连接

## Requirement R5: sentiment.py 独立调用必须同步适配

- `sentiment.py` 中绕过 `CoinGlassClient` 直连 CoinGlass 的恐慌贪婪指数接口必须同步适配
- 注意：当前使用 V2 API（`open-api.coinglass.com`），与 V4 代理路径不同
- 如果 AlphaNode 不代理 V2 API，该接口固定走官方直连

## Requirement R6: 管理后台必须支持双 Key 配置

- 后台配置页必须支持 `alphanode_api_key` 的设置与验证
- 管理后台必须能查询双通道运行态（当前活跃通道、切换原因、切换时间、锁定状态、预算风险等）
- 若产品将“健康检查”定义为主动探测 proxy / official 两个 REST 通道，则该能力必须作为独立实现项明确落地，不得与当前运行态读取语义混写
- 数据源状态展示必须标明当前活跃通道

## Requirement R7: 可观测性

- 通道切换事件必须记录结构化日志
- 后台接口 / 数据源健康检查必须可查询当前活跃通道、最近切换原因、最近切换时间和锁定状态
- proxy 连续失败计数、fallback 触发次数必须可监控
- 日志中不得包含 API Key 原文，仅记录通道 ID + 切换原因 + 时间戳
- 运行态状态语义必须至少区分：`fallback_active`、`budget_risk`、`quota_warning`、`quota_exceeded`、`channel_locked`

---

## Requirement R8: Proxy 通道配额保护

- AlphaNode 总配额为 **1,000,000 次/月**（≈33,333 次/天）
- 采集间隔调整为 **3 分钟**，3 币种下日消耗约 25,920 次，30 天安全
- proxy 主通道的稳定保障范围为 ≤3 个已启用衍生品币种
- 当已启用衍生品币种 >3 时，系统必须发出预算风险告警，并提示运维切换或锁定 official 通道
- 必须在 Redis 中维护 proxy 日用量计数器，接近日配额上限时自动降级到 official
- 日配额上限建议 30,000 次（保守值，留余量给探测 + 手动查询）
- 日用量达到 80%（24,000 次）时必须发出 warning 日志告警
- 探测请求也计入日配额计数（避免配额泄漏）
- 必须支持通过 `/usage/me` 端点定期或按需查询剩余配额并记录，用于对账 Redis 计数
- 日配额日期统一使用 **UTC** 时区，避免跨时区不一致
- CoinGlass 采集周期从 2 分钟调整为 3 分钟（修改 celery_app.py beat_schedule）
- **已落地口径**：系统按 **attempt** 记账，proxy 主请求、探测请求、重试请求均计入本地预算（`_incr_proxy_daily_usage` docstring 已写死）
- `/usage/me` 对账闭环已完成（T7.2）：供应商真值写入 `cg_proxy_quota_remaining` + `cg_proxy_quota_synced_at`；漂移记录到 `cg_proxy_quota_drift`
- 月度配额判断优先参考供应商返回值（`_check_proxy_quota` 先查 `synced_at` 新鲜度，1 小时内视为新鲜）

## Requirement R9: 运维手动干预

- 管理后台必须支持手动切换活跃通道（不重启服务）
- 手动切换后可选“锁定”模式：禁止自动切回，直到运维解锁
- 用于应对：proxy 计费异常、AlphaNode 维护等紧急场景
- 锁定语义必须明确：锁定 `official` 时禁止自动恢复到 `proxy`；锁定 `proxy` 时也禁止自动 fallback 到 `official`
- 管理后台文案 SHALL 明示“锁定 `proxy` 可能在 proxy 故障时继续失败，直到运维手动解锁或切换”

---

## Requirement R10: 当前实现与目标状态必须区分

- 文档 SHALL 明确区分“已落地基线能力”与“已完成硬化能力”
- `tasks.md` 和 `implementation-prompts.md` 不得把已完成能力描述为待开发项
- 进程内 throttle（`_throttle_if_proxy`）仍为单实例平滑缓冲，全局限频保证由 `reserve_rate_slot()` 承担（T7.1 已落地）

---

## 联合审查补充结论（多视角）

> 以下为实施前联合审查结论（历史记录），所述缺口均已由 T7.1–T7.4 落地。

- **审查裁决**：本 spec 包状态为 `Done`（T1–T7 全部完成）。
- **产品结论**：`proxy` 作为默认主通道是有边界的运行策略，而不是无条件承诺；当前安全预算边界仍是 **≤3 个已启用衍生品币种**。
- **架构结论**：系统存在两类真相源：Redis 中的通道运行态真相，以及供应商 `/usage/me` 返回的计费真相；已通过 T7.2 对账闭环桥接。
- **后端结论**：运行级硬化（T7.1 全局限频、T7.2 对账、T7.3 定时恢复、T7.4 锁定语义）已完成，无需再做基线重建。
- **运维结论**：`lock official` 与 `lock proxy` 的风险不对称，其中锁定 `proxy` 可能把可降级故障转化为持续失败，后台已显式提示（`lock_risk_warning`）。
- **QA 结论**：多 worker 全局限频、`/usage/me` 对账漂移、锁定 `proxy` 失败语义、定时恢复等边界场景已有测试覆盖（38 个测试全通过）。
- **执行优先级**：T7 P0/P1 硬化已完成。后续如需增强（如主动双通道健康检查、告警推送），作为独立演进项处理。

---

## Success Criteria

- proxy 通道正常时，所有 REST 请求走 proxy
- proxy 不可用时，系统在请求流经路径上可自动切换到 official，无人工干预
- proxy 恢复后系统可自动切回：request-driven probe（有请求流量时触发）+ scheduled probe（Celery Beat 每 5 分钟触发，T7.3 已落地）
- proxy 日调用量不超过 30,000 次
- proxy 单分钟请求不超过 50 次（最终以跨 worker 协调的全局限频机制保证，而不是仅靠单实例 throttle）
- 当已启用衍生品币种 >3 时，后台展示预算风险告警，并支持运维切换或锁定 official 通道
- 采集间隔从 2 分钟调整为 3 分钟
- 上层数据模块零改动
- WebSocket 不受影响
- 限频和配额均不超标
- 运维可手动切换 + 锁定通道
