# AXIOM — AI 对抗 AI 多智能体加密货币分析系统

> v4.1.0 · "链上数据不会说谎，庄家行为有迹可循"

聚焦链路：**多源数据采集 → 11 智能体并行分析 → NSED 共识引擎 → 3AI 对抗推演 → 操作建议**

## 技术栈

| 层级 | 技术 |
|------|------|
| 后端框架 | FastAPI（异步） |
| 前端框架 | Next.js 14（App Router） |
| 任务调度 | Celery + Redis |
| 数据库 | PostgreSQL（生产）/ SQLite（开发） |
| 缓存/队列 | Redis |
| AI 网关 | DMXAPI（DeepSeek / Claude / Grok / Qwen） |
| 图表 | TradingView Lightweight Charts |
| 样式 | Tailwind CSS + shadcn/ui |
| 支付 | Oxapay（USDT / BTC / ETH） |
| 推送 | Telegram Bot + SendGrid + WebSocket |
| 数据源 | Binance · CoinGlass · CryptoQuant · CoinMarketCal · CryptoPanic · BlockBeats · Alternative.me |

## 快速启动（Docker）

```bash
# 1. 克隆项目
git clone <repo-url> && cd omnimind

# 2. 配置环境变量
cp .env.example .env
# 编辑 .env，填入实际的 API Key 等配置

# 3. 启动所有服务
docker compose up -d

# 4. 初始化数据库（首次启动自动执行 init.sql）
# 种子数据
docker compose exec backend python -c "
import asyncio
from app.models.db import init_db
asyncio.run(init_db())
"

# 5. 访问
# 前端：http://localhost:3000
# 后端API：http://localhost:8000
# API文档：http://localhost:8000/docs
```

## 开发环境搭建

### 后端

```bash
cd backend

# 创建虚拟环境
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate

# 安装依赖
pip install -r requirements.txt

# 启动 PostgreSQL + Redis（使用 Docker）
docker compose up postgres redis -d

# 启动后端
uvicorn main:app --reload --host 0.0.0.0 --port 8000

# 启动 Celery Worker（另一个终端）
celery -A workers.celery_app worker --loglevel=info

# 启动 Celery Beat（另一个终端）
celery -A workers.celery_app beat --loglevel=info

# 运行测试
pytest
```
### 前端

```bash
cd frontend

# 安装依赖
npm install

# 配置环境变量
cp .env.example .env.local

# 启动开发服务器
npm run dev

# 访问 http://localhost:3000
```

## 生产部署

### 使用 Docker Compose 部署

```bash
# 1. 配置生产环境变量
cp .env.example .env
# 编辑 .env，设置：
#   - APP_ENV=production
#   - POSTGRES_PASSWORD=<强密码>
#   - JWT_SECRET_KEY=<随机生成的密钥>
#   - 所有 API Key 填入真实值
#   - PUBLIC_API_URL=https://your-domain.com/api

# 2. 使用生产配置启动
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d

# 3. 查看服务状态
docker compose ps

# 4. 查看日志
docker compose logs -f backend
docker compose logs -f worker
```

### 生产环境特性

- PostgreSQL 优化参数（shared_buffers=256MB, max_connections=100）
- Redis 开启 AOF 持久化
- 后端 4 个 Uvicorn Worker 进程
- Celery Worker 8 并发 + 2 副本
- 数据库/Redis 端口不对外暴露
- 所有服务配置健康检查和自动重启

## 环境变量说明

| 变量名 | 说明 | 必填 | 默认值 |
|--------|------|------|--------|
| `DATABASE_URL` | PostgreSQL 连接字符串 | ✅ | - |
| `REDIS_URL` | Redis 连接地址 | ❌ | `redis://localhost:6379` |
| `POSTGRES_USER` | 数据库用户名（Docker用） | ❌ | `omnimind` |
| `POSTGRES_PASSWORD` | 数据库密码（Docker用） | ✅ | - |
| `POSTGRES_DB` | 数据库名（Docker用） | ❌ | `omnimind` |
| `DMX_API_KEY` | DMXAPI 密钥 | ✅ | - |
| `DMX_BASE_URL` | DMXAPI 网关地址 | ❌ | `https://www.dmxapi.cn/v1` |
| `BINANCE_API_KEY` | Binance API Key | ❌ | - |
| `BINANCE_API_SECRET` | Binance API Secret | ❌ | - |
| `GLASSNODE_API_KEY` | GlassNode API Key | ❌ | - |
| `OXAPAY_MERCHANT_KEY` | Oxapay Merchant API Key | ❌ | - |
| `TELEGRAM_BOT_TOKEN` | Telegram Bot Token | ❌ | - |
| `SENDGRID_API_KEY` | SendGrid 邮件 API Key | ❌ | - |
| `JWT_SECRET_KEY` | JWT 签名密钥 | ✅ | - |
| `JWT_ALGORITHM` | JWT 算法 | ❌ | `HS256` |
| `APP_ENV` | 运行环境 | ❌ | `development` |
| `APP_HOST` | 监听地址 | ❌ | `0.0.0.0` |
| `APP_PORT` | 监听端口 | ❌ | `8000` |
| `SENTRY_DSN_BACKEND` | 后端 Sentry DSN | ❌ | - |
| `SENTRY_TRACES_SAMPLE_RATE` | Sentry 采样率 | ❌ | `0.2` |
| `NEXT_PUBLIC_API_URL` | 前端 API 地址 | ❌ | `http://localhost:8000` |
| `NEXT_PUBLIC_WS_URL` | 前端 WebSocket 地址 | ❌ | `ws://localhost:8000` |
| `NEXT_PUBLIC_SENTRY_DSN` | 前端 Sentry DSN | ❌ | - |
| `PUBLIC_API_URL` | 生产环境公网 API 地址 | ❌ | `http://backend:8000` |

## 数据库备份策略

### 备份方案

采用 `pg_dump` 全量备份 + WAL 归档增量备份的组合策略。

| 类型 | 频率 | 保留策略 | 说明 |
|------|------|----------|------|
| 全量备份 | 每日 02:00 | 保留 7 天 | pg_dump 压缩导出 |
| WAL 归档 | 每小时 | 保留 7 天 | 支持时间点恢复（PITR） |
| 周备份 | 每周日 03:00 | 保留 4 周 | 从每日备份中保留 |

### 备份脚本

备份脚本位于 `scripts/backup_db.sh`，支持自动压缩、轮转清理。

```bash
# 手动执行备份
./scripts/backup_db.sh

# 配置 crontab 自动备份
# 每日 02:00 全量备份
0 2 * * * /path/to/omnimind/scripts/backup_db.sh >> /var/log/omnimind-backup.log 2>&1
```

### 恢复流程

```bash
# 1. 停止应用服务（保持数据库运行）
docker compose stop backend worker beat frontend

# 2. 查看可用备份
ls -la /var/backups/omnimind/

# 3. 恢复指定备份
gunzip -c /var/backups/omnimind/omnimind_20240101_020000.sql.gz | \
  docker compose exec -T postgres psql -U omnimind -d omnimind

# 4. 如需完全重建数据库
docker compose exec postgres dropdb -U omnimind omnimind
docker compose exec postgres createdb -U omnimind omnimind
gunzip -c /var/backups/omnimind/omnimind_20240101_020000.sql.gz | \
  docker compose exec -T postgres psql -U omnimind -d omnimind

# 5. 重启应用服务
docker compose up -d
```

## 项目结构

```
axiom/
├── backend/
│   ├── app/
│   │   ├── agents/            # 11 智能体
│   │   │   ├── base.py        # Agent 基类
│   │   │   ├── technical.py   # 技术分析（K线/指标）
│   │   │   ├── onchain.py     # 链上数据解读
│   │   │   ├── sentiment.py   # 舆情分析
│   │   │   ├── orderbook.py   # 订单簿微观结构
│   │   │   ├── risk.py        # 风险预警
│   │   │   ├── playbook.py    # 剧本推演
│   │   │   ├── calendar.py    # 日历事件分析
│   │   │   ├── news_analyst.py # 新闻量化
│   │   │   ├── reflection.py  # 离线复盘
│   │   │   ├── adversarial.py # 庄家对抗推演
│   │   │   └── collusion_detector.py # 合谋检测
│   │   ├── api/               # FastAPI 路由（40+ 端点）
│   │   ├── consensus/         # NSED 多模型共识引擎
│   │   ├── core/              # 配置 / 数据库 / Redis / LLM / JWT
│   │   ├── data/              # 数据采集（Binance/CoinGlass/CryptoQuant/...）
│   │   ├── models/            # Pydantic / ORM 模型
│   │   └── services/          # 业务逻辑 / 支付 / 推送
│   ├── workers/               # Celery 异步任务（20+ worker）
│   ├── migrations/            # 数据库迁移（Alembic）
│   ├── tests/                 # 测试
│   └── main.py                # FastAPI 入口
├── frontend/
│   ├── app/(main)/            # Next.js 页面（AuthGuard 保护）
│   │   ├── dashboard/         # 主仪表盘
│   │   ├── consensus/         # 综合分析（旗舰）
│   │   ├── playbook-sim/      # 剧本推演（3AI 对抗）
│   │   ├── performance/       # 绩效追踪
│   │   ├── alerts/            # 智能预警
│   │   ├── admin/             # 管理后台（独立侧边栏布局）
│   │   └── settings/          # 用户设置（会员/推送）
│   ├── components/
│   │   ├── admin/             # AdminLayout / AdminSidebar
│   │   ├── layout/            # TopNav / AuthGuard
│   │   ├── analysis/          # 分析报告组件
│   │   ├── ui/                # shadcn/ui 基础组件
│   │   └── ...
│   └── lib/                   # API 封装 / WebSocket / 权限
├── docs/                      # 活跃设计文档
├── .windsurf/workflows/       # 12 个开发工作流
├── .kiro/specs/               # 功能规格说明
├── docker-compose.yml         # 开发环境
├── docker-compose.prod.yml    # 生产环境
└── CHANGELOG.md               # 版本变更日志
```

## 许可证

私有项目，未经授权禁止使用。
