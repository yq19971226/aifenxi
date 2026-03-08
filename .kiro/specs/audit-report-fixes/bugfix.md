# Bugfix Requirements Document

## Introduction

本文档覆盖系统审查报告（`docs/AUDIT_REPORT.md`）中发现的全部 19 个问题。这些问题涵盖基础设施链路断裂（P0）、功能缺陷（P1）、功能缺失与质量问题（P2）、以及低优先级改进（P3）。修复目标是恢复实时推送链路、修正数据查询错误、消除硬编码、提升预测分析质量，同时确保现有正常功能不受影响。

---

## Bug Analysis

### Current Behavior (Defect)

**P0 — 基础设施完全失效**

1.1 WHEN kline_collector.py 发布 K 线数据到 Redis Stream `kline_updates` THEN ws.py 消费的是 `price_updates`，两个 stream 名称不匹配，导致 WebSocket `/ws/price` 端点收不到任何实时价格数据

1.2 WHEN email_worker 执行 SQL `SELECT email FROM push_settings WHERE email_enabled = TRUE AND email IS NOT NULL` THEN 查询失败，因为 `push_settings` 表不存在 `email` 列（用户邮箱存储在 `users` 表），导致邮件推送完全失效

**P1 — 功能缺陷**

1.3 WHEN 付费用户访问 Dashboard 页面 THEN `MEMBERSHIP_LEVEL` 硬编码为 0（免费用户），`DerivativesPanel` 和 `PerformanceSummary` 组件始终按免费用户渲染，付费用户看不到高级内容

1.4 WHEN 应用部署到非 localhost 域名的生产环境 THEN CORS `allow_origins` 硬编码为 `["http://localhost:3000"]`，前端请求被 CORS 策略拦截，所有 API 调用失败

1.5 WHEN 共识引擎完成 NSED 三轮评估输出 `ConsensusReport`（含加权信号、分歧度、少数派警告）THEN 策略服务 `generate_from_report()` 只接受单个 `AgentReport`，完全忽略共识结果，多模型交叉验证的核心价值未被利用

1.6 WHEN 4 个模型中仅 1 个给出 bullish（confidence=0.8）、其余 3 个 neutral THEN 加权分数即可超过 ±0.2 阈值，共识信号被单个模型高置信度带偏，误判率高

**P2 — 功能缺失 / 质量问题**

1.7 WHEN 市场出现横盘吸筹、诱空杀空、二次探底、阶梯式拉升等操盘手法 THEN 剧本知识库仅有 4 种模式（假突破诱多、恐慌洗盘、主升浪启动、顶部派发），无法匹配，只能给出泛化分析

1.8 WHEN 庄家操盘阶段从吸筹转入试盘或拉盘 THEN playbook 智能体每次分析无状态，不追踪阶段转换过程，无法检测关键转换信号，错过最佳预警时机

1.9 WHEN 模型 A 预测 bullish（confidence=0.9）但实际仅涨 1.1%，模型 B 预测 bullish（confidence=0.5）但实际涨 15% THEN 动态权重系统仅评估方向准确率，两者被同等对待，权重分配精度不足

1.10 WHEN 市场处于高波动行情且缺少支撑/阻力位数据 THEN 策略入场区间使用固定百分比（±2% 和 ±5%），不考虑当前波动率，高波动时入场区间过窄频繁触发止损，低波动时入场区间过宽资金效率低

1.11 WHEN sentiment.py 已实现恐慌贪婪指数采集逻辑 THEN 没有任何 Worker 或 Service 调用该模块，采集能力被浪费

1.12 WHEN 链上智能体需要 MVRV 估值指标 THEN onchain.py 的 `collect_snapshot()` 中 `mvrv` 字段始终返回 None（Glassnode 未接入），链上分析缺少核心估值数据

1.13 WHEN alert_eval_worker 消费 Redis Streams 列表包含 `price_updates` THEN 该 stream 不存在（实际是 `kline_updates`），预警评估无法获取价格更新数据

1.14 WHEN 市场处于牛市周期 MVRV 长期 >3.5 THEN 风险阈值全部硬编码为模块级常量，不随市场周期调整，持续触发告警导致告警疲劳；熊市中 MVRV <1 是常态却不断报警

1.15 WHEN 共识引擎和智能体需要情绪数据 THEN sentiment.py 的独立采集能力未被任何 Worker 调度，也未被任何智能体或共识引擎消费，`MarketData.onchain.fear_greed_index` 仅依赖链上数据源

**P3 — 低优先级**

1.16 WHEN 用户访问 `/performance` 绩效看板 THEN 后端 `PerformanceTracker` 已实现智能体准确率统计（`by_agent` 字段），但前端仅展示 PnL 曲线，未展示各智能体预测准确率对比

1.17 WHEN 策略和共识输出包含 `confidence` 字段（0.0-1.0 浮点数）THEN 前端直接显示百分比，用户难以理解 0.65 和 0.75 的实际差异，缺少语义映射

1.18 WHEN `backend/scripts/seed_admin.py` 存在于代码仓库 THEN 该脚本包含硬编码的管理员信息，存在安全隐患

1.19 WHEN TopNav overflow 修复已合入前端代码 THEN Docker 前端镜像未重建，修复未生效


### Expected Behavior (Correct)

**P0 — 基础设施恢复**

2.1 WHEN kline_collector.py 发布 K 线数据 THEN ws.py SHALL 消费相同的 stream 名称（统一为 `kline_updates`），WebSocket `/ws/price` 端点能正常接收实时价格数据并广播给前端

2.2 WHEN email_worker 查询需要邮件推送的用户 THEN SQL SHALL JOIN `users` 表获取 `email` 字段：`SELECT u.email FROM push_settings ps JOIN users u ON u.id = ps.user_id WHERE ps.email_enabled = TRUE AND u.email IS NOT NULL AND ps.events @> :event_json`，邮件推送正常工作

**P1 — 功能修正**

2.3 WHEN 用户访问 Dashboard 页面 THEN 系统 SHALL 从 `useAuth()` 上下文中读取 `user.membership_level`（通过 `/api/auth/me` 接口获取），`DerivativesPanel` 和 `PerformanceSummary` 按用户实际会员等级渲染

2.4 WHEN 应用部署到任意域名 THEN CORS `allow_origins` SHALL 从 `settings` 读取（新增 `cors_origins` 配置项，支持逗号分隔多域名），生产环境前端请求不被拦截

2.5 WHEN 共识引擎输出 `ConsensusReport` THEN 策略服务 SHALL 提供 `generate_from_consensus(report: ConsensusReport)` 方法，利用共识信号（`consensus_signal`）、加权置信度（`consensus_confidence`）和分歧度（`divergence`）生成策略，分歧度高时降低置信度

2.6 WHEN 进行加权聚合判定共识信号 THEN 系统 SHALL 将阈值提高至 ±0.35，并增加"至少 2 个模型方向一致"的硬性条件，避免单个模型高置信度带偏共识

**P2 — 功能补全 / 质量提升**

2.7 WHEN 市场出现横盘吸筹、诱空杀空、二次探底、阶梯式拉升等操盘手法 THEN 剧本知识库 SHALL 扩充至 8 种核心剧本，每种包含链上特征、技术形态特征和典型后续走势

2.8 WHEN 庄家操盘阶段发生转换 THEN 系统 SHALL 引入 `phase_tracker` 模块，在 Redis 中维护每个交易对的当前阶段状态（吸筹→试盘→拉盘→派发），检测阶段转换并触发告警

2.9 WHEN 评估模型预测质量 THEN 动态权重系统 SHALL 综合考虑方向准确率、置信度校准度（calibration：预测 confidence 与实际涨跌幅的匹配度）和预测幅度匹配度，给出更精确的权重分配

2.10 WHEN 缺少支撑/阻力位数据需要计算入场区间 THEN 策略服务 SHALL 引入 ATR（Average True Range）指标动态计算入场区间和止损位，替代固定百分比（±2%/±5%），技术指标数据层已有 ATR 计算能力

2.11 WHEN 系统启动定时任务调度 THEN SHALL 创建 `sentiment_worker.py` 定时采集恐慌贪婪指数，数据写入 Redis 缓存，供共识引擎和仪表盘使用

2.12 WHEN 链上数据采集器执行 `collect_snapshot()` THEN SHALL 接入免费替代 MVRV 数据源（如 CoinGlass 或 CryptoQuant 免费层），`mvrv` 字段不再始终为 None

2.13 WHEN alert_eval_worker 消费 Redis Streams THEN 消费列表 SHALL 将 `price_updates` 修正为 `kline_updates`，与 kline_collector.py 发布的 stream 名称一致

2.14 WHEN 风险智能体检查阈值 THEN 风险阈值 SHALL 从动态配置管理（`config_service`）读取，支持管理员在线调整；或引入自适应阈值，基于近 30 天数据的百分位数动态计算

2.15 WHEN 共识引擎和智能体需要情绪数据 THEN sentiment_worker SHALL 定时采集并写入 Redis，共识引擎的 `MarketData` 组装过程 SHALL 优先从 Redis 读取 sentiment 数据

**P3 — 低优先级改进**

2.16 WHEN 用户访问 `/performance` 绩效看板 THEN 前端 SHALL 增加"智能体准确率排行"卡片，调用 `get_stats()` 返回的 `by_agent` 字段展示各智能体预测准确率对比

2.17 WHEN 前端展示 `confidence` 字段 THEN 系统 SHALL 增加置信度语义映射层：`<0.3` → "低置信度 — 仅供参考"、`0.3-0.6` → "中等置信度 — 需结合其他信号"、`0.6-0.8` → "较高置信度 — 可作为主要参考"、`>0.8` → "高置信度 — 多维度信号一致"

2.18 WHEN `seed_admin.py` 存在于代码仓库 THEN SHALL 移除硬编码管理员信息，改为从环境变量读取，或将脚本加入 `.gitignore`

2.19 WHEN 前端代码变更需要生效 THEN Docker 前端镜像 SHALL 通过 `docker compose up --build -d frontend` 重建


### Unchanged Behavior (Regression Prevention)

3.1 WHEN WebSocket `/ws/alerts` 端点消费 `alerts` stream THEN 系统 SHALL CONTINUE TO 正常接收和广播预警通知，stream 名称修改不影响 alerts 频道

3.2 WHEN email_worker 处理非邮件类型的告警（如 `alert_type` 不在 `_EMAIL_EVENT_TYPES` 中）THEN 系统 SHALL CONTINUE TO 跳过处理并正常 ACK 消息

3.3 WHEN 免费用户访问 Dashboard THEN `DerivativesPanel` 和 `PerformanceSummary` SHALL CONTINUE TO 按免费用户等级渲染，不显示高级内容

3.4 WHEN 本地开发环境运行在 `localhost:3000` THEN CORS SHALL CONTINUE TO 允许该来源的请求，不影响本地开发体验

3.5 WHEN 策略服务通过 `generate_from_report(report: AgentReport)` 生成策略 THEN 该方法 SHALL CONTINUE TO 正常工作，新增 `generate_from_consensus()` 不影响原有接口

3.6 WHEN 所有 4 个模型方向一致（如全部 bullish）THEN 共识引擎 SHALL CONTINUE TO 正确输出 bullish 信号，阈值调整不影响强共识场景

3.7 WHEN 剧本智能体匹配到现有 4 种剧本（假突破诱多、恐慌洗盘、主升浪启动、顶部派发）THEN 系统 SHALL CONTINUE TO 正确匹配并输出分析结果，新增剧本不影响现有剧本的匹配逻辑

3.8 WHEN 动态权重系统在无历史数据时 THEN 系统 SHALL CONTINUE TO 使用默认准确率 0.5 和等权分配，新评估维度不影响冷启动行为

3.9 WHEN 策略服务有支撑/阻力位数据时 THEN 系统 SHALL CONTINUE TO 使用支撑/阻力位计算入场区间，ATR 仅作为缺失数据时的替代方案

3.10 WHEN 链上数据采集器的恐慌贪婪指数和交易所净流量采集 THEN 系统 SHALL CONTINUE TO 正常工作，新增 sentiment_worker 和 MVRV 数据源不影响现有采集逻辑

3.11 WHEN alert_eval_worker 消费 `indicator_updates` 和 `onchain_updates` stream THEN 系统 SHALL CONTINUE TO 正常处理这两个 stream 的消息

3.12 WHEN 风险智能体在配置服务不可用时 THEN 系统 SHALL CONTINUE TO 使用当前硬编码值作为降级默认值，不因配置读取失败而中断风险评估

3.13 WHEN 前端 `/performance` 页面展示 PnL 曲线 THEN 系统 SHALL CONTINUE TO 正常渲染 PnL 曲线，新增智能体准确率卡片不影响现有图表

3.14 WHEN 后端 API 返回 `confidence` 数值字段 THEN 系统 SHALL CONTINUE TO 返回原始浮点数，语义映射仅在前端展示层添加，不修改 API 响应格式

3.15 WHEN 其他 Celery Worker（kline_collector, indicator_worker, derivatives_worker 等）正常运行 THEN 系统 SHALL CONTINUE TO 不受 sentiment_worker 新增的影响

