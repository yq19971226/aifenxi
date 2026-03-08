# Design Document — 商用就绪 + 自主学习模块

## Architecture Overview

本设计分两部分：Part A 商用补齐（最小改动，无需重构）、Part B 自主学习模块（新增页面+API）。

```
┌─────────────────── 前端 ───────────────────┐
│                                             │
│  /settings/configs  ← A1(定价) + A2(配额)  │
│  /settings/membership ← A3(动态对比表)     │
│                       ← A4(时长选择器)     │
│  /admin/learning    ← B1~B5(自主学习)      │
│                                             │
└──────────────┬──────────────────────────────┘
               │ API
┌──────────────▼──────────────────────────────┐
│           后端 API 层                        │
│                                             │
│  api/membership.py  ← A3 GET /plans        │
│  api/learning.py    ← B1~B5 全部端点       │
│                                             │
├─────────────────────────────────────────────┤
│           后端 Service 层                    │
│                                             │
│  payment.py         ← A1 动态读取价格       │
│  learning_service.py ← B1~B5 业务逻辑      │
│  config_service.py  ← 现有，无需改动        │
│  performance.py     ← 现有，复用统计方法    │
│  consensus/weights.py ← 现有，复用计算     │
│                                             │
└─────────────────────────────────────────────┘
```

---

## Part A: 商用补齐

### A1: 套餐定价动态化

**修改范围：**

1. `backend/app/services/payment.py`
   - `PLAN_PRICES` 改为回退默认值
   - 新增 `_get_plan_price(plan: int) -> float` 从 config_service 读取
   - `create_payment()` 调用 `_get_plan_price()` 替代直接取 `PLAN_PRICES`

2. `frontend/app/(main)/settings/configs/page.tsx`
   - `CONFIG_GROUPS` 新增「会员定价」分组：
     ```typescript
     {
       id: "pricing",
       icon: "💰",
       title: "会员定价",
       items: [
         { key: "plan_price_pro", label: "专业版月价", defaultValue: "99", unit: "USD" },
         { key: "plan_price_flagship", label: "旗舰版月价", defaultValue: "299", unit: "USD" },
       ],
     }
     ```

3. `frontend/app/(main)/settings/membership/page.tsx`
   - 价格从新增 API `GET /api/membership/plans` 获取

### A2: 分析配额管理 UI

**修改范围：仅前端**

`frontend/app/(main)/settings/configs/page.tsx` 的 `CONFIG_GROUPS` 新增：

```typescript
{
  id: "analysis_quota",
  icon: "📈",
  title: "分析配额",
  items: [
    { key: "analysis_daily_limit_free_scalping", label: "免费-快速分析", defaultValue: "5", unit: "次/天" },
    { key: "analysis_daily_limit_pro_scalping", label: "专业-快速分析", defaultValue: "50", unit: "次/天" },
    { key: "analysis_daily_limit_flagship_scalping", label: "旗舰-快速分析", defaultValue: "200", unit: "次/天" },
    { key: "analysis_daily_limit_pro_intraday", label: "专业-日内分析", defaultValue: "20", unit: "次/天" },
    { key: "analysis_daily_limit_flagship_intraday", label: "旗舰-日内分析", defaultValue: "100", unit: "次/天" },
    { key: "analysis_daily_limit_flagship_trend", label: "旗舰-趋势分析", defaultValue: "30", unit: "次/天" },
  ],
}
```

后端无需修改 — `analysis_quota.py` 已支持从 config_service 动态读取。

### A3: 会员功能对比表动态化

**新增文件：**

- `backend/app/api/membership.py` — 新增路由
  ```python
  GET /api/membership/plans → 返回 { plans: [...], features: [...] }
  ```
  价格从 config_service 读取，功能对比表可硬编码（变更频率低）

**修改文件：**

- `frontend/app/(main)/settings/membership/page.tsx`
  - `PLAN_FEATURES` 和价格改为从 API 获取
  - 新增 loading 状态

### A4: 会员时长多选项

**修改文件：**

1. `backend/app/services/payment.py`
   - `DURATION_DISCOUNTS = {1: 1.0, 3: 0.9, 12: 0.7}` — 从 config_service 读取
   - `create_payment()` 新增 `duration_months` 参数
   - 金额 = 月价 × 月数 × 折扣率

2. `backend/app/api/payment.py`（如果有独立路由）
   - 请求体新增 `duration_months` 字段

3. `frontend/app/(main)/settings/membership/page.tsx`
   - 新增时长切换按钮组（月/季/年）
   - 价格实时计算展示

---

## Part B: 自主学习模块

### 整体设计

新增一个后台管理页面 `/admin/learning`，分为 5 个功能卡片/Tab。

### B1: 绩效回顾面板

**新增文件：**

- `backend/app/api/learning.py` — 学习模块 API 路由

```python
@router.get("/performance-review")
async def performance_review(
    days: int = Query(30, ge=7, le=365),
    symbol: str | None = None,
    mode: str | None = None,
    session: AsyncSession = Depends(get_session),
    user: dict = Depends(require_admin),
):
    """返回指定时段的绩效回顾数据。"""
```

**返回数据结构：**

```python
{
  "period": {"start": "2026-01-29", "end": "2026-02-28", "days": 30},
  "overall": {
    "total_strategies": 450,
    "settled_count": 420,
    "win_rate": 0.62,
    "avg_profit_pct": 3.2,
    "avg_loss_pct": -1.8,
    "profit_loss_ratio": 1.78
  },
  "daily_trend": [
    {"date": "2026-01-29", "win_rate": 0.58, "cumulative_pnl": 2.1, "strategy_count": 15},
    ...
  ],
  "by_agent": {
    "technical": {"accuracy": 0.65, "total": 420, "correct": 273},
    "onchain": {"accuracy": 0.58, "total": 350, "correct": 203},
    ...
  },
  "signal_distribution": {
    "bullish": 180, "bearish": 150, "neutral": 120
  },
  "by_mode": {
    "scalping": {"win_rate": 0.55, "count": 200},
    "intraday": {"win_rate": 0.64, "count": 180},
    "trend": {"win_rate": 0.71, "count": 70}
  }
}
```

**复用：** `PerformanceTracker.get_stats()`, `get_trend()`, `_get_agent_accuracy()`

### B2: 手动权重迭代

**新增 API：**

```python
@router.post("/recalculate-weights")
async def recalculate_weights(
    lookback_days: int = Body(30, ge=7, le=180),
    session: AsyncSession = Depends(get_session),
    user: dict = Depends(require_admin),
):
    """预览新权重（不写入 Redis）。"""

@router.post("/apply-weights")
async def apply_weights(
    weights: dict[str, float] = Body(...),
    session: AsyncSession = Depends(get_session),
    user: dict = Depends(require_admin),
):
    """将权重写入 Redis 生效。"""
```

**复用：** `consensus/weights.py` 的 `_query_model_scores()`, `calculate_weights()`

需新增 `calculate_weights_with_lookback(session, days)` 函数支持自定义回看天数。

### B3: 手动反思复盘触发

**复用已有端点：** `POST /api/reflection/trigger`

前端封装：
- 币种多选器（从 symbol_registry 获取）
- 批量触发按钮
- 最近复盘报告列表（`GET /api/reflection/latest`）

### B4: 信号校准工具

**参数迁移：**

| 参数 | 当前位置 | 迁移到 config_service |
|------|----------|----------------------|
| 共识阈值 ±0.35 | `engine.py` 硬编码 | `consensus_signal_threshold` |
| 最小一致模型数 ≥2 | `engine.py` 硬编码 | `consensus_min_agreement` |

**新增 API：**

```python
@router.get("/calibration-params")
async def get_calibration_params(user: dict = Depends(require_admin)):
    """返回当前可调校准参数。"""

@router.put("/calibration-params")
async def update_calibration_params(
    params: dict[str, str] = Body(...),
    session: AsyncSession = Depends(get_session),
    user: dict = Depends(require_admin),
):
    """更新校准参数。"""
```

### B5: 数据库维护工具

**新增 API：**

```python
@router.get("/db-stats")
async def db_stats(session: AsyncSession = Depends(get_session)):
    """返回各表行数和数据量。"""
    # 查询 strategy_snapshots, notification_logs, agent_reports 等表

@router.post("/cleanup")
async def cleanup(
    target: str = Body(...),  # "snapshots" | "notifications" | "cache"
    retain_days: int = Body(180),
    session: AsyncSession = Depends(get_session),
    user: dict = Depends(require_admin),
):
    """清理过期数据。"""
```

### 前端页面设计

`/admin/learning` 页面使用 Tab 布局：

```
┌─────────────────────────────────────────────────┐
│  自主学习中心                                     │
├────────┬───────────┬──────────┬────────┬─────────┤
│ 绩效回顾 │ 权重迭代  │ 反思复盘 │ 信号校准 │ 数据维护 │
├────────┴───────────┴──────────┴────────┴─────────┤
│                                                   │
│  [根据选中 Tab 渲染对应面板]                       │
│                                                   │
└───────────────────────────────────────────────────┘
```

---

## 安全考虑

- 所有 learning API 端点均需 `require_admin` 权限
- 权重应用和数据清理操作需二次确认
- 所有修改操作写入 config_service 审计日志
- 数据清理 API 设置最小保留天数下限（30 天）

## 不修改的部分

- 编排器架构不变
- 共识引擎 NSED 流程不变
- 现有 14 个管理页面不变
- 现有前台用户页面不变
- 数据库 schema 不变（无需迁移）
