# 需求文档：庄家建仓/点杀预警系统

## 文档状态

- **当前定位**：本文件是 `CoinGlass` 衍生品子域 spec。
- **承担范围**：描述 CoinGlass 套餐能力、采集链路与点杀预警子系统。
- **不再承担**：系统级主数据源总纲定义。

简介

本功能为庄家视角多智能体分析系统新增"庄家建仓/点杀预警"能力。通过接入 CoinGlass API V4 采集持仓量（OI）、主动买卖量（Taker Volume）、爆仓热力图（Liquidation Heatmap）等合约深度数据，结合多维度信号交叉验证，检测庄家大额建仓行为并预警"点杀"风险（即庄家利用杠杆密集区反向操盘引发连环爆仓）。

系统同时引入 CoinGlass 套餐管理机制，根据后台配置的套餐等级自动控制限频、可用端点和采集频率，确保 API 用量不超限。

## 术语表

- **CoinGlass_Client**: CoinGlass API V4 数据采集客户端，负责所有 CoinGlass 端点的请求、限频和错误处理
- **OI_Monitor**: 持仓量监控模块，负责采集和分析 Open Interest 变化
- **Taker_Analyzer**: 主动买卖量分析模块，负责检测 Taker Buy/Sell Volume 的方向性失衡
- **Heatmap_Collector**: 爆仓热力图采集模块，负责获取和解析爆仓密集区数据
- **Kill_Detector**: 点杀预警引擎，综合 OI、Taker Volume、爆仓热力图信号生成预警
- **Tier_Manager**: CoinGlass 套餐管理模块，根据配置的套餐等级控制限频和端点可用性
- **Notification_Dispatcher**: 现有推送系统（TG/邮件），负责将预警消息推送给用户
- **Config_Service**: 现有动态配置服务，存储 CoinGlass API Key 和套餐等级等配置
- **Risk_Agent**: 现有风险预警智能体，本功能扩展其告警类型
- **OI突增**: 持仓量在短时间窗口内增幅超过设定阈值（如5分钟内增幅 > 5%）
- **Taker方向性失衡**: 主动买入量与主动卖出量的比值偏离1.0超过设定阈值
- **爆仓密集区**: 爆仓热力图中爆仓订单集中的价格区间
- **点杀条件（基础版）**: OI变化率 + 大户多空比 + 净持仓 + 爆仓热力图model1 + 加权资金费率，综合判断（需 Startup+ 套餐）
- **点杀条件（增强版）**: 基础版 + Taker买卖方向 + 热力图全模型(model2/3) + 爆仓订单明细 + 清算最大痛点 + 资金费率套利，综合判断（需 Standard+ 套餐）
- **点杀条件（完整版）**: 增强版全部能力 + 最高频率(1200/min) + 全币种(7000+)覆盖（需 Professional 套餐）
- **CoinGlass套餐等级**: CoinGlass API 的四个订阅等级——Hobbyist($29)、Startup($79)、Standard($299)、Professional($699)，每个等级对应不同的数据覆盖范围、限频上限和可用端点

## 需求

### 需求 1：CoinGlass API V4 数据采集客户端

**用户故事：** 作为系统开发者，我希望有一个统一的 CoinGlass API V4 客户端，以便集中管理所有 CoinGlass 数据采集、限频控制和错误处理。

#### 验收标准

1. THE CoinGlass_Client SHALL 使用 `httpx.AsyncClient` 发起所有 HTTP 请求，每次请求超时时间为 30 秒
2. THE CoinGlass_Client SHALL 从 Config_Service 读取 `coinglass_api_key` 作为请求头 `CG-API-KEY` 的值
3. THE CoinGlass_Client SHALL 使用 CoinGlass API V4 基础地址 `https://open-api-v4.coinglass.com` 作为所有端点的前缀
4. WHEN CoinGlass API 返回 HTTP 429（限频）错误时，THE CoinGlass_Client SHALL 等待响应头中 `Retry-After` 指定的秒数后重试，最多重试 2 次
5. WHEN CoinGlass API 返回非 2xx 状态码（非 429）时，THE CoinGlass_Client SHALL 记录错误日志（包含端点路径、状态码、响应体）并返回 None
6. IF CoinGlass API Key 未配置，THEN THE CoinGlass_Client SHALL 记录警告日志并跳过所有采集，返回 None

### 需求 2：持仓量（Open Interest）采集与监控

**用户故事：** 作为交易者，我希望系统能实时监控合约持仓量变化，以便发现庄家大额建仓行为。

#### 验收标准

1. THE OI_Monitor SHALL 通过 CoinGlass_Client 调用 `/api/futures/openInterest/ohlc-history` 端点采集指定交易对的 OI OHLC 历史数据
2. THE OI_Monitor SHALL 通过 CoinGlass_Client 调用 `/api/futures/openInterest/aggregated-history` 端点采集全网聚合 OI 历史数据
3. THE OI_Monitor SHALL 将采集到的 OI 数据写入 TimescaleDB 时序表 `oi_snapshots`，包含字段：time、symbol、exchange、open_interest、oi_change_percent
4. THE OI_Monitor SHALL 将最新 OI 快照缓存到 Redis，缓存键为 `oi_snapshot:{symbol}`，TTL 为 300 秒
5. WHILE CoinGlass 套餐为 Startup 或更高时，WHEN OI 在 5 分钟窗口内增幅超过配置阈值（默认 5%）时，THE OI_Monitor SHALL 发布一条 `oi_surge` 事件到 Redis Streams `indicator_updates`
6. WHILE CoinGlass 套餐为 Hobbyist 时，THE OI_Monitor SHALL 仅采集 OI 总量和分交易所数据，跳过 OI 变化率趋势分析（Hobbyist 套餐不支持 OI 变化率）
7. THE OI_Monitor SHALL 通过 CoinGlass_Client 调用 `/api/futures/openInterest/exchange-list` 端点采集各交易所级别的 OI 分布数据

### 需求 3：主动买卖量（Taker Buy/Sell Volume）采集与分析

**用户故事：** 作为交易者，我希望系统能分析主动买卖量的方向性失衡，以便判断庄家的建仓方向。

> ⚠️ 套餐依赖：Taker Buy/Sell Volume 方向数据需要 Standard($299)+ 套餐。Hobbyist/Startup 套餐无法获取此数据。

#### 验收标准

1. WHILE CoinGlass 套餐为 Standard 或 Professional 时，THE Taker_Analyzer SHALL 通过 CoinGlass_Client 调用 `/api/futures/taker-buy-sell-volume/history` 端点采集指定交易对的 Taker 买卖量历史数据
2. WHILE CoinGlass 套餐为 Standard 或 Professional 时，THE Taker_Analyzer SHALL 通过 CoinGlass_Client 调用 `/api/futures/aggregated-taker-buysell-volume-history` 端点采集聚合主动买卖量历史数据
3. THE Taker_Analyzer SHALL 计算 Taker Buy/Sell Ratio（主动买入量 / 主动卖出量），精度保留 4 位小数
4. THE Taker_Analyzer SHALL 将采集到的 Taker Volume 数据写入 TimescaleDB 时序表 `taker_volume_snapshots`，包含字段：time、symbol、buy_volume、sell_volume、buy_sell_ratio
5. WHEN Taker Buy/Sell Ratio 偏离 1.0 超过配置阈值（默认 0.3）时，THE Taker_Analyzer SHALL 发布一条 `taker_imbalance` 事件到 Redis Streams `indicator_updates`，包含方向（buy_dominant 或 sell_dominant）
6. WHILE CoinGlass 套餐为 Hobbyist 或 Startup 时，THE Taker_Analyzer SHALL 跳过 Taker Volume 采集，记录信息级别日志说明当前套餐不支持此数据

### 需求 4：爆仓热力图采集与解析

**用户故事：** 作为交易者，我希望系统能获取爆仓热力图数据，以便识别爆仓密集区并评估点杀风险。

> ⚠️ 套餐依赖：爆仓热力图 model1 需要 Startup($79)+ 套餐，model2/model3 需要 Standard($299)+ 套餐。Hobbyist 仅可获取爆仓总量(24h)、分多空、分交易所基础数据。

#### 验收标准

1. WHILE CoinGlass 套餐为 Startup 时，THE Heatmap_Collector SHALL 通过 CoinGlass_Client 调用 `/api/futures/liquidation/heatmap` (model1) 端点采集指定交易对的基础爆仓热力图数据
2. WHILE CoinGlass 套餐为 Standard 或 Professional 时，THE Heatmap_Collector SHALL 通过 CoinGlass_Client 调用 `/api/futures/liquidation/heatmap/model2` 和 `/api/futures/liquidation/heatmap/model3` 端点采集指定交易对的增强爆仓热力图数据
3. THE Heatmap_Collector SHALL 解析热力图数据，提取爆仓密集区的价格区间（上界和下界）及对应的预估爆仓量（USD）
4. THE Heatmap_Collector SHALL 将解析后的爆仓密集区数据写入 TimescaleDB 时序表 `liquidation_heatmap`，包含字段：time、symbol、price_low、price_high、estimated_liq_usd、direction（long/short）、model_version（model1/model2/model3）
5. THE Heatmap_Collector SHALL 将最新爆仓密集区数据缓存到 Redis，缓存键为 `liq_heatmap:{symbol}`，TTL 为 600 秒
6. THE Heatmap_Collector SHALL 通过 CoinGlass_Client 调用 `/api/futures/liquidation/history` 端点采集历史爆仓数据作为热力图的补充验证
7. WHILE CoinGlass 套餐为 Standard 或 Professional 时，THE Heatmap_Collector SHALL 通过 CoinGlass_Client 调用 `/api/futures/liquidation/order` 端点采集爆仓订单明细数据
8. WHILE CoinGlass 套餐为 Standard 或 Professional 时，THE Heatmap_Collector SHALL 通过 CoinGlass_Client 调用 `/api/futures/liquidation/max-pain` 端点采集清算最大痛点数据
9. WHILE CoinGlass 套餐为 Hobbyist 时，THE Heatmap_Collector SHALL 仅采集爆仓总量(24h)、分多空和分交易所基础爆仓数据，跳过热力图采集

### 需求 5：多空比与净持仓增强采集

**用户故事：** 作为交易者，我希望系统能从 CoinGlass 获取全网多空比、大户多空比和净持仓数据，以便与现有 Binance 多空比交叉验证并判断主力方向。

#### 验收标准

1. THE CoinGlass_Client SHALL 调用 `/api/futures/global-long-short-account-ratio/history` 端点采集全网多空比历史数据（所有套餐可用）
2. THE CoinGlass_Client SHALL 调用 `/api/futures/fundingRate/ohlc-history` 端点采集资金费率 OHLC 历史数据
3. THE OI_Monitor SHALL 将 CoinGlass 全网多空比数据与现有 Binance 多空比数据存储在同一 TimescaleDB 表 `derivatives_snapshots` 中，通过 `source` 字段区分数据来源（binance/coinglass）
4. WHEN CoinGlass 全网多空比与 Binance 多空比偏差超过 0.2 时，THE Risk_Agent SHALL 记录一条 `ls_ratio_divergence` 信息级别日志
5. WHILE CoinGlass 套餐为 Startup 或更高时，THE CoinGlass_Client SHALL 调用 `/api/futures/top-long-short-account-ratio` 端点采集大户账户多空比数据
6. WHILE CoinGlass 套餐为 Startup 或更高时，THE CoinGlass_Client SHALL 调用 `/api/futures/top-long-short-position-ratio` 端点采集大户持仓多空比数据
7. WHILE CoinGlass 套餐为 Startup 或更高时，THE CoinGlass_Client SHALL 调用 `/api/futures/openInterest/net-position` 端点采集净多/空持仓数据，作为检测主力方向的核心指标
8. WHILE CoinGlass 套餐为 Startup 或更高时，THE CoinGlass_Client SHALL 调用 `/api/futures/openInterest/net-position-v2` 端点采集增强版净持仓数据
9. WHILE CoinGlass 套餐为 Startup 或更高时，THE CoinGlass_Client SHALL 调用 `/api/futures/fundingRate/oi-weight-ohlc-history` 端点采集持仓加权资金费率数据
10. WHILE CoinGlass 套餐为 Startup 或更高时，THE CoinGlass_Client SHALL 调用 `/api/futures/fundingRate/vol-weight-ohlc-history` 端点采集成交量加权资金费率数据
11. WHILE CoinGlass 套餐为 Standard 或更高时，THE CoinGlass_Client SHALL 调用 `/api/futures/fundingRate/fr-arbitrage` 端点采集资金费率套利数据

### 需求 6：点杀预警引擎

**用户故事：** 作为交易者，我希望系统能在检测到点杀条件时提前预警，以便我及时调整仓位避免被庄家点杀。

> ⚠️ 点杀预警分三个级别：
> - 基础版（Startup $79+）：OI变化率 + 大户多空比(top-longshort) + 净持仓(net-position) + 爆仓热力图model1 + 加权资金费率
> - 增强版（Standard $299+）：基础版 + Taker买卖方向 + 热力图全模型(model2/3) + 爆仓订单明细 + 清算最大痛点 + 资金费率套利
> - 完整版（Professional $699）：增强版全部能力 + 最高频率(1200/min) + 全币种(7000+)覆盖

#### 验收标准

1. THE Kill_Detector SHALL 每 60 秒执行一次点杀条件检测，检测范围为所有已配置监控的交易对
2. WHILE CoinGlass 套餐为 Startup 时，THE Kill_Detector SHALL 使用基础版点杀检测，WHEN 以下条件综合满足时生成一条基础版点杀预警：
   - OI 在 5 分钟窗口内增幅超过配置阈值（默认 5%）
   - 大户账户多空比(top-longshort)偏离 1.0 超过配置阈值（默认 0.3）
   - 净持仓(net-position)出现显著方向性变化
   - 当前价格与爆仓热力图 model1 密集区边界的距离小于配置阈值（默认 2%）
   - 持仓加权/成交量加权资金费率出现极端偏离
3. WHILE CoinGlass 套餐为 Standard 时，THE Kill_Detector SHALL 使用增强版点杀检测，WHEN 以下条件综合判断时生成一条增强版点杀预警：
   - 基础版所有条件
   - Taker Buy/Sell Ratio 偏离 1.0 超过配置阈值（默认 0.3）
   - 爆仓热力图 model2/model3 提供更精确的爆仓密集区定位
   - 爆仓订单明细中出现大额爆仓事件
   - 清算最大痛点价格与当前价格的关系
   - 资金费率套利机会出现异常
4. WHILE CoinGlass 套餐为 Professional 时，THE Kill_Detector SHALL 使用完整版点杀检测，具备增强版全部能力，并以最高频率(1200次/分钟)和全币种(7000+)覆盖执行检测
5. THE Kill_Detector SHALL 为每条点杀预警标注版本（basic/enhanced/full）和计算风险评分（0-100）：
   - 基础版评分公式：OI 增幅权重（30%）+ 大户多空比异常权重（20%）+ 净持仓方向权重（20%）+ 价格接近爆仓密集区程度权重（20%）+ 加权资金费率偏离权重（10%）
   - 增强版评分公式：OI 增幅权重（20%）+ Taker 失衡程度权重（20%）+ 价格接近爆仓密集区程度权重（15%）+ 大户多空比权重（15%）+ 爆仓订单明细权重（10%）+ 清算最大痛点权重（10%）+ 资金费率套利权重（10%）
   - 完整版评分公式：与增强版相同，但数据覆盖更广（7000+ 币种）且检测频率更高
6. THE Kill_Detector SHALL 将点杀预警写入 Redis Streams `alerts`，包含字段：alert_type（kill_zone_warning）、symbol、risk_score、detection_version（basic/enhanced/full）、oi_change_percent、taker_ratio（增强版/完整版）或 ls_ratio（基础版）、net_position_change（基础版+）、nearest_liq_zone、estimated_liq_usd、direction（long_kill/short_kill）
7. THE Kill_Detector SHALL 将预警记录写入 TimescaleDB 表 `kill_zone_alerts`，包含完整的检测快照数据和 detection_version 字段
8. IF 同一交易对在 10 分钟内已触发过点杀预警，THEN THE Kill_Detector SHALL 跳过重复预警，仅在风险评分提升超过 20 分时更新预警
9. WHILE CoinGlass 套餐为 Standard 或 Professional 时，THE Kill_Detector SHALL 根据 Taker Volume 方向判断点杀方向：Taker Buy 主导表示多头建仓密集（可能被空头点杀），Taker Sell 主导表示空头建仓密集（可能被多头点杀）
10. WHILE CoinGlass 套餐为 Startup 时，THE Kill_Detector SHALL 根据大户多空账户比和净持仓方向推断点杀方向（精度低于增强版/完整版）
11. WHILE CoinGlass 套餐为 Hobbyist 时，THE Kill_Detector SHALL 跳过点杀检测，因为缺少 OI 变化率、净持仓和爆仓热力图数据

### 需求 7：CoinGlass 套餐管理

**用户故事：** 作为系统管理员，我希望能在后台配置当前使用的 CoinGlass 套餐等级，以便系统自动控制 API 用量不超限并按能力矩阵启用/禁用功能模块。

#### 验收标准

1. THE Tier_Manager SHALL 从 Config_Service 读取 `coinglass_tier` 配置项，支持四个等级：hobbyist、startup、standard、professional
2. THE Tier_Manager SHALL 根据套餐等级设置对应的限频上限：hobbyist 为 30 次/分钟、startup 为 80 次/分钟、standard 为 300 次/分钟、professional 为 1200 次/分钟
3. THE Tier_Manager SHALL 维护一个端点可用性映射表，根据套餐等级判断指定端点是否可用（hobbyist 70+ 端点、startup 80+ 端点、standard 90+ 端点、professional 100+ 端点）
4. THE CoinGlass_Client SHALL 在每次请求前通过 Tier_Manager 检查限频余量，WHEN 当前分钟内请求次数已达上限时，THE CoinGlass_Client SHALL 等待至下一分钟再发起请求
5. THE CoinGlass_Client SHALL 在每次请求前通过 Tier_Manager 检查端点可用性，WHEN 请求的端点在当前套餐不可用时，THE CoinGlass_Client SHALL 记录警告日志并返回 None
6. THE Tier_Manager SHALL 根据套餐等级调节采集频率：hobbyist 每 5 分钟采集一次、startup 每 2 分钟采集一次、standard 每 1 分钟采集一次、professional 每 30 秒采集一次
7. IF `coinglass_tier` 配置项不存在或值无效，THEN THE Tier_Manager SHALL 降级使用 hobbyist 等级的限制
8. THE Tier_Manager SHALL 维护一个数据覆盖范围映射表，根据套餐等级控制可监控的币种范围：hobbyist 前 50 名主流币、startup 前 100 名、standard 前 300 名、professional 7000+ 全覆盖
9. THE Tier_Manager SHALL 维护一个历史数据深度映射表：hobbyist 30-90 天、startup 180 天、standard 1-2 年、professional 3 年+
10. THE Tier_Manager SHALL 维护一个功能能力矩阵，按套餐等级控制以下数据模块的启用/禁用：
    - **所有套餐（Hobbyist+）可用：**
      - OI 总量 OHLC + 分交易所 + 聚合历史
      - 资金费率历史 + 分交易所 + 累计
      - 爆仓历史 + 聚合爆仓 + 分交易所/币种列表
      - 全局多空账户比
      - 基础信息（coins, exchanges, instruments）
      - RSI 列表、BTC 市值占比、恐惧贪婪指数、ETF、交易所资产
    - **Startup+（$79）可用：**
      - 净持仓（net-position, net-position-v2）— 主力方向核心指标
      - 大户账户多空比 + 大户持仓多空比
      - 持仓加权/成交量加权资金费率
      - 爆仓热力图 model1
      - OI 变化率趋势分析
    - **Standard+（$299）可用：**
      - Taker 主动买卖方向 + 聚合主动买卖
      - 爆仓热力图 model2/model3
      - 爆仓订单明细
      - 清算最大痛点
      - 资金费率套利
      - 稳定币/币本位保证金持仓
      - 期权全部（最大痛点、持仓、Greeks + IV）
      - GEX（Gamma Exposure）
    - **Professional（$699）可用：**
      - 所有接口
      - 1200 次/分钟
      - 7000+ 币种
      - WebSocket 全接口实时数据
11. THE Tier_Manager SHALL 提供 `get_tier_capabilities()` 接口，返回当前套餐的完整能力描述（限频、端点数、数据覆盖、功能模块列表），供前端和其他模块查询

### 需求 8：预警推送集成

**用户故事：** 作为交易者，我希望在触发点杀预警时通过 Telegram 或邮件收到通知，以便及时采取行动。

#### 验收标准

1. WHEN Kill_Detector 生成风险评分 >= 70 的点杀预警时，THE Notification_Dispatcher SHALL 向订阅了该交易对预警的专业版和旗舰版用户推送通知
2. WHEN Kill_Detector 生成风险评分 >= 50 且 < 70 的点杀预警时，THE Notification_Dispatcher SHALL 仅向订阅了该交易对预警的旗舰版用户推送通知
3. THE Notification_Dispatcher SHALL 在推送消息中包含：交易对、点杀方向、风险评分、OI 变化幅度、Taker 失衡方向、最近爆仓密集区价格范围、预估爆仓量
4. THE Notification_Dispatcher SHALL 通过现有 Telegram 推送通道和邮件推送通道发送预警消息
5. IF 推送失败，THEN THE Notification_Dispatcher SHALL 记录错误日志并在 5 分钟后重试一次

### 需求 9：前端展示

**用户故事：** 作为交易者，我希望在前端看到爆仓热力图、OI 变化图和点杀预警卡片，以便直观了解市场风险。

#### 验收标准

1. THE 前端 SHALL 展示爆仓热力图组件，以价格为 Y 轴、时间为 X 轴、颜色深浅表示爆仓密集程度，使用 TradingView Lightweight Charts 渲染
2. THE 前端 SHALL 展示 OI 变化折线图组件，叠加显示价格走势和 OI 变化曲线，支持 1h/4h/1d 时间周期切换
3. THE 前端 SHALL 展示点杀预警卡片组件，包含：风险评分仪表盘（0-100）、点杀方向标识、OI 变化百分比、Taker 失衡比率、最近爆仓密集区标注
4. WHEN 点杀预警风险评分 >= 70 时，THE 前端 SHALL 将预警卡片边框显示为红色并展示闪烁动画
5. WHEN 点杀预警风险评分 >= 50 且 < 70 时，THE 前端 SHALL 将预警卡片边框显示为橙色
6. THE 前端 SHALL 通过 WebSocket 接收实时点杀预警更新，收到新预警时自动刷新预警卡片内容

### 需求 10：前端功能降级

**用户故事：** 作为用户，我希望看到功能降级提示而非空白页面，以便了解升级 CoinGlass 套餐后可解锁的功能。

#### 验收标准

1. THE 前端 SHALL 通过 API 调用 Tier_Manager 的 `get_tier_capabilities()` 接口获取当前 CoinGlass 套餐等级及完整能力矩阵，并据此控制功能展示
2. WHILE CoinGlass 套餐为 Hobbyist 时，THE 前端 SHALL 展示以下可用功能：OI 总量 OHLC、OI 分交易所、OI 聚合历史、爆仓历史、聚合爆仓、分交易所/币种爆仓列表、当前资金费率、历史资金费率、累计资金费率、全局多空账户比、基础信息（coins/exchanges/instruments）、RSI 列表、BTC 市值占比、恐惧贪婪指数、ETF、交易所资产
3. WHILE CoinGlass 套餐为 Hobbyist 时，THE 前端 SHALL 隐藏以下功能并显示"升级至 Startup 套餐解锁"提示：净持仓、大户多空比、持仓加权/成交量加权资金费率、爆仓热力图、OI 变化率趋势分析
4. WHILE CoinGlass 套餐为 Startup 时，THE 前端 SHALL 在 Hobbyist 基础上额外展示：净持仓（net-position）、大户账户多空比、大户持仓多空比、持仓加权/成交量加权资金费率、爆仓热力图 model1、OI 变化率趋势分析
5. WHILE CoinGlass 套餐为 Startup 时，THE 前端 SHALL 隐藏以下功能并显示"升级至 Standard 套餐解锁"提示：Taker 主动买卖方向、爆仓热力图 model2/model3、爆仓订单明细、清算最大痛点、资金费率套利、稳定币/币本位保证金持仓、期权全部、GEX
6. WHILE CoinGlass 套餐为 Standard 时，THE 前端 SHALL 在 Startup 基础上额外展示：Taker 主动买卖方向、聚合主动买卖、爆仓热力图 model2/model3、爆仓订单明细、清算最大痛点、资金费率套利、稳定币/币本位保证金持仓、期权全部（最大痛点、持仓、Greeks + IV）、GEX
7. WHILE CoinGlass 套餐为 Standard 时，THE 前端 SHALL 隐藏以下功能并显示"升级至 Professional 套餐解锁"提示：WebSocket 全接口实时数据、7000+ 全币种覆盖、1200 次/分钟高频采集
8. WHILE CoinGlass 套餐为 Professional 时，THE 前端 SHALL 展示所有功能模块，无任何降级限制，包括：所有接口、1200 次/分钟、7000+ 币种、WebSocket 全接口实时数据
9. THE 前端 SHALL 在点杀预警卡片上标注预警版本：基础版（Startup 套餐）显示"基础版预警"标签，增强版（Standard 套餐）显示"增强版预警"标签，完整版（Professional 套餐）显示"完整版预警"标签
10. THE 前端 SHALL 根据用户会员等级控制点杀预警卡片的展示：免费用户显示"升级会员解锁点杀预警"提示，专业版用户显示风险评分 >= 70 的预警，旗舰版用户显示所有预警
11. THE 前端 SHALL 根据套餐等级显示数据更新频率标注：Hobbyist "每5分钟更新"、Startup "每2分钟更新"、Standard "每1分钟更新"、Professional "每30秒更新"

### 需求 11：WebSocket 实时爆仓流

**用户故事：** 作为旗舰版用户，我希望接收实时爆仓事件流，以便第一时间感知市场异动。

#### 验收标准

1. WHILE CoinGlass 套餐为 Professional 时，THE CoinGlass_Client SHALL 建立到 `wss://open-api-v4.coinglass.com/ws` 的 WebSocket 连接，订阅全接口实时数据流
2. WHILE CoinGlass 套餐为 Standard 时，THE CoinGlass_Client SHALL 建立 WebSocket 连接，仅订阅部分接口（OI 变化、爆仓事件等基础实时流），不可订阅 Taker 方向等高级接口
3. WHEN WebSocket 连接断开时，THE CoinGlass_Client SHALL 在 5 秒后自动重连，最多重试 10 次，每次重试间隔递增（指数退避，上限 60 秒）
4. THE CoinGlass_Client SHALL 将接收到的实时爆仓事件解析后发布到 Redis Streams `realtime_liquidations`
5. WHILE CoinGlass 套餐为 Hobbyist 或 Startup 时，THE CoinGlass_Client SHALL 跳过 WebSocket 连接（Hobbyist 和 Startup 套餐不支持 WebSocket）
6. THE 前端 SHALL 仅向旗舰版用户推送实时爆仓事件流，专业版和免费用户显示"升级解锁实时爆仓流"提示

### 需求 12：数据采集调度

**用户故事：** 作为系统开发者，我希望 CoinGlass 数据采集任务能通过 Celery 定时调度，以便与现有采集架构保持一致。

#### 验收标准

1. THE Celery Worker SHALL 注册一个 `collect_coinglass_data` 定时任务，采集频率由 Tier_Manager 根据套餐等级决定
2. THE `collect_coinglass_data` 任务 SHALL 按顺序采集：OI 数据 → Taker Volume 数据 → 爆仓热力图数据 → 多空比数据 → 资金费率数据
3. WHEN 单个端点采集失败时，THE `collect_coinglass_data` 任务 SHALL 继续采集剩余端点，将失败端点记录到日志
4. THE Celery Worker SHALL 注册一个 `evaluate_kill_zone` 定时任务，每 60 秒执行一次，调用 Kill_Detector 进行点杀条件检测
5. IF Tier_Manager 判断当前分钟限频余量不足以完成所有端点采集，THEN THE `collect_coinglass_data` 任务 SHALL 按优先级采集（OI > Taker Volume > 热力图 > 多空比 > 资金费率），跳过低优先级端点
