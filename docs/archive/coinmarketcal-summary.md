# 🎉 CoinMarketCal 官方 API 集成完成

## ✅ 已完成的工作

### 1. **数据采集层** ✅
- ✅ `app/data/calendar.py` - CoinMarketCal API 采集器
  - 支持按币种、日期范围、分类筛选事件
  - 支持高影响力事件筛选（投票数阈值）
  - 完整的错误处理和日志记录
  - 支持分页查询

### 2. **Worker 定时任务** ✅
- ✅ `workers/calendar_worker.py` - Celery 定时任务
  - 每天凌晨 3 点：采集所有币种未来 30 天事件
  - 每 6 小时：采集高影响力事件（投票数 > 50）
  - 每天凌晨 4 点：清理 7 天前的过期事件
  - 自动缓存到 Redis

### 3. **智能体分析** ✅
- ✅ `app/agents/calendar.py` - CalendarAgent 日历事件分析智能体
  - 评估事件对价格的影响（-10 到 +10）
  - 时间衰减系数（越近影响越大）
  - 社区关注度加成（投票数）
  - 可信度评估（是否有 proof）
  - 输出交易信号和置信度

### 4. **数据库表结构** ✅
- ✅ `migrations/v10_calendar_events.sql` - 数据库迁移脚本
  - `calendar_events` 表（存储事件）
  - 索引优化（symbol, event_date, vote_count）
  - 自动更新 updated_at 触发器

### 5. **API 路由** ✅
- ✅ `app/api/calendar.py` - RESTful API 端点
  - `GET /api/calendar/events` - 获取事件列表
  - `GET /api/calendar/events/upcoming` - 获取即将到来的事件
  - `GET /api/calendar/events/high-impact` - 获取高影响力事件
  - `POST /api/calendar/sync` - 手动触发同步（管理员）

### 6. **配置文件** ✅
- ✅ `app/core/config.py` - 添加 `coinmarketcal_api_key` 配置
- ✅ `workers/celery_app.py` - 注册 calendar_worker 和定时任务
- ✅ `.env.example` - 添加 API Key 配置说明

### 7. **文档和测试** ✅
- ✅ `docs/coinmarketcal-integration.md` - 完整集成文档
- ✅ `tests/test_coinmarketcal.py` - 集成测试脚本

---

## 📊 数据流架构

```
CoinMarketCal API
    ↓
calendar_worker (Celery 定时任务)
    ↓
TimescaleDB calendar_events 表
    ↓
Redis 缓存 (calendar:{symbol})
    ↓
CalendarAgent (智能体分析)
    ↓
AnalysisOrchestrator (集成到分析流程)
    ↓
前端展示
```

---

## 🚀 快速开始

### 1. 获取 API Key
访问：https://coinmarketcal.com/en/api
注册并获取 API Key

### 2. 配置环境变量
```bash
# 编辑 .env 文件
COINMARKETCAL_API_KEY=your_api_key_here
```

### 3. 运行数据库迁移
```bash
psql -U omnimind -d omnimind -f backend/migrations/v10_calendar_events.sql
```

### 4. 重启服务
```bash
# Docker 环境
docker-compose restart backend worker

# 本地开发环境
# 重启 Celery Worker
pkill -f "celery.*worker"
celery -A workers.celery_app worker --loglevel=info

# 启动 Celery Beat
celery -A workers.celery_app beat --loglevel=info
```

### 5. 运行测试
```bash
cd backend
python tests/test_coinmarketcal.py
```

---

## 📈 事件影响评分示例

### 示例1：Binance 上线（强利好）
- **基础影响分**：+8
- **时间距离**：2 天后（系数 1.5）
- **投票数**：150（系数 1.3）
- **最终影响分**：8 × 1.5 × 1.3 = **+15.6**
- **信号**：bullish
- **置信度**：0.85

### 示例2：Token Unlock（强利空）
- **基础影响分**：-7
- **时间距离**：5 天后（系数 1.2）
- **投票数**：80（系数 1.1）
- **最终影响分**：-7 × 1.2 × 1.1 = **-9.2**
- **信号**：bearish
- **置信度**：0.75

### 示例3：AMA 问答（中性）
- **基础影响分**：+1
- **时间距离**：20 天后（系数 0.7）
- **投票数**：30（系数 1.0）
- **最终影响分**：1 × 0.7 × 1.0 = **+0.7**
- **信号**：neutral
- **置信度**：0.3

---

## 🎯 集成到分析流程

### CalendarAgent 已自动集成到以下模式：

#### Intraday 模式（日内交易）
```python
# 在 analysis_orchestrator.py 中
agents = [
    TechnicalAgent(),
    OnchainAgent(),
    OrderBookAgent(),
    RiskAgent(),
    NewsAnalystAgent(),
    CalendarAgent(),  # ✅ 已集成
    PlaybookAgent(),
]
```

#### Trend 模式（趋势交易）
```python
# 在 analysis_orchestrator.py 中
agents = [
    TechnicalAgent(),
    OnchainAgent(),
    OrderBookAgent(),
    SentimentAgent(),
    PlaybookAgent(),
    RiskAgent(),
    NewsAnalystAgent(),
    CalendarAgent(),  # ✅ 已集成
    AdversarialAgent(),
]
```

---

## 📝 API 使用示例

### 前端调用示例

```typescript
// 获取 BTC 未来 30 天的事件
const response = await fetch('/api/calendar/events?symbol=BTCUSDT&days_ahead=30');
const data = await response.json();

console.log(`获取到 ${data.total_count} 个事件`);
data.events.forEach(event => {
  console.log(`${event.title} - ${event.event_date}`);
});

// 获取高影响力事件
const highImpact = await fetch('/api/calendar/events/high-impact?symbol=BTCUSDT&min_votes=50');
const impactData = await highImpact.json();

console.log(`高影响力事件: ${impactData.count} 个`);
```

---

## 🔍 数据查询示例

### SQL 查询

```sql
-- 查看即将到来的事件
SELECT symbol, title, event_date, categories, vote_count
FROM calendar_events
WHERE event_date > NOW()
  AND symbol = 'BTC'
ORDER BY event_date ASC
LIMIT 10;

-- 查看 Token Unlock 利空事件
SELECT symbol, title, event_date, vote_count
FROM calendar_events
WHERE categories LIKE '%Token Unlock%'
  AND event_date > NOW()
ORDER BY event_date ASC;

-- 统计各分类事件数量
SELECT 
  UNNEST(string_to_array(categories, ',')) AS category,
  COUNT(*) AS count
FROM calendar_events
WHERE event_date > NOW()
GROUP BY category
ORDER BY count DESC;
```

### Redis 查询

```bash
# 查看缓存的事件
redis-cli
> GET calendar:BTCUSDT
> GET calendar:high_impact:BTCUSDT

# 查看所有日历相关的键
> KEYS calendar:*
```

---

## 🎨 前端展示建议

### 1. 日历视图
```typescript
// 在仪表盘显示即将到来的事件
<EventCalendar>
  {events.map(event => (
    <EventCard
      title={event.title}
      date={event.event_date}
      category={event.categories[0]}
      impact={calculateImpact(event)}
      votes={event.vote_count}
    />
  ))}
</EventCalendar>
```

### 2. 时间线视图
```typescript
// 显示未来 7 天的事件时间线
<Timeline>
  {upcomingEvents.map(event => (
    <TimelineItem
      date={event.event_date}
      title={event.title}
      daysToEvent={event.days_to_event}
      impactScore={event.impact_score}
    />
  ))}
</Timeline>
```

### 3. 高影响力事件提醒
```typescript
// 在顶部显示高影响力事件提醒
{highImpactEvents.length > 0 && (
  <Alert severity="warning">
    ⚠️ 未来 3 天有 {highImpactEvents.length} 个高影响力事件
  </Alert>
)}
```

---

## 🔧 维护和监控

### 监控指标

1. **API 配额使用**
   - 每月请求数
   - 剩余配额
   - 配额耗尽预警

2. **数据采集状态**
   - 每日采集成功率
   - 采集失败次数
   - 平均响应时间

3. **数据库状态**
   - 事件总数
   - 过期事件清理数
   - 高影响力事件占比

### 日志监控

```bash
# 查看 calendar_worker 日志
docker-compose logs -f worker | grep calendar

# 查看采集成功日志
grep "Calendar events collected" /var/log/omnimind/worker.log

# 查看采集失败日志
grep "Failed to collect calendar events" /var/log/omnimind/worker.log
```

---

## 📚 相关文件清单

### 核心文件
- `backend/app/data/calendar.py` - API 采集器
- `backend/workers/calendar_worker.py` - Celery 任务
- `backend/app/agents/calendar.py` - 智能体
- `backend/app/api/calendar.py` - API 路由
- `backend/migrations/v10_calendar_events.sql` - 数据库表

### 配置文件
- `backend/app/core/config.py` - 配置类
- `backend/workers/celery_app.py` - Celery 配置
- `.env.example` - 环境变量模板

### 文档和测试
- `docs/coinmarketcal-integration.md` - 集成文档
- `backend/tests/test_coinmarketcal.py` - 测试脚本

---

## ✨ 功能亮点

1. **完整的数据流闭环**
   - API 采集 → 数据库存储 → Redis 缓存 → 智能体分析 → 前端展示

2. **智能影响评分**
   - 基础影响分（事件类型）
   - 时间衰减系数（越近影响越大）
   - 社区关注度加成（投票数）
   - 可信度评估（proof 链接）

3. **自动化运维**
   - 定时采集（每天/每 6 小时）
   - 自动清理过期事件
   - 错误处理和降级策略

4. **灵活的查询接口**
   - 按币种筛选
   - 按日期范围筛选
   - 按投票数筛选
   - 高影响力事件专用接口

---

## 🎉 总结

CoinMarketCal 官方 API 已完整集成到系统中！

**新增能力**：
- ✅ 自动采集币圈日历事件
- ✅ 智能评估事件对价格的影响
- ✅ 提前预警利空事件（Token Unlock）
- ✅ 识别高影响力事件（Exchange Listing）
- ✅ 结合技术分析和链上数据做综合判断

**下一步**：
1. 获取 CoinMarketCal API Key
2. 配置环境变量
3. 运行数据库迁移
4. 重启服务
5. 运行测试脚本验证

**需要帮助？**
查看完整文档：`docs/coinmarketcal-integration.md`
