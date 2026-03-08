# CoinMarketCal 官方 API 集成完整指南

## 📅 功能概述

集成 CoinMarketCal 官方 API，实时获取币圈日历事件，用于：
- 评估即将到来的事件对价格的影响
- 识别高影响力事件（Exchange Listing、Token Unlock 等）
- 提前预警利空事件（代币解锁、硬分叉）
- 结合技术分析和链上数据做综合判断

---

## 🔑 获取 API Key

### 步骤1：注册账号
访问：https://coinmarketcal.com/en/api

### 步骤2：选择套餐
- **Free Plan**：每月 1,000 次请求（适合测试）
- **Starter Plan**：$19/月，10,000 次请求
- **Pro Plan**：$49/月，50,000 次请求

### 步骤3：获取 API Key
注册后在 Dashboard 获取 API Key

---

## ⚙️ 配置步骤

### 1. 添加环境变量

编辑 `.env` 文件：

```bash
# CoinMarketCal API
COINMARKETCAL_API_KEY=your_api_key_here
```

### 2. 运行数据库迁移

```bash
# 创建日历事件表
psql -U omnimind -d omnimind -f backend/migrations/v10_calendar_events.sql
```

或者在 PostgreSQL 中执行：

```sql
-- 查看迁移脚本
cat backend/migrations/v10_calendar_events.sql
```

### 3. 重启 Celery Worker

```bash
# 停止现有 Worker
pkill -f "celery.*worker"

# 启动新 Worker（包含 calendar_worker）
cd backend
celery -A workers.celery_app worker --loglevel=info
```

### 4. 启动 Celery Beat（定时任务调度器）

```bash
celery -A workers.celery_app beat --loglevel=info
```

---

## 📊 数据采集任务

### 自动任务（Celery Beat）

| 任务 | 频率 | 说明 |
|------|------|------|
| `collect_calendar_events` | 每天凌晨 3 点 | 采集所有币种未来 30 天事件 |
| `collect_high_impact_events` | 每 6 小时 | 采集高影响力事件（投票数 > 50） |
| `cleanup_old_events` | 每天凌晨 4 点 | 清理 7 天前的过期事件 |

### 手动触发（测试用）

```python
# 进入 Python 环境
cd backend
python

# 手动采集单个币种
import asyncio
from app.data.calendar import CoinMarketCalCollector

collector = CoinMarketCalCollector("your_api_key")
events = asyncio.run(collector.fetch_upcoming_events("BTC", days_ahead=30))
print(f"获取到 {len(events)} 个事件")

# 查看事件详情
for event in events[:3]:
    print(f"{event.title} - {event.date_event} - {event.categories}")
```

---

## 🤖 智能体集成

### CalendarAgent 使用

CalendarAgent 已自动集成到分析流程中，无需手动调用。

#### 在 Intraday/Trend 模式中自动启用

```python
# 在 analysis_orchestrator.py 中已集成
from app.agents.calendar import CalendarAgent

calendar_agent = CalendarAgent()
report = await calendar_agent.analyze(market_data)

# 输出示例
{
    "agent_id": "calendar",
    "signal": "bullish",
    "confidence": 0.75,
    "reasoning": "未来3天有2个高影响力事件：Binance上线和主网升级",
    "key_findings": [
        "3天后 Binance 上线（影响 +8.5）",
        "7天后主网升级（影响 +6.0）",
        "总体影响偏利好 (+14.5)"
    ],
    "raw_data": {
        "upcoming_events": [...],
        "total_impact_score": 14.5,
        "high_impact_count": 2
    }
}
```

---

## 📈 事件影响评分规则

### 基础影响分

| 事件类型 | 影响分 | 说明 |
|---------|--------|------|
| **Exchange Listing** | +8 | 交易所上线（强利好） |
| **Mainnet Launch** | +7 | 主网上线（长期利好） |
| **Partnership** | +6 | 合作公告（中期利好） |
| **Burn** | +6 | 代币销毁（利好） |
| **Halving** | +9 | 减半事件（超级利好） |
| **Token Unlock** | -7 | 代币解锁（强利空） |
| **Hard Fork** | -2 | 硬分叉（不确定性） |
| **Conference** | +2 | 会议（中性偏利好） |
| **AMA** | +1 | 问答（中性） |

### 时间衰减系数

| 距离事件天数 | 系数 | 说明 |
|-------------|------|------|
| 0-3 天 | 1.5× | 即将发生，市场高度关注 |
| 4-7 天 | 1.2× | 近期事件 |
| 8-14 天 | 1.0× | 正常关注 |
| 15-30 天 | 0.7× | 较远，关注度低 |

### 社区关注度加成

| 投票数 | 系数 | 说明 |
|--------|------|------|
| > 100 | 1.3× | 高度关注 |
| 50-100 | 1.1× | 中等关注 |
| < 50 | 1.0× | 低关注 |

### 最终影响分计算

```
最终影响分 = 基础影响分 × 时间衰减系数 × 社区关注度系数
```

**示例**：
- 事件：Binance 上线（基础分 +8）
- 距离：2 天后（时间系数 1.5）
- 投票数：150（关注度系数 1.3）
- **最终影响分**：8 × 1.5 × 1.3 = **+15.6**

---

## 🔍 数据查询

### 查询数据库

```sql
-- 查看所有即将到来的事件
SELECT symbol, title, event_date, categories, vote_count
FROM calendar_events
WHERE event_date > NOW()
ORDER BY event_date ASC
LIMIT 20;

-- 查看高影响力事件
SELECT symbol, title, event_date, categories, vote_count
FROM calendar_events
WHERE event_date > NOW()
  AND vote_count > 50
ORDER BY vote_count DESC;

-- 查看 Token Unlock 事件（利空）
SELECT symbol, title, event_date, vote_count
FROM calendar_events
WHERE event_date > NOW()
  AND categories LIKE '%Token Unlock%'
ORDER BY event_date ASC;
```

### 查询 Redis 缓存

```bash
# 查看缓存的事件
redis-cli
> GET calendar:BTCUSDT
> GET calendar:high_impact:BTCUSDT
```

---

## 🎯 API 端点（前端调用）

### 获取日历事件

```typescript
// GET /api/calendar/events?symbol=BTCUSDT&days=30
const response = await fetch('/api/calendar/events?symbol=BTCUSDT&days=30');
const events = await response.json();

// 返回格式
{
  "events": [
    {
      "event_id": "123456",
      "title": "Binance Listing",
      "event_date": "2026-03-10T00:00:00Z",
      "categories": ["Exchange Listing"],
      "vote_count": 150,
      "impact_score": 15.6,
      "credibility": "high"
    }
  ],
  "total_count": 5,
  "high_impact_count": 2
}
```

---

## 🚨 注意事项

### 1. API 配额管理

```python
# 监控 API 使用量
# CoinMarketCal 会在响应头返回配额信息
# X-RateLimit-Limit: 1000
# X-RateLimit-Remaining: 950
```

### 2. 错误处理

```python
# 采集器已内置错误处理
# 失败时会记录日志并优雅降级
try:
    events = await collector.fetch_upcoming_events("BTC")
except httpx.HTTPStatusError as e:
    if e.response.status_code == 429:
        logger.error("API 配额耗尽")
    elif e.response.status_code == 401:
        logger.error("API Key 无效")
```

### 3. 数据质量

- 优先使用有 `proof_link` 的事件（可信度高）
- 投票数 > 50 的事件更可靠
- Token Unlock 事件需要特别关注（强利空）

---

## 📝 测试清单

- [ ] API Key 配置正确
- [ ] 数据库表创建成功
- [ ] Celery Worker 包含 calendar_worker
- [ ] 手动触发采集任务成功
- [ ] 数据库中有事件记录
- [ ] Redis 缓存有数据
- [ ] CalendarAgent 分析正常
- [ ] 前端可以显示事件

---

## 🔧 故障排查

### 问题1：API 返回 401 Unauthorized

**原因**：API Key 无效或未配置

**解决**：
```bash
# 检查环境变量
echo $COINMARKETCAL_API_KEY

# 重新配置
vim .env
# 添加：COINMARKETCAL_API_KEY=your_key

# 重启服务
docker-compose restart backend worker
```

### 问题2：数据库表不存在

**原因**：未运行迁移脚本

**解决**：
```bash
psql -U omnimind -d omnimind -f backend/migrations/v10_calendar_events.sql
```

### 问题3：Celery 任务未执行

**原因**：Beat 调度器未启动

**解决**：
```bash
# 启动 Beat
celery -A workers.celery_app beat --loglevel=info

# 查看任务列表
celery -A workers.celery_app inspect scheduled
```

---

## 📚 参考资料

- CoinMarketCal 官方文档：https://developers.coinmarketcal.com/
- API 端点列表：https://developers.coinmarketcal.com/v1/events
- 事件分类列表：https://developers.coinmarketcal.com/v1/categories

---

**集成完成！** 🎉

现在系统可以自动采集币圈日历事件，并通过 CalendarAgent 评估事件对价格的影响。
