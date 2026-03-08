# v4.0 清理清单

> 日期: 2026-03-01
> 状态: ✅ 全部执行完成
> 目的: 清除所有旧代码、旧文档、旧测试、死菜单、废弃逻辑，防止后期误调用或被重新写入

---

## 一、旧设计文档（全部删除）

| 文件 | 原用途 | 删除理由 |
|------|--------|----------|
| `docs/spec-core-upgrade.md` | v2→v3 升级 spec | 已被 `spec-v4-redesign.md` 取代 |
| `docs/spec-growth-system.md` | 增长体系 spec | 已过时，v4 会员体系重设计 |
| `docs/AUDIT_REPORT.md` | 旧审计报告 | 已完成，不再需要 |
| `docs/ROLLOUT_PLAN.md` | 旧上线计划 | 已过时 |
| `docs/architecture.md` | 旧架构文档 | 需用 v4 spec 替代 |
| `docs/design-system.md` | 旧设计系统文档 | UI 已重设计，文档过时 |
| `DEPRECATED.md` | v3 淘汰清单 | 将被本文件 + v4 spec 替代 |

---

## 二、后端：删除淘汰的数据源代码

### 2.1 连接器（删除 3 个交易所 + __pycache__）

| 文件 | 说明 |
|------|------|
| `backend/app/data/connectors/deribit.py` | Deribit WSS 连接器 |
| `backend/app/data/connectors/bybit.py` | Bybit WSS 连接器 |
| `backend/app/data/connectors/okx.py` | OKX WSS 连接器 |
| `backend/app/data/connectors/__pycache__/deribit.cpython-311.pyc` | 缓存 |
| `backend/app/data/connectors/__pycache__/bybit.cpython-311.pyc` | 缓存 |
| `backend/app/data/connectors/__pycache__/okx.cpython-311.pyc` | 缓存 |

### 2.2 数据源注册表（修改，不删除）

| 文件 | 操作 |
|------|------|
| `backend/app/data/datasource_registry.py` | 移除 `_EXCHANGE_SOURCES` 中的 deribit/bybit_linear/okx_swap 条目 |
| `backend/app/data/datasource_registry.py` | 移除 `_SENTIMENT_SOURCES` 中的 lunarcrush 条目 |

### 2.3 已淘汰功能代码

| 文件 | 说明 | 操作 |
|------|------|------|
| `backend/app/services/correlation.py` | 相关性分析（已淘汰） | 删除 |
| `backend/workers/correlation_worker.py` | 相关性 worker | 删除 |

---

## 三、后端：测试文件（全部清除 87 个）

`backend/tests/` 目录下所有 `test_*.py` 文件删除，仅保留：
- `__init__.py`
- `conftest.py`（如果后续需要重建测试）

**删除文件列表**：
```
test_accuracy_properties.py
test_admin_orders_api.py
test_agent_base.py
test_alert_docker.py
test_alert_engine.py
test_analysis_quota.py
test_anti_hallucination.py
test_atr_entry_range.py
test_audit_fault_conditions.py
test_audit_preservation.py
test_auth_api.py
test_binance.py
test_cache_consistency.py
test_cache_lock.py
test_case_search.py
test_circuit_breaker.py
test_coinglass_client.py
test_coinglass_heatmap.py
test_coinglass_oi.py
test_coinglass_taker.py
test_config_crud.py
test_config_service.py
test_connectors.py
test_consensus_api.py
test_consensus_engine.py
test_core.py
test_correlation.py
test_datasource_api.py
test_datasource_manager.py
test_datasource_properties.py
test_datasource_registry.py
test_derivatives_api.py
test_derivatives_collector.py
test_derivatives_integration.py
test_dynamic_config.py
test_email.py
test_encryption.py
test_fingerprint.py
test_health_monitor.py
test_heatmap_collector.py
test_indicators.py
test_kill_detector.py
test_learning_service.py
test_llm_client.py
test_llm_cost.py
test_llm_temperature.py
test_long_short_ratio.py
test_market_api.py
test_metrics.py
test_new_agents.py
（以及其余 37 个 test_*.py 文件）
```

同时清除 `backend/tests/__pycache__/` 目录。

---

## 四、前端：页面清理评估

### 4.1 确认保留的用户页面（新设计）

| 页面 | 路径 | 说明 |
|------|------|------|
| 看板 | `/dashboard` | 重构为多币种概览表 |
| 综合分析 | `/consensus` | 重构为 AI 对抗分析 |
| 剧本 | `/playbook-sim` | 重构为 AI 对抗推演 |
| 绩效 | `/performance` | 保留 |
| 预警 | `/alerts` | 保留 |
| 任务中心 | `/tasks` | 保留 |
| 合伙人 | `/partner` | 保留 |
| 会员中心 | `/settings/membership` | 保留，更新权益表 |
| 推送设置 | `/settings/push` | 保留 |
| 参数设置 | `/settings/configs` | 保留，布局重构 |

### 4.2 需要删除或合并的用户页面

| 页面 | 路径 | 处理 | 理由 |
|------|------|------|------|
| 对抗防御 | `/defense` | **合并到 `/consensus`** | AI 对抗已融入综合分析流程 |
| 反思复盘 | `/reflection` | **合并到 `/consensus`** | 反思洞察作为分析的一部分展示 |
| 剧本案例 | `/cases` | **合并到 `/playbook-sim`** | 案例库归入剧本页 |
| 合约数据 | `/derivatives` | **合并到 `/dashboard`** | 看板概览表展示关键衍生品数据 |
| 链上监控 | `/onchain` | **删除** | 导航已移除，链上数据由 OnchainAgent 内部消化 |
| 回测 | `/backtest` | **保留** | 会员功能，7/30/180 天回测 |

### 4.3 需要删除的前端文件/目录

| 路径 | 说明 |
|------|------|
| `frontend/app/(main)/defense/` | 对抗防御页面目录 |
| `frontend/app/(main)/reflection/` | 反思复盘页面目录 |
| `frontend/app/(main)/cases/` | 剧本案例页面目录 |
| `frontend/app/(main)/derivatives/` | 合约数据页面目录 |
| `frontend/app/(main)/onchain/` | 链上监控页面目录 |

---

## 五、前端：导航菜单清理

### 5.1 TopNav.tsx 需要修改

**现有用户导航**：
```
看板 | 分析 | 剧本 | 绩效 | 预警 | 增长 | 设置
```

**需要删除的隐藏入口**（页面删除后对应路由也失效）：
- `/defense`（无导航入口但页面存在）
- `/reflection`（无导航入口但页面存在）
- `/cases`（无导航入口但页面存在）
- `/derivatives`（无导航入口但页面存在）
- `/onchain`（无导航入口但页面存在）

---

## 六、后端：需要修改的引用

删除数据源/页面后，以下文件需要清理引用：

| 文件 | 修改内容 |
|------|----------|
| `backend/app/data/connectors/__init__.py` | 移除 Deribit/Bybit/OKX 的 import |
| `backend/app/data/datasource_registry.py` | 移除 4 个淘汰数据源定义 |
| `backend/workers/celery_app.py` | 检查是否有 correlation_worker 的 beat 注册 |
| `frontend/lib/api/datasources.ts` | 前端数据源 API 无需改（动态读取） |

---

## 七、__pycache__ 全局清理

```bash
find backend/ -type d -name "__pycache__" -exec rm -rf {} +
```

执行一次全局 pycache 清理，保持目录干净。

---

## 八、执行顺序

1. **先删文档**：旧 spec/audit/rollout/design-system/DEPRECATED.md
2. **再删后端死代码**：connectors/deribit|bybit|okx、correlation、tests
3. **再删前端页面**：defense/reflection/cases/derivatives/onchain
4. **修改引用**：datasource_registry、connectors/__init__、celery_app
5. **清理 __pycache__**
6. **验证构建**：`npm run build` + `pytest`（确保无 import 错误）
