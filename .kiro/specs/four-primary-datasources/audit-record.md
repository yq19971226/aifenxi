# 四主源架构审查记录

> 审查日期: 2026-03-08
> 审查范围: 代码层 + spec 层 + 运行态验证

## 1. 架构概要

| 域 | 主源 Owner | 当前运行态 | 语义位状态 |
|----|-----------|-----------|-----------|
| market | Binance | ✅ 已闭环（WS + REST + K线调度器） | capability_state 注册 + worker 回写 |
| derivatives | CoinGlass | ✅ 已闭环（Standard 套餐 + 双通道 + worker 回写） | 10 个 capability 全部注册 |
| onchain | CryptoQuant | ⏳ 语义位就绪，当前由 Alternative.me + GlassNode fallback 补位 | capability_state 注册 + worker 回写 |
| macro | FRED | ⏳ 语义位就绪，当前由 CoinGecko Global fallback 补位 | capability_state 注册 + worker 回写 |

## 2. 代码层闭环确认

### capability_state.py
- 所有 capability 均携带 `domain` / `owner` / `cache_key` 元数据
- `get_all_capabilities()` 输出包含上述字段
- V4 已移除端点（`cg_oi`, `cg_fr`）标记为 UNAVAILABLE

### Worker capability 回写
| Worker | 回写的 capability key | 状态 |
|--------|---------------------|------|
| kline_collector | `market_klines` | ✅ |
| orderbook_worker | `orderbook` | ✅ |
| derivatives_worker | `derivatives` | ✅ |
| coinglass_worker | `cg_*` 系列（10个） | ✅ |
| onchain_collector | `onchain` | ✅ |
| coingecko_worker | `gecko_*` 系列（5个） | ✅ |
| sentiment_worker | `sentiment:fear_greed` | ✅ |
| calendar_worker | `calendar` | ✅ |

### 数据源状态接口
- `/api/datasources/status` 返回 `primary_sources` / `domain_completeness` / `missing_domains`
- 旧字段 `combo_enabled` / `exchanges` / `completeness_score` / `coinglass_*` / `coingecko_*` 全部保留

### 分析编排器
- `DataQualitySnapshot` 扩展 `required_domains` / `domain_status` / `missing_domains` / `domain_completeness`
- `_evaluate_status` 基于域级语义判定 blocked / degraded / actionable
- `_apply_completeness_degradation` 优先使用域级完整度，回退到旧 datasource_manager 完整度

### 前端
- 数据源管理页：四主源区域 + "兼容运行组" 分隔 + 旧卡片保留
- DataSourceBanner：优先显示 `domain_completeness`
- TopNav：优先显示 `domain_completeness`

## 3. Spec 层归属确认

| Spec | 状态归属标注 |
|------|------------|
| `four-primary-datasources` | 主总纲 ✅ |
| `multi-datasource-management` | 已降级为运行时管理抽象历史参考 ✅ |
| `cryptoquant-onchain-source` | onchain 子域，上位引用 four-primary-datasources ✅ |
| `fred-macro-source` | macro 子域，上位引用 four-primary-datasources ✅ |

## 4. 运行态验证（Smoke Test）

```
后端 API 返回:
  combo_enabled: True
  completeness_score: 1.0
  primary_sources: 4
  domain_completeness: 0.25
  market: enabled 5/5
  derivatives: error 0/5 (Celery worker 未运行)
  onchain: error 0/5 (Celery worker 未运行)
  macro: error 0/1 (Celery worker 未运行)
```

## 5. 剩余开放项

| Task | 子项 | 状态 | 依赖 |
|------|------|------|------|
| 2.1 | 定义 Primary Capability Matrix 字段与维护位置 | 待定 | 可在下一轮文档整理中完成 |
| 2.4 | 统一 capability status 与 freshness 输出协议 | 待定 | 需设计 freshness 时间戳字段 |
| 6.2 | 定义 CryptoQuant 采集预算 | 待定 | 需用户确认 API 档位 |
| 6.3 | 实现链上 owner 矩阵与数据源注册 | 待定 | 依赖 CryptoQuant API key |
| 7.2 | 定义 FRED 宏观序列白名单 | 待定 | 需用户确认目标序列 |
| 7.3 | 建立 FRED observations 语义 | 待定 | 依赖 FRED API key |
| 7.4 | 新闻宏观降级为解释层 | 待定 | 依赖 7.2/7.3 |
