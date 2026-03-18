# AI 助手开发规则与避坑手册

> **适用场景**：本项目（aifenxi / Axiom）已正式部署到生产服务器（`/opt/axiom`），日常工作为修复 Bug、迭代功能、更新代码。  
> **更新时间**：2026-03-18  
> **维护人**：AI 助手（由用户校正后记录）

---

## 一、项目基本情况

| 项目 | 信息 |
|------|------|
| 线上地址 | `https://www.axiom123.cc` |
| 服务器路径 | `/opt/axiom` |
| GitHub 仓库 | `https://github.com/yq19971226/aifenxi` |
| 主分支 | `master` |
| 后端 | Python / FastAPI / SQLAlchemy（PostgreSQL） |
| 前端 | Next.js 15 App Router / Tailwind CSS / framer-motion |
| 缓存 | Redis |
| 任务队列 | Celery + Celery Beat |
| 部署方式 | Docker Compose（宝塔面板管理） |
| 国际化 | next-intl，翻译文件在 `frontend/messages/{locale}/` |

---

## 二、每次改代码前必须知道的规则

### 2.1 [严禁] 用 Python 脚本批量写入含 `${}` 的 JSON 文件

**背景**：2026-03-18 翻译 `avgMonthly` 时，用 Python `json.dump` 写入含 `${amount}` 的字符串，结果 `$` 被保留但前后空格等变化，最终输出 `"Avg  / MO"`，占位符丢失，UI 显示为空白。

**规则**：
- ✅ **直接用 `replace_file_content` 或 `multi_replace_file_content` 工具编辑 JSON 文件**
- ❌ **禁止用 Python `json.dump()` 写入含 `${xxx}` 占位符的 i18n JSON**
- ❌ **禁止用 Python 脚本批量改 `messages/` 目录下的文件**（用文件编辑工具代替）

---

### 2.2 i18n 翻译文件管理规则

- 新增翻译 key 时，**必须同步到所有语言**：`en/` 和 `zh-CN/`，缺一不可
- 翻译 key 的命名层级要与页面组件的 `useTranslations` 命名空间完全对应
- 每次改完 `.tsx` 后，整文件搜索硬编码中文/英文，确认都已替换为 `t('xxx')`
- 常见遗漏点：按钮文字、状态标签、提示文字、占位字符

**已知 i18n key 命名空间对应关系：**
```
settings.membership.*    → /settings/membership/page.tsx
settings.configs.*       → /settings/configs/page.tsx
settings.push.*          → /settings/push/page.tsx
consensus.*              → /consensus/ 相关页面
nav.*                    → 导航菜单
```

---

### 2.3 修改后必须运行类型检查

```bash
# 前端改动后必须运行
cd d:\aifenxi\frontend
npx tsc --noEmit
# 零报错才可提交
```

---

### 2.4 Git 提交规范

每次提交必须附带说明，格式：
```
<类型>(<范围>): <说明>

类型: fix | feat | refactor | style | docs | chore
范围: 文件名/模块名（可选）
说明: 一句话说清楚改了什么
```

**示例：**
```
fix(membership): restore {amount} placeholder in avgMonthly i18n keys
fix: lower leaderboard min threshold to 1 for cold-start phase
feat(llm): add DeepSeek V3.2 standard model to MODELS and AVAILABLE_MODELS
```

---

### 2.5 后端模型相关改动的三件套

每次新增/删除一个 AI 模型，必须同步改三个文件：

| 文件 | 改什么 |
|------|--------|
| `backend/app/core/llm_client.py` | `MODELS` 和 `MODEL_PRICING` 字典 |
| `backend/app/core/model_router.py` | `AVAILABLE_MODELS` 列表 |
| （可选）后台管理界面 | 如有 UI 展示则同步 |

---

## 三、已知 Bug 与绕坑记录

### Bug-001：排行榜长期空白（已修复 2026-03-18）

**原因**：上榜门槛（最少已结算策略数）设置过高，在冷启动用户少时永远无数据。

**修复**：`leaderboard.py` 中 `_MIN_BY_MODE` 全部改为 1（冷启动阶段），后期随用户量增长可逐步调高。

**诊断 SQL（服务器上运行）：**
```sql
-- 检查有多少已发布记录
SELECT COUNT(*), analysis_mode FROM strategy_snapshots
WHERE published = TRUE GROUP BY analysis_mode;

-- 检查有多少已结算
SELECT COUNT(*), status FROM strategy_snapshots
WHERE status != 'pending' GROUP BY status;

-- 检查有 user_id 的记录
SELECT COUNT(*) FROM strategy_snapshots WHERE user_id IS NOT NULL;
```

---

### Bug-002：i18n 占位符被 Python 脚本覆盖（已修复 2026-03-18）

**原因**：用 Python `json.load` → 修改 → `json.dump` 写回时，`${amount}` 中的 `$` 和相邻空格被转义/去除。

**修复**：直接用文件编辑工具修改 `messages/en/settings.json` 和 `messages/zh-CN/settings.json`，还原 `${amount}` 占位符。

**避免方法**：永远不用 Python 脚本批量写 i18n 文件。

---

### Bug-003：Celery Worker 不更新排行榜缓存

排行榜有 5 分钟 Redis 缓存（`_CACHE_TTL = 300`），改完代码后服务器重启前数据不会立刻变化，需等一个缓存周期。

---

## 四、线上部署命令速查

### 仅改了后端代码
```bash
cd /opt/axiom && git pull
docker compose -f docker-compose.yml -f docker-compose.prod.yml build --no-cache backend
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d backend worker beat
```

### 改了前端代码（包括 i18n 翻译文件）
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

### 查看实时日志
```bash
# 后端日志
docker compose -f docker-compose.yml -f docker-compose.prod.yml logs backend --tail=100 -f
# Celery Worker 日志
docker compose -f docker-compose.yml -f docker-compose.prod.yml logs worker --tail=100 -f
# 前端日志
docker compose -f docker-compose.yml -f docker-compose.prod.yml logs frontend --tail=50 -f
```

---

## 五、Celery Worker 任务调度速查

| 任务 | 触发频率 | 说明 |
|------|---------|------|
| `settle_strategies_task` | 每 1 分钟 | 结算所有未结策略（止损/目标/超时） |
| `schedule_all_symbols` | 每 1 分钟 | 触发各币种自动分析调度 |
| `collect_klines_task` | 每 5 分钟 | K 线数据采集 |
| `collect_derivatives_snapshot_task` | 每 5 分钟 | 合约数据采集 |
| `system_bot_loop` | 每 1 小时 | 系统 Bot 自动分析 BTC/ETH/SOL |
| `update_weights_task` | 每 6 小时 | 更新 VPD 因子权重 |

---

## 六、架构关键链路速查

### 排行榜数据链路
```
用户/System Bot 触发分析
  → strategy_snapshots 创建（published=FALSE）
  → PublishRuleEngine.try_publish() 判断发布条件
    ├─ analysis_mode 必须为 scalping/intraday/trend
    ├─ direction != neutral
    ├─ is_fallback == False
    └─ 去重窗口内无重复（scalping 4h, intraday 12h, trend 3d）
  → published=TRUE
  → Celery settle_strategies_task 每分钟跑一次结算
  → status 变为 hit_target / hit_stop_loss / timeout
  → 排行榜 API 查询（需 >= 1 条已结算记录才上榜）
```

### 模型动态切换链路
```
管理员后台修改模型分工
  → admin_models.py API
  → ConfigService.set_config_value() → Redis 持久化
  → invalidate_cache() 清除内存缓存
  → 下次 get_model_for_agent() 从 Redis 重新加载
  （无需重启服务）
```

---

## 七、System Bot 说明

- 固定 UUID：`00000000-0000-0000-0000-000000000001`
- 每小时自动分析 BTC/ETH/SOL 三个币种 × 三个模式
- 策略进入排行榜（以该 UUID 匿名显示）
- 可通过后台 `system_bot_enabled` 配置项开关
- 目的：在真实用户较少时为排行榜提供基础数据

---

## 八、AI 助手自查 Checklist（每次改完后核对）

```
改了翻译文件？
  □ en/ 和 zh-CN/ 都改了
  □ 没有用 Python 脚本批量写入
  □ ${xxx} 占位符完整保留

改了 .tsx 文件？
  □ npx tsc --noEmit 零错误
  □ 没有硬编码中英文字符串

改了后端？
  □ 新增模型：llm_client + model_router + AVAILABLE_MODELS 三处同步
  □ 改了 SQL：在本地确认语法无误
  □ 改了排行榜门槛：同步更新注释和文档字符串

提交前？
  □ git commit 有明确说明
  □ git push 推送到远程
  □ 告知用户需要在服务器执行哪条部署命令
```

---

*本文档随项目迭代持续更新，遇到新 Bug 或约定变化时及时追加到对应章节。*
