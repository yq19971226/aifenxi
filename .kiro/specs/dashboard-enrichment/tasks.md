# 实施计划：仪表盘内容丰富化

## 概述

基于已有后端数据源（ConsensusReport、PerformanceStats、Redis sentiment 缓存），新增一个轻量后端 sentiment 端点和三个前端展示组件（CompositeSignal、WinRatePrediction、MarketSentimentGauge），并集成到仪表盘布局中。后端改动极小（一个 API 文件 + 路由注册），主要工作在前端组件和布局集成。

## Tasks

- [x] 1. 新增后端 Sentiment API 端点
  - [x] 1.1 创建 `backend/app/api/sentiment.py`，实现 `GET /api/sentiment/fear-greed` 端点
    - 定义 `SentimentResponse` Pydantic 模型（value: int, classification: str, timestamp: str）
    - 从 Redis 缓存 `sentiment:fear_greed` 读取数据
    - 缓存不存在时返回 404，Redis 连接失败时返回 500 并记录日志
    - 使用 `Depends` 注入当前用户（需登录，无会员等级限制）
    - _需求: 3.1, 3.4_

  - [x] 1.2 在 `backend/main.py` 注册 sentiment 路由
    - 导入 sentiment router 并添加到 `app.include_router()`
    - _需求: 3.1_

  - [x]* 1.3 编写后端 sentiment API 单元测试 `backend/tests/test_sentiment_api.py`
    - 测试 Redis 有缓存时返回 SentimentResponse
    - 测试 Redis 无缓存时返回 404
    - 测试 Redis 连接失败时返回 500
    - _需求: 3.1, 3.4_

- [x] 2. 新增前端 API 封装与工具函数
  - [x] 2.1 创建 `frontend/lib/api/sentiment.ts`
    - 定义 `SentimentData` 接口（value: number, classification: string, timestamp: string）
    - 实现 `fetchFearGreed()` 函数，调用 `/api/sentiment/fear-greed`，404 时返回 null
    - _需求: 3.1_

  - [x] 2.2 创建 `frontend/lib/dashboard/signalUtils.ts` 工具函数模块
    - 实现 `mapSignalMeta(signal)` — 信号方向到标签/颜色映射
    - 实现 `shouldShowDivergenceWarning(divergence)` — 分歧度 >50 警示判断
    - 实现 `computeWeightedWinRate(byAgent, weights)` — 加权胜率计算
    - 实现 `shouldShowSampleWarning(settledCount)` — 样本不足 <5 警示判断
    - 实现 `computeGaugeAngle(value)` — 仪表盘指针角度计算
    - 实现 `mapFearGreedZone(value)` — 恐贪指数区间到标签/颜色映射
    - _需求: 1.3, 1.4, 2.2, 2.6, 3.1, 3.2_

  - [x]* 2.3 编写属性测试 `frontend/__tests__/dashboard/compositeSignal.property.test.ts`
    - **Property 1: 信号方向与颜色/标签映射**
    - **验证: 需求 1.3**

  - [x]* 2.4 编写属性测试 `frontend/__tests__/dashboard/compositeSignal.property.test.ts`（追加）
    - **Property 2: 分歧度警示阈值**
    - **验证: 需求 1.4**

  - [x]* 2.5 编写属性测试 `frontend/__tests__/dashboard/winRate.property.test.ts`
    - **Property 3: 加权胜率计算**
    - **验证: 需求 2.2**

  - [x]* 2.6 编写属性测试 `frontend/__tests__/dashboard/winRate.property.test.ts`（追加）
    - **Property 4: 样本不足警示阈值**
    - **验证: 需求 2.6**

  - [x]* 2.7 编写属性测试 `frontend/__tests__/dashboard/sentimentGauge.property.test.ts`
    - **Property 5: 仪表盘指针角度计算**
    - **验证: 需求 3.1**

  - [x]* 2.8 编写属性测试 `frontend/__tests__/dashboard/sentimentGauge.property.test.ts`（追加）
    - **Property 6: 恐贪指数区间映射**
    - **验证: 需求 3.2, 3.3**

- [x] 3. Checkpoint - 确保后端端点和工具函数就绪
  - 确保所有测试通过，如有疑问请向用户确认。

- [x] 4. 实现 CompositeSignal 组件
  - [x] 4.1 创建 `frontend/components/cards/CompositeSignal.tsx`
    - 定义 `CompositeSignalProps`（symbol: string, membershipLevel: number）
    - 使用 React Query 调用 `fetchConsensusLatest(symbol)` 获取共识数据
    - 根据 `consensus_signal` 渲染信号方向标签 + 对应颜色主题（绿/红/灰）
    - 展示 `consensus_confidence` 百分比和 `divergence` 分歧度
    - divergence > 50 时附加"分歧较大"警示标签
    - 数据不可用时展示"暂无信号数据"占位
    - membershipLevel === 0 时锁定 confidence 和 divergence 字段
    - 使用与现有模块一致的卡片样式（backdrop-blur、border-white/[0.08]、rounded-xl）
    - _需求: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 4.3_

  - [x]* 4.2 编写 CompositeSignal 单元测试 `frontend/__tests__/dashboard/compositeSignal.test.ts`
    - 测试数据不可用时展示占位状态
    - 测试免费用户锁定覆盖层渲染
    - _需求: 1.5, 1.6_

- [x] 5. 实现 WinRatePrediction 组件
  - [x] 5.1 创建 `frontend/components/cards/WinRatePrediction.tsx`
    - 定义 `WinRatePredictionProps`（symbol: string, membershipLevel: number）
    - 使用 React Query 分别获取 ConsensusReport 和 PerformanceStats
    - 信号为 bullish/bearish 时调用 `computeWeightedWinRate` 计算加权胜率
    - 展示历史基准胜率 `win_rate`、平均盈利 `avg_profit_pct`、平均亏损 `avg_loss_pct`
    - 信号为 neutral 时展示"当前无方向性信号，不计算胜率"
    - `settled_count < 5` 时附加"样本不足"警示
    - 数据不可用时展示"暂无绩效数据"占位
    - membershipLevel === 0 时展示完整锁定覆盖层
    - _需求: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8_

  - [x]* 5.2 编写 WinRatePrediction 单元测试 `frontend/__tests__/dashboard/winRate.test.ts`
    - 测试观望信号时的提示文案
    - 测试数据不可用时的占位状态
    - 测试免费用户锁定覆盖层
    - _需求: 2.5, 2.7, 2.8_

- [x] 6. 实现 MarketSentimentGauge 组件
  - [x] 6.1 创建 `frontend/components/cards/MarketSentimentGauge.tsx`
    - 使用 React Query 调用 `fetchFearGreed()` 获取恐贪指数
    - 使用 SVG 绘制半圆仪表盘，五段弧线分别着色对应区间
    - 指针角度 = `180 - (value / 100) × 180`
    - 中央显示数值和情绪文字标签
    - 数据不可用时展示"数据缺失"占位
    - _需求: 3.1, 3.2, 3.3, 3.4_

  - [x]* 6.2 编写 MarketSentimentGauge 单元测试 `frontend/__tests__/dashboard/sentimentGauge.test.ts`
    - 测试数据缺失时的占位状态
    - _需求: 3.4_

- [x] 7. Checkpoint - 确保三个组件独立可用
  - 确保所有测试通过，如有疑问请向用户确认。

- [x] 8. 仪表盘布局集成与错误隔离
  - [x] 8.1 修改 `frontend/app/(main)/dashboard/page.tsx` 集成新模块
    - 在 KlineChart 和 DerivativesPanel 之间插入新模块区域
    - CompositeSignal 和 WinRatePrediction 使用 `grid-cols-1 lg:grid-cols-2` 并排
    - MarketSentimentGauge 紧随其后
    - 传入 symbol 和 membershipLevel props
    - 用户切换交易对时自动刷新新模块数据（通过 React Query key 依赖 symbol）
    - _需求: 4.1, 4.2, 4.5_

  - [x] 8.2 为三个新模块添加 React Error Boundary 错误隔离
    - 每个模块独立包裹 Error Boundary
    - 任一模块加载失败时展示错误提示卡片，不影响其他模块
    - _需求: 4.4_

  - [ ]* 8.3 编写错误隔离单元测试 `frontend/__tests__/dashboard/errorIsolation.test.ts`
    - **Property 8: 模块错误隔离**
    - 测试单个模块抛出异常时其余模块正常渲染
    - **验证: 需求 4.4**

  - [ ]* 8.4 编写免费用户锁定测试 `frontend/__tests__/dashboard/membershipLock.test.ts`
    - **Property 7: 免费用户字段锁定**
    - 测试 membershipLevel=0 时 CompositeSignal 锁定 confidence/divergence
    - 测试 membershipLevel=0 时 WinRatePrediction 完整锁定
    - **验证: 需求 1.6, 2.8**

- [x] 9. Final Checkpoint - 全部完成验证
  - 确保所有测试通过，如有疑问请向用户确认。

## 备注

- 标记 `*` 的子任务为可选，可跳过以加速 MVP
- 每个任务引用具体需求编号以确保可追溯性
- 属性测试验证纯函数在所有输入上的通用正确性，单元测试覆盖具体边界案例
- Checkpoint 确保增量验证
