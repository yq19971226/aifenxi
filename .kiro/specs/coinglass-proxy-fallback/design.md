# Design Document — CoinGlass 双通道代理接入设计

## Document Status

- **当前定位**：本设计文档描述 `CoinGlass` REST 双通道的目标结构，并明确当前仓库里的已实现基线与已完成硬化项。
- **已实现基线**：`coinglass_client.py`、`coinglass_tier.py`、`admin_configs.py`、`datasources.py`、`datasource_registry.py`、`celery_app.py`、`sentiment.py` 已存在双通道或相关配套实现。
- **T7 硬化已完成**：分布式全局限频（T7.1）、`/usage/me` 对账闭环（T7.2）、固定 SLA 主动恢复（T7.3）、锁定语义文档化（T7.4）均已落地。

## Overview

在 `CoinGlassClient` 层引入双通道（proxy / official）REST 调用机制，对上层数据模块完全透明。通道级自动 fallback + 定期探测恢复。WebSocket 独立于 REST 通道，固定走官方。

### 当前实现锚点

- `backend/app/data/coinglass_client.py`：双通道、失败计数、probe、日配额本地计数已存在
- `backend/app/data/coinglass_tier.py`：按通道限频 key 已存在
- `backend/app/api/admin_configs.py`：`/api/admin/configs/coinglass/channel` 手动切换与查询已存在
- `backend/app/api/datasources.py`：`/api/admin/datasources/health` 与 `/api/admin/datasources/coinglass/channel` 运行态查询已存在
- `backend/app/data/datasource_registry.py`：`coinglass_rest.base_url` 已标注为运行时动态
- `backend/workers/celery_app.py`：CoinGlass 采集周期已调整为 `3 分钟`

---

## D1. 通道定义

两个通道作为静态配置常量存在于 `coinglass_client.py`：

```
CHANNEL_PROXY:
  base_url:     https://api.alphanode.work
  path_prefix:  /open-api-v4.coinglass.com
  auth_header:  x-key
  key_config:   alphanode_api_key

CHANNEL_OFFICIAL:
  base_url:     https://open-api-v4.coinglass.com
  path_prefix:  (empty)
  auth_header:  CG-API-KEY
  key_config:   coinglass_api_key
```

通道优先级：`proxy > official`（配额 100万/月，3 分钟间隔下安全够用）。

通道可用前提：对应 `key_config` 已配置且非空。

---

## D2. CoinGlassClient 双通道改造

### 现有结构

```
CoinGlassClient
  ├─ __init__(tier_manager)
  ├─ _client: httpx.AsyncClient(base_url=_BASE_URL)
  └─ get(path, endpoint, params) → dict | None
```

### 改造后结构

```
CoinGlassClient
  ├─ __init__(tier_manager)
  ├─ _clients: dict[str, httpx.AsyncClient]   # proxy / official 各一个
  ├─ _channels: dict[str, ChannelConfig]
  ├─ _active_channel: str                      # 当前活跃通道 ID
  ├─ _proxy_throttle: float                    # proxy 通道请求间隔（≥ 1.2s）
  ├─ _last_request_time: float                 # 上次请求时间戳（用于 throttle）
  │
  ├─ get(path, endpoint, params) → dict | None
  │     1. 读取活跃通道（检查是否被运维锁定）
  │     2. 如果活跃通道是 proxy → 检查日配额，超额则降级到 official
  │     3. 如果活跃通道是 proxy → throttle 等待（请求间隔 ≥ 1.2s）
  │     4. 拼接 path_prefix + path
  │     5. 使用通道对应的 auth_header + api_key
  │     6. 请求成功 → Redis INCR 日配额 + 重置失败计数，返回数据
  │     7. 请求失败 → Redis INCR 连续失败计数
  │     8. 连续失败 ≥ N → 尝试 fallback 通道
  │     9. fallback 成功 → 切换活跃通道，写 Redis
  │    10. fallback 也失败 → 返回 None
  │
  ├─ _resolve_channel() → str
  │     从 Redis 读 cg_channel:active，无则按优先级（proxy > official）选择首个有 Key 的通道
  │
  ├─ _switch_channel(new_channel, reason)
  │     更新 _active_channel + 写 Redis + 结构化日志
  │
  ├─ _probe_channel(channel_id) → bool
  │     对目标通道发送轻量探测请求（/api/futures/supported-coins）
  │
  ├─ _check_proxy_quota() → bool
  │     从 Redis 读 proxy 日用量计数，超过日配额上限返回 False
  │     达到 80% (24,000) 时发 warning 日志
  │
  ├─ _throttle_if_proxy()
  │     proxy 通道下 asyncio.sleep 做单实例节流缓冲
  │     official 通道无 throttle
  │
  └─ _is_channel_locked() → bool
        检查 Redis 中是否有运维锁定标记，锁定时禁止自动切换
```

### 当前实现状态

- 上述结构的大部分基线能力已在 `coinglass_client.py` 中存在
- 当前 `_throttle_if_proxy()` 属于 **baseline implemented**，全局限频由 `reserve_rate_slot()` 承担（T7.1 已完成）
- 当前日配额计数属于 **本地估算 + `/usage/me` 供应商对账闭环已完成**（T7.2）

### 连续失败计数（P1 修复）

使用 **Redis 原子计数器**而非实例属性，避免多 worker 进程间计数不共享：

```
cg_channel:failures:{channel} → int（INCR 原子操作，TTL 120s 自动衰减）
```

- 请求成功 → `DEL cg_channel:failures:{channel}`
- 请求失败 → `INCR cg_channel:failures:{channel}` + `EXPIRE 120`
- 计数 ≥ 3 → 触发 fallback

### Fallback 触发条件

- 当前通道 Redis 连续失败计数 ≥ `_MAX_CONSECUTIVE_FAILURES`（3）
- 当前通道 Key 未配置
- proxy 通道日配额耗尽

### 自动恢复

- **request-driven probe**：当 official 为活跃通道且有请求流经 `CoinGlassClient.get()` 时，按 `_PROBE_INTERVAL`（300 秒）重新探测 proxy，切换原因 `probe_recovery`
- **scheduled probe**（T7.3 已落地）：Celery Beat 每 5 分钟触发 `scheduled_probe_proxy()`，切换原因 `scheduled_probe_recovery`，不依赖请求流量
- 探测成功 → 自动切回 proxy（除非运维锁定） + 日志
- 探测失败 → 保持 official + 不影响正常请求
- 探测请求计入 proxy 日配额计数
- 两种探测共享 Redis 锁 `cg_channel:probing`（`SET 1 NX EX 60`），防止多 worker 并发探测

### 冷启动行为

- 首次调用 `_resolve_channel()` 时 Redis 无 `cg_channel:active`
- 直接按优先级选择有 Key 的通道，不做探测（避免首次请求延迟翻倍）
- 选定后写入 Redis，后续请求直接读取

### Redis 故障降级

- 如果 Redis 不可用，`_resolve_channel()` 使用内存缓存的 `_active_channel`
- 如果内存也无，按优先级选择有 Key 的通道
- Redis 恢复后自动同步状态

### Proxy 配额保护（D2.5）

AlphaNode 总配额 1,000,000 次/月。采集间隔调整为 3 分钟，3 币种下日消耗约 25,920 次，30 天安全。

配额保护机制：
- Redis 维护日用量计数器 `cg_proxy_daily:{date}` (TTL 48h)
- 当前实现按 **attempt** 记账（含主请求、探测、重试）
- proxy 主通道的稳定保障范围为 ≤3 个已启用衍生品币种
- 当已启用衍生品币种 >3 时，记录预算风险 warning，并在后台展示风险状态，提示运维切换或锁定 official 通道
- `_PROXY_DAILY_BUDGET = 30000`（保守值，留余量给探测 + 手动查询）
- 日用量超额时，自动降级到 official 通道 + warning 日志
- `/usage/me` 对账闭环已完成（T7.2），供应商真值写入 `cg_proxy_quota_remaining` + `cg_proxy_quota_synced_at`

#### 已完成的预算语义硬化（T7.2）

- 已显式定义：`proxy` 主请求、探测请求、重试请求均按 attempt 计入本地预算
- `/usage/me` 对账闭环已落地，供应商真值写入 `cg_proxy_quota_remaining` + `cg_proxy_quota_synced_at`
- 供应商返回额度与 Redis 本地计数不一致时，记录差异到 `cg_proxy_quota_drift` 并优先信任供应商返回值

### Redis 状态键

```
cg_channel:active          → "proxy" | "official"
cg_channel:switched_at     → Unix timestamp
cg_channel:switch_reason   → 切换原因字符串
cg_channel:failures:{channel} → int（按通道隔离的连续失败计数，TTL 120s）
cg_channel:locked          → "proxy" | "official" | (empty)（运维锁定）
cg_channel:probing         → 1（探测锁，TTL 60s，NX）
cg_proxy_daily:{YYYY-MM-DD} → int（proxy 当日已用次数，TTL 48h，UTC 日期）
cg_proxy_quota_remaining   → int（从 /usage/me 同步的剩余配额）
```

---

## D3. 限频隔离

### 现有限频

```
Redis key: cg_rate:{minute_ts}
```

### 改造后限频

```
Redis key: cg_rate:{channel}:{minute_ts}
```

- `cg_rate:proxy:1709800200` — proxy 通道计数
- `cg_rate:official:1709800200` — official 通道计数

`TierManager` 改造：
- `check_rate_limit()` 和 `increment_rate_counter()` 接受 `channel` 参数
- proxy 通道限频上限独立配置（Standard = 50 次/分）
- 通道切换时不清零计数器（自然过期即可）

### 全局限频保证（T7.1 已完成）

- `TierManager.reserve_rate_slot()` 使用 Redis INCR 原子预留，超限自动 DECR 回退
- proxy 限频耗尽时单次溢出到 official（不切换活跃通道），锁定时不溢出
- 进程内 `_throttle_if_proxy()` 仍保留为单实例平滑缓冲，不承担全局保证语义

### 限频配置

在 `_TIER_CAPABILITIES` 中新增 `proxy_rate_limit_per_minute` 字段，或独立维护一份 proxy 限频映射：

```python
_PROXY_RATE_LIMITS = {
    CoinGlassTier.STANDARD: 50,
}
```

---

## D4. sentiment.py 适配

`sentiment.py` 绕过 `CoinGlassClient`，直连 CoinGlass V2 API 获取恐慌贪婪指数。

### 决策

- V2 API（`open-api.coinglass.com/public/v2/...`）路径与 V4 不同
- 当前实现口径：该接口固定走官方直连，不参与双通道切换
- 如未来要统一到 V4 `index/fear-greed-history`，应作为单独演进项，不应回溯污染本次双通道基线

---

## D5. WebSocket 隔离

- `coinglass_ws.py` 和 `coinglass_adapter.py` 保持不变
- WS URL 固定为 `wss://open-api-v4.coinglass.com/ws`
- WS 鉴权固定使用 `coinglass_api_key` + `CG-API-KEY` header
- REST 通道状态不影响 WebSocket 连接

---

## D6. 管理后台适配

### 配置项

新增 `alphanode_api_key` 到 ConfigService：
- `admin_configs.py` — API Key 验证请求使用 proxy 通道参数
- `datasources.py` — 聚合 CoinGlass 双通道运行态与预算风险信息
- `datasource_registry.py` — REST `base_url` 改为当前活跃通道地址（或保持元数据不变，仅影响运行时）

### 手动通道切换（P2 修复）

新增后台 API：

```
POST /api/admin/configs/coinglass/channel
Body: { "channel": "proxy" | "official", "lock": true | false }
```

- 写 Redis `cg_channel:active` + `cg_channel:locked`
- `lock=true` 时禁止自动 fallback 和自动恢复，直到解锁
- `lock=false` 或不传 lock → 切换后仍允许自动切换

运行态查询口径：

```
GET /api/admin/configs/coinglass/channel
GET /api/admin/datasources/coinglass/channel
```

锁定语义：

- 锁定 `official`：禁止自动恢复到 `proxy`
- 锁定 `proxy`：禁止自动 fallback 到 `official`
- 因此后台必须明确提示锁定 `proxy` 的风险

### 健康检查

```
coinglass_rest 健康检查:
  1. 读取 Redis / registry 中的运行态
  2. 聚合当前活跃通道、失败计数、日用量、锁定状态、预算风险状态
  3. 合成 coinglass_rest 运行态展示
```

后台查询与健康检查都应直接读取 `cg_channel:active`、`cg_channel:switch_reason`、`cg_channel:switched_at`、`cg_channel:locked`，避免展示与运行态不一致。

如果产品后续要求“健康检查 = 主动探测两个 REST 通道”，应新增独立实现，不应把该语义混入当前 baseline。

---

## D7. 改动文件清单

以下文件中多数已存在基线实现；T7 硬化已完成，无需从零重做。

| 文件 | 改动类型 | 说明 |
|---|---|---|
| `coinglass_client.py` | **核心改造** | 双通道 + fallback + probe + Redis 状态已落地，限频/配额硬化已完成（T7.1/T7.2） |
| `coinglass_tier.py` | 限频适配 | 按通道区分限频已落地，全局限频已完成（T7.1 `reserve_rate_slot`） |
| `sentiment.py` | 条件适配 | V2 接口固定走官方直连已落地 |
| `datasource_registry.py` | 元数据 | REST `base_url` 动态标注已落地 |
| `datasources.py` | 健康检查 | 运行态聚合查询已落地 |
| `admin_configs.py` | 配置验证 | `alphanode_api_key` 验证与手动切换已落地 |
| `celery_app.py` | 配置 | CoinGlass 采集间隔 120s → 180s 已落地 |
| `coinglass_ws.py` | **不改** | 固定走官方 |
| `coinglass_adapter.py` | **不改** | 固定走官方 |
| 上层数据模块（10+） | **不改** | 透明，零感知 |

---

## D8. 配置依赖

运行时需要以下配置项（通过 ConfigService / .env）：

| 配置项 | 必需 | 说明 |
|---|---|---|
| `alphanode_api_key` | 否（无则跳过 proxy） | AlphaNode 代理 Key |
| `coinglass_api_key` | 否（无则跳过 official） | CoinGlass 官方 Key |
| `coinglass_tier` | 是 | 当前套餐（影响限频和端点可用性） |

至少一个 Key 必须配置，否则所有 CoinGlass 请求返回 None。

---

## D9. 联合审查补充结论（多视角）

本节记录多视角联合审查后的补充判断，用于解释为什么当前实现工作应聚焦 `T7` 的运行级硬化，而不是重复建设双通道 baseline。

### 产品视角

- `proxy` 默认优先是一项**有预算边界的运行策略**，而不是无条件产品承诺。
- 在当前预算模型下，`proxy` 稳定主通道的安全边界仍是 **≤3 个已启用衍生品币种**。
- “自动恢复”包含两种机制：request-driven probe（有流量时触发）+ scheduled probe（Celery Beat 每 5 分钟触发，T7.3 已落地）。

### 架构视角

- 运行态真相与计费真相必须分离：
  - Redis 承载 `active / locked / failures / probing / daily_usage` 等运行态
  - `/usage/me` 承载供应商额度真值
- 进程内 throttle 只能降低单实例突发，不应承担分布式全局限频保证语义。

### 后端实现视角

- 当前代码基线已经覆盖双通道、fallback、probe、按通道限频、后台切换、运行态聚合等主要能力。
- 运行级硬化（T7.1–T7.4）已完成，双通道基线 + 硬化均已落地。

### 数据治理视角

- 本地预算计数规则必须写死：至少要明确主请求、probe、retry 是否计费，以及按 `attempt` 还是 `success` 记账。
- `/usage/me` 对账闭环已完成（T7.2）；Redis 本地计数为运行时估算，供应商真值优先。

### 运维视角

- `lock official` 与 `lock proxy` 风险不对称：后者可能把可降级故障放大为持续失败。
- 当前 `/api/admin/datasources/health` 的 baseline 语义应明确为“运行态读取 + 聚合”，而不是主动双通道探测。

### QA / 验收视角

- 以下硬化边界场景已有测试覆盖（38 个测试全通过）：
  - 多 worker 全局限频（`test_reserve_rate_slot_concurrent_no_oversell`）
  - `/usage/me` 对账与漂移处理（`test_quota_drift_detection`）
  - 锁定 `proxy` 时的失败语义（`test_lock_proxy_failure_no_fallback`）
  - 定时探测恢复（`test_scheduled_probe_*`）
