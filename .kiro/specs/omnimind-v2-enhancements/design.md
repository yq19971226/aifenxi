# OmniMind V2 增强功能 — 技术设计文档

## 文档状态

- **当前定位**：本文件保留为 OmniMind V2 历史增强设计记录。
- **不再承担**：当前产品级主数据源架构说明。
- **阅读方式**：以下设计用于保留历史功能扩展上下文，不应与当前四主源总纲并列为主真相源。

一、概述

本设计文档定义 OmniMind V2 五大增强模块的技术方案，在现有系统（4个智能体、NSED共识引擎、三级会员、推送模块）基础上扩展，保持架构分层一致性。

### 五大模块

| 模块 | 覆盖需求 | 核心新增 |
|------|----------|----------|
| 自定义预警 | 需求1-2 | Alert_Rule_Engine + 规则评估 Worker |
| 多币种支持 | 需求3-5 | Symbol_Registry + Multi_Symbol_Scheduler + Correlation_Analyzer |
| 策略绩效追踪 | 需求6-7 | Performance_Tracker + Strategy_Snapshot |
| AI对话助手 | 需求8-10 | Chat_Agent + Chat_Session + 前端聊天侧边栏 |
| 合约数据接入 | 需求11-13 | Derivatives_Collector + 合约数据面板 |

### 设计原则

- 遵循现有分层架构：API路由层 → Service层 → Agent层 → 数据层
- Agent 间通过 Redis Streams 消息总线通信，禁止直接调用
- 所有 AI 调用经过 `UnifiedLLMClient`，JSON 输出 + pydantic 校验
- 会员权限通过 `Depends(require_level(n))` 统一校验
- TimescaleDB 存时序数据，PostgreSQL 存业务数据，Redis 做缓存和消息队列

---

## 二、架构

### 整体架构扩展

```
[Next.js 前端]  ← 新增: 聊天侧边栏、合约面板、预警管理、绩效看板、关联热力图
      │ REST / WebSocket
      ▼
[FastAPI 网关] ── JWT认证 ── 限流 ── 权限校验
      │
      ├── [数据采集层]              ← 扩展
      │     ├── Binance WS          ← 现有：实时行情
      │     ├── Binance Futures API ← 新增：资金费率/多空比/爆仓 (需求11)
      │     ├── Etherscan API       ← 现有：链上大额转账
      │     ├── CryptoQuant         ← 现有：交易所净流入
      │     └── Alternative.me      ← 现有：恐慌贪婪指数
      │
      ├── [智能体集群]              ← 扩展
      │     ├── TechnicalAgent      ← 现有 + 合约数据辅助 (需求12)
      │     ├── OnchainAgent        ← 现有 + 多币种适配 (需求4)
      │     ├── PlaybookAgent       ← 现有 + 合约特征匹配 (需求12)
      │     ├── RiskAgent           ← 现有 + 合约风险告警 (需求12)
      │     └── ChatAgent           ← 新增：AI对话助手 (需求8-9)
      │
      ├── [NSED共识引擎]            ← 现有，按 symbol 独立运行 (需求4)
      │
      ├── [新增引擎]
      │     ├── Alert_Rule_Engine   ← 预警规则评估 (需求1-2)
      │     ├── Correlation_Analyzer← 关联分析 (需求5)
      │     └── Performance_Tracker ← 绩效追踪 (需求6-7)
      │
      ├── [调度层]
      │     ├── Celery Beat         ← 现有定时调度
      │     ├── Multi_Symbol_Scheduler ← 新增：多币种并行调度 (需求3)
      │     ├── alert_eval_worker   ← 新增：预警评估 Worker (需求2)
      │     └── perf_settle_worker  ← 新增：绩效结算 Worker (需求6)
      │
      └── [推送模块]                ← 现有
            ├── WebSocket
            ├── Telegram Bot
            └── SendGrid Email

[存储层]
  ├── PostgreSQL + TimescaleDB
  │     ├── 现有：klines, indicators, onchain_snapshots
  │     ├── 新增：derivatives_snapshots, liquidation_events (需求11)
  │     ├── 新增：alert_rules, alert_triggers (需求1-2)
  │     ├── 新增：symbol_registry, symbol_correlations (需求3,5)
  │     ├── 新增：strategy_snapshots, perf_checkpoints (需求6-7)
  │     └── 新增：chat_sessions, chat_messages (需求8)
  └── Redis
        ├── 缓存 + 消息队列 + WS状态 (现有)
        ├── 预警冷却计数器 (需求2)
        ├── 对话限流计数器 (需求9)
        └── 合约数据缓存 (需求11)
```


### 数据流扩展

```
=== 多币种采集流 (需求3) ===
Celery Beat (每分钟)
    └→ Multi_Symbol_Scheduler
          └→ 遍历 Symbol_Registry 中所有 enabled=true 的交易对
          └→ 为每个 symbol 并行提交 Celery 任务:
                ├→ kline_collect_task(symbol)
                ├→ indicator_calc_task(symbol)
                ├→ onchain_collect_task(symbol)
                └→ derivatives_collect_task(symbol)  ← 新增

=== 预警评估流 (需求2) ===
Redis Streams(price_updates / indicator_updates / onchain_updates)
    └→ alert_eval_worker (消费者组)
          └→ 查询所有 enabled=true 且匹配该 symbol+指标类型 的规则
          └→ 逐条评估条件表达式
          └→ 检查冷却期 (Redis key: alert_cooldown:{rule_id}, TTL=300s)
          └→ 条件满足且未冷却 → 触发通知 + 写入 alert_triggers

=== 绩效追踪流 (需求6) ===
策略生成 → Performance_Tracker.create_snapshot()
Celery Beat (每分钟)
    └→ perf_settle_worker
          ├→ 检查未结算策略的止损/目标触达
          ├→ 在 1h/4h/24h/72h 时间点记录 checkpoint
          └→ 72h 超时 → 强制结算

=== AI对话流 (需求8) ===
用户消息 → POST /api/chat/message
    └→ 限流检查 (Redis: chat_quota:{user_id}:{date})
    └→ ChatAgent.respond(session_id, message)
          ├→ 加载最近20条上下文
          ├→ 识别意图 + 交易对
          ├→ 查询相关数据 (最新行情/智能体报告/共识结果)
          └→ UnifiedLLMClient 生成回答
    └→ SSE 流式返回前端
```

---

## 三、组件与接口

### 3.1 自定义预警规则引擎 (需求1-2)

#### 条件表达式模型

```python
# app/models/alert.py
from enum import Enum
from pydantic import BaseModel, Field, field_validator

class MetricType(str, Enum):
    PRICE = "price"
    RSI = "rsi"
    MACD = "macd"
    EMA = "ema"
    BB_UPPER = "bb_upper"
    BB_LOWER = "bb_lower"
    EXCHANGE_NETFLOW = "exchange_netflow"
    WHALE_CHANGE_24H = "whale_change_24h"
    FEAR_GREED_INDEX = "fear_greed_index"
    MVRV = "mvrv"
    FUNDING_RATE = "funding_rate"

class Operator(str, Enum):
    GT = "gt"
    LT = "lt"
    GTE = "gte"
    LTE = "lte"
    CROSS_ABOVE = "cross_above"
    CROSS_BELOW = "cross_below"

class Condition(BaseModel):
    metric: MetricType
    operator: Operator
    threshold: float

class LogicGroup(str, Enum):
    AND = "and"
    OR = "or"

class ConditionExpression(BaseModel):
    """支持最多2层嵌套的条件组合。"""
    logic: LogicGroup = LogicGroup.AND
    conditions: list[Condition] = Field(min_length=1, max_length=10)
    sub_groups: list["ConditionExpression"] = Field(default=[], max_length=2)

    @field_validator("sub_groups")
    @classmethod
    def limit_nesting(cls, v: list, info) -> list:
        for sg in v:
            if sg.sub_groups:
                raise ValueError("条件组合最多支持2层嵌套")
        return v

class AlertRuleCreate(BaseModel):
    name: str = Field(max_length=100)
    symbol: str = Field(max_length=20)
    expression: ConditionExpression
    notify_channels: list[str] = Field(default=["websocket"])

class AlertRuleResponse(BaseModel):
    id: str
    name: str
    symbol: str
    expression: ConditionExpression
    enabled: bool
    notify_channels: list[str]
    last_triggered_at: datetime | None
    created_at: datetime
```

#### 规则评估引擎

```python
# app/services/alert_engine.py
class AlertRuleEngine:
    """预警规则评估核心逻辑。"""

    # 会员等级 → 规则上限
    RULE_LIMITS: dict[int, int] = {0: 3, 1: 20, 2: 100}

    async def create_rule(
        self, user_id: UUID, level: int, rule: AlertRuleCreate
    ) -> AlertRuleResponse:
        """创建规则，校验会员额度。"""
        current_count = await self._count_user_rules(user_id)
        limit = self.RULE_LIMITS.get(level, 3)
        if current_count >= limit:
            raise QuotaExceededError(f"当前等级最多 {limit} 条规则")
        # 校验 expression 合法性 → 持久化
        ...

    async def evaluate(
        self, symbol: str, metric_type: MetricType, current_value: float, prev_value: float | None
    ) -> list[UUID]:
        """评估所有匹配的已启用规则，返回触发的 rule_id 列表。"""
        rules = await self._get_active_rules(symbol, metric_type)
        triggered: list[UUID] = []
        for rule in rules:
            if self._check_expression(rule.expression, metric_type, current_value, prev_value):
                if not await self._is_cooling_down(rule.id):
                    triggered.append(rule.id)
                    await self._set_cooldown(rule.id, ttl=300)
        return triggered

    def _check_condition(
        self, cond: Condition, current: float, prev: float | None
    ) -> bool:
        """单条件评估，包含 cross_above/cross_below 穿越判断。"""
        match cond.operator:
            case Operator.GT: return current > cond.threshold
            case Operator.LT: return current < cond.threshold
            case Operator.GTE: return current >= cond.threshold
            case Operator.LTE: return current <= cond.threshold
            case Operator.CROSS_ABOVE:
                return prev is not None and prev <= cond.threshold and current > cond.threshold
            case Operator.CROSS_BELOW:
                return prev is not None and prev >= cond.threshold and current < cond.threshold

    def _check_expression(
        self, expr: ConditionExpression, metric: MetricType, current: float, prev: float | None
    ) -> bool:
        """递归评估条件表达式（AND/OR 组合）。"""
        results = [
            self._check_condition(c, current, prev)
            for c in expr.conditions if c.metric == metric
        ]
        for sg in expr.sub_groups:
            results.append(self._check_expression(sg, metric, current, prev))
        if not results:
            return False
        if expr.logic == LogicGroup.AND:
            return all(results)
        return any(results)
```

#### 预警评估 Worker

```python
# workers/alert_eval_worker.py
@celery_app.task(name="evaluate_alerts")
async def evaluate_alerts_task(symbol: str, metric_type: str, current_value: float, prev_value: float | None):
    """从 Redis Streams 消费数据更新事件，评估预警规则。"""
    engine = AlertRuleEngine()
    triggered_ids = await engine.evaluate(
        symbol=symbol,
        metric_type=MetricType(metric_type),
        current_value=current_value,
        prev_value=prev_value,
    )
    for rule_id in triggered_ids:
        rule = await engine.get_rule(rule_id)
        # 写入触发历史
        await engine.record_trigger(rule_id, current_value)
        # 通过推送模块发送通知
        await notify_alert_triggered(rule, current_value)
```

### 3.2 多币种支持 (需求3-5)

#### Symbol_Registry

```python
# app/services/symbol_registry.py
from pydantic import BaseModel

class SymbolConfig(BaseModel):
    symbol: str                    # e.g. "BTCUSDT"
    display_name: str              # e.g. "BTC/USDT"
    collect_interval_sec: int = 60 # 采集间隔
    enabled: bool = True
    has_onchain: bool = True       # 是否有链上数据
    has_derivatives: bool = True   # 是否有合约数据

# 默认支持的交易对
DEFAULT_SYMBOLS: list[str] = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT", "XRPUSDT"]

class SymbolRegistry:
    """币种注册表 — 管理系统支持的交易对。"""

    async def list_symbols(self, enabled_only: bool = True) -> list[SymbolConfig]:
        """返回所有（或仅启用的）交易对配置。"""
        ...

    async def add_symbol(self, config: SymbolConfig) -> SymbolConfig:
        """管理员添加新交易对。"""
        ...

    async def update_symbol(self, symbol: str, **kwargs) -> SymbolConfig:
        """更新交易对配置（启用/禁用、采集间隔等）。"""
        ...

    async def mark_error(self, symbol: str, error_count: int) -> None:
        """标记采集失败次数，连续3次 → 禁用 + 告警。"""
        if error_count >= 3:
            await self.update_symbol(symbol, enabled=False)
            await notify_admin(f"交易对 {symbol} 连续3次采集失败，已自动禁用")
```

#### Multi_Symbol_Scheduler

```python
# workers/multi_symbol_scheduler.py
@celery_app.task(name="schedule_all_symbols")
async def schedule_all_symbols():
    """Celery Beat 每分钟触发，为每个启用的交易对提交采集任务。"""
    registry = SymbolRegistry()
    symbols = await registry.list_symbols(enabled_only=True)
    tasks = []
    for sym in symbols:
        tasks.append(collect_symbol_data.delay(sym.symbol))
    # 并行提交，互不影响

@celery_app.task(name="collect_symbol_data", bind=True, max_retries=2)
async def collect_symbol_data(self, symbol: str):
    """单个交易对的完整采集流程。"""
    try:
        await asyncio.gather(
            kline_collect(symbol),
            indicator_calc(symbol),
            onchain_collect(symbol),
            derivatives_collect(symbol),
        )
        await SymbolRegistry().mark_error(symbol, 0)  # 重置错误计数
    except Exception as exc:
        error_count = await increment_error_count(symbol)
        await SymbolRegistry().mark_error(symbol, error_count)
        raise self.retry(exc=exc)
```

#### Correlation_Analyzer

```python
# app/services/correlation.py
import numpy as np

class CorrelationAnalyzer:
    """币种关联分析器 — 计算 Pearson 相关系数矩阵。"""

    async def compute_matrix(self, symbols: list[str], hours: int = 168) -> dict:
        """计算所有交易对两两之间的 Pearson 相关系数。
        使用最近 {hours} 小时（默认7天）的1小时K线收盘价。
        """
        price_series: dict[str, list[float]] = {}
        for sym in symbols:
            closes = await self._get_hourly_closes(sym, hours)
            price_series[sym] = closes

        matrix: dict[str, dict[str, float]] = {}
        for i, s1 in enumerate(symbols):
            matrix[s1] = {}
            for j, s2 in enumerate(symbols):
                if i == j:
                    matrix[s1][s2] = 1.0
                elif j < i:
                    matrix[s1][s2] = matrix[s2][s1]
                else:
                    corr = float(np.corrcoef(price_series[s1], price_series[s2])[0, 1])
                    matrix[s1][s2] = round(corr, 4)
        return matrix

    async def detect_anomalies(self, current: dict, previous: dict) -> list[dict]:
        """检测30分钟内相关系数变化超过0.3的异动。"""
        anomalies = []
        for s1 in current:
            for s2 in current[s1]:
                if s1 >= s2:
                    continue
                delta = abs(current[s1][s2] - previous.get(s1, {}).get(s2, current[s1][s2]))
                if delta > 0.3:
                    anomalies.append({
                        "pair": [s1, s2],
                        "current_corr": current[s1][s2],
                        "previous_corr": previous.get(s1, {}).get(s2),
                        "delta": round(delta, 4),
                    })
        return anomalies
```

### 3.3 策略绩效追踪 (需求6-7)

#### Strategy_Snapshot 模型

```python
# app/models/performance.py
from enum import Enum
from pydantic import BaseModel

class SettlementStatus(str, Enum):
    PENDING = "pending"           # 未结算
    HIT_STOP_LOSS = "hit_stop_loss"
    HIT_TARGET = "hit_target"
    TIMEOUT = "timeout"           # 72h超时结算

class StrategyDirection(str, Enum):
    LONG = "long"
    SHORT = "short"
    NEUTRAL = "neutral"

class StrategySnapshotCreate(BaseModel):
    strategy_id: UUID
    symbol: str
    direction: StrategyDirection
    entry_low: float
    entry_high: float
    stop_loss: float
    targets: list[float]          # [target1, target2, ...]
    confidence: float
    price_at_generation: float

class PerfCheckpoint(BaseModel):
    """策略生成后的定时价格记录点。"""
    snapshot_id: UUID
    checkpoint_hours: int         # 1, 4, 24, 72
    actual_price: float
    recorded_at: datetime

class SettlementResult(BaseModel):
    snapshot_id: UUID
    status: SettlementStatus
    settlement_price: float
    settlement_time: datetime
    pnl_pct: float                # 盈亏百分比

class PerformanceStats(BaseModel):
    """绩效统计汇总。"""
    total_strategies: int
    settled_count: int
    win_rate: float               # 胜率
    avg_profit_pct: float         # 平均盈利%
    avg_loss_pct: float           # 平均亏损%
    profit_loss_ratio: float      # 盈亏比
    by_agent: dict[str, float]    # agent_id → 信号准确率
```

#### Performance_Tracker 核心逻辑

```python
# app/services/performance.py
class PerformanceTracker:
    """策略绩效追踪器。"""

    CHECKPOINT_HOURS: list[int] = [1, 4, 24, 72]

    async def create_snapshot(self, strategy_id: UUID) -> UUID:
        """策略生成时创建快照，记录完整市场状态。"""
        strategy = await self._get_strategy(strategy_id)
        current_price = await self._get_current_price(strategy.symbol)
        snapshot = StrategySnapshotCreate(
            strategy_id=strategy_id,
            symbol=strategy.symbol,
            direction=strategy.direction,
            entry_low=strategy.entry_low,
            entry_high=strategy.entry_high,
            stop_loss=strategy.stop_loss,
            targets=strategy.targets,
            confidence=strategy.confidence,
            price_at_generation=current_price,
        )
        return await self._save_snapshot(snapshot)

    async def check_and_settle(self, snapshot_id: UUID) -> SettlementResult | None:
        """检查是否触达止损/目标，返回结算结果或 None。"""
        snapshot = await self._get_snapshot(snapshot_id)
        if snapshot.status != SettlementStatus.PENDING:
            return None

        current_price = await self._get_current_price(snapshot.symbol)
        elapsed_hours = (datetime.now(timezone.utc) - snapshot.created_at).total_seconds() / 3600

        # 检查止损
        if self._hit_stop_loss(snapshot, current_price):
            return await self._settle(snapshot, current_price, SettlementStatus.HIT_STOP_LOSS)

        # 检查目标位
        if self._hit_any_target(snapshot, current_price):
            return await self._settle(snapshot, current_price, SettlementStatus.HIT_TARGET)

        # 72h 超时结算
        if elapsed_hours >= 72:
            return await self._settle(snapshot, current_price, SettlementStatus.TIMEOUT)

        # 记录 checkpoint
        for h in self.CHECKPOINT_HOURS:
            if abs(elapsed_hours - h) < 0.1:  # ±6分钟窗口
                await self._record_checkpoint(snapshot_id, h, current_price)

        return None

    def _calc_pnl_pct(self, snapshot: StrategySnapshotCreate, settlement_price: float) -> float:
        """计算盈亏百分比。做空方向取反。"""
        entry_mid = (snapshot.entry_low + snapshot.entry_high) / 2
        pnl = (settlement_price - entry_mid) / entry_mid * 100
        if snapshot.direction == StrategyDirection.SHORT:
            pnl = -pnl
        return round(pnl, 4)

    async def get_stats(
        self, symbol: str | None, days: int = 30, direction: str | None = None
    ) -> PerformanceStats:
        """计算绩效统计，支持按交易对/时间/方向筛选。"""
        # 使用 SQL 聚合查询，避免应用层数据聚合
        ...
```

#### 绩效结算 Worker

```python
# workers/perf_settle_worker.py
@celery_app.task(name="settle_strategies")
async def settle_strategies_task():
    """Celery Beat 每分钟触发，检查所有未结算策略。"""
    tracker = PerformanceTracker()
    pending = await tracker.get_pending_snapshots()
    for snapshot in pending:
        try:
            result = await tracker.check_and_settle(snapshot.id)
            if result:
                logger.info(f"策略 {snapshot.strategy_id} 已结算: {result.status}, PnL={result.pnl_pct}%")
        except Exception as exc:
            logger.error(f"结算失败: snapshot={snapshot.id}, error={exc}")
```

### 3.4 AI 对话助手 (需求8-10)

#### Chat_Agent

```python
# app/agents/chat.py
class ChatAgent(BaseAgent):
    """AI对话智能体 — 处理用户自然语言查询。"""

    AGENT_ID: str = "chat"

    # 交易对别名映射
    SYMBOL_ALIASES: dict[str, str] = {
        "btc": "BTCUSDT", "bitcoin": "BTCUSDT", "比特币": "BTCUSDT",
        "eth": "ETHUSDT", "ethereum": "ETHUSDT", "以太坊": "ETHUSDT",
        "sol": "SOLUSDT", "solana": "SOLUSDT",
        "bnb": "BNBUSDT",
        "xrp": "XRPUSDT", "瑞波": "XRPUSDT",
    }

    # 每日查询限额
    DAILY_LIMITS: dict[int, int] = {0: 5, 1: 50, 2: 200}

    async def respond(
        self, user_id: UUID, session_id: UUID, message: str, level: int
    ) -> AsyncGenerator[str, None]:
        """处理用户消息，流式返回回答。"""
        # 1. 限流检查
        remaining = await self._check_quota(user_id, level)
        if remaining <= 0:
            yield json.dumps({"error": "今日查询次数已用完", "reset_at": "UTC 00:00"})
            return

        # 2. 加载会话上下文（最近20条）
        history = await self._load_history(session_id, limit=20)

        # 3. 识别意图和交易对
        symbol = self._extract_symbol(message)
        intent = self._classify_intent(message)

        # 4. 查询相关数据
        context_data = await self._gather_context(symbol, intent)

        # 5. 构建 prompt + 流式调用 LLM
        messages = self._build_messages(history, message, context_data)
        async for chunk in llm_client.stream_model(
            model_key="gpt4o",
            messages=messages,
        ):
            yield chunk

        # 6. 记录消息和用量
        await self._save_message(session_id, "user", message)
        await self._save_message(session_id, "assistant", full_response)
        await self._increment_quota(user_id)

    def _extract_symbol(self, message: str) -> str | None:
        """从消息中识别交易对名称。"""
        lower = message.lower()
        for alias, symbol in self.SYMBOL_ALIASES.items():
            if alias in lower:
                return symbol
        return None

    async def _gather_context(self, symbol: str | None, intent: str) -> dict:
        """根据意图查询相关系统数据，确保回答有数据支撑。"""
        context: dict = {}
        if symbol:
            context["price"] = await get_cached_price(symbol)
            context["latest_report"] = await get_latest_agent_reports(symbol)
            context["consensus"] = await get_latest_consensus(symbol)
            if intent in ("analysis", "strategy"):
                context["strategy"] = await get_latest_strategy(symbol)
            if intent == "onchain":
                context["onchain"] = await get_latest_onchain(symbol)
        return context

    # ChatAgent 不实现 BaseAgent.analyze()，它有独立的 respond() 接口
    async def analyze(self, data: MarketData) -> AgentReport:
        raise NotImplementedError("ChatAgent 使用 respond() 接口")
```

#### Chat_Session 管理

```python
# app/services/chat_session.py
class ChatSessionService:
    """对话会话管理。"""

    async def create_session(self, user_id: UUID) -> UUID:
        """创建新会话。"""
        ...

    async def get_or_create_session(self, user_id: UUID) -> UUID:
        """获取用户最近的活跃会话，或创建新会话。"""
        ...

    async def get_history(self, session_id: UUID, limit: int = 20) -> list[dict]:
        """获取会话历史消息，按时间正序。"""
        ...

    async def add_message(self, session_id: UUID, role: str, content: str) -> None:
        """追加消息到会话。"""
        ...

    async def clear_session(self, session_id: UUID) -> None:
        """清空会话上下文（新建会话按钮）。"""
        ...
```

#### 对话限流（Redis 计数器）

```python
# app/services/chat_quota.py
class ChatQuotaService:
    """对话查询限流 — Redis 计数器，每日 UTC 00:00 重置。"""

    async def check_and_increment(self, user_id: UUID, level: int) -> tuple[bool, int]:
        """检查并递增计数。返回 (是否允许, 剩余次数)。"""
        key = f"chat_quota:{user_id}:{date.today().isoformat()}"
        current = await redis.incr(key)
        if current == 1:
            # 首次使用，设置 TTL 到次日 UTC 00:00
            seconds_until_midnight = self._seconds_until_utc_midnight()
            await redis.expire(key, seconds_until_midnight)
        limit = ChatAgent.DAILY_LIMITS.get(level, 5)
        if current > limit:
            await redis.decr(key)  # 回滚
            return False, 0
        return True, limit - current
```

### 3.5 合约数据接入 (需求11-13)

#### Derivatives_Collector

```python
# app/data/derivatives.py
import aiohttp
from pydantic import BaseModel

class DerivativesSnapshot(BaseModel):
    """合约数据快照。"""
    time: datetime
    symbol: str
    funding_rate: float | None
    predicted_funding_rate: float | None
    long_short_account_ratio: float | None
    long_short_position_ratio: float | None
    top_long_short_account_ratio: float | None
    top_long_short_position_ratio: float | None

class LiquidationEvent(BaseModel):
    """爆仓事件。"""
    time: datetime
    symbol: str
    side: str                     # "LONG" | "SHORT"
    quantity: float
    price: float
    usd_value: float              # quantity * price

BINANCE_FUTURES_BASE = "https://fapi.binance.com"

class DerivativesCollector:
    """合约数据采集器 — Binance Futures API。"""

    async def collect_snapshot(self, symbol: str) -> DerivativesSnapshot:
        """采集资金费率 + 多空比（每5分钟）。"""
        async with aiohttp.ClientSession() as session:
            funding, ls_account, ls_position, top_account, top_position = await asyncio.gather(
                self._fetch(session, "/fapi/v1/premiumIndex", {"symbol": symbol}),
                self._fetch(session, "/futures/data/globalLongShortAccountRatio", {"symbol": symbol, "period": "5m", "limit": 1}),
                self._fetch(session, "/futures/data/topLongShortPositionRatio", {"symbol": symbol, "period": "5m", "limit": 1}),
                self._fetch(session, "/futures/data/topLongShortAccountRatio", {"symbol": symbol, "period": "5m", "limit": 1}),
                self._fetch(session, "/futures/data/topLongShortPositionRatio", {"symbol": symbol, "period": "5m", "limit": 1}),
            )
            return DerivativesSnapshot(
                time=datetime.now(timezone.utc),
                symbol=symbol,
                funding_rate=float(funding.get("lastFundingRate", 0)),
                predicted_funding_rate=float(funding.get("nextFundingRate", 0)) if funding.get("nextFundingRate") else None,
                long_short_account_ratio=float(ls_account[0]["longShortRatio"]) if ls_account else None,
                long_short_position_ratio=float(ls_position[0]["longShortRatio"]) if ls_position else None,
                top_long_short_account_ratio=float(top_account[0]["longShortRatio"]) if top_account else None,
                top_long_short_position_ratio=float(top_position[0]["longShortRatio"]) if top_position else None,
            )

    async def collect_liquidations(self, symbol: str) -> list[LiquidationEvent]:
        """采集最近的爆仓事件（每1分钟）。"""
        async with aiohttp.ClientSession() as session:
            data = await self._fetch(session, "/fapi/v1/allForceOrders", {"symbol": symbol, "limit": 50})
            return [
                LiquidationEvent(
                    time=datetime.fromtimestamp(item["time"] / 1000, tz=timezone.utc),
                    symbol=item["symbol"],
                    side=item["side"],
                    quantity=float(item["origQty"]),
                    price=float(item["price"]),
                    usd_value=float(item["origQty"]) * float(item["price"]),
                )
                for item in data
            ]

    async def _fetch(self, session: aiohttp.ClientSession, path: str, params: dict) -> dict | list:
        """带超时和错误处理的 HTTP GET。"""
        try:
            async with asyncio.timeout(30):
                async with session.get(f"{BINANCE_FUTURES_BASE}{path}", params=params) as resp:
                    resp.raise_for_status()
                    return await resp.json()
        except Exception as exc:
            logger.error(f"Binance Futures API 调用失败: {path}, error={exc}")
            raise
```

#### 合约数据与智能体集成

```python
# MarketData 模型扩展
class DerivativesData(BaseModel):
    """合约数据摘要 — 嵌入 MarketData。"""
    funding_rate: float | None = None
    predicted_funding_rate: float | None = None
    long_short_ratio: float | None = None
    top_long_short_ratio: float | None = None
    liquidation_1h_usd: float | None = None    # 近1小时爆仓总额
    liquidation_1h_long_pct: float | None = None  # 多头爆仓占比

class MarketData(BaseModel):
    symbol: str
    current_price: float
    klines_15m: list[KlineData] = []
    klines_1h: list[KlineData] = []
    klines_4h: list[KlineData] = []
    klines_1d: list[KlineData] = []
    indicators: IndicatorResult | None = None
    onchain: OnchainSnapshot | None = None
    derivatives: DerivativesData | None = None  # ← 新增

# RiskAgent 合约风险阈值 (需求12)
FUNDING_RATE_THRESHOLD: float = 0.001       # 0.1%
LIQUIDATION_1H_THRESHOLD: float = 50_000_000  # $50M
LONG_SHORT_IMBALANCE: float = 0.5           # 偏离1.0超过0.5
```

---

## 四、数据模型

### 4.1 新增 TimescaleDB 时序表

```sql
-- 合约数据快照 (需求11)
CREATE TABLE derivatives_snapshots (
    time                          TIMESTAMPTZ NOT NULL,
    symbol                        VARCHAR(20) NOT NULL,
    funding_rate                  NUMERIC(12,8),
    predicted_funding_rate        NUMERIC(12,8),
    long_short_account_ratio      NUMERIC(10,6),
    long_short_position_ratio     NUMERIC(10,6),
    top_long_short_account_ratio  NUMERIC(10,6),
    top_long_short_position_ratio NUMERIC(10,6)
);
SELECT create_hypertable('derivatives_snapshots', 'time');
CREATE INDEX idx_deriv_symbol ON derivatives_snapshots (symbol, time DESC);

-- 爆仓事件 (需求11)
CREATE TABLE liquidation_events (
    time        TIMESTAMPTZ NOT NULL,
    symbol      VARCHAR(20) NOT NULL,
    side        VARCHAR(10) NOT NULL,  -- 'LONG' | 'SHORT'
    quantity    NUMERIC(20,8) NOT NULL,
    price       NUMERIC(20,8) NOT NULL,
    usd_value   NUMERIC(20,2) NOT NULL
);
SELECT create_hypertable('liquidation_events', 'time');
CREATE INDEX idx_liq_symbol ON liquidation_events (symbol, time DESC);

-- 币种关联系数 (需求5)
CREATE TABLE symbol_correlations (
    time        TIMESTAMPTZ NOT NULL,
    symbol_a    VARCHAR(20) NOT NULL,
    symbol_b    VARCHAR(20) NOT NULL,
    correlation NUMERIC(6,4) NOT NULL
);
SELECT create_hypertable('symbol_correlations', 'time');
CREATE INDEX idx_corr_pair ON symbol_correlations (symbol_a, symbol_b, time DESC);
```

### 4.2 新增 PostgreSQL 业务表

```sql
-- 币种注册表 (需求3)
CREATE TABLE symbol_registry (
    symbol              VARCHAR(20) PRIMARY KEY,
    display_name        VARCHAR(50) NOT NULL,
    collect_interval_sec INTEGER DEFAULT 60,
    enabled             BOOLEAN DEFAULT true,
    has_onchain         BOOLEAN DEFAULT true,
    has_derivatives     BOOLEAN DEFAULT true,
    error_count         INTEGER DEFAULT 0,
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW()
);

-- 预警规则 (需求1)
CREATE TABLE alert_rules (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id           UUID REFERENCES users(id) ON DELETE CASCADE,
    name              VARCHAR(100) NOT NULL,
    symbol            VARCHAR(20) NOT NULL,
    expression        JSONB NOT NULL,       -- ConditionExpression 序列化
    enabled           BOOLEAN DEFAULT true,
    notify_channels   JSONB DEFAULT '["websocket"]',
    last_triggered_at TIMESTAMPTZ,
    created_at        TIMESTAMPTZ DEFAULT NOW(),
    updated_at        TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_alert_rules_user ON alert_rules (user_id);
CREATE INDEX idx_alert_rules_symbol_enabled ON alert_rules (symbol, enabled) WHERE enabled = true;

-- 预警触发历史 (需求2)
CREATE TABLE alert_triggers (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rule_id         UUID REFERENCES alert_rules(id) ON DELETE CASCADE,
    triggered_value NUMERIC(20,8) NOT NULL,
    metric_type     VARCHAR(30) NOT NULL,
    notify_channel  VARCHAR(20) NOT NULL,
    notify_status   VARCHAR(20) DEFAULT 'sent',  -- sent | failed
    triggered_at    TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_alert_triggers_rule ON alert_triggers (rule_id, triggered_at DESC);

-- 策略绩效快照 (需求6)
CREATE TABLE strategy_snapshots (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    strategy_id         UUID REFERENCES strategies(id) ON DELETE CASCADE,
    symbol              VARCHAR(20) NOT NULL,
    direction           VARCHAR(20) NOT NULL,
    entry_low           NUMERIC(20,8) NOT NULL,
    entry_high          NUMERIC(20,8) NOT NULL,
    stop_loss           NUMERIC(20,8) NOT NULL,
    targets             JSONB NOT NULL,
    confidence          NUMERIC(4,3),
    price_at_generation NUMERIC(20,8) NOT NULL,
    status              VARCHAR(20) DEFAULT 'pending',  -- pending | hit_stop_loss | hit_target | timeout
    settlement_price    NUMERIC(20,8),
    settlement_time     TIMESTAMPTZ,
    pnl_pct             NUMERIC(10,4),
    created_at          TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_snapshots_status ON strategy_snapshots (status) WHERE status = 'pending';
CREATE INDEX idx_snapshots_symbol ON strategy_snapshots (symbol, created_at DESC);

-- 绩效检查点 (需求6)
CREATE TABLE perf_checkpoints (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    snapshot_id     UUID REFERENCES strategy_snapshots(id) ON DELETE CASCADE,
    checkpoint_hours INTEGER NOT NULL,  -- 1, 4, 24, 72
    actual_price    NUMERIC(20,8) NOT NULL,
    recorded_at     TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(snapshot_id, checkpoint_hours)
);

-- 对话会话 (需求8)
CREATE TABLE chat_sessions (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID REFERENCES users(id) ON DELETE CASCADE,
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    updated_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_chat_sessions_user ON chat_sessions (user_id, updated_at DESC);

-- 对话消息 (需求8)
CREATE TABLE chat_messages (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id  UUID REFERENCES chat_sessions(id) ON DELETE CASCADE,
    role        VARCHAR(20) NOT NULL,  -- 'user' | 'assistant'
    content     TEXT NOT NULL,
    token_count INTEGER,
    model_key   VARCHAR(30),
    latency_ms  INTEGER,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_chat_messages_session ON chat_messages (session_id, created_at);
```

### 4.3 Redis 键设计

| 键模式 | 用途 | TTL |
|--------|------|-----|
| `alert_cooldown:{rule_id}` | 预警冷却（防重复触发） | 300s |
| `chat_quota:{user_id}:{date}` | 对话每日限额计数 | 到次日 UTC 00:00 |
| `deriv_snapshot:{symbol}` | 最新合约快照缓存 | 300s |
| `deriv_liquidations:{symbol}` | 最新爆仓数据缓存 | 60s |
| `symbol_error_count:{symbol}` | 采集失败计数 | 3600s |
| `correlation_matrix` | 关联系数矩阵缓存 | 3600s |
| `perf_stats:{symbol}:{days}` | 绩效统计缓存 | 300s |


---

## 五、API 路由设计

### 5.1 预警规则 API (需求1-2)

```python
# app/api/alerts.py
router = APIRouter(prefix="/api/alerts", tags=["alerts"])

@router.post("/rules", response_model=AlertRuleResponse)
async def create_rule(
    rule: AlertRuleCreate,
    user: User = Depends(get_current_user),
):
    """创建预警规则。会员额度校验在 Service 层。"""
    ...

@router.get("/rules", response_model=list[AlertRuleResponse])
async def list_rules(user: User = Depends(get_current_user)):
    """获取当前用户的所有预警规则。"""
    ...

@router.put("/rules/{rule_id}", response_model=AlertRuleResponse)
async def update_rule(
    rule_id: UUID,
    update: AlertRuleUpdate,
    user: User = Depends(get_current_user),
):
    """修改预警规则（仅限本人创建的规则）。"""
    ...

@router.delete("/rules/{rule_id}")
async def delete_rule(rule_id: UUID, user: User = Depends(get_current_user)):
    """删除预警规则（仅限本人创建的规则）。"""
    ...

@router.get("/triggers", response_model=list[AlertTriggerResponse])
async def list_triggers(
    limit: int = Query(default=100, le=100),
    user: User = Depends(get_current_user),
):
    """获取最近的触发历史（最多100条）。"""
    ...
```

### 5.2 多币种 API (需求3-5)

```python
# app/api/symbols.py
router = APIRouter(prefix="/api/symbols", tags=["symbols"])

@router.get("/", response_model=list[SymbolConfig])
async def list_symbols(user: User = Depends(get_current_user)):
    """获取交易对列表。免费用户仅返回 BTCUSDT。"""
    ...

@router.post("/", response_model=SymbolConfig)
async def add_symbol(
    config: SymbolConfig,
    user: User = Depends(require_level(2)),  # 管理员
):
    """添加新交易对（管理员）。"""
    ...

@router.get("/correlations")
async def get_correlations(user: User = Depends(require_level(1))):
    """获取关联矩阵热力图数据。专业+旗舰可用。"""
    ...
```

### 5.3 绩效 API (需求7)

```python
# app/api/performance.py
router = APIRouter(prefix="/api/performance", tags=["performance"])

@router.get("/stats", response_model=PerformanceStats)
async def get_stats(
    symbol: str | None = None,
    days: int = Query(default=30, le=90),
    direction: str | None = None,
    user: User = Depends(get_current_user),
):
    """获取绩效统计。免费用户仅7天摘要。"""
    ...

@router.get("/snapshots/{snapshot_id}", response_model=SnapshotDetail)
async def get_snapshot_detail(
    snapshot_id: UUID,
    user: User = Depends(require_level(1)),
):
    """获取单条策略的绩效详情。专业+旗舰可用。"""
    ...

@router.get("/trend")
async def get_trend(
    days: int = Query(default=30, le=90),
    user: User = Depends(require_level(1)),
):
    """获取胜率趋势和累计盈亏曲线数据。"""
    ...
```

### 5.4 对话 API (需求8-10)

```python
# app/api/chat.py
router = APIRouter(prefix="/api/chat", tags=["chat"])

@router.post("/message")
async def send_message(
    body: ChatMessageRequest,
    user: User = Depends(get_current_user),
):
    """发送消息，SSE 流式返回。"""
    return StreamingResponse(
        chat_agent.respond(user.id, body.session_id, body.message, user.membership.level),
        media_type="text/event-stream",
    )

@router.post("/sessions", response_model=ChatSessionResponse)
async def create_session(user: User = Depends(get_current_user)):
    """创建新对话会话。"""
    ...

@router.get("/sessions/{session_id}/messages", response_model=list[ChatMessageResponse])
async def get_messages(
    session_id: UUID,
    user: User = Depends(get_current_user),
):
    """获取会话历史消息。"""
    ...

@router.get("/quota", response_model=ChatQuotaResponse)
async def get_quota(user: User = Depends(get_current_user)):
    """获取当日剩余查询次数。"""
    ...
```

### 5.5 合约数据 API (需求13)

```python
# app/api/derivatives.py
router = APIRouter(prefix="/api/derivatives", tags=["derivatives"])

@router.get("/snapshot/{symbol}", response_model=DerivativesSnapshot)
async def get_snapshot(
    symbol: str,
    user: User = Depends(get_current_user),
):
    """获取最新合约数据快照。免费用户仅资金费率当前值。"""
    ...

@router.get("/funding-history/{symbol}")
async def get_funding_history(
    symbol: str,
    days: int = Query(default=7, le=30),
    user: User = Depends(require_level(1)),
):
    """获取资金费率历史趋势。专业+旗舰可用。"""
    ...

@router.get("/liquidations/{symbol}", response_model=list[LiquidationEvent])
async def get_liquidations(
    symbol: str,
    limit: int = Query(default=50, le=50),
    user: User = Depends(require_level(1)),
):
    """获取最近爆仓事件流水。专业+旗舰可用。"""
    ...
```

---

## 六、前端新增组件设计

### 6.1 页面结构扩展

```
frontend/app/
├── alerts/page.tsx              ← 新增：预警规则管理页
├── chat/                        ← 新增（侧边栏组件，非独立页面）
├── dashboard/page.tsx           ← 扩展：新增合约面板、绩效摘要
├── performance/page.tsx         ← 新增：绩效详情页
└── correlation/page.tsx         ← 新增：关联分析页
```

### 6.2 新增组件

```
frontend/components/
├── alerts/
│   ├── AlertRuleForm.tsx        ← 规则创建/编辑表单
│   ├── AlertRuleList.tsx        ← 规则列表（启用/禁用/删除）
│   └── AlertTriggerHistory.tsx  ← 触发历史列表
├── chat/
│   ├── ChatSidebar.tsx          ← 可折叠聊天侧边栏
│   ├── ChatMessage.tsx          ← 单条消息（支持 Markdown 渲染）
│   └── ChatInput.tsx            ← 输入框 + 剩余次数显示
├── derivatives/
│   ├── DerivativesPanel.tsx     ← 合约数据面板（资金费率+多空比+爆仓汇总）
│   ├── FundingRateChart.tsx     ← 资金费率历史趋势图
│   └── LiquidationFeed.tsx      ← 实时爆仓流水列表
├── performance/
│   ├── PerformanceSummary.tsx   ← 绩效摘要卡片（胜率/盈亏比）
│   ├── WinRateTrend.tsx         ← 胜率趋势折线图
│   └── PnlCurve.tsx            ← 累计盈亏曲线
└── correlation/
    └── CorrelationHeatmap.tsx   ← 关联矩阵热力图
```

### 6.3 关键组件接口

```typescript
// components/chat/ChatSidebar.tsx
interface ChatSidebarProps {
  isOpen: boolean;
  onToggle: () => void;
}
// 默认收起，点击展开。展开时显示历史消息。
// AI回复支持 Markdown 渲染（react-markdown）。
// 流式打字效果通过 SSE EventSource 实现。
// 底部显示当日剩余查询次数。
// "新建会话"按钮清空上下文。

// components/derivatives/DerivativesPanel.tsx
interface DerivativesPanelProps {
  symbol: string;
  membershipLevel: number;
}
// 资金费率：百分比显示，正值绿色，负值红色
// 多空比：柱状图
// 24h爆仓汇总：金额
// 免费用户仅显示资金费率当前值

// components/derivatives/LiquidationFeed.tsx
interface LiquidationFeedProps {
  symbol: string;
  events: LiquidationEvent[];
}
// 最近50条爆仓事件
// 单笔 > $1M 高亮显示（红色边框 + 闪烁动画）

// components/performance/PerformanceSummary.tsx
interface PerformanceSummaryProps {
  stats: PerformanceStats;
  membershipLevel: number;
}
// 免费用户：仅胜率和总策略数
// 专业/旗舰：完整统计

// components/alerts/AlertRuleForm.tsx
interface AlertRuleFormProps {
  symbol: string;
  onSubmit: (rule: AlertRuleCreate) => Promise<void>;
  initialValues?: AlertRuleResponse;  // 编辑模式
}
// 指标类型下拉选择
// 运算符下拉选择
// 阈值数字输入
// AND/OR 逻辑组合（最多2层）
// 通知渠道多选

// components/correlation/CorrelationHeatmap.tsx
interface CorrelationHeatmapProps {
  matrix: Record<string, Record<string, number>>;
  symbols: string[];
}
// 热力图：-1(红) → 0(白) → 1(绿)
// 强相关(|r|>0.8)加粗边框
```

### 6.4 API 封装

```typescript
// frontend/lib/api/alerts.ts
export const alertsApi = {
  createRule: (rule: AlertRuleCreate) => post<AlertRuleResponse>('/api/alerts/rules', rule),
  listRules: () => get<AlertRuleResponse[]>('/api/alerts/rules'),
  updateRule: (id: string, update: AlertRuleUpdate) => put<AlertRuleResponse>(`/api/alerts/rules/${id}`, update),
  deleteRule: (id: string) => del(`/api/alerts/rules/${id}`),
  listTriggers: (limit?: number) => get<AlertTriggerResponse[]>('/api/alerts/triggers', { limit }),
};

// frontend/lib/api/chat.ts
export const chatApi = {
  sendMessage: (sessionId: string, message: string) =>
    fetchSSE('/api/chat/message', { session_id: sessionId, message }),
  createSession: () => post<ChatSessionResponse>('/api/chat/sessions'),
  getMessages: (sessionId: string) => get<ChatMessageResponse[]>(`/api/chat/sessions/${sessionId}/messages`),
  getQuota: () => get<ChatQuotaResponse>('/api/chat/quota'),
};

// frontend/lib/api/derivatives.ts
export const derivativesApi = {
  getSnapshot: (symbol: string) => get<DerivativesSnapshot>(`/api/derivatives/snapshot/${symbol}`),
  getFundingHistory: (symbol: string, days?: number) => get(`/api/derivatives/funding-history/${symbol}`, { days }),
  getLiquidations: (symbol: string) => get<LiquidationEvent[]>(`/api/derivatives/liquidations/${symbol}`),
};

// frontend/lib/api/performance.ts
export const performanceApi = {
  getStats: (params?: { symbol?: string; days?: number; direction?: string }) =>
    get<PerformanceStats>('/api/performance/stats', params),
  getSnapshotDetail: (id: string) => get<SnapshotDetail>(`/api/performance/snapshots/${id}`),
  getTrend: (days?: number) => get('/api/performance/trend', { days }),
};
```
