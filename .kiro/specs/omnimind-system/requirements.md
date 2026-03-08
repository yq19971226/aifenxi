# OmniMind 庄家视角多智能体分析系统 - 需求文档

## 文档状态

- **当前定位**：本文件保留为 OmniMind 早期阶段需求文档。
- **不再承担**：当前产品级主数据源定义。
- **说明**：文中关于 `CryptoQuant`、`Alternative.me`、`Etherscan` 等数据源的表述应理解为历史阶段目标，不应直接视为当前四主源架构依据。
- **当前主真相源**：请以 `four-primary-datasources` spec 为准。

## 产品定位
"链上数据不会说谎，庄家行为有迹可循"
聚焦链路：链上异动监控 → AI解读庄家意图 → 推演操盘剧本 → 给出操作建议

---

## 功能需求

### FR-01 行情数据采集
- MUST: 通过 Binance WebSocket 实时采集 BTC/USDT 价格、成交量
- MUST: 支持多周期K线（15m/1h/4h/1d）历史数据拉取
- MUST: 数据持久化到 TimescaleDB
- SHOULD: 支持多交易对扩展（ETH/USDT 等）

### FR-02 技术指标计算
- MUST: 计算 EMA7/25/99
- MUST: 计算 RSI(14)、MACD、布林带
- MUST: 识别支撑位和阻力位
- MUST: 指标结果存入 TimescaleDB

### FR-03 链上数据采集
- MUST: 接入 Etherscan/BSCScan API 监控大额转账
- MUST: 接入 CryptoQuant 免费层获取交易所净流入/流出
- MUST: 接入 Alternative.me 恐慌贪婪指数
- SHOULD: 接入 Glassnode 免费层（MVRV等基础指标）

### FR-04 智能体集群
- MUST: 技术分析智能体（多周期指标 → 关键点位）
- MUST: 链上解读智能体（链上数据 → 庄家行为语义）
- MUST: 剧本推演智能体（综合信号 → 操盘剧本匹配）
- MUST: 风险预警智能体（异常信号 → 实时告警）
- MUST: 所有智能体通过 DMXAPI 调用，AsyncOpenAI 客户端

### FR-05 NSED多模型共识引擎
- MUST: 支持 DeepSeek/GPT-4o/Claude/Gemini 并行调用
- MUST: 三轮流程：独立分析 → 交叉审查 → 加权聚合
- MUST: 动态权重基于历史准确率计算
- MUST: 少数派高置信度观点检测与提示
- SHOULD: 分歧度指标（0-100%）

### FR-06 前端仪表盘
- MUST: 科技风深色主题（#0A0F1B 背景）
- MUST: TradingView Lightweight Charts K线图，支持多周期切换
- MUST: 实时价格看板（大字体+发光效果）
- MUST: 链上信号面板（交易所净流入、巨鲸变化、恐慌贪婪、MVRV）
- MUST: 庄家剧本指示器（当前阶段+置信度+关键证据）
- MUST: 策略卡片（方向、入场区间、止损、目标、置信度）
- SHOULD: 多模型共识详情页
- SHOULD: 历史案例匹配模块

### FR-07 会员系统
- MUST: 三级会员（免费/专业/$99 · 旗舰/$299）
- MUST: JWT 认证（access 1h / refresh 7d）
- MUST: 权限中间件（FastAPI Depends）
- MUST: 免费用户每日3次查询限流

### FR-08 USDT支付
- MUST: 接入 NowPayments（TRC-20/ERC-20/BEP-20）
- MUST: 支付订单创建、二维码展示、倒计时
- MUST: Webhook 验签 + 幂等性处理
- MUST: 支付成功自动升级会员 + 通知用户

### FR-09 推送模块
- MUST: Telegram Bot 推送策略更新、关键位预警
- MUST: SendGrid 邮件推送
- MUST: WebSocket 实时推送到前端
- SHOULD: 用户自定义推送频率和事件类型

---

## 非功能需求

### NFR-01 性能
- API 响应时间 P95 < 500ms（不含AI调用）
- AI共识生成 < 60s（三轮并行）
- WebSocket 推送延迟 < 1s

### NFR-02 安全
- 所有密钥从环境变量读取，禁止硬编码
- 支付 Webhook 必须验签
- SQL 注入防护（pydantic + ORM）

### NFR-03 可用性
- 单节点部署，Docker Compose
- 关键服务（数据采集、推送）异常自动重启
- 错误日志完整记录

---

## 数据模型概览

### 时序数据（TimescaleDB）
- `klines`: 多周期K线（symbol, interval, open, high, low, close, volume, timestamp）
- `indicators`: 技术指标（symbol, interval, ema7/25/99, rsi, macd, timestamp）
- `onchain_snapshots`: 链上数据快照（exchange_netflow, whale_change, fear_greed, mvrv, timestamp）

### 关系数据（PostgreSQL）
- `users`: 用户信息（id, email, password_hash, created_at）
- `memberships`: 会员等级（user_id, level, expires_at, query_count_today）
- `payments`: 支付记录（payment_id, user_id, plan, amount, status, created_at）
- `push_settings`: 推送配置（user_id, telegram_chat_id, email, events, frequency）
- `agent_reports`: 智能体分析报告（agent_id, symbol, signal, confidence, reasoning, timestamp）
- `strategies`: 策略记录（direction, entry_low, entry_high, stop_loss, targets, confidence, timestamp）
- `consensus_reports`: 共识报告（votes, final_signal, confidence, minority_alert, timestamp）
