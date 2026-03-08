# 需求文档：AI 对话功能优化

## 简介

本需求文档覆盖 AI 对话功能的全面优化，涵盖安全漏洞修复、后端健壮性增强和前端体验改善三大方面。共计 13 项问题的系统性修复，确保对话功能在安全性、可靠性和用户体验上达到生产标准。

## 术语表

- **ChatAgent**: 后端 AI 对话智能体，负责处理用户消息并流式返回 LLM 回答
- **ChatSessionService**: 对话会话管理服务，负责会话 CRUD 和消息持久化
- **ChatQuotaService**: 基于 Redis 的每日对话限流服务，按会员等级控制查询次数
- **UnifiedLLMClient**: 统一 LLM 客户端，所有模型调用必须经过此模块
- **SSE**: Server-Sent Events，服务端向客户端推送流式数据的协议
- **ChatSidebar**: 前端对话侧边栏组件，承载消息展示、输入和会话管理
- **AbortController**: 浏览器原生 API，用于取消进行中的 fetch 请求
- **Redis_INCR**: Redis 原子递增命令，用于限流计数器

## 需求

### 需求 1：会话归属权校验

**用户故事：** 作为系统管理员，我希望对话消息只能被会话所有者访问，以防止未授权用户通过猜测 UUID 读取他人对话记录。

#### 验收标准

1. WHEN 用户请求获取会话历史消息, THE ChatSessionService SHALL 在 SQL 查询中同时过滤 session_id 和 user_id，仅返回属于该用户的会话消息
2. WHEN 用户请求的 session_id 不属于该用户, THE Chat_API SHALL 返回 HTTP 403 状态码和明确的错误提示
3. WHEN 用户发送消息到某个会话, THE Chat_API SHALL 在调用 ChatAgent.respond 之前验证该会话属于当前用户
4. THE ChatSessionService.get_history SHALL 接受 user_id 参数，并在数据库查询中将 user_id 作为过滤条件

### 需求 2：用户消息预持久化

**用户故事：** 作为用户，我希望发送的消息在 LLM 流式响应开始前就被保存，以避免流式传输中断导致消息丢失。

#### 验收标准

1. WHEN 用户发送消息且通过限流检查, THE ChatAgent SHALL 在调用 LLM 流式接口之前将用户消息持久化到数据库
2. IF 用户消息持久化失败, THEN THE ChatAgent SHALL 终止本次请求并通过 SSE 返回错误提示
3. WHEN LLM 流式响应完成, THE ChatAgent SHALL 仅持久化助手回复消息，不再重复保存用户消息

### 需求 3：模型配置动态化

**用户故事：** 作为运维人员，我希望对话使用的 LLM 模型可通过动态配置切换，而非硬编码在代码中。

#### 验收标准

1. THE ChatAgent SHALL 从动态配置服务读取对话模型的 model_key，不再硬编码 "gpt4o"
2. IF 动态配置读取失败, THEN THE ChatAgent SHALL 回退使用默认模型 "gpt4o" 并记录警告日志
3. WHEN 动态配置中的模型键值发生变更, THE ChatAgent SHALL 在下一次请求时使用新的模型配置

### 需求 4：流式请求取消支持

**用户故事：** 作为用户，我希望能够取消正在进行的 AI 回答生成，以节省等待时间和查询配额。

#### 验收标准

1. WHEN 用户点击取消按钮, THE ChatSidebar SHALL 通过 AbortController.abort 终止当前 fetch 请求
2. THE sendMessage 函数 SHALL 接受 AbortSignal 参数，并将其传递给 fetch 调用
3. WHEN 流式请求被取消, THE ChatSidebar SHALL 保留已接收的部分回答内容并结束流式状态
4. WHILE 流式响应正在进行, THE ChatInput SHALL 显示取消按钮替代发送按钮

### 需求 5：上下文数据并行查询

**用户故事：** 作为用户，我希望 AI 回答的响应速度更快，通过并行查询 Redis 缓存数据减少等待时间。

#### 验收标准

1. THE ChatAgent._gather_context SHALL 使用 asyncio.gather 并行查询 market、consensus、strategy 和 onchain 数据
2. IF 某个 Redis 查询失败, THEN THE ChatAgent SHALL 跳过该数据源并继续使用其他成功获取的数据
3. WHEN 所有 Redis 查询均失败, THE ChatAgent SHALL 返回空上下文字典并记录错误日志

### 需求 6：流式响应 Token 用量追踪

**用户故事：** 作为运维人员，我希望流式对话的 token 用量被准确记录，以便监控成本和用量趋势。

#### 验收标准

1. WHEN LLM 流式响应完成, THE ChatAgent SHALL 调用 ChatQuotaService.record_usage 记录本次调用的 token 用量
2. THE ChatAgent SHALL 在流式过程中累计 completion token 数量，并在完成后连同 prompt token 一起记录
3. IF token 用量记录失败, THEN THE ChatAgent SHALL 记录错误日志但不影响用户正常收到回答

### 需求 7：流式迭代全程超时控制

**用户故事：** 作为系统管理员，我希望 LLM 流式响应有全程超时保护，防止慢速流导致连接无限挂起。

#### 验收标准

1. THE UnifiedLLMClient.stream_model SHALL 对整个流式迭代过程（包括初始连接和所有 chunk 读取）施加超时控制
2. WHEN 流式迭代总耗时超过配置的超时阈值, THE UnifiedLLMClient SHALL 终止流式连接并 yield 超时错误提示
3. THE UnifiedLLMClient.stream_model SHALL 支持配置单个 chunk 的读取超时，防止单次读取长时间阻塞

### 需求 8：限流计数器原子性保障

**用户故事：** 作为系统管理员，我希望限流计数器的 INCR 和 EXPIRE 操作具有原子性，防止进程崩溃导致计数器永不过期。

#### 验收标准

1. THE ChatQuotaService.check_and_increment SHALL 使用 Redis Lua 脚本或 Pipeline 将 INCR 和 EXPIRE 合并为原子操作
2. WHEN 计数器首次创建时, THE ChatQuotaService SHALL 在同一原子操作中设置计数值和 TTL
3. IF Redis 操作部分失败, THEN THE ChatQuotaService SHALL 记录错误日志并拒绝本次请求（安全降级）

### 需求 9：配额耗尽错误结构化展示

**用户故事：** 作为用户，我希望在查询次数用完时看到友好的提示信息，而非原始 JSON 字符串。

#### 验收标准

1. WHEN ChatAgent 返回配额耗尽的 JSON 错误, THE sendMessage 函数 SHALL 检测并解析该 JSON 结构
2. WHEN 检测到配额耗尽错误, THE ChatSidebar SHALL 显示友好的中文提示信息而非原始 JSON 文本
3. WHEN 配额耗尽, THE ChatSidebar SHALL 自动刷新配额状态并禁用输入框

### 需求 10：AbortController 信号接入

**用户故事：** 作为开发者，我希望前端的 AbortController 被正确接入 fetch 请求，使取消功能真正生效。

#### 验收标准

1. THE sendMessage 函数 SHALL 接受 AbortSignal 参数并将其传递给 fetch 的 signal 选项
2. WHEN AbortController.abort 被调用, THE sendMessage 函数 SHALL 终止 fetch 请求和流式读取
3. WHEN 请求被 abort 取消, THE sendMessage 函数 SHALL 抛出 AbortError 以便调用方区分取消和其他错误

### 需求 11：消息列表稳定 Key

**用户故事：** 作为用户，我希望消息列表在新增或删除消息时不会出现闪烁或错位，保持流畅的视觉体验。

#### 验收标准

1. THE ChatSidebar SHALL 为每条消息生成唯一且稳定的标识符作为 React key，不使用数组索引
2. WHEN 新消息被添加到列表, THE ChatSidebar SHALL 保持已有消息的 key 不变，避免不必要的 React 重新渲染
3. THE 消息标识符 SHALL 基于消息创建时间戳和角色的组合生成，确保唯一性

### 需求 12：前端错误可见化

**用户故事：** 作为用户，我希望在会话初始化或历史加载失败时看到明确的错误提示和重试选项，而非静默失败。

#### 验收标准

1. WHEN initSession 调用失败, THE ChatSidebar SHALL 在界面上显示错误提示信息并提供重试按钮
2. WHEN loadHistory 调用失败, THE ChatSidebar SHALL 显示加载失败提示并允许用户手动重试
3. THE ChatSidebar SHALL 记录所有捕获的错误到浏览器控制台，包含错误类型和上下文信息
4. IF 连续失败超过 3 次, THEN THE ChatSidebar SHALL 显示"服务暂时不可用"的提示并延长重试间隔
