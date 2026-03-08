# OmniMind 实施任务清单

## 文档状态

- **当前定位**：本任务清单保留为 OmniMind 早期阶段实施记录。
- **不再代表**：当前主数据源与能力路线图。
- **当前主路线图**：请以 `four-primary-datasources/tasks.md` 与相关现行子域 spec 为准。

## 阶段1：行情采集 + 数据库基础

- [x] 1.1 初始化项目结构
  - 创建 backend/ 和 frontend/ 目录骨架
  - 配置 pyproject.toml / requirements.txt
  - 配置 package.json（Next.js 14）
  - 创建 .env.example

- [x] 1.2 数据库初始化
  - docker-compose.yml（postgres+timescaledb, redis）
  - TimescaleDB 建表：klines, indicators, onchain_snapshots
  - PostgreSQL 建表：users, memberships, payments, agent_reports, strategies
  - Alembic 迁移配置

- [x] 1.3 核心配置层
  - app/core/config.py（Settings 类，所有环境变量）
  - app/core/database.py（asyncpg 连接池）
  - app/core/redis.py（Redis 连接）
  - app/core/logging.py（结构化日志）

- [x] 1.4 Binance 行情采集
  - app/data/binance.py（WebSocket 实时价格）
  - app/data/binance_rest.py（历史K线拉取）
  - workers/kline_collector.py（Celery任务）
  - 写入 TimescaleDB klines 表

- [x] 1.5 技术指标计算
  - app/data/indicators.py（EMA/RSI/MACD/布林带计算）
  - workers/indicator_worker.py（K线更新后触发）
  - 写入 TimescaleDB indicators 表

---

## 阶段2：技术分析智能体 + DMXAPI集成

- [x] 2.1 LLM客户端
  - app/core/llm_client.py（UnifiedLLMClient，AsyncOpenAI）
  - 超时控制（asyncio.wait_for，30s）
  - 降级处理（signal="neutral"）
  - 调用日志记录（模型名、耗时、token、是否降级）

- [x] 2.2 Agent基础框架
  - app/agents/base.py（BaseAgent抽象类，AgentReport dataclass）
  - app/models/market_data.py（MarketData pydantic模型）

- [x] 2.3 技术分析智能体
  - app/agents/technical.py（TechnicalAgent）
  - Prompt：多周期指标 → 支撑阻力位 → 趋势判断
  - 输出：signal, confidence, support_levels, resistance_levels, reasoning

- [x] 2.4 策略生成器
  - app/services/strategy.py（根据Agent报告生成策略）
  - 策略写入 PostgreSQL strategies 表
  - Redis 缓存最新策略（TTL=15m）

- [x] 2.5 基础API路由
  - app/api/market.py（GET /api/klines, GET /api/indicators）
  - app/api/strategy.py（GET /api/strategy/latest）

---

## 阶段3：前端科技风原型

- [x] 3.1 Next.js 项目初始化
  - Tailwind CSS + shadcn/ui 配置
  - 全局 CSS 变量（科技风色彩系统）
  - 字体配置（Inter + Roboto Mono）

- [x] 3.2 布局组件
  - components/layout/Sidebar.tsx
  - components/layout/TopBar.tsx（系统状态、用户头像）
  - Framer Motion 页面切换动画

- [x] 3.3 K线图表组件
  - components/charts/KlineChart.tsx（TradingView Lightweight Charts）
  - 多周期切换（15m/1h/4h/1d）
  - EMA7/25/99 叠加
  - 支撑阻力位标注

- [x] 3.4 价格看板组件
  - components/cards/PriceBoard.tsx
  - 实时价格大字体 + 荧光发光效果
  - 24h涨跌幅、最高/最低、成交量

- [x] 3.5 策略卡片组件
  - components/cards/StrategyCard.tsx
  - 多头（绿渐变边框）/ 空头（红渐变边框）/ 观望（灰色）
  - 入场区间、止损、目标位、置信度星级

- [x] 3.6 仪表盘页面
  - app/dashboard/page.tsx
  - 组合：K线图 + 价格看板 + 策略卡片
  - WebSocket 实时数据接入（lib/ws/）

- [x] 3.7 API客户端封装
  - lib/api/market.ts
  - lib/api/strategy.ts
  - lib/ws/priceSocket.ts

---

## 阶段4：链上数据 + 链上解读智能体

- [x] 4.1 链上数据采集
  - app/data/onchain.py
    - Etherscan API：大额转账监控（>$1M）
    - CryptoQuant API：交易所净流入/流出
    - Alternative.me：恐慌贪婪指数
  - workers/onchain_collector.py（每30分钟 Celery Beat）
  - 写入 TimescaleDB onchain_snapshots 表

- [x] 4.2 链上解读智能体
  - app/agents/onchain.py（OnchainAgent）
  - Prompt：链上数据 → 庄家行为阶段（吸筹/洗盘/拉盘/派发/出逃）
  - 输出：phase, confidence, evidence, warning, next_likely_move

- [x] 4.3 前端链上信号面板
  - components/cards/OnchainPanel.tsx
  - 展示：交易所净流入、巨鲸变化、恐慌贪婪、MVRV
  - 颜色编码（正面信号绿，负面信号红）

- [x] 4.4 链上监控页面（旗舰专属）
  - app/onchain/page.tsx
  - 实时大额转账流水列表
  - 交易所余额趋势图

---

## 阶段5：剧本推演智能体 + 知识库

- [x] 5.1 庄家剧本知识库
  - app/agents/playbook_patterns.py（4种核心剧本定义）
  - 每种剧本：特征列表、后续描述、触发条件函数

- [x] 5.2 剧本推演智能体
  - app/agents/playbook.py（PlaybookAgent）
  - 输入：技术信号 + 链上信号 + 情绪数据
  - 匹配知识库剧本，计算各剧本概率
  - 输出：matched_playbook, probability, stage_description, next_move

- [x] 5.3 历史案例库
  - PostgreSQL cases 表（case_name, date, symbol, pattern_type, description, similarity_features）
  - 初始化10个典型加密货币操盘案例数据
  - app/services/case_search.py（余弦相似度检索，返回Top5）

- [x] 5.4 前端剧本指示器
  - components/cards/PlaybookIndicator.tsx
  - 圆环进度条显示当前剧本概率
  - 阶段描述文字 + 关键证据列表

- [x] 5.5 历史案例页面
  - app/cases/page.tsx
  - 相似行情匹配列表
  - 案例卡片（名称、时间、最大涨跌幅、匹配度）

---

## 阶段6：NSED多模型共识引擎

- [x] 6.1 共识引擎核心
  - app/consensus/engine.py（run_nsed 三轮流程）
  - Round1：4模型并行独立分析（asyncio.gather）
  - Round2：4模型并行交叉审查
  - Round3：加权聚合 + 少数派检测

- [x] 6.2 动态权重系统
  - app/consensus/weights.py
  - 基于历史准确率计算各模型权重
  - 权重存入 Redis（TTL=24h），每日更新

- [x] 6.3 模型专责分工
  - deepseek_analyzer：链上数据解读专责
  - gpt4o_analyzer：宏观叙事+英文信息专责
  - claude_analyzer：风险识别+逻辑一致性专责
  - gemini_analyzer：模式匹配+历史相似专责

- [x] 6.4 共识API
  - app/api/consensus.py（GET /api/consensus/latest，旗舰权限）
  - 返回：各模型观点、权重分布、分歧度、少数派提示

- [x] 6.5 前端共识详情页
  - app/consensus/page.tsx（旗舰专属）
  - 4个模型卡片（各自品牌色边框）
  - 权重圆环图
  - 分歧度仪表盘（0-100%，绿→红渐变）
  - 少数派警告框

---

## 阶段7：会员系统 + USDT支付

- [x] 7.1 用户认证
  - app/api/auth.py（注册/登录/刷新token）
  - app/core/security.py（JWT生成/验证，access 1h / refresh 7d）
  - app/core/deps.py（get_current_user, require_level）

- [x] 7.2 会员权限
  - app/services/subscription.py（等级查询、升级、到期检查）
  - 免费用户每日3次查询限流（Redis计数器，TTL到次日0点）
  - 权限中间件应用到所有受保护路由

- [x] 7.3 NowPayments集成
  - app/services/payment.py（create_payment, handle_webhook）
  - Webhook 验签（HMAC-SHA512）
  - 幂等性处理（payment_id唯一索引）
  - 支付成功 → 升级会员 → 通知用户

- [x] 7.4 前端会员中心
  - app/settings/membership/page.tsx
  - 等级权益对比表
  - 套餐选择 + 网络选择（TRC-20/ERC-20/BEP-20）
  - 支付二维码 + 15分钟倒计时
  - 支付历史记录

---

## 阶段8：推送模块

- [x] 8.1 风险预警智能体
  - app/agents/risk.py（RiskAgent）
  - 监控阈值：交易所单笔流入>1000 BTC、巨鲸转账>$10M、MVRV>3.5或<1、恐慌贪婪<15或>85
  - 触发后写入 Redis Streams(alerts)

- [x] 8.2 Telegram Bot
  - app/services/notification/telegram.py
  - /start 命令 + 绑定会员账户（唯一token）
  - 推送：策略更新、关键位预警、剧本切换
  - workers/telegram_worker.py（消费 Redis Streams）

- [x] 8.3 邮件推送
  - app/services/notification/email.py（SendGrid）
  - 策略邮件模板（HTML）
  - workers/email_worker.py

- [x] 8.4 WebSocket推送
  - app/api/ws.py（/ws/price, /ws/alerts）
  - 连接管理（Redis存储在线用户）
  - 实时价格推送 + 预警推送

- [x] 8.5 推送设置页面
  - app/settings/push/page.tsx
  - 渠道开关（邮件/TG/WebSocket）
  - 订阅事件选择
  - 测试推送按钮

---

## 阶段9：测试 + 部署 + 监控

- [x] 9.1 单元测试
  - tests/agents/test_technical.py（mock DMXAPI）
  - tests/agents/test_onchain.py
  - tests/consensus/test_engine.py（验证加权聚合逻辑）
  - tests/services/test_payment.py（幂等性场景）

- [x] 9.2 集成测试
  - tests/api/test_auth.py
  - tests/api/test_strategy.py
  - tests/api/test_payment_webhook.py

- [x] 9.3 Docker Compose 完整配置
  - docker-compose.yml（所有服务）
  - docker-compose.prod.yml（生产配置）
  - 健康检查配置

- [x] 9.4 监控
  - Sentry 错误追踪（前端+后端）
  - 关键业务指标日志（智能体响应时间、共识成功率、推送成功率）

- [x] 9.5 上线准备
  - .env.example 完整更新
  - README.md 部署文档
  - 数据库备份策略
