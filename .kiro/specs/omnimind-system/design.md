# OmniMind 系统设计文档

## 文档状态

- **当前定位**：本文件保留为 OmniMind 早期整体设计记录。
- **不再承担**：当前产品级主数据源架构真相源。
- **阅读方式**：以下架构图用于保留历史上下文，其中出现的数据源组合不代表当前四主源定义。
- **当前主真相源**：请以 `four-primary-datasources` spec 为准。

## 一、整体架构

```
[Next.js 前端]
      │ REST / WebSocket
      ▼
[FastAPI 网关] ── JWT认证 ── 限流 ── 权限校验
      │
      ├── [数据采集层]          ← Celery定时任务
      │     ├── Binance WS      ← 实时行情
      │     ├── Etherscan API   ← 链上大额转账
      │     ├── CryptoQuant     ← 交易所净流入
      │     └── Alternative.me  ← 恐慌贪婪指数
      │
      ├── [智能体集群]          ← Redis Streams 消息驱动
      │     ├── TechnicalAgent  ← 技术指标分析
      │     ├── OnchainAgent    ← 链上行为解读
      │     ├── PlaybookAgent   ← 剧本推演
      │     └── RiskAgent       ← 风险预警
      │
      ├── [NSED共识引擎]        ← 多模型并行 via DMXAPI
      │     ├── Round1: 独立分析
      │     ├── Round2: 交叉审查
      │     └── Round3: 加权聚合
      │
      └── [推送模块]            ← Celery任务
            ├── WebSocket
            ├── Telegram Bot
            └── SendGrid Email

[存储层]
  ├── PostgreSQL + TimescaleDB  ← 时序K线/指标/链上 + 用户/支付
  └── Redis                     ← 缓存 + 消息队列 + WS状态
```

---

## 二、数据流设计

### 行情数据流
```
Binance WS → binance_collector → TimescaleDB(klines)
                               → Redis(latest_price, TTL=5s)
                               → Redis Streams(price_updates)
                                     └→ indicator_worker → TimescaleDB(indicators)
                                     └→ ws_broadcaster → 前端WebSocket
```

### 分析触发流
```
每15分钟 Celery Beat
    └→ 拉取最新K线+指标+链上数据
    └→ 并行触发4个Agent
          └→ 结果写入 agent_reports
          └→ 触发 NSED共识引擎
                └→ 生成策略
                └→ 写入 strategies
                └→ 推送模块
```

### 链上数据流
```
每30分钟 Celery Beat
    └→ onchain_collector
          ├→ Etherscan: 大额转账
          ├→ CryptoQuant: 净流入
          └→ Alternative.me: 恐慌贪婪
    └→ TimescaleDB(onchain_snapshots)
    └→ Redis(latest_onchain, TTL=30m)
    └→ RiskAgent 检查异常阈值
```

---

## 三、核心模块设计

### 3.1 UnifiedLLMClient
```python
# app/core/llm_client.py
class UnifiedLLMClient:
    - client: AsyncOpenAI(base_url=DMXAPI)
    - call_model(model_key, messages, temperature, timeout=30)
      → asyncio.wait_for 超时控制
      → 失败返回 _fallback_response(signal="neutral")
      → 记录耗时、token用量、是否降级
    - MODELS = {
        "deepseek": "deepseek-chat",
        "gpt4o": "gpt-4o",
        "claude": "claude-3-5-sonnet-20241022",
        "gemini": "gemini-1.5-pro"
      }
```

### 3.2 BaseAgent 接口
```python
# app/agents/base.py
@dataclass
class AgentReport:
    agent_id: str
    symbol: str
    timestamp: datetime
    signal: Literal["bullish", "bearish", "neutral"]
    confidence: float          # 0.0-1.0
    reasoning: str
    key_findings: list[str]
    raw_data: dict

class BaseAgent(ABC):
    @abstractmethod
    async def analyze(self, data: MarketData) -> AgentReport: ...
```

### 3.3 NSED共识引擎
```python
# app/consensus/engine.py
async def run_nsed(market_data: MarketData) -> ConsensusReport:
    # Round 1: 并行独立分析
    r1 = await asyncio.gather(
        deepseek_analyze(market_data),   # 链上专责
        gpt4o_analyze(market_data),      # 宏观专责
        claude_analyze(market_data),     # 风险专责
        gemini_analyze(market_data),     # 模式专责
    )
    # Round 2: 并行交叉审查
    r2 = await asyncio.gather(*[
        cross_review(model, vote, others)
        for model, vote in zip(MODELS, r1)
    ])
    # Round 3: 加权聚合
    weights = await get_dynamic_weights()
    consensus = weighted_aggregate(r2, weights)
    minority = detect_minority(r2, consensus)
    return ConsensusReport(...)
```

### 3.4 庄家剧本知识库
```python
# app/agents/playbook.py
PLAYBOOK_PATTERNS = {
    "假突破诱多": {
        "特征": ["价格突破关键阻力", "成交量温和", "链上无大额流入", "巨鲸未增仓"],
        "后续": "快速回落，散户追多被套",
        "触发条件": lambda d: d.tech_breakout and not d.onchain_support
    },
    "恐慌洗盘": {
        "特征": ["价格急跌5-15%", "交易所流入激增", "恐慌贪婪<25", "巨鲸反向增仓"],
        "后续": "快速反弹，洗出弱手",
        "触发条件": lambda d: d.price_drop > 0.05 and d.whale_buying
    },
    "主升浪启动": {
        "特征": ["交易所余额持续下降", "巨鲸增仓>2周", "MVRV<2", "情绪低迷"],
        "后续": "放量上涨，持续性强",
        "触发条件": lambda d: d.exchange_outflow_14d and d.mvrv < 2
    },
    "顶部派发": {
        "特征": ["交易所流入激增", "巨鲸持仓下降", "MVRV>3.5", "情绪极度贪婪"],
        "后续": "缓慢下跌或急跌",
        "触发条件": lambda d: d.exchange_inflow_surge and d.mvrv > 3.5
    }
}
```

### 3.5 权限中间件
```python
# app/core/deps.py
def require_level(level: int):
    async def dep(user=Depends(get_current_user)):
        if user.membership_level < level:
            raise HTTPException(403, "订阅等级不足")
        return user
    return dep

# 使用方式
@router.get("/consensus")
async def get_consensus(user=Depends(require_level(2))):  # 旗舰=2
    ...
```

### 3.6 支付幂等性
```python
# app/services/payment.py
async def handle_webhook(payment_id: str, status: str):
    # 幂等性：payment_id 唯一索引，重复处理直接返回
    existing = await db.get_payment(payment_id)
    if existing and existing.status == "completed":
        return
    if status == "finished":
        async with db.transaction():
            await db.update_payment_status(payment_id, "completed")
            await upgrade_membership(existing.user_id, existing.plan)
            await notify_user(existing.user_id)
```

---

## 四、前端组件设计

### 页面结构
```
app/
├── (auth)/
│   ├── login/page.tsx
│   └── register/page.tsx
├── dashboard/page.tsx          ← 主仪表盘
├── onchain/page.tsx            ← 链上监控（旗舰）
├── consensus/page.tsx          ← 共识详情（旗舰）
├── cases/page.tsx              ← 历史案例
└── settings/
    ├── push/page.tsx           ← 推送设置
    └── membership/page.tsx     ← 会员中心
```

### 核心组件
```
components/
├── charts/
│   ├── KlineChart.tsx          ← TradingView封装，多周期切换
│   └── OnchainChart.tsx        ← 链上趋势图
├── cards/
│   ├── PriceBoard.tsx          ← 实时价格+发光效果
│   ├── OnchainPanel.tsx        ← 链上信号面板
│   ├── PlaybookIndicator.tsx   ← 庄家剧本圆环指示器
│   ├── StrategyCard.tsx        ← 策略卡片（多头/空头/观望）
│   └── ConsensusCard.tsx       ← 模型投票卡片
└── layout/
    ├── Sidebar.tsx
    └── TopBar.tsx
```

### 视觉规范
```css
--bg-primary: #0A0F1B
--bg-card: rgba(255,255,255,0.04)
--border-card: rgba(42,109,255,0.2)
--color-bull: #00F5A0    /* 多头荧光绿 */
--color-bear: #FF3B6F    /* 空头警示红 */
--color-accent: #2A6DFF  /* 科技蓝 */
--font-mono: 'Roboto Mono'  /* 数字等宽 */
```

---

## 五、数据库 Schema

### TimescaleDB
```sql
-- K线数据
CREATE TABLE klines (
    time        TIMESTAMPTZ NOT NULL,
    symbol      VARCHAR(20) NOT NULL,
    interval    VARCHAR(5)  NOT NULL,
    open        NUMERIC(20,8),
    high        NUMERIC(20,8),
    low         NUMERIC(20,8),
    close       NUMERIC(20,8),
    volume      NUMERIC(30,8)
);
SELECT create_hypertable('klines', 'time');

-- 技术指标
CREATE TABLE indicators (
    time        TIMESTAMPTZ NOT NULL,
    symbol      VARCHAR(20) NOT NULL,
    interval    VARCHAR(5)  NOT NULL,
    ema7        NUMERIC(20,8),
    ema25       NUMERIC(20,8),
    ema99       NUMERIC(20,8),
    rsi         NUMERIC(8,4),
    macd        NUMERIC(20,8),
    macd_signal NUMERIC(20,8),
    bb_upper    NUMERIC(20,8),
    bb_lower    NUMERIC(20,8)
);
SELECT create_hypertable('indicators', 'time');

-- 链上快照
CREATE TABLE onchain_snapshots (
    time                TIMESTAMPTZ NOT NULL,
    symbol              VARCHAR(20) NOT NULL,
    exchange_netflow    NUMERIC(20,4),
    whale_change_24h    NUMERIC(8,4),
    fear_greed_index    INTEGER,
    mvrv                NUMERIC(8,4)
);
SELECT create_hypertable('onchain_snapshots', 'time');
```

### PostgreSQL
```sql
CREATE TABLE users (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email           VARCHAR(255) UNIQUE NOT NULL,
    password_hash   VARCHAR(255) NOT NULL,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE memberships (
    user_id             UUID REFERENCES users(id),
    level               INTEGER DEFAULT 0,  -- 0=免费 1=专业 2=旗舰
    expires_at          TIMESTAMPTZ,
    query_count_today   INTEGER DEFAULT 0,
    query_reset_at      DATE DEFAULT CURRENT_DATE
);

CREATE TABLE payments (
    payment_id      VARCHAR(100) UNIQUE NOT NULL,  -- NowPayments ID，幂等键
    user_id         UUID REFERENCES users(id),
    plan            INTEGER NOT NULL,
    amount_usd      NUMERIC(10,2),
    network         VARCHAR(20),
    status          VARCHAR(20) DEFAULT 'pending',
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE agent_reports (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id    VARCHAR(50),
    symbol      VARCHAR(20),
    signal      VARCHAR(20),
    confidence  NUMERIC(4,3),
    reasoning   TEXT,
    findings    JSONB,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE strategies (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    symbol      VARCHAR(20),
    direction   VARCHAR(20),
    entry_low   NUMERIC(20,8),
    entry_high  NUMERIC(20,8),
    stop_loss   NUMERIC(20,8),
    targets     JSONB,
    confidence  NUMERIC(4,3),
    valid_until TIMESTAMPTZ,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);
```

---

## 六、部署架构

```yaml
# docker-compose.yml 服务清单
services:
  frontend:     # Next.js, port 3000
  backend:      # FastAPI, port 8000
  worker:       # Celery worker
  beat:         # Celery beat 定时调度
  postgres:     # PostgreSQL + TimescaleDB
  redis:        # Redis 6379
```

### 环境变量清单（.env）
```
# 数据库
DATABASE_URL=postgresql+asyncpg://...
REDIS_URL=redis://redis:6379

# AI
DMX_API_KEY=sk-...
DMX_BASE_URL=https://www.dmxapi.cn/v1

# 数据源
BINANCE_API_KEY=...
ETHERSCAN_API_KEY=...
CRYPTOQUANT_API_KEY=...

# 支付
NOWPAYMENTS_API_KEY=...
NOWPAYMENTS_IPN_SECRET=...

# 推送
TELEGRAM_BOT_TOKEN=...
SENDGRID_API_KEY=...

# 安全
JWT_SECRET_KEY=...
JWT_ALGORITHM=HS256
```
