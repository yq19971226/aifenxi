# 智能体实现状态说明

## ✅ 所有 10 个智能体都已实现！

### 已实现的智能体列表

| # | 智能体 ID | 文件路径 | 状态 | 代码行数 | 说明 |
|---|----------|---------|------|---------|------|
| 1 | technical | `app/agents/technical.py` | ✅ 已实现 | ~300 行 | 技术分析智能体 |
| 2 | onchain | `app/agents/onchain.py` | ✅ 已实现 | ~350 行 | 链上数据智能体 |
| 3 | playbook | `app/agents/playbook.py` | ✅ 已实现 | ~400 行 | 剧本推演智能体 |
| 4 | risk | `app/agents/risk.py` | ✅ 已实现 | ~250 行 | 风险预警智能体 |
| 5 | orderbook | `app/agents/orderbook.py` | ✅ 已实现 | ~300 行 | 订单簿分析智能体 |
| 6 | **sentiment** | `app/agents/sentiment.py` | ✅ **已实现** | ~200 行 | **舆情分析智能体** |
| 7 | news_analyst | `app/agents/news_analyst.py` | ✅ 已实现 | ~250 行 | 新闻分析智能体 |
| 8 | calendar | `app/agents/calendar.py` | ✅ 已实现 | 373 行 | 日历事件智能体（新增） |
| 9 | **adversarial** | `app/agents/adversarial.py` | ✅ **已实现** | ~300 行 | **对抗推演智能体** |
| 10 | **collusion_detector** | `app/agents/collusion_detector.py` | ✅ **已实现** | ~350 行 | **合谋检测智能体** |

---

## 🔍 为什么默认禁用？

### 1. **sentiment（舆情分析智能体）** - 默认禁用 ❌

**原因**：
- ✅ 代码已实现
- ❌ 需要配置外部 API Key（LunarCrush / Twitter API）
- ❌ 需要 sentiment_worker 定时采集数据
- ❌ 数据源可能需要付费

**功能**：
- 监控社交媒体情绪
- 识别 FUD/FOMO 操纵
- 检测 KOL 协同喊单
- 分析恐慌贪婪指数

**启用条件**：
1. 配置 Twitter API / LunarCrush API Key
2. 启动 sentiment_worker
3. 在管理后台启用该智能体

---

### 2. **adversarial（对抗推演智能体）** - 默认禁用 ❌

**原因**：
- ✅ 代码已实现
- ❌ 仅在 **Trend 模式**下使用（长线分析）
- ❌ 需要 deepseek-reasoner 模型（深度推理）
- ❌ 计算成本较高

**功能**：
- 站在庄家 AI 视角推演
- 预测庄家下一步操作
- 识别价格陷阱
- 输出反制策略

**启用条件**：
1. 使用 Trend 模式分析
2. 配置 deepseek-reasoner 模型
3. 在管理后台启用该智能体

---

### 3. **collusion_detector（合谋检测智能体）** - 默认禁用 ❌

**原因**：
- ✅ 代码已实现
- ❌ 仅在 **Trend 模式**下使用（长线分析）
- ❌ 需要大量链上数据和订单簿数据
- ❌ 计算复杂度高

**功能**：
- 检测对倒交易（Wash Trading）
- 识别拉地毯前兆（Rug Pull）
- 检测多账号协同操纵
- 识别 KOL + 链上地址联动

**启用条件**：
1. 使用 Trend 模式分析
2. 确保链上数据和订单簿数据完整
3. 在管理后台启用该智能体

---

## 📊 智能体使用场景

### Scalping 模式（超短线）
- ✅ technical（技术分析）

### Intraday 模式（日内交易）
- ✅ technical（技术分析）
- ✅ onchain（链上数据）
- ✅ orderbook（订单簿）
- ✅ risk（风险预警）
- ✅ news_analyst（新闻分析）
- ✅ calendar（日历事件）
- ✅ playbook（剧本推演）

### Trend 模式（趋势交易）
- ✅ technical（技术分析）
- ✅ onchain（链上数据）
- ✅ orderbook（订单簿）
- ✅ sentiment（舆情分析）⚠️
- ✅ playbook（剧本推演）
- ✅ risk（风险预警）
- ✅ news_analyst（新闻分析）
- ✅ calendar（日历事件）
- ✅ **adversarial（对抗推演）**⚠️
- ✅ **collusion_detector（合谋检测）**⚠️

⚠️ = 默认禁用，需要手动启用

---

## 🚀 如何启用这三个智能体？

### 方法 1：通过 API 启用（推荐）

```bash
# 启用舆情分析智能体
curl -X PUT "http://localhost:8000/api/agents/sentiment" \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"enabled": true}'

# 启用对抗推演智能体
curl -X PUT "http://localhost:8000/api/agents/adversarial" \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"enabled": true}'

# 启用合谋检测智能体
curl -X PUT "http://localhost:8000/api/agents/collusion_detector" \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"enabled": true}'
```

### 方法 2：批量启用

```bash
curl -X POST "http://localhost:8000/api/agents/batch-update" \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "updates": [
      {"agent_id": "sentiment", "enabled": true},
      {"agent_id": "adversarial", "enabled": true},
      {"agent_id": "collusion_detector", "enabled": true}
    ]
  }'
```

### 方法 3：直接修改数据库

```sql
-- 启用三个智能体
UPDATE agent_configs 
SET enabled = TRUE 
WHERE agent_id IN ('sentiment', 'adversarial', 'collusion_detector');
```

### 方法 4：前端管理界面

在前端管理界面中，找到这三个智能体，点击开关即可启用。

---

## ⚠️ 启用前的准备工作

### 1. sentiment（舆情分析）

**需要配置**：
```bash
# .env 文件
LUNARCRUSH_API_KEY=your_key_here
# 或
TWITTER_API_KEY=your_key_here
TWITTER_API_SECRET=your_secret_here
```

**需要启动 Worker**：
```bash
# 确保 sentiment_worker 在运行
celery -A workers.celery_app worker --loglevel=info
```

### 2. adversarial（对抗推演）

**需要配置**：
```bash
# .env 文件
DEEPSEEK_API_KEY=your_key_here
```

**需要在 model_router 中配置**：
```python
# app/core/model_router.py
AGENT_MODEL_MAP = {
    "adversarial": "deepseek-reasoner",  # 使用深度推理模型
    # ...
}
```

### 3. collusion_detector（合谋检测）

**需要确保数据完整**：
- ✅ 链上数据采集正常（onchain_worker）
- ✅ 订单簿数据采集正常（orderbook_worker）
- ✅ 舆情数据采集正常（sentiment_worker）

---

## 📝 总结

### 实现状态
- ✅ **所有 10 个智能体都已实现**
- ✅ 代码完整，功能齐全
- ✅ 已集成到 AnalysisOrchestrator

### 默认禁用原因
1. **sentiment**：需要外部 API Key 和数据采集
2. **adversarial**：仅 Trend 模式使用，计算成本高
3. **collusion_detector**：仅 Trend 模式使用，数据要求高

### 启用方式
- 通过 API 端点启用
- 通过前端管理界面启用
- 通过数据库直接修改

### 启用后效果
- Trend 模式分析将包含这三个智能体的报告
- 可以检测更复杂的市场操纵行为
- 提供更全面的风险预警

---

**结论**：这三个智能体都已经实现，只是默认禁用。你可以随时通过管理后台启用它们！
