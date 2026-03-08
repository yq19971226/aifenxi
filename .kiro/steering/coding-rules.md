---
inclusion: always
---

# 项目编码规则 - 严格约束

## 一、代码风格

### Python（后端）
- 所有异步函数必须用 `async/await`，禁止在异步上下文中使用同步阻塞调用
- AI模型调用必须用 `AsyncOpenAI`，禁止用同步 `OpenAI` 客户端
- 所有外部API调用必须有超时控制（`asyncio.wait_for`，默认30s）和降级处理
- 类型注解必须完整，函数参数和返回值都要标注
- 使用 `pydantic` 做数据验证，禁止裸字典传递业务数据
- 错误处理：所有外部调用用 `try/except`，记录日志，不允许静默失败
- 环境变量统一从 `app/core/config.py` 的 `Settings` 类读取，禁止硬编码密钥

### TypeScript（前端）
- 严格模式，禁止使用 `any`
- 组件必须有 Props 类型定义
- API调用统一封装在 `lib/api/` 下，禁止在组件里直接 fetch
- WebSocket连接统一在 `lib/ws/` 管理

---

## 二、架构约束

### 分层规则
```
API路由层     → 只做参数校验和响应格式化，不含业务逻辑
Service层     → 业务逻辑，调用Agent和数据层
Agent层       → 单一职责，每个Agent只做一件事
数据层        → 只做数据读写，不含业务判断
```

### 禁止事项
- 禁止在路由层直接调用数据库
- 禁止在Agent层直接调用其他Agent（通过消息总线通信）
- 禁止跨层调用（如数据层调用Service层）
- 禁止在前端组件里写业务逻辑

---

## 三、AI调用规则

- 所有模型调用必须经过 `app/core/llm_client.py` 的 `UnifiedLLMClient`
- Prompt必须要求模型输出JSON格式，并做解析校验
- 多模型并行调用必须用 `asyncio.gather`，不允许串行等待
- 每次调用必须记录：模型名、耗时、token用量、是否降级
- 降级响应格式必须与正常响应格式一致，signal字段设为 `"neutral"`

---

## 四、数据库规则

- TimescaleDB：只存时序数据（K线、指标、链上快照）
- PostgreSQL：用户、会员、支付、推送历史
- Redis：缓存（TTL必须设置）、消息队列、WebSocket状态
- 禁止在应用层做数据聚合，复杂查询写SQL或存储过程
- 所有数据库操作必须在事务里执行（涉及多表更新时）

---

## 五、安全规则

- 所有用户输入必须经过 pydantic 校验，禁止直接拼接SQL
- JWT token有效期：access_token 1小时，refresh_token 7天
- 支付Webhook必须验签，处理前检查幂等性（payment_id唯一索引）
- API Key等敏感信息只从环境变量读取，禁止出现在代码或日志里
- 会员权限校验用 FastAPI `Depends`，不允许在业务逻辑里手动判断等级

---

## 六、测试规则

- 每个Agent必须有单元测试，mock外部API调用
- 支付流程必须有集成测试，覆盖幂等性场景
- 共识引擎必须有测试，验证加权聚合逻辑正确性

---

## 七、提交规范

- 每次只做一件事，不混合功能开发和重构
- 文件改动超过200行时，拆分为多次提交
