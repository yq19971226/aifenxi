---
inclusion: always
---

# 庄家视角多智能体分析系统 - 项目主文档 v4.0

## 项目定位
> "链上数据不会说谎，庄家行为有迹可循"

聚焦链路：**链上异动监控 → AI解读庄家意图 → 推演操盘剧本 → 给出操作建议**

目标用户：有一定经验的加密货币交易者（持仓 $1k-$100k）

---

## 技术栈

### 后端
- Web框架：FastAPI（异步）
- 任务调度：Celery + Redis
- 消息队列：Redis Streams
- 数据库：PostgreSQL + TimescaleDB扩展
- 缓存：Redis
- AI调用：DMXAPI统一网关（base_url: https://www.dmxapi.cn/v1）
- 推送：python-telegram-bot + SendGrid

### 前端
- 框架：Next.js 14（App Router）
- 图表：TradingView Lightweight Charts
- 样式：Tailwind CSS + shadcn/ui
- 动画：Framer Motion
- 实时数据：WebSocket + React Query

### 支付
- 主选：NowPayments（USDT TRC-20/ERC-20/BEP-20，费率0.5%）

---

## 项目结构

```
backend/
├── app/
│   ├── api/           # FastAPI路由
│   ├── agents/        # 智能体集群
│   │   ├── onchain.py     # 链上解读智能体（核心）
│   │   ├── technical.py   # 技术分析智能体
│   │   ├── playbook.py    # 剧本推演智能体
│   │   └── risk.py        # 风险预警智能体
│   ├── consensus/     # NSED共识引擎
│   ├── data/          # 数据采集
│   │   ├── binance.py
│   │   ├── onchain.py
│   │   └── sentiment.py
│   ├── models/        # 数据模型
│   ├── services/
│   │   ├── payment.py
│   │   ├── subscription.py
│   │   └── notification.py
│   └── core/          # 配置、中间件
├── workers/           # Celery任务
└── tests/

frontend/
├── app/
│   ├── dashboard/
│   ├── onchain/
│   ├── consensus/
│   ├── cases/
│   └── settings/
├── components/
│   ├── charts/
│   ├── cards/
│   └── ui/
└── lib/
```

---

## 会员等级

| 等级 | 权益 | 价格 |
|------|------|------|
| 免费 | 每日3次实时查询，延迟15分钟链上数据 | $0 |
| 专业 | 实时链上监控 + 策略推送（邮件） | $99/月 |
| 旗舰 | 专业权益 + 多模型共识 + TG推送 + API访问 | $299/月 |

---

## 开发路线图

| 阶段 | 任务 | 时间 | 状态 |
|------|------|------|------|
| 1 | 行情采集 + TimescaleDB + 基础K线展示 | 2周 | ⬜ 待开始 |
| 2 | 技术分析智能体 + DMXAPI集成 | 2周 | ⬜ 待开始 |
| 3 | 前端科技风原型（仪表盘+策略看板） | 3周 | ⬜ 待开始 |
| 4 | 链上数据接入（免费层）+ 链上解读智能体 | 2周 | ⬜ 待开始 |
| 5 | 剧本推演智能体 + 知识库 | 2周 | ⬜ 待开始 |
| 6 | NSED共识引擎 | 2周 | ⬜ 待开始 |
| 7 | 会员系统 + USDT支付 | 2周 | ⬜ 待开始 |
| 8 | 推送模块（邮件+TG） | 1周 | ⬜ 待开始 |
| 9 | 测试 + 部署 + 监控 | 2周 | ⬜ 待开始 |
