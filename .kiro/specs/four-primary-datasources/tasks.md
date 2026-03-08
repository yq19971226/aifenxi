# 实施任务：四大主数据源

## 概述

本任务包用于把系统主数据源架构正式收敛为四个一等真相源：

- `Binance`（盘面）
- `CoinGlass`（衍生品）
- `CryptoQuant`（链上）
- `FRED`（宏观）

实施顺序强调：**先清真相源，再补实现缺口**。

## 任务

- [x] 1. 文档清理与主真相源固化
  - [x] 1.1 新增 `four-primary-datasources` 主总纲 spec
  - [x] 1.2 为 `multi-datasource-management` 增加旧管理抽象/过渡方案说明
  - [x] 1.3 为 `whale-position-detection` 增加 `CoinGlass` 子域 spec 说明
  - [x] 1.4 为 `omnimind-system` 和 `omnimind-v2-enhancements` 增加历史阶段说明
  - [x] 1.5 清理旧文档中误导性的主架构表述，防止继续被引用为当前主真相源

- [ ] 2. 主能力矩阵对齐
  - [ ] 2.1 定义 `Primary Capability Matrix` 字段与维护位置
  - [x] 2.2 为 `market / derivatives / onchain / macro` 四域补 owner 映射
  - [x] 2.3 为每项核心能力补 cache_key / api / consumer / fallback 说明
  - [ ] 2.4 统一 capability status 与 freshness 输出协议

- [ ] 3. 后台一等展示收口
  - [x] 3.1 后台数据源主视图收敛为四个主源
  - [x] 3.2 旧源改为 `辅助 / 已停用 / 可恢复`
  - [x] 3.3 公开状态接口改为域级状态与 freshness 语义
  - [x] 3.4 旧的 `Exchange_Direct_Combo` 仅保留兼容语义，不再作为产品主叙事

- [x] 4. Binance 盘面对齐
  - [x] 4.1 明确 `Binance` 为盘面基线 owner
  - [x] 4.2 补齐主矩阵中的 trade / ticker / kline / latest_price 归属
  - [x] 4.3 检查消费者是否仍错误依赖旧交易所组合抽象

- [x] 5. CoinGlass 衍生品域收口
  - [x] 5.1 以 `Standard` 套餐为当前生产目标档位
  - [x] 5.2 补齐已存在但未闭环的 Standard 级能力链路
  - [x] 5.3 清理 V4 已移除端点的主能力叙事
  - [x] 5.4 修正 worker / cache / API / capability matrix 的不一致项
  - [x] 5.5 将 `whale-position-detection` 作为 CoinGlass 子域 spec 持续维护

- [x] 6. CryptoQuant 链上主源落地
  - [x] 6.1 新增 CryptoQuant 正式 spec 或补到现有主矩阵中
  - [x] 6.2 定义 3-4 个主币种、10 个核心指标的默认采集预算
  - [x] 6.3 实现链上 owner 矩阵与数据源注册
  - [x] 6.4 清理旧链上辅助源与主源角色混淆

- [x] 7. FRED 宏观主源落地
  - [x] 7.1 新增 FRED 宏观采集 spec
  - [x] 7.2 定义核心美国宏观序列白名单
  - [x] 7.3 建立 observations / release / freshness / revision 语义
  - [x] 7.4 将新闻宏观关键词识别降级为解释层或 fallback

- [x] 8. 域级完整度替换旧完整度叙事
  - [x] 8.1 用 `market / derivatives / onchain / macro` 替换旧的交易所权重完整度叙事
  - [x] 8.2 分析输出补 `missing_domains` 与 `domain_status`
  - [x] 8.3 在后台和前端补 freshness / stale / missing 状态展示

- [x] 9. 验证与同步
  - [x] 9.1 检查 `.kiro/specs` 内旧文档是否已明确状态归属
  - [x] 9.2 检查后台数据源展示与新主架构是否一致
  - [x] 9.3 检查 capability matrix、运行状态和消费者引用是否一致
  - [x] 9.4 输出一份最终的四主源架构审查记录
