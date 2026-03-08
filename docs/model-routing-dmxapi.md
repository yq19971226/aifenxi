# 模型分工与聚合 API 说明

## ✅ 是的！所有智能体都使用聚合 API

**聚合 API 网关**：https://www.dmxapi.cn/

所有智能体调用的模型都通过 DMXAPI 聚合网关，**不需要单独配置每个模型的 API Key**！

---

## 🎯 核心优势

### 1. **一个 API Key 调用所有模型**
- ✅ 只需配置 `DMX_API_KEY`
- ✅ 无需单独配置 DeepSeek、Claude、Grok、Qwen 等 API Key
- ✅ 统一计费，统一管理

### 2. **后台动态切换模型**
- ✅ 管理员可以在后台「模型分工」页面实时切换
- ✅ 无需重启服务
- ✅ 配置持久化到数据库

### 3. **成本优化**
- ✅ 统一计费，价格透明
- ✅ 自动记录每日成本
- ✅ 按模型统计用量

---

## 📊 当前模型分工（默认配置）

### 核心层智能体（6个）

| 智能体 | 默认模型 | 模型说明 | 适用场景 |
|--------|---------|---------|---------|
| **technical** | claude-sonnet | Claude Sonnet 4.5 | 技术分析、逻辑推理 |
| **onchain** | deepseek-v3.2-thinking | DeepSeek V3.2 Thinking | 链上数据分析 |
| **sentiment** | grok-fast | Grok-4 Fast | 舆情分析、实时信息 |
| **orderbook** | qwen3-max | Qwen3 Max | 订单簿分析、模式匹配 |
| **playbook** | deepseek-r1 | DeepSeek R1-671B | 剧本推演、深度推理 |
| **risk** | claude-haiku | Claude Haiku 4.5 | 风险评估、快速分析 |

### 增强层智能体（2个）

| 智能体 | 默认模型 | 模型说明 | 适用场景 |
|--------|---------|---------|---------|
| **news_analyst** | grok-fast | Grok-4 Fast | 新闻分析、实时信息 |
| **reflection** | deepseek-r1 | DeepSeek R1-671B | 反思复盘、深度推理 |

### 对抗层智能体（2个）

| 智能体 | 默认模型 | 模型说明 | 适用场景 |
|--------|---------|---------|---------|
| **adversarial** | deepseek-r1 | DeepSeek R1-671B | 对抗推演、博弈分析 |
| **collusion_detector** | claude-sonnet | Claude Sonnet 4.5 | 合谋检测、逻辑一致性 |

### 共识引擎（4个分析器）

| 分析器 | 默认模型 | 模型说明 | 适用场景 |
|--------|---------|---------|---------|
| **consensus_deepseek** | deepseek-v3.2-thinking | DeepSeek V3.2 Thinking | 链上解读 |
| **consensus_grok** | grok-fast | Grok-4 Fast | 宏观叙事 |
| **consensus_claude** | claude-sonnet | Claude Sonnet 4.5 | 风险识别 |
| **consensus_qwen** | qwen3-max | Qwen3 Max | 模式匹配 |

---

## 🎨 可用模型列表（14个）

### 精选首选模型（8个）

| model_key | 模型名称 | 说明 | 定价（输入/输出） |
|-----------|---------|------|------------------|
| **deepseek-r1** | DeepSeek R1-671B | 深度推理，适合复杂博弈 | $0.004 / $0.016 |
| **deepseek-v3.2-thinking** | DeepSeek V3.2 Thinking | 思考推理增强版 | $0.0003 / $0.0004 |
| **claude-sonnet** | Claude Sonnet 4.5 | 逻辑推理最强 | $0.003 / $0.015 |
| **grok-fast** | Grok-4 Fast | 高性价比，价格仅为竞品 1/25 | $0.001 / $0.004 |
| **grok-code-fast** | Grok Code Fast | 轻量级快速推理 | $0.001 / $0.004 |
| **qwen3-max** | Qwen3 Max | 复杂多步骤任务专优 | $0.001 / $0.004 |
| **qwen3-next-thinking** | Qwen3 Next Thinking | 推理增强版 | $0.001 / $0.004 |
| **claude-haiku** | Claude Haiku 4.5 | 低成本快速模型 | $0.001 / $0.005 |

### 备用模型（6个）

| model_key | 模型名称 | 说明 | 定价（输入/输出） |
|-----------|---------|------|------------------|
| deepseek | DeepSeek V3 通用 | 旧版通用模型 | $0.0014 / $0.0028 |
| grok | Grok-4 标准 | 旧版 Grok | $0.003 / $0.015 |
| gpt4o | GPT-4o | OpenAI 通用模型 | $0.0025 / $0.01 |
| gemini | Gemini 2.5 Pro | Google 最新模型 | $0.00125 / $0.005 |
| o3 | OpenAI o3 | OpenAI 推理模型 | $0.002 / $0.008 |

---

## 🚀 配置方式

### 方法 1：环境变量配置（推荐）

```bash
# .env 文件
DMX_API_KEY=your_dmxapi_key_here
DMX_BASE_URL=https://www.dmxapi.cn/v1
```

### 方法 2：数据库配置

```sql
-- 插入配置
INSERT INTO configs (key, value, category, description)
VALUES 
  ('dmx_api_key', 'your_key_here', 'llm', 'DMXAPI 聚合网关 API Key'),
  ('dmx_base_url', 'https://www.dmxapi.cn/v1', 'llm', 'DMXAPI 聚合网关地址');
```

### 方法 3：后台管理界面

在后台「系统配置」页面配置：
- `dmx_api_key`：DMXAPI API Key
- `dmx_base_url`：DMXAPI 网关地址

---

## 🎛️ 后台模型分工管理

### API 端点

```bash
# 获取所有智能体的模型分配
GET /api/admin/model-assignments

# 更新单个智能体的模型
PUT /api/admin/model-assignments/{agent_id}
{
  "model_key": "deepseek-r1"
}

# 批量更新模型分配
POST /api/admin/model-assignments/batch
{
  "assignments": [
    {"agent_id": "technical", "model_key": "claude-sonnet"},
    {"agent_id": "onchain", "model_key": "deepseek-v3.2-thinking"}
  ]
}

# 获取可用模型列表
GET /api/admin/available-models
```

### 前端管理界面示例

```typescript
// 模型分工管理组件
export const ModelAssignments = () => {
  const [assignments, setAssignments] = useState([]);
  const [models, setModels] = useState([]);

  const handleModelChange = async (agentId, modelKey) => {
    await fetch(`/api/admin/model-assignments/${agentId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ model_key: modelKey }),
    });
    fetchAssignments(); // 刷新列表
  };

  return (
    <Table>
      {assignments.map(assignment => (
        <tr key={assignment.agent_id}>
          <td>{assignment.agent_name}</td>
          <td>{assignment.phase}</td>
          <td>
            <Select
              value={assignment.current_model_key}
              onChange={(value) => handleModelChange(assignment.agent_id, value)}
            >
              {models.map(model => (
                <Option key={model.model_key} value={model.model_key}>
                  {model.display_name}
                </Option>
              ))}
            </Select>
          </td>
          <td>{assignment.is_custom ? '自定义' : '默认'}</td>
        </tr>
      ))}
    </Table>
  );
};
```

---

## 💰 成本监控

### 每日成本统计

```bash
# 获取今日成本统计
GET /api/admin/llm-cost/daily

# 响应示例
{
  "date": "2026-03-03",
  "total_cost_usd": 1.25,
  "total_tokens": 125000,
  "total_calls": 450,
  "by_model": {
    "deepseek-r1": 0.45,
    "claude-sonnet": 0.38,
    "grok-fast": 0.22,
    "qwen3-max": 0.20
  }
}
```

### Redis 成本记录

```bash
# 查看今日总成本
redis-cli GET llm_cost:daily:2026-03-03

# 查看单个模型成本
redis-cli GET llm_cost:daily:2026-03-03:deepseek-r1

# 查看今日总 Token 数
redis-cli GET llm_tokens:daily:2026-03-03

# 查看今日调用次数
redis-cli GET llm_calls:daily:2026-03-03
```

---

## 🔧 模型切换示例

### 场景 1：降低成本

```bash
# 将所有智能体切换到低成本模型
curl -X POST "http://localhost:8000/api/admin/model-assignments/batch" \
  -H "Authorization: Bearer TOKEN" \
  -d '{
    "assignments": [
      {"agent_id": "technical", "model_key": "grok-fast"},
      {"agent_id": "onchain", "model_key": "qwen3-max"},
      {"agent_id": "playbook", "model_key": "qwen3-next-thinking"}
    ]
  }'
```

### 场景 2：提升质量

```bash
# 将核心智能体切换到高质量模型
curl -X POST "http://localhost:8000/api/admin/model-assignments/batch" \
  -H "Authorization: Bearer TOKEN" \
  -d '{
    "assignments": [
      {"agent_id": "technical", "model_key": "claude-sonnet"},
      {"agent_id": "onchain", "model_key": "deepseek-r1"},
      {"agent_id": "playbook", "model_key": "deepseek-r1"}
    ]
  }'
```

### 场景 3：A/B 测试

```bash
# 测试不同模型的效果
# 第一天使用 DeepSeek
curl -X PUT "http://localhost:8000/api/admin/model-assignments/technical" \
  -H "Authorization: Bearer TOKEN" \
  -d '{"model_key": "deepseek-r1"}'

# 第二天使用 Claude
curl -X PUT "http://localhost:8000/api/admin/model-assignments/technical" \
  -H "Authorization: Bearer TOKEN" \
  -d '{"model_key": "claude-sonnet"}'

# 对比两天的分析结果和成本
```

---

## ✨ 核心优势总结

### 1. **统一管理**
- ✅ 一个 API Key 调用所有模型
- ✅ 统一计费，统一监控
- ✅ 无需管理多个 API Key

### 2. **灵活切换**
- ✅ 后台实时切换模型
- ✅ 无需重启服务
- ✅ 支持 A/B 测试

### 3. **成本优化**
- ✅ 自动记录每日成本
- ✅ 按模型统计用量
- ✅ 灵活调整模型分配

### 4. **高可用性**
- ✅ 聚合网关自动负载均衡
- ✅ 自动降级处理
- ✅ 超时自动重试

---

## 🎉 总结

### ✅ 所有智能体都使用聚合 API
- **不需要**单独配置 DeepSeek API Key
- **不需要**单独配置 Claude API Key
- **不需要**单独配置 Grok API Key
- **只需要**配置一个 `DMX_API_KEY`

### ✅ 后台动态管理
- 管理员可以在后台「模型分工」页面实时切换
- 支持 14 个模型自由组合
- 配置持久化到数据库

### ✅ 成本透明
- 自动记录每日成本
- 按模型统计用量
- 支持成本优化

---

**获取 DMXAPI API Key**：https://www.dmxapi.cn/

**配置文件**：
- `backend/app/core/llm_client.py` - LLM 客户端
- `backend/app/core/model_router.py` - 模型路由
- `.env` - 环境变量配置

**相关文档**：
- `docs/datasource-agent-dependency.md` - 数据源依赖关系
- `docs/agent-management.md` - 智能体管理
