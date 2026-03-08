# 需求文档：一键综合分析面板

## 简介

用结构化的"一键分析"面板替代现有的 AI 聊天侧边栏。用户选择交易对和分析模式后，点击按钮即可获得分层结构化的综合分析报告。系统根据用户会员等级控制可用模式和每日配额，分析过程通过 SSE 实时推送进度，结果缓存在 Redis 中以节省配额。

## 术语表

- **Analysis_Panel**: 替代聊天侧边栏的一键综合分析面板组件
- **Analysis_Orchestrator**: 后端分析编排服务，根据模式协调各智能体执行
- **Analysis_Mode**: 分析模式枚举，包含实时短线、日内博弈、趋势布局三种
- **Scalping_Mode**: 实时短线模式，面向分钟到小时级别的快速交易
- **Intraday_Mode**: 日内博弈模式，面向小时到日级别的日内交易
- **Trend_Mode**: 趋势布局模式，面向日到周级别的波段/趋势交易
- **Analysis_Report**: 分析结果的结构化报告对象，包含各维度分析数据
- **Analysis_Quota_Service**: 分析配额服务，管理各模式的每日使用次数
- **TechnicalAgent**: 已有的技术分析智能体
- **OnchainAgent**: 已有的链上解读智能体
- **PlaybookAgent**: 已有的剧本推演智能体
- **RiskAgent**: 已有的风险预警智能体
- **NSED_Engine**: 已有的多模型共识引擎（4模型3轮结构化辩论）
- **Phase_Tracker**: 已有的庄家操盘阶段追踪模块
- **Strategy_Service**: 已有的策略生成服务
- **SSE**: Server-Sent Events，服务端推送事件流
- **Candlestick_Pattern_Detector**: K线形态识别模块，检测吞没、Pin Bar、晨星/暮星等经典反转形态
- **FVG_Detector**: 公允价值缺口检测模块，识别价格失衡区域并追踪回补状态
- **OrderBlock_Detector**: 机构订单块检测模块，识别机构资金进出的关键价格区域
- **FVG**: Fair Value Gap（公允价值缺口），三根K线中第1根高点低于第3根低点（看涨）或第1根低点高于第3根高点（看跌）形成的价格失衡区域
- **OB**: Order Block（订单块），机构资金在趋势反转前最后一根反向K线所在的价格区域
- **ChoCh**: Change of Character（性质转变），市场结构从上升转为下降或从下降转为上升的关键转折点
- **BoS**: Break of Structure（结构突破），价格突破前一个高点或低点，确认趋势延续
- **SMC**: Smart Money Concept（聪明钱概念），基于机构交易行为分析市场结构的方法论
- **ATR**: Average True Range（平均真实波幅），衡量价格波动幅度的技术指标，用于 FVG 过滤阈值

## 需求

### 需求 1：分析模式定义与权限控制

**用户故事：** 作为交易者，我希望根据自己的交易风格选择对应的分析模式，以便获得针对性的分析结果。

#### 验收标准

1. THE Analysis_Panel SHALL 提供三种分析模式供用户选择：Scalping_Mode（实时短线）、Intraday_Mode（日内博弈）、Trend_Mode（趋势布局）
2. WHEN 会员等级为 0（免费）的用户访问 Analysis_Panel 时，THE Analysis_Panel SHALL 仅允许选择 Scalping_Mode，并将 Intraday_Mode 和 Trend_Mode 显示为锁定状态
3. WHEN 会员等级为 1（专业）的用户访问 Analysis_Panel 时，THE Analysis_Panel SHALL 允许选择 Scalping_Mode 和 Intraday_Mode
4. WHEN 会员等级为 2（旗舰）的用户访问 Analysis_Panel 时，THE Analysis_Panel SHALL 允许选择全部三种分析模式
5. WHEN 用户点击锁定状态的分析模式时，THE Analysis_Panel SHALL 显示升级会员提示，包含该模式所需的最低会员等级

### 需求 2：分析配额管理

**用户故事：** 作为平台运营者，我希望对各模式的使用次数进行限制，以便控制 AI 调用成本。

#### 验收标准

1. THE Analysis_Quota_Service SHALL 为每种分析模式维护独立的每日使用计数器，每日 UTC 00:00 重置
2. WHEN 免费用户触发 Scalping_Mode 分析时，THE Analysis_Quota_Service SHALL 检查当日 Scalping_Mode 使用次数是否低于每日限额（默认 5 次/天）
3. WHEN 专业用户触发 Scalping_Mode 分析时，THE Analysis_Quota_Service SHALL 使用专业等级的每日限额（默认 50 次/天）
4. WHEN 旗舰用户触发 Scalping_Mode 分析时，THE Analysis_Quota_Service SHALL 使用旗舰等级的每日限额（默认 200 次/天）
5. WHEN 用户的当日配额已耗尽时，THE Analysis_Quota_Service SHALL 拒绝分析请求并返回剩余配额为 0 的响应
6. THE Analysis_Panel SHALL 在界面上显示当前模式的剩余配额和每日限额
7. WHEN 分析请求被配额拒绝时，THE Analysis_Panel SHALL 显示"今日配额已用完，明日 UTC 00:00 重置"的提示

### 需求 3：实时短线模式分析流程

**用户故事：** 作为短线交易者，我希望快速获得当前币种的技术面分析和入场信号，以便做出快速交易决策。

#### 验收标准

1. WHEN 用户选择 Scalping_Mode 并点击"开始分析"时，THE Analysis_Orchestrator SHALL 并行执行以下数据采集：获取短周期 K 线数据（5m、15m、30m）和计算技术指标（EMA(7/25)、RSI、MACD、布林带、VWAP、量比）
2. WHEN K线数据就绪时，THE Analysis_Orchestrator SHALL 调用 Candlestick_Pattern_Detector 识别K线形态，并调用 FVG_Detector 检测短周期（5m、15m）的公允价值缺口
3. WHEN 技术指标数据和 SMC 指标数据就绪时，THE Analysis_Orchestrator SHALL 将技术指标、K线形态识别结果和 FVG 检测结果一并传递给 TechnicalAgent 生成交易信号
4. WHEN TechnicalAgent 分析完成时，THE Analysis_Orchestrator SHALL 调用 Strategy_Service 生成入场区间、止损位和目标位
5. THE Analysis_Report SHALL 包含以下结构化分段：技术指标摘要、K线形态信号、FVG 区域标注、趋势方向、支撑阻力位、入场/止损/目标策略、风险提示
6. IF TechnicalAgent 调用失败，THEN THE Analysis_Orchestrator SHALL 返回降级报告，signal 字段设为 "neutral"，并在报告中标注"数据不完整，仅供参考"

### 需求 4：日内博弈模式分析流程

**用户故事：** 作为日内交易者，我希望获得技术面、链上数据和合约数据的综合分析，以便全面评估日内交易机会。

#### 验收标准

1. WHEN 用户选择 Intraday_Mode 并点击"开始分析"时，THE Analysis_Orchestrator SHALL 并行执行以下任务：调用 TechnicalAgent（使用 15m/1h/4h 周期）、调用 Candlestick_Pattern_Detector 和 FVG_Detector（使用 15m/1h/4h 周期）和 OrderBlock_Detector（使用 1h/4h 周期）、调用 OnchainAgent（交易所净流量、巨鲸活动）、采集合约数据（资金费率、爆仓、多空比）、调用 RiskAgent 进行风险评估
2. WHEN 全部智能体和 SMC 指标分析完成时，THE Analysis_Orchestrator SHALL 调用 Phase_Tracker 检测当前庄家操盘阶段，并将K线形态、FVG 和 OB 数据传递给 TechnicalAgent 作为辅助信号
3. THE Analysis_Report SHALL 包含以下结构化分段：技术分析（含多周期指标、K线形态、FVG 区域、订单块标注）、链上数据解读（庄家行为阶段）、合约数据（资金费率/多空比/爆仓）、风险评估、操作策略建议
4. IF 任一智能体调用失败，THEN THE Analysis_Orchestrator SHALL 在报告中标注该维度"数据缺失"，其余维度正常展示
5. WHEN 恐慌贪婪指数数据可用时，THE Analysis_Orchestrator SHALL 将恐慌贪婪指数纳入链上分析数据

### 需求 5：趋势布局模式分析流程

**用户故事：** 作为趋势交易者，我希望获得包含多模型共识辩论的深度分析报告，以便制定中长期持仓策略。

#### 验收标准

1. WHEN 用户选择 Trend_Mode 并点击"开始分析"时，THE Analysis_Orchestrator SHALL 依次执行：先并行调用全部四个智能体（TechnicalAgent 使用 4h/1d 周期、OnchainAgent、PlaybookAgent、RiskAgent）和 SMC 指标检测（Candlestick_Pattern_Detector、FVG_Detector 使用 4h/1d 周期、OrderBlock_Detector 使用 4h/1d 周期），再运行 NSED_Engine 进行多模型共识辩论
2. WHEN OrderBlock_Detector 和 OnchainAgent 均完成时，THE Analysis_Orchestrator SHALL 将 OB 检测结果与链上巨鲸活动数据进行交叉验证，标注与巨鲸行为吻合的高置信度订单块
3. WHEN NSED_Engine 完成三轮辩论后，THE Analysis_Orchestrator SHALL 调用 Strategy_Service 基于共识结果和 SMC 指标数据生成策略
4. THE Analysis_Report SHALL 包含以下结构化分段：技术分析（含K线形态、FVG、订单块）、链上深度解读（含 MVRV、矿工储备、OB-巨鲸交叉验证）、剧本推演（历史模式匹配）、多模型共识报告（各模型观点、加权信号、分歧度、少数派警告）、操盘阶段追踪、综合策略建议
5. IF NSED_Engine 调用失败，THEN THE Analysis_Orchestrator SHALL 回退到使用四个智能体的加权平均结果生成报告，并标注"共识引擎不可用，使用智能体加权结果"
6. THE Analysis_Report SHALL 在共识报告分段中展示每个模型的信号方向、置信度和核心论据

### 需求 6：SSE 实时进度推送

**用户故事：** 作为用户，我希望在分析过程中看到实时进度，以便了解当前分析进展而非面对空白等待。

#### 验收标准

1. WHEN 分析开始时，THE Analysis_Orchestrator SHALL 通过 SSE 连接向前端推送进度事件，每个事件包含 step（当前步骤名称）和 status（running/completed/failed）字段
2. WHEN 每个智能体开始执行时，THE Analysis_Orchestrator SHALL 推送对应的进度事件（例如 "正在分析技术指标..."、"正在查询链上数据..."、"正在运行共识引擎..."）
3. WHEN 每个智能体完成执行时，THE Analysis_Orchestrator SHALL 推送该步骤的部分结果数据，前端实时渲染已完成的分段
4. WHEN 全部分析完成时，THE Analysis_Orchestrator SHALL 推送包含完整 Analysis_Report 的终止事件
5. IF SSE 连接中断，THEN THE Analysis_Panel SHALL 显示"连接中断，请重试"的提示，并提供重试按钮

### 需求 7：分析结果缓存

**用户故事：** 作为用户，我希望短时间内重复查询同一币种时能直接获取缓存结果，以便节省配额和等待时间。

#### 验收标准

1. WHEN 分析完成时，THE Analysis_Orchestrator SHALL 将 Analysis_Report 缓存到 Redis，Scalping_Mode 缓存 TTL 为 5 分钟，Intraday_Mode 为 15 分钟，Trend_Mode 为 30 分钟
2. WHEN 用户触发分析请求时，THE Analysis_Orchestrator SHALL 先检查 Redis 中是否存在该交易对和模式的有效缓存
3. WHEN 有效缓存存在时，THE Analysis_Panel SHALL 显示缓存结果并标注"缓存结果（N 分钟前生成）"，同时提供"重新分析"按钮
4. WHEN 用户点击"重新分析"时，THE Analysis_Orchestrator SHALL 忽略缓存执行全新分析，并扣减配额
5. WHEN 使用缓存结果时，THE Analysis_Quota_Service SHALL 不扣减用户配额

### 需求 8：分析面板 UI

**用户故事：** 作为用户，我希望分析面板界面清晰直观，能快速选择币种和模式并查看结构化报告。

#### 验收标准

1. THE Analysis_Panel SHALL 以侧边栏形式展示，包含以下区域：顶部（交易对选择器 + 模式选择器 + 配额显示）、中部（分析进度指示器 + 结构化报告展示区）、底部（"开始分析"按钮）
2. THE Analysis_Panel SHALL 使用 Tailwind CSS 和 shadcn/ui 组件库，保持与现有深色科技风界面一致的视觉风格
3. WHEN 分析正在进行时，THE Analysis_Panel SHALL 显示各步骤的进度指示器，已完成步骤显示绿色勾选，进行中步骤显示加载动画，未开始步骤显示灰色
4. THE Analysis_Report 展示区 SHALL 将报告按维度分段展示（技术分析、链上数据、合约数据、共识报告、策略建议），每个分段可折叠/展开
5. WHEN 屏幕宽度小于 768px 时，THE Analysis_Panel SHALL 以全屏模态形式展示，替代侧边栏布局
6. WHEN 分析报告包含信号方向时，THE Analysis_Panel SHALL 使用颜色编码：bullish 显示绿色，bearish 显示红色，neutral 显示灰色

### 需求 9：分析 API 端点

**用户故事：** 作为前端开发者，我希望有清晰的 API 端点来触发分析和查询配额，以便前端面板与后端交互。

#### 验收标准

1. THE Analysis_Orchestrator SHALL 通过 POST /api/analysis/run 端点接收分析请求，请求体包含 symbol（交易对）和 mode（分析模式）字段，响应为 SSE 事件流
2. THE Analysis_Orchestrator SHALL 通过 GET /api/analysis/quota 端点返回当前用户各模式的剩余配额和每日限额
3. WHEN POST /api/analysis/run 请求缺少 symbol 或 mode 字段时，THE Analysis_Orchestrator SHALL 返回 HTTP 422 和字段校验错误详情
4. WHEN 用户会员等级不满足所选模式要求时，THE Analysis_Orchestrator SHALL 返回 HTTP 403 和权限不足的错误信息
5. WHEN 用户配额不足时，THE Analysis_Orchestrator SHALL 返回 HTTP 429 和配额耗尽的错误信息，包含重置时间
6. THE Analysis_Orchestrator SHALL 对每次分析请求记录：用户 ID、交易对、分析模式、各智能体耗时、总耗时、是否使用缓存

### 需求 10：错误处理与超时控制

**用户故事：** 作为用户，我希望在分析过程出错时获得明确的错误提示，而非无限等待。

#### 验收标准

1. THE Analysis_Orchestrator SHALL 为每个智能体调用设置 60 秒超时（通过 asyncio.wait_for），NSED_Engine 的每轮辩论设置 90 秒超时
2. IF 单个智能体调用超时，THEN THE Analysis_Orchestrator SHALL 将该智能体结果标记为超时，继续执行其余智能体，并在报告中标注"该维度分析超时"
3. THE Analysis_Orchestrator SHALL 为整体分析流程设置总超时：Scalping_Mode 为 90 秒，Intraday_Mode 为 180 秒，Trend_Mode 为 300 秒
4. IF 整体分析超时，THEN THE Analysis_Orchestrator SHALL 返回已完成部分的报告，并标注"分析未完全完成，部分数据缺失"
5. IF 数据采集（K 线、链上、合约）失败，THEN THE Analysis_Orchestrator SHALL 使用 Redis 缓存的最近一次有效数据作为降级输入，并在报告中标注数据时效性


### 需求 11：K线形态识别（Candlestick Pattern Recognition）

**用户故事：** 作为交易者，我希望系统自动识别经典K线反转形态，以便在技术分析中获得更精确的入场和出场信号。

#### 验收标准

1. THE Candlestick_Pattern_Detector SHALL 从K线数据中识别以下优先形态：吞没形态（Engulfing，阳吞阴/阴吞阳）、Pin Bar（锤子线/上吊线）、晨星/暮星（Morning Star / Evening Star）
2. THE Candlestick_Pattern_Detector SHALL 支持以下扩展形态：刺穿/乌云盖顶（Piercing Line / Dark Cloud Cover）、三内部（Three Inside Bar）、大阳线/大阴线（Marubozu）
3. WHEN 检测到K线形态时，THE Candlestick_Pattern_Detector SHALL 返回结构化结果，包含 pattern_name（形态名称）、direction（bullish 或 bearish）、strength（0 到 1 的浮点数）、candle_index（触发K线的索引位置）
4. THE Candlestick_Pattern_Detector SHALL 在所有三种分析模式（Scalping_Mode、Intraday_Mode、Trend_Mode）中可用，使用对应模式的K线周期数据
5. WHEN Candlestick_Pattern_Detector 检测到形态时，THE TechnicalAgent SHALL 在分析 prompt 中引用检测到的形态名称、方向和强度作为辅助判断依据
6. IF K线数据不足以完成形态识别（少于 3 根K线），THEN THE Candlestick_Pattern_Detector SHALL 返回空结果列表，不产生错误

### 需求 12：FVG 公允价值缺口检测（Fair Value Gap Detection）

**用户故事：** 作为交易者，我希望系统自动检测价格失衡区域（FVG），以便识别潜在的价格回补目标和入场机会。

#### 验收标准

1. THE FVG_Detector SHALL 从K线数据中检测看涨 FVG（第1根K线高点低于第3根K线低点）和看跌 FVG（第1根K线低点高于第3根K线高点）
2. THE FVG_Detector SHALL 支持 4 种基于 ATR 的过滤模式：Mode 0（无过滤，显示全部 FVG）、Mode 1（ATR 过滤，仅显示大于阈值 × ATR 的 FVG）、Mode 2（严格 ATR 过滤，使用更大阈值）、Mode 3（超严格过滤）
3. THE FVG_Detector SHALL 默认使用 Mode 1（ATR 过滤）进行检测，用户可通过配置切换过滤模式
4. WHEN 价格回到 FVG 区域时，THE FVG_Detector SHALL 将该 FVG 标记为"已回补"（mitigated），并记录回补时间和回补程度（部分回补/完全回补）
5. THE FVG_Detector SHALL 在所有三种分析模式中可用：Scalping_Mode 使用 5m/15m 周期、Intraday_Mode 使用 15m/1h/4h 周期、Trend_Mode 使用 4h/1d 周期
6. WHEN FVG_Detector 检测到未回补的 FVG 时，THE Analysis_Report SHALL 在报告中标注 FVG 的价格区间、方向、所在周期和距当前价格的距离百分比
7. IF 计算 ATR 所需的K线数据不足（少于 14 根），THEN THE FVG_Detector SHALL 回退到 Mode 0（无过滤）并在结果中标注"ATR 数据不足，使用无过滤模式"

### 需求 13：Order Block 机构订单块检测（Institutional Order Block Detection）

**用户故事：** 作为交易者，我希望系统自动识别机构资金进出的关键价格区域（订单块），以便在机构行为的支撑/阻力位附近制定交易策略。

#### 验收标准

1. THE OrderBlock_Detector SHALL 检测需求订单块（Demand OB，趋势反转前最后一根阴线）和供给订单块（Supply OB，趋势反转前最后一根阳线）
2. THE OrderBlock_Detector SHALL 优先检测 Main ChoCh 类型的订单块（主结构性质转变后的订单块），作为最高优先级信号
3. THE OrderBlock_Detector SHALL 支持 6 种订单块类型：Main ChoCh Demand、Main ChoCh Supply、Sub ChoCh Demand、Sub ChoCh Supply、BoS Demand、BoS Supply
4. THE OrderBlock_Detector SHALL 与 Phase_Tracker 集成，在检测订单块时参考当前庄家操盘阶段，提供阶段感知的 OB 置信度评分
5. THE OrderBlock_Detector SHALL 仅在 Intraday_Mode（使用 1h/4h 周期）和 Trend_Mode（使用 4h/1d 周期）中可用，Scalping_Mode 不启用订单块检测
6. WHEN Trend_Mode 下 OrderBlock_Detector 检测到订单块时，THE Analysis_Orchestrator SHALL 将 OB 位置与 OnchainAgent 提供的巨鲸活动数据进行交叉验证，标注与巨鲸行为吻合的 OB 为"机构确认"级别
7. WHEN OrderBlock_Detector 检测到有效订单块时，THE Analysis_Report SHALL 展示 OB 的价格区间、类型（Demand/Supply）、触发条件（ChoCh/BoS）、与当前价格的距离百分比
8. IF 市场结构数据不足以判断 ChoCh 或 BoS，THEN THE OrderBlock_Detector SHALL 返回空结果列表，不产生错误
