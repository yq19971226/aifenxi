# 多套餐数据源接入系统设计 Spec

> 版本: v1.1 | 日期: 2026-03-02
> 状态: 设计阶段（基于现有币种管理）

---

## 一、需求背景

### 1.1 业务场景
- T1 免费套餐：仅 BTCUSDT
- T2 专业套餐 ($49/月)：后台启用的币种（has_onchain=true）
- **复用现有 `symbol_registry` 表**，不单独维护币种列表
- 后台可在 `/admin/symbols` 动态管理各币种的链上数据开关

### 1.2 现有数据源
- 已有：`symbol_registry` 表（含 `has_onchain` 字段）
- 需接入：GlassNode API（提供链上指标数据）

---

## 二、系统架构

### 2.1 复用现有体系

```
┌─────────────────────────────────────────────────────────┐
│  现有 symbol_registry 表                                │
│  ┌─────────────────────────────────────────────────────┐│
│  │ symbol      │ has_onchain │ has_derivatives │ ...  ││
│  │-------------|-------------|------------------|----│
│  │ BTCUSDT    │ true        │ true             │    ││
│  │ ETHUSDT    │ true        │ true             │    ││
│  │ SOLUSDT    │ true        │ false            │    ││
│  │ ...        │             │                  │    ││
│  └─────────────────────────────────────────────────────┘│
│                                                         │
│  前端 GET /api/symbols/ → 根据 membership_level 过滤   │
└─────────────────────────────────────────────────────────┘
```

### 2.2 套餐权限控制

| 套餐 | 可见币种 | 链上数据权限 |
|------|----------|--------------|
| T1 免费 | 仅 BTCUSDT | 基础指标 |
| T2 专业 | 所有 enabled=true + has_onchain=true | 完整指标 |
| T3 旗舰 | 所有 enabled=true | 全功能 |

### 2.3 数据流

```
用户请求 /api/onchain?symbol=BTCUSDT
         │
         ▼
┌──────────────────────────────┐
│  1. 获取用户套餐级别 (level)  │
│  2. 查询 symbol_registry 表  │
│     - 检查 enabled=true      │
│     - 检查 has_onchain=true  │
│  3. 按级别过滤               │
│     - T0: 仅 BTCUSDT         │
│     - T1+: has_onchain=true  │
│  4. 调用 GlassNode API       │
└──────────────────────────────┘
```

---

## 三、后台配置设计

### 3.1 复用现有后台管理

使用现有 `/admin/symbols` 页面管理币种：

| 字段 | 用途 |
|------|------|
| `symbol` | 交易对（如 BTCUSDT） |
| `enabled` | 是否启用（前端可见） |
| `has_onchain` | 是否开启链上数据（决定 T2 访问权限） |
| `has_derivatives` | 是否开启衍生品数据 |

### 3.2 新增配置项

| 配置 Key | 类型 | 说明 | 默认值 |
|----------|------|------|--------|
| `plan_t1_symbols` | string[] | T1 免费套餐额外允许的币种 | ["BTCUSDT"] |
| `plan_t1_metrics` | string[] | T1 可用指标 | ["price", "market_cap"] |
| `plan_t2_metrics` | string[] | T2 可用指标 | ["price","market_cap","nvt","mvrv","stock_to_flow",...] |
| `glassnode_api_key` | string | GlassNode API Key | (从环境变量读取) |

> 注：T2/T3 套餐的币种范围 = symbol_registry 中 enabled=true + has_onchain=true 的所有币种

### 3.3 现有页面复用

直接使用 `/admin/symbols` 管理：

```
币种管理
┌─────────────────────────────────────────────────────────┐
│  交易对      │ 显示名   │ 启用 │ 链上数据 │ 衍生品    │
│--------------|---------|------|----------|----------│
│  BTCUSDT    │ 比特币   │ ✓   │ ✓       │ ✓        │
│  ETHUSDT    │ 以太坊   │ ✓   │ ✓       │ ✓        │
│  SOLUSDT    │ Solana  │ ✓   │ ✓       │ —        │
│  DOGEUSDT   │ Dogecoin │ ✓   │ ✓       │ —        │
│              ...                                 │
└─────────────────────────────────────────────────────────┘
```

- `has_onchain = true` → T2/T3 可访问链上数据
- `has_onchain = false` → 仅 T3 旗舰可访问

---

## 四、API 设计

### 4.1 链上数据接口

**请求**
```
GET /api/onchain/{symbol}
Header: Authorization: Bearer {token}

Query Parameters:
- symbol: 币种符号 (BTC, ETH, SOL, ...)
- metric: 指标类型 (price, market_cap, nvt, mvrv, ...)
- interval: 时间间隔 (h1, h24, h168, h720)
```

**响应 (200)**
```json
{
  "symbol": "BTC",
  "metric": "price",
  "value": 96234.50,
  "unit": "USD",
  "timestamp": "2026-03-02T10:00:00Z",
  "change_24h": 2.34,
  "source": "glassnode"
}
```

**响应 (403 - 套餐不匹配)**
```json
{
  "error": "upgrade_required",
  "message": "您的套餐不支持查看 {symbol} 的链上数据",
  "current_plan": "T1",
  "required_plan": "T2",
  "upgrade_url": "/settings/membership"
}
```

**响应 (404 - 指标不存在)**
```json
{
  "error": "metric_not_found",
  "message": "指标 {metric} 不存在或当前套餐无权访问"
}
```

### 4.2 套餐数据能力查询

**请求**
```
GET /api/onchain/capabilities
```

**响应**
```json
{
  "plans": {
    "t1": {
      "name": "免费套餐",
      "symbols": ["BTC", "ETH"],
      "metrics": ["price", "market_cap"],
      "intervals": ["h1", "h24"]
    },
    "t2": {
      "name": "专业套餐",
      "symbols": ["BTC","ETH","SOL","BNB","XRP","DOGE","ZEC","BCH","HYPE"],
      "metrics": ["price","market_cap","nvt","mvrv","stock_to_flow","exchange_flow",...],
      "intervals": ["h1", "h24", "h168", "h720"]
    }
  },
  "user_capabilities": {
    "level": 1,
    "symbols": ["BTC","ETH","SOL","BNB","XRP","DOGE","ZEC","BCH","HYPE"],
    "metrics": ["price","market_cap","nvt","mvrv",...]
  }
}
```

---

## 五、前端设计

### 5.1 看板页面币种过滤

```tsx
// 前端根据用户套餐过滤可见币种
const { data: capabilities } = useQuery(['onchain/capabilities']);

const visibleSymbols = capabilities?.user_capabilities?.symbols || [];
const filteredCoins = allCoins.filter(coin => 
  visibleSymbols.includes(coin.symbol)
);
```

### 5.2 锁定状态展示

```
┌─────────────────────────────────────────────────────────┐
│  币种    最新价    24h涨幅    链上数据    操作          │
├─────────────────────────────────────────────────────────┤
│  BTC    $96,234   +2.34%     [查看]       —            │
│  ETH    $3,412    -1.23%     [查看]       —            │
│  SOL    $178.50   +5.67%     [🔒 T2]     [升级]        │
│  BNB    $612.30   +0.89%     [🔒 T2]     [升级]        │
└─────────────────────────────────────────────────────────┘
```

### 5.3 升级引导弹窗

当用户点击锁定数据时：

```
┌─────────────────────────────────────────────────────────┐
│  升级到专业套餐                                        │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  您正在访问 SOL 的链上数据                              │
│                                                         │
│  专业套餐 ($49/月) 包括:                                │
│  ✓ 支持 9 大主流币种 (BTC, ETH, SOL, BNB...)          │
│  ✓ 完整链上指标 (NVT, MVRV, 交易所流量...)            │
│  ✓ 更多时间周期 (1h, 24h, 7d, 30d)                   │
│                                                         │
│  [立即升级]  [取消]                                    │
└─────────────────────────────────────────────────────────┘
```

---

## 六、数据库设计

### 6.1 新增配置表

```sql
CREATE TABLE IF NOT EXISTS data_source_config (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    plan_level INTEGER NOT NULL,          -- 0=T1免费, 1=T2专业, 2=T3旗舰
    symbol VARCHAR(20) NOT NULL,          -- 币种符号
    metrics TEXT,                         -- JSON数组，支持的指标
    intervals TEXT,                       -- JSON数组，支持的时间周期
    is_active BOOLEAN DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(plan_level, symbol)
);

-- 默认数据
INSERT INTO data_source_config (plan_level, symbol, metrics, intervals) VALUES
(0, 'BTC', '["price","market_cap"]', '["h1","h24"]'),
(0, 'ETH', '["price","market_cap"]', '["h1","h24"]'),
(1, 'BTC', '["price","market_cap","nvt","mvrv","stock_to_flow","exchange_flow"]', '["h1","h24","h168","h720"]'),
(1, 'ETH', '["price","market_cap","nvt","mvrv","stock_to_flow","exchange_flow"]', '["h1","h24","h168","h720"]'),
(1, 'SOL', '["price","market_cap","nvt","mvrv","stock_to_flow","exchange_flow"]', '["h1","h24","h168","h720"]'),
-- ... 其他 T2 币种
(2, '*', '["*"]', '["*"]');  -- 旗舰套餐无限制
```

### 6.2 缓存策略

- 配置表数据缓存到 Redis (TTL: 5 分钟)
- API 请求结果缓存到 Redis (TTL: 1-10 分钟，视指标类型)

---

## 七、实施计划

### 7.1 任务拆分

| 优先级 | 任务 | 预估工时 |
|--------|------|----------|
| P0 | 后端：配置管理 CRUD | 2h |
| P0 | 后端：套餐级别校验中间件 | 2h |
| P0 | 后端：GlassNode API 接入 | 4h |
| P1 | 前端：能力查询 API 集成 | 2h |
| P1 | 前端：看板币种过滤展示 | 2h |
| P1 | 前端：锁定状态 + 升级引导 | 3h |
| P2 | 后台：数据源配置页面 | 4h |
| P2 | 监控：API 调用统计 | 2h |

### 7.2 依赖项

- GlassNode API Key（需要购买订阅）
- Redis（已有）
- 数据库（已有）

---

## 八、风险与限制

### 8.1 风险
- GlassNode API 可能有速率限制
- 部分币种/指标可能在 API 中不存在

### 8.2 限制
- 初期仅支持 USD 计价的指标
- 历史数据范围受 API 限制

---

## 九、验收标准

1. ✅ 后台可配置 T1/T2 各支持的币种和指标
2. ✅ 用户只能访问自己套餐范围内的数据
3. ✅ 超出套餐范围时返回清晰的升级引导
4. ✅ 前端正确过滤展示可见币种
5. ✅ API 响应时间 < 500ms（不含外部 API）
