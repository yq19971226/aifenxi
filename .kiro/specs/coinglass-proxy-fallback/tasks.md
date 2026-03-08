# Tasks — CoinGlass 双通道代理接入

## Execution Gate

- `Status = Done`（T1–T7 全部完成，可进入归档）
- 前置条件：用户已跑 AlphaNode 测试脚本确认端点可用性
- AlphaNode Key 已到手
- WebSocket 确认不支持，REST only
- 当前仓库已存在双通道 baseline + T7 硬化完成

---

## T1 已完成基线能力

### Task T1.1 — CoinGlassClient 双通道基线
- **Owner**: Backend
- **File**: `backend/app/data/coinglass_client.py`
- [x] 定义 `ChannelConfig` 数据结构（base_url / path_prefix / auth_header / key_config）
- [x] 预置 `CHANNEL_PROXY` 和 `CHANNEL_OFFICIAL` 两套配置
- [x] 为每个通道创建独立的 `httpx.AsyncClient` 实例
- [x] 将现有 `_BASE_URL` / `CG-API-KEY` 硬编码替换为通道配置驱动
- [x] 实现 `_throttle_if_proxy()` 作为单实例节流缓冲
- **Exit Criteria**: 双通道 baseline 已存在，但 throttle 仍不应被视为跨 worker 全局限频保证

### Task T1.2 — Fallback / Redis 运行态基线
- **Owner**: Backend
- **File**: `backend/app/data/coinglass_client.py`
- [x] 实现 `_resolve_channel()`：从 Redis 读 `cg_channel:active`，无则按优先级（proxy > official）选择首个有 Key 的通道
- [x] 连续失败计数改用 Redis 原子计数器 `cg_channel:failures:{channel}`（INCR + TTL 120s）
- [x] 请求成功 → `DEL cg_channel:failures:{channel}`；失败 → `INCR cg_channel:failures:{channel}` + `EXPIRE 120`
- [x] 计数 ≥ 3 → 尝试 fallback 通道，成功则切换
- [x] 实现 `_switch_channel(new_channel, reason)`：更新 Redis 状态键 + 结构化日志（不含 Key 原文）
- [x] 实现 `_is_channel_locked()`：检查 Redis 运维锁定标记
- [x] 冷启动：Redis 无 `cg_channel:active` 时直接按优先级选通道，不探测
- [x] Redis 故障降级：Redis 不可用时使用内存缓存的 `_active_channel`
- **Exit Criteria**: request-driven fallback baseline 已存在

### Task T1.3 — 自动恢复 baseline
- **Owner**: Backend
- **File**: `backend/app/data/coinglass_client.py`
- [x] 当 official 为活跃通道时，按 300 秒间隔做 request-driven proxy 探测
- [x] 探测成功 → 自动切回 proxy（除非运维锁定） + 日志
- [x] 探测失败 → 保持 official + 不影响正常请求
- [x] 探测请求计入 proxy 日配额计数
- [x] Redis 探测锁防止多 worker 并发探测（`SET cg_channel:probing 1 NX EX 60`）
- **Exit Criteria**: request-driven auto-recovery baseline 已存在；固定时间 SLA 已由 T7.3 scheduled probe 落地

---

## T2 已完成配套能力

### Task T2.1 — 按通道区分限频 baseline
- **Owner**: Backend
- **File**: `backend/app/data/coinglass_tier.py`
- [x] Redis key 从 `cg_rate:{minute_ts}` 改为 `cg_rate:{channel}:{minute_ts}`
- [x] `check_rate_limit()` 和 `increment_rate_counter()` 接受 `channel` 参数
- [x] 新增 proxy 限频映射（Standard = 50 次/分）
- [x] `CoinGlassClient.get()` 传入当前活跃通道到限频检查
- **Exit Criteria**: 两个通道限频计数互不干扰；全局限频已由 T7.1 `reserve_rate_slot` 落地

### Task T2.2 — Proxy 日配额保护 baseline
- **Owner**: Backend
- **File**: `backend/app/data/coinglass_client.py`
- [x] Redis 维护 `cg_proxy_daily:{YYYY-MM-DD}` 日用量计数器（TTL 48h，**UTC 日期**）
- [x] 每次 proxy 请求成功后 `INCR` 计数（含探测请求）
- [x] `_PROXY_DAILY_BUDGET = 30000`（100万/月的保守值，留余量给探测）
- [x] 日用量达到 80%（24,000）时发 warning 日志告警
- [x] 当已启用衍生品币种 >3 时，标记预算风险状态并发出 warning，提示运维切换或锁定 official 通道
- [x] `get()` 在 proxy 通道下检查日配额，超额则自动降级到 official + warning 日志
- [x] 实现定期或按需调用 `/usage/me` 同步真实剩余配额，用于对账 Redis 计数（由 T7.2 完成）
- **Exit Criteria**: baseline 本地预算保护 + 供应商对账闭环均已完成

---

## T3 已完成管理与兼容能力

### Task T3.1 — sentiment.py V2 兼容决策
- **Owner**: Backend
- **File**: `backend/app/data/sentiment.py`
- [x] 明确该接口固定走官方直连，header 保持 `CG-API-KEY`，不参与通道切换
- [x] 通过 docstring 同步说明 V2 API 不走 AlphaNode
- ℹ️ 未来演进：如需统一到 V4 `index/fear-greed-history`，作为单独演进项处理
- **Exit Criteria**: 恐慌贪婪指数采集正常工作，不因通道切换中断

---

## T4 管理后台与配置 baseline

### Task T4.1 — 新增 alphanode_api_key 配置项
- **Owner**: Backend
- **File**: `backend/app/api/admin_configs.py`
- [x] 新增 `alphanode_api_key` 连接测试支持
- [x] 新增 API Key 验证逻辑（向 proxy 通道发送探测请求）
- **Exit Criteria**: 后台可设置和验证 AlphaNode Key

### Task T4.2 — 健康检查运行态聚合
- **Owner**: Backend
- **File**: `backend/app/api/datasources.py`
- [x] 返回结果标明当前活跃通道、最近切换原因、最近切换时间、锁定状态、预算风险状态
- [x] 当已启用衍生品币种 >3 时，在健康检查结果中标记预算风险
- [x] spec 已明确 `health` 当前是“读取运行态 + 聚合”；若要求主动探测，则补独立实现
- **Exit Criteria**: 管理员可查看当前运行态元数据；主动双通道探测若需要则作为增量能力实现

### Task T4.3 — 数据源注册表元数据更新
- **Owner**: Backend
- **File**: `backend/app/data/datasource_registry.py`
- [x] `coinglass_rest` 的 `base_url` 更新为反映双通道（标注为"运行时动态"）
- **Exit Criteria**: 注册表元数据与实际运行行为一致

### Task T4.4 — 手动通道切换 API（P2 修复）
- **Owner**: Backend
- **File**: `backend/app/api/admin_configs.py`
- [x] 新增 `POST /api/admin/configs/coinglass/channel` 端点
- [x] 参数：`channel` (proxy/official) + `lock` (true/false)
- [x] 写 Redis `cg_channel:active` + `cg_channel:locked`
- [x] `lock=true` 时禁止自动 fallback 和自动恢复
- [x] spec 已明确“锁 proxy”与“锁 official”的不同风险语义
- [x] 后台显式风险提示 `lock_risk_warning` 已暴露到 admin_configs + datasources API（由 T7.4 完成）
- **Exit Criteria**: 运维可不重启服务切换 + 锁定通道；风险提示已落地

---

## T5 测试基线与剩余补测

### Task T5.1 — 单元测试 baseline
- **Owner**: Backend
- [x] 已存在 `backend/tests/test_coinglass_dual_channel.py`
- [x] 已覆盖通道选择、fallback、失败计数隔离、自动恢复、运维锁定、日配额保护、throttle、限频隔离、冷启动、Redis 故障、双超时等基线场景
- [x] 补测并发/多 worker 下的全局限频正确性（test_reserve_rate_slot_concurrent_no_oversell）
- [x] 补测 `/usage/me` 对账与本地计数漂移处理（test_quota_drift_detection）
- [x] 补测锁定 `proxy` 时的失败语义（test_lock_proxy_failure_no_fallback）
- ℹ️ 无流量场景已由 T7.3 scheduled probe 覆盖，request-driven probe 边界为设计隐式保证
- **Exit Criteria**: baseline + 硬化边界场景全覆盖

### Task T5.2 — 集成验证
- **Owner**: Backend
- [x] py_compile 全部修改文件（已通过）
- [x] pytest 回归（`backend/tests/test_coinglass_dual_channel.py` 38 passed；`backend/tests/test_capability_state.py` 6 passed）
- ℹ️ 手动验证（配置 AlphaNode Key → 请求走 proxy → 拔掉 Key → 降级到 official）沿用用户已确认的前置链路；自动切换语义由回归测试覆盖
- **Exit Criteria**: 无编译错误、回归测试全通过、前置链路与自动切换语义均已确认

---

## 不改动文件确认

以下文件在双通道基线改造中**不需要修改**（`coinglass_worker.py` 由 T7.3 新增任务）：

- `coinglass_ws.py` — WebSocket 固定走官方
- `coinglass_adapter.py` — WebSocket 适配器固定走官方
- `coinglass_oi.py` — 上层数据模块，透明
- `coinglass_flow.py` — 上层数据模块，透明
- `coinglass_taker.py` — 上层数据模块，透明
- `coinglass_heatmap.py` — 上层数据模块，透明
- `coinglass_orderbook.py` — 上层数据模块，透明
- `coinglass_options.py` — 上层数据模块，透明
- `coinglass_worker.py` — T7.3 新增了 `probe_proxy_recovery` Celery 任务

---

## T6 采集间隔调整

### Task T6.1 — CoinGlass 采集周期 2分钟 → 3分钟
- **Owner**: Backend
- **File**: `backend/workers/celery_app.py`
- [x] `collect-coinglass-every-2min` 的 `schedule` 从 `120.0` 改为 `180.0`
- [x] 重命名 task 注释为 `collect-coinglass-every-3min`
- **Exit Criteria**: Celery Beat 每 3 分钟触发一次 CoinGlass 采集
- 所有 agents — 不涉及
- 前端 — 不涉及

---

## T7 P0/P1 硬化工作（已完成）

### Task T7.1 — 分布式全局限频保证
- **Owner**: Backend
- **File**: `backend/app/data/coinglass_client.py`, `backend/app/data/coinglass_tier.py`
- [x] 设计并实现跨 worker 协调的 proxy 全局限频机制（Redis 原子预留 / token bucket / 等价方案）
- [x] 不再把实例内 `_throttle_if_proxy()` 作为全局 50 次/分保证
- [x] proxy 限频耗尽时单次溢出到 official（不切换活跃通道），锁定时不溢出
- **Exit Criteria**: 多 worker 并发下仍可严格控制 proxy 全局请求速率

### Task T7.2 — `/usage/me` 对账闭环
- **Owner**: Backend
- **File**: `backend/app/data/coinglass_client.py`（或等价调度位置）
- [x] 明确本地预算计数规则：按 attempt 记账（含主请求 / probe / retry）
- [x] 实现定期或按需调用 `/usage/me` 写入 `cg_proxy_quota_remaining`
- [x] 记录 Redis 本地计数与供应商真值的差异（`cg_proxy_quota_drift`）
- [x] 月度配额判断优先参考供应商返回值（`_check_proxy_quota` 先查 synced_at 新鲜度）
- **Exit Criteria**: 本地预算估算与供应商额度形成稳定对账闭环

### Task T7.3 — 自动恢复 SLA 语义收口
- **Owner**: Backend
- **File**: `backend/app/data/coinglass_client.py`, `backend/workers/coinglass_worker.py`, `backend/workers/celery_app.py`
- [x] spec 已明确当前 request-driven probe 的 SLA 表述
- [x] 新增独立主动探测任务 `scheduled_probe_proxy()`，由 Celery Beat 每 5 分钟触发
- [x] 切换原因使用 `scheduled_probe_recovery`，与 request-driven `probe_recovery` 语义分离
- [x] 复用 `cg_channel:probing` 分布式锁防多 worker 重复探测
- [x] 尊重 lock 语义：锁定时跳过切换
- **Exit Criteria**: 成功标准与实现机制一致，不再混写

### Task T7.4 — 锁定语义与健康检查口径收口
- **Owner**: Backend
- **File**: `backend/app/api/admin_configs.py`, `backend/app/api/datasources.py`
- [x] spec 已明确锁定 `proxy` 与锁定 `official` 的差异语义
- [x] spec 已明确 `/api/admin/datasources/health` 当前是“运行态读取”而非“主动双通道探测”
- [x] 锁定风险提示 `lock_risk_warning` 已暴露到 admin_configs + datasources API
- **Exit Criteria**: spec 与后台状态语义一致；如产品需要更强显式提示，再做增量实现
