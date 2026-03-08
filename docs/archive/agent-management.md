# 智能体管理系统 - 完整实现文档

## 📋 功能概述

实现了一个完整的智能体管理系统，支持：
- ✅ 动态启用/关闭智能体
- ✅ 按分类管理智能体
- ✅ 智能体优先级排序
- ✅ 配置持久化到数据库
- ✅ Redis 缓存加速
- ✅ 前端 API 接口
- ✅ 管理员权限控制

---

## 🎯 当前智能体列表（10个）

| 智能体 ID | 名称 | 分类 | 优先级 | 默认启用 | 说明 |
|----------|------|------|--------|---------|------|
| technical | 技术分析智能体 | technical | 10 | ✅ | 分析技术指标、趋势、支撑阻力位 |
| onchain | 链上数据智能体 | onchain | 9 | ✅ | 分析链上数据、巨鲸动向、交易所流动 |
| playbook | 剧本推演智能体 | market | 8 | ✅ | 识别庄家操盘手法，推演剧本阶段 |
| risk | 风险预警智能体 | risk | 7 | ✅ | 监控风险指标，触发预警 |
| orderbook | 订单簿分析智能体 | market | 6 | ✅ | 分析订单簿微观结构，识别操纵行为 |
| sentiment | 舆情分析智能体 | market | 5 | ❌ | 监控社交媒体情绪，识别 FUD/FOMO |
| news_analyst | 新闻分析智能体 | market | 4 | ✅ | 分析新闻事件，评估市场影响 |
| calendar | 日历事件智能体 | market | 3 | ✅ | 分析即将到来的事件，评估价格影响 |
| adversarial | 对抗推演智能体 | risk | 2 | ❌ | 从对手角度推演，发现盲点 |
| collusion_detector | 合谋检测智能体 | risk | 1 | ❌ | 检测多方合谋操纵行为 |

---

## 📊 智能体分类

| 分类 ID | 分类名称 | 说明 |
|---------|---------|------|
| technical | 技术分析 | 技术指标、K线形态、趋势分析 |
| onchain | 链上数据 | 链上交易、巨鲸动向、交易所流动 |
| market | 市场分析 | 订单簿、舆情、新闻、日历事件 |
| risk | 风险管理 | 风险预警、对抗推演、合谋检测 |

---

## 🚀 快速开始

### 步骤 1：运行数据库迁移
```bash
psql -U omnimind -d omnimind -f backend/migrations/v11_agent_configs.sql
```

### 步骤 2：重启服务
```bash
docker-compose restart backend
```

### 步骤 3：初始化智能体配置（可选）
```bash
curl -X POST "http://localhost:8000/api/agents/initialize" \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"
```

---

## 📡 API 端点

### 1. 获取所有智能体
```bash
GET /api/agents
```

**响应示例**：
```json
{
  "agents": [
    {
      "agent_id": "technical",
      "agent_name": "技术分析智能体",
      "description": "分析技术指标、趋势、支撑阻力位",
      "category": "technical",
      "category_name": "技术分析",
      "priority": 10,
      "enabled": true,
      "created_at": "2026-03-03T00:00:00Z",
      "updated_at": "2026-03-03T00:00:00Z"
    }
  ],
  "total": 10
}
```

### 2. 获取启用的智能体
```bash
GET /api/agents/enabled
```

**响应示例**：
```json
{
  "enabled_agents": ["technical", "onchain", "playbook", "risk", "orderbook", "news_analyst", "calendar"],
  "count": 7
}
```

### 3. 获取智能体统计
```bash
GET /api/agents/stats
```

**响应示例**：
```json
{
  "total_agents": 10,
  "enabled_agents": 7,
  "disabled_agents": 3,
  "categories": 4
}
```

### 4. 获取智能体分类
```bash
GET /api/agents/categories
```

**响应示例**：
```json
{
  "categories": [
    {"id": "technical", "name": "技术分析"},
    {"id": "onchain", "name": "链上数据"},
    {"id": "market", "name": "市场分析"},
    {"id": "risk", "name": "风险管理"}
  ]
}
```

### 5. 按分类获取智能体
```bash
GET /api/agents/category/market
```

**响应示例**：
```json
{
  "category": "market",
  "category_name": "市场分析",
  "agents": [
    {
      "agent_id": "playbook",
      "agent_name": "剧本推演智能体",
      "description": "识别庄家操盘手法，推演剧本阶段",
      "priority": 8,
      "enabled": true
    }
  ],
  "count": 4
}
```

### 6. 更新智能体状态（管理员）
```bash
PUT /api/agents/technical
Content-Type: application/json
Authorization: Bearer YOUR_ADMIN_TOKEN

{
  "enabled": false
}
```

**响应示例**：
```json
{
  "success": true,
  "agent_id": "technical",
  "enabled": false,
  "message": "智能体已禁用"
}
```

### 7. 批量更新智能体（管理员）
```bash
POST /api/agents/batch-update
Content-Type: application/json
Authorization: Bearer YOUR_ADMIN_TOKEN

{
  "updates": [
    {"agent_id": "sentiment", "enabled": true},
    {"agent_id": "adversarial", "enabled": true},
    {"agent_id": "collusion_detector", "enabled": true}
  ]
}
```

**响应示例**：
```json
{
  "success": true,
  "updated": 3,
  "failed": 0,
  "errors": []
}
```

---

## 🎨 前端集成示例

### React 组件示例

```typescript
import React, { useEffect, useState } from 'react';
import { Switch, Card, Tag, Divider, Statistic, Row, Col } from 'antd';

interface Agent {
  agent_id: string;
  agent_name: string;
  description: string;
  category: string;
  category_name: string;
  priority: number;
  enabled: boolean;
}

interface AgentStats {
  total_agents: number;
  enabled_agents: number;
  disabled_agents: number;
  categories: number;
}

export const AgentManagement: React.FC = () => {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [stats, setStats] = useState<AgentStats | null>(null);
  const [loading, setLoading] = useState(false);

  // 加载智能体列表
  useEffect(() => {
    fetchAgents();
    fetchStats();
  }, []);

  const fetchAgents = async () => {
    const response = await fetch('/api/agents');
    const data = await response.json();
    setAgents(data.agents);
  };

  const fetchStats = async () => {
    const response = await fetch('/api/agents/stats');
    const data = await response.json();
    setStats(data);
  };

  // 切换智能体状态
  const handleToggle = async (agentId: string, enabled: boolean) => {
    setLoading(true);
    try {
      await fetch(`/api/agents/${agentId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify({ enabled }),
      });
      
      // 刷新列表
      await fetchAgents();
      await fetchStats();
    } catch (error) {
      console.error('Failed to update agent:', error);
    } finally {
      setLoading(false);
    }
  };

  // 按分类分组
  const groupedAgents = agents.reduce((acc, agent) => {
    if (!acc[agent.category]) {
      acc[agent.category] = [];
    }
    acc[agent.category].push(agent);
    return acc;
  }, {} as Record<string, Agent[]>);

  return (
    <div>
      <h1>智能体管理</h1>
      
      {/* 统计信息 */}
      {stats && (
        <Row gutter={16} style={{ marginBottom: 24 }}>
          <Col span={6}>
            <Card>
              <Statistic title="总智能体数" value={stats.total_agents} />
            </Card>
          </Col>
          <Col span={6}>
            <Card>
              <Statistic 
                title="已启用" 
                value={stats.enabled_agents} 
                valueStyle={{ color: '#3f8600' }}
              />
            </Card>
          </Col>
          <Col span={6}>
            <Card>
              <Statistic 
                title="已禁用" 
                value={stats.disabled_agents} 
                valueStyle={{ color: '#cf1322' }}
              />
            </Card>
          </Col>
          <Col span={6}>
            <Card>
              <Statistic title="分类数" value={stats.categories} />
            </Card>
          </Col>
        </Row>
      )}

      {/* 按分类显示智能体 */}
      {Object.entries(groupedAgents).map(([category, categoryAgents]) => (
        <div key={category} style={{ marginBottom: 24 }}>
          <h2>{categoryAgents[0].category_name}</h2>
          <Divider />
          
          {categoryAgents.map((agent) => (
            <Card 
              key={agent.agent_id}
              style={{ marginBottom: 16 }}
              extra={
                <Switch
                  checked={agent.enabled}
                  loading={loading}
                  onChange={(checked) => handleToggle(agent.agent_id, checked)}
                />
              }
            >
              <Card.Meta
                title={
                  <>
                    {agent.agent_name}
                    <Tag color={agent.enabled ? 'green' : 'red'} style={{ marginLeft: 8 }}>
                      {agent.enabled ? '已启用' : '已禁用'}
                    </Tag>
                    <Tag color="blue">优先级: {agent.priority}</Tag>
                  </>
                }
                description={agent.description}
              />
            </Card>
          ))}
        </div>
      ))}
    </div>
  );
};
```

---

## 🔧 后端集成

### 在 AnalysisOrchestrator 中使用

```python
from app.services.agent_loader import get_enabled_agent_instances

async def _run_intraday(self, data: MarketData) -> AnalysisReport:
    """Intraday 模式分析"""
    
    # 1. 获取启用的智能体（自动从数据库读取）
    agents = await get_enabled_agent_instances("intraday")
    
    # 2. 并行调用智能体
    reports = await asyncio.gather(*[
        self._safe_call_agent(agent, data)
        for agent in agents
    ])
    
    # 3. 过滤失败的报告
    valid_reports = [r for r in reports if r is not None]
    
    # 4. 运行共识引擎
    consensus = await run_nsed(valid_reports)
    
    # ... 后续处理
```

---

## 📝 数据库表结构

```sql
CREATE TABLE agent_configs (
    agent_id VARCHAR(50) PRIMARY KEY,
    agent_name VARCHAR(100) NOT NULL,
    description TEXT,
    category VARCHAR(50),
    priority INTEGER DEFAULT 0,
    enabled BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## ✨ 核心功能

1. ✅ **动态启用/关闭**：无需重启服务，实时生效
2. ✅ **分类管理**：按技术分析、链上数据、市场分析、风险管理分类
3. ✅ **优先级排序**：智能体按优先级执行
4. ✅ **配置持久化**：配置保存到数据库
5. ✅ **Redis 缓存**：加速配置读取（TTL 5 分钟）
6. ✅ **权限控制**：只有管理员可以修改配置
7. ✅ **批量操作**：支持批量启用/禁用
8. ✅ **统计信息**：实时统计启用/禁用数量

---

## 🎉 集成完成！

现在你的系统支持：
- ✅ 动态管理 10 个智能体
- ✅ 前端可视化配置界面
- ✅ 实时启用/禁用，无需重启
- ✅ 按分类和优先级管理
- ✅ 完整的 API 接口

**下一步**：
1. 运行数据库迁移
2. 重启服务
3. 在前端实现管理界面
4. 测试智能体启用/禁用功能
