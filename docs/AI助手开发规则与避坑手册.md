# AI 助手开发规则与避坑手册

> **⚠️ 置顶声明**：本文档是 AI 助手参与本项目开发的**唯一权威规则文档**。  
> 遇到任何规范冲突，以本文档为准，旧文档已停用。  
> **更新时间**：2026-03-18 | **版本**：v2.0（全局置顶版）

---

## 一、项目基本情况

| 项目 | 信息 |
|------|------|
| 线上地址 | `https://www.axiom123.cc`（无 www） |
| 服务器路径 | `/opt/axiom` |
| GitHub 仓库 | `https://github.com/yq19971226/aifenxi`，主分支 `master` |
| 后端 | Python / FastAPI / SQLAlchemy（PostgreSQL） |
| 前端 | Next.js 15 App Router / Tailwind CSS / framer-motion |
| 缓存 | Redis |
| 任务队列 | Celery + Celery Beat |
| 部署方式 | Docker Compose（宝塔面板管理） |
| 国际化 | next-intl，翻译文件在 `frontend/messages/{locale}/` |
| AI 网关 | DMXAPI（`https://www.dmxapi.cn/`），一个 Key 调用所有模型 |

---

## 二、每次改代码前必须遵守的规则

### 🚨 规则 1：禁止用 Python 脚本批量写 i18n JSON 文件

**教训来源**：2026-03-18，用 Python `json.dump` 写含 `${amount}` 的字符串，`$` 符号导致占位符结构被破坏，输出 `"Avg  / MO"`（空白），UI 中折合月价显示异常。

**规定**：
- ✅ 直接使用 `replace_file_content` 或 `multi_replace_file_content` 工具编辑 JSON
- ❌ 禁止 Python `json.load` → 修改 → `json.dump` 写回 i18n 文件
- ❌ `${xxx}` 占位符写进去后必须肉眼核对是否完整

---

### 规则 2：i18n 翻译必须中英双语同步

- 新增 key 必须同步写入 `messages/en/` 和 `messages/zh-CN/`
- 改完 `.tsx` 后全文搜索有无残留硬编码中文/英文字符串
- 翻译 key 命名层级须与 `useTranslations` 命名空间完全对应

**已知命名空间 → 文件映射：**
```
settings.membership.*  → /settings/membership/page.tsx
settings.configs.*     → /settings/configs/page.tsx
settings.push.*        → /settings/push/page.tsx
consensus.*            → /consensus/ 相关页面
nav.*                  → 导航菜单
```

---

### 规则 3：改前端必须跑类型检查

```bash
cd d:\aifenxi\frontend
npx tsc --noEmit
# 零报错才可提交
```

---

### 规则 4：新增 AI 模型必须同步三个文件

| 文件 | 改什么 |
|------|--------|
| `backend/app/core/llm_client.py` | `MODELS` 字典 + `MODEL_PRICING` 字典 |
| `backend/app/core/model_router.py` | `AVAILABLE_MODELS` 列表 |
| — | 无需改其他地方，后台界面自动读取 |

---

### 规则 5：Git 提交规范

```
<类型>(<范围>): <一句话说明>

类型: fix | feat | refactor | style | docs | chore
```

示例：
```
fix(membership): restore {amount} placeholder in avgMonthly i18n keys
feat(llm): add DeepSeek V3.2 standard model
fix: lower leaderboard min threshold to 1 for cold-start phase
```

---

### 规则 6：禁止提交到仓库的文件

- `.env`（含密码、密钥，只提交 `.env.example`）
- `node_modules/`、`__pycache__/`、`.next/`、`*.pyc`
- 每次提交前跑一遍 `git status` 确认

---

## 三、线上部署命令速查

> 域名：`https://www.axiom123.cc`  
> 服务器目录：`/opt/axiom`  
> **所有 docker compose 命令都用双 compose 文件**

### 仅改了后端代码
```bash
cd /opt/axiom && git pull
docker compose -f docker-compose.yml -f docker-compose.prod.yml build --no-cache backend
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d backend worker beat
```

### 改了前端代码（含 i18n 翻译文件）
```bash
cd /opt/axiom && git pull
docker compose -f docker-compose.yml -f docker-compose.prod.yml build --no-cache frontend
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d frontend
```

### 前后端都改了
```bash
cd /opt/axiom && git pull
docker compose -f docker-compose.yml -f docker-compose.prod.yml build --no-cache backend frontend
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

### 代码同步（服务器与远程不一致时）
```bash
cd /opt/axiom
git fetch origin
git reset --hard origin/master
```

### 查看实时日志
```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml logs backend --tail=100 -f
docker compose -f docker-compose.yml -f docker-compose.prod.yml logs worker --tail=100 -f
docker compose -f docker-compose.yml -f docker-compose.prod.yml logs frontend --tail=50 -f
```

---

## 四、运维操作速查

### 重置管理员密码
```bash
cd /opt/axiom
docker compose -f docker-compose.yml -f docker-compose.prod.yml exec -e PYTHONPATH=/app backend python scripts/create_admin.py
# 输入管理员邮箱和新密码（输入时无回显，正常）
```
> 若遇「too many clients」：先 restart postgres backend worker beat，再执行。

### 手动创建 audit_logs 表（旧库未执行 v18 迁移时）
```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml exec -T postgres psql -U omnimind -d omnimind <<'SQL'
CREATE TABLE IF NOT EXISTS audit_logs (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    TEXT,
    action     TEXT,
    detail     TEXT,
    created_at TIMESTAMPTZ DEFAULT (now())
);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs (user_id) WHERE user_id IS NOT NULL;
SQL
```

### 迁移文件缺失导致 Postgres 无法启动
```bash
# 方法 1：拉齐代码
git reset --hard origin/master
# 方法 2：补空文件
touch /opt/axiom/backend/migrations/缺失文件名.sql
```

### Nginx 反向代理注意事项（宝塔）
- `proxy_pass` **不要**写末尾 `/`：✅ `proxy_pass http://127.0.0.1:8000;`
- `/health` 路径也需要代理到后端（监控页会请求）：
  ```nginx
  location /health {
    proxy_pass http://127.0.0.1:8000;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
  }
  ```

### 前端环境变量规范
- `.env` 中 `PUBLIC_API_URL` 填**根域名**，不加 `/api`
  - ✅ `PUBLIC_API_URL=https://axiom123.cc`
  - ❌ `PUBLIC_API_URL=https://axiom123.cc/api`（会导致 `.../api/api/auth/login`，404）
- 改域名或 `.env` 后必须**重建 frontend**

---

## 五、AI 模型分工速查

> 网关：DMXAPI（`https://www.dmxapi.cn/`）  
> 只需配置一个 `dmx_api_key`，无需各模型单独 Key  
> 后台「模型分工」页面可实时切换，无需重启

### 当前默认分工

| 智能体 | 默认模型 | 说明 |
|--------|---------|------|
| technical | claude-sonnet | 技术分析 |
| onchain | deepseek-v3.2-thinking | 链上分析 |
| sentiment | grok-fast | 舆情分析 |
| orderbook | qwen3-max | 订单簿 |
| playbook | deepseek-r1 | 剧本推演 |
| risk | claude-haiku | 风险评估 |
| news_analyst | grok-fast | 新闻分析 |
| reflection | deepseek-r1 | 反思复盘 |
| adversarial | deepseek-r1 | 对抗推演 |
| collusion_detector | claude-sonnet | 合谋检测 |
| consensus_deepseek | deepseek-v3.2-thinking | 共识层 |
| consensus_grok | grok-fast | 共识层 |
| consensus_claude | claude-sonnet | 共识层 |
| consensus_qwen | qwen3-max | 共识层 |

### 可用模型列表（当前 15 个）

| model_key | 说明 | 定价输入/输出 |
|-----------|------|-------------|
| deepseek-r1 | DeepSeek R1-671B 深度推理 | $0.004 / $0.016 |
| deepseek-v3.2 | DeepSeek V3.2 标准版 | $0.0002 / $0.0003 |
| deepseek-v3.2-thinking | DeepSeek V3.2 Thinking | $0.0003 / $0.0004 |
| claude-sonnet | Claude Sonnet 4.5 | $0.003 / $0.015 |
| claude-haiku | Claude Haiku 4.5 | $0.001 / $0.005 |
| grok-fast | Grok-4 Fast | $0.001 / $0.004 |
| grok-code-fast | Grok Code Fast | $0.001 / $0.004 |
| qwen3-max | Qwen3 Max | $0.001 / $0.004 |
| qwen3-next-thinking | Qwen3 Next Thinking | $0.001 / $0.004 |
| deepseek | DeepSeek V3 通用（旧） | $0.0014 / $0.0028 |
| grok | Grok-4 标准（旧） | $0.003 / $0.015 |
| gpt4o | GPT-4o | $0.0025 / $0.01 |
| gemini | Gemini 2.5 Pro | $0.00125 / $0.005 |
| o3 | OpenAI o3 推理 | $0.002 / $0.008 |
| claude | claude-sonnet 别名 | — |

---

## 六、Celery Worker 任务调度速查

| 任务 | 触发频率 | 说明 |
|------|---------|------|
| `settle_strategies_task` | 每 1 分钟 | 结算未结策略（止损/目标/超时） |
| `schedule_all_symbols` | 每 1 分钟 | 触发各币种自动分析 |
| `collect_klines_task` | 每 5 分钟 | K 线数据采集 |
| `collect_derivatives_snapshot_task` | 每 5 分钟 | 合约数据采集 |
| `system_bot_loop` | 每 1 小时 | 系统 Bot 自动分析 BTC/ETH/SOL |
| `update_weights_task` | 每 6 小时 | 更新 VPD 因子权重 |

---

## 七、架构关键链路速查

### 排行榜数据链路
```
用户/System Bot 分析
  → strategy_snapshots（published=FALSE）
  → PublishRuleEngine.try_publish()
    ├─ analysis_mode ∈ {scalping, intraday, trend}
    ├─ direction != neutral
    ├─ is_fallback == False
    └─ 去重窗口（scalping 4h, intraday 12h, trend 3d）
  → published=TRUE
  → Celery settle_strategies_task 每 1 分钟结算
  → status: hit_target / hit_stop_loss / timeout
  → 排行榜查询（>= 1 条已结算才上榜，冷启动门槛）
```

### 模型动态切换链路
```
后台「模型分工」页面修改
  → admin_models.py API
  → ConfigService → Redis 持久化
  → invalidate_cache() 清内存缓存
  → 下次调用自动从 Redis 加载（无需重启）
```

---

## 八、System Bot 说明

- 固定 UUID：`00000000-0000-0000-0000-000000000001`
- 每小时自动分析 BTC/ETH/SOL × 3 种模式
- 策略进入排行榜（以该 UUID 匿名显示为"交易员 #XXXXXX"）
- 后台 `system_bot_enabled` 配置项可开关
- 目的：在真实用户较少时为排行榜提供基础数据

---

## 九、已知 Bug 与绕坑记录

### Bug-001：排行榜长期空白（已修复 2026-03-18）
**根因**：上榜门槛（`_MIN_STRATEGIES`）设为 3 条，冷启动用户少时数据永远不满足。  
**修复**：改为 1 条（`leaderboard.py`）。后期用户量增长后可逐步调高。  
**诊断 SQL**：
```sql
SELECT COUNT(*), analysis_mode FROM strategy_snapshots WHERE published=TRUE GROUP BY analysis_mode;
SELECT COUNT(*), status FROM strategy_snapshots WHERE status!='pending' GROUP BY status;
SELECT COUNT(*) FROM strategy_snapshots WHERE user_id IS NOT NULL;
```

### Bug-002：i18n 占位符被 Python 覆盖（已修复 2026-03-18）
**根因**：Python `json.dump` 写入含 `${amount}` 的字符串时，`${}` 结构被破坏输出空白。  
**修复**：直接用文件编辑工具修复 `messages/en` 和 `zh-CN` 中的 `avgMonthly` key。  
**预防**：永远不用 Python 脚本批量写 i18n 文件（见规则 1）。

### Bug-003：注册 500（数据库缺字段）
**根因**：旧库未执行 v8 迁移，`users` 表缺 `referral_code` 等字段。  
**排查**：`docker compose ... logs backend --tail=200` 关注 `register failed:` 或完整 Traceback。

### Bug-004：Celery 结算缓存延迟
排行榜有 5 分钟 Redis 缓存（`_CACHE_TTL = 300`），改完代码重启后需等一个缓存周期才反映最新数据。

---

## 十、AI 助手自查 Checklist（每次改完必核对）

```
改了翻译文件？
  □ en/ 和 zh-CN/ 都改了
  □ 没有用 Python 脚本写入
  □ ${xxx} 占位符完整保留（肉眼核对）

改了 .tsx 文件？
  □ npx tsc --noEmit 零错误
  □ 没有残留硬编码中英文字符串

改了后端？
  □ 新增模型：llm_client + model_router 两处同步
  □ 改了排行榜门槛：注释/文档字符串同步更新

提交前？
  □ git status 确认无 .env 等敏感文件
  □ git commit 有规范说明
  □ git push 已推送到远程
  □ 告知用户需在服务器执行的部署命令
```
