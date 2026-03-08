# CoinGlass 双通道代理接入 — AI 程序员实施提示词

> **归档状态：历史记录**。Prompt 1–4 已全部执行完毕（T7.1–T7.4），以下内容保留为实施过程记录，不再作为活跃任务。

> ✅ Prompt 1–4 已全部执行完毕，对应 T7.1–T7.4 硬化任务。以下提示词保留为实施过程的历史记录。

---

## Prompt 1 — 分布式全局限频硬化（T7.1）

```
## 任务

不要重做双通道 baseline。当前 `backend/app/data/coinglass_client.py` 与 `backend/app/data/coinglass_tier.py` 已支持：

- proxy / official 双通道
- 按通道 Redis rate key
- request-driven fallback / probe
- 实例内 `_throttle_if_proxy()`

本次仅做 **proxy 全局 50 req/min 的跨 worker 硬化**。

完整设计规格在 `.kiro/specs/coinglass-proxy-fallback/design.md`，务必通读后再动手。

---

### 一、目标

- 保留现有 `get(path, endpoint, params)` 签名
- 保留现有双通道 fallback / probe / quota 基线
- `_throttle_if_proxy()` 继续存在，但只作为**单实例平滑节流**
- 真正的 proxy `50 req/min` 保证必须通过 **Redis 原子预留 / token bucket / 等价跨 worker 协调** 实现

### 二、建议改动

#### 2.1 `backend/app/data/coinglass_tier.py`

- 新增一个更强语义的方法，例如：
  - `reserve_rate_slot(channel: str = "official") -> bool`
- `channel == "proxy"` 时：
  - 使用 `cg_rate:{channel}:{minute_ts}` 做**原子预留**
  - 若无可用 slot，返回 `False`
- `channel == "official"` 时：
  - 可继续沿用现有限频逻辑或同样走原子预留
- `check_rate_limit()` 可以保留，但不应继续承担 proxy 生产级全局保证语义

#### 2.2 `backend/app/data/coinglass_client.py`

- 在 proxy 请求真正发出前先尝试 `reserve_rate_slot("proxy")`
- 若 proxy 无 slot：
  - 按当前 fallback 语义降级到 official，或在无 official 时返回 None
- `_throttle_if_proxy()` 保留，但注释 / docstring 必须改成“单实例缓冲，不是全局保证”
- probe / retry 是否占用 rate slot，要与预算记账口径保持一致

### 三、约束

- `get()` 方法签名 `(path, endpoint, params)` **不得变更**，上层模块零改动
- 所有 Redis 操作必须 try/except，Redis 不可用时 fail-open
- structlog 日志不得包含 API Key 原文
- `import` 语句放文件顶部
- 保留所有现有注释和文档字符串风格
- 使用 `from app.core.redis import get_redis_pool` 获取 Redis 连接

### 四、验证

- 多 worker / 并发下 proxy 全局请求速率不超过 50/min
- existing fallback / probe / quota baseline 不被回归破坏
```

---

## Prompt 2 — `/usage/me` 对账 + 预算口径收口（T7.2）

```
## 任务

在现有 `backend/app/data/coinglass_client.py` 基础上补齐 proxy 配额对账闭环。当前代码只有 Redis 本地日计数，尚未真正完成 `/usage/me` 同步与真值优先判断。

### 一、预算记账口径先写死

至少明确并落实以下口径：

- proxy 主请求是否计入本地预算
- probe 请求是否计入本地预算
- retry 请求是否计入本地预算
- 本地预算到底按“attempt”还是“success”记账

如果供应商计费规则无法完全确认，优先使用**保守口径**，避免低估消耗。

### 二、增加 `/usage/me` 真值同步

建议新增方法，例如：

- `_sync_proxy_quota_usage()`
- `_fetch_proxy_usage_me()`

要求：

- 调用 AlphaNode `/usage/me`
- 解析剩余额度 / 已用额度（按实际返回结构）
- 写 Redis：
  - `cg_proxy_quota_remaining`
  - `cg_proxy_quota_synced_at`
  - `cg_proxy_quota_drift`（如有差异）

### 三、差异处理

当 `/usage/me` 与本地 Redis 计数不一致时：

- 记录 warning 日志
- 保留差异值到 Redis
- 月度额度判断优先参考供应商真值
- 不要把本地计数继续表述成账单真值

### 四、约束

- 不改变现有 `get()` 对上层的调用签名
- 不记录 API Key 原文
- Redis / `/usage/me` 异常时保持 fail-soft，但要留下可观测日志
```

---

## Prompt 3 — 运行态语义收口（T7.3 + T7.4）

```
## 任务

不要重做管理后台 baseline。当前代码已存在：

- `POST /api/admin/configs/coinglass/channel`
- `GET /api/admin/configs/coinglass/channel`
- `GET /api/admin/datasources/coinglass/channel`
- `/api/admin/datasources/health` 中的 CoinGlass 运行态聚合

本次只做 **语义收口**，把后台返回结构和实际运行机制对齐。

### 一、锁定语义收口

文件：`backend/app/api/admin_configs.py`

- 明确 `lock` 的真实行为：
  - 锁定 `official` → 禁止自动恢复到 `proxy`
  - 锁定 `proxy` → 禁止自动 fallback 到 `official`
- 返回结构或文档注释中应明确提示锁定 `proxy` 的风险
- `switch_reason` / `locked` 字段语义要与 `datasources.py` 保持一致

### 二、恢复 SLA 语义收口

- 当前 `proxy` 恢复检测是 **request-driven probe**
- 不要在后台或注释中把它描述成“无流量也会固定 5 分钟恢复”
- 如果产品要求固定时间恢复，必须新增独立主动探测任务，而不是继续沿用现有文案

### 三、健康检查口径收口

- 当前 `/api/admin/datasources/health` 更接近**运行态读取 + 汇总**
- 如果继续沿用这个实现，就把文案明确为：
  - 读取 Redis 运行态
  - 聚合失败计数 / 用量 / 风险状态
  - 不承诺每次健康检查都主动探测两个 REST 通道
- 如果产品坚持“health = 主动探测”，则作为新的实现任务单列，不与当前 baseline 混写

### 四、约束

- 不新增前端依赖
- 不改动上层采集调用签名
- 路径文档必须与现有真实路径一致：`/api/admin/configs/coinglass/channel`
- 若仅更新文案/返回结构，也要确保 `datasources.py` 与 `admin_configs.py` 口径统一
```

---

## Prompt 4 — 测试缺口补强（T5.1 剩余项）

```
## 任务

不要新建测试文件。当前 `backend/tests/test_coinglass_dual_channel.py` 已存在，并覆盖了大量 baseline 场景。本次只补剩余缺口。

### 一、必须新增的测试场景

1. **全局限频协调**
   - 多协程 / 多实例语义下，proxy rate slot 不会超发
   - 单实例 throttle 不是唯一保障

2. **`/usage/me` 对账**
   - 供应商真值写入 `cg_proxy_quota_remaining`
   - 本地 Redis 计数与真值不一致时会记录差异

3. **锁定 `proxy` 的失败语义**
   - 当 `cg_channel:locked = proxy` 且 proxy 故障时，不会自动切到 official
   - 返回/日志语义应可解释

4. **request-driven recovery 边界**
   - 无请求流量时，不应伪造“5 分钟内已自动恢复”的测试结论
   - 有请求流量时，probe 才触发恢复路径

### 二、测试约束

- 测试文件仍使用 `backend/tests/test_coinglass_dual_channel.py`
- 不依赖真实网络或真实 Redis
- 允许继续使用 fakeredis / AsyncMock / patch
- 每个新增测试都要准确体现“baseline 已有，当前是在补硬化边界”
```

---

## 执行顺序

1. **Prompt 1** → 分布式全局限频硬化
2. **Prompt 2** → `/usage/me` 对账与预算口径收口
3. **Prompt 3** → 运行态语义与后台口径收口
4. **Prompt 4** → 测试缺口补强

每步完成后优先做该步对应的最小验证，最后再做回归验证。
