"""庄家剧本知识库 — 17种核心操盘剧本定义 + 反制策略模板。

每种剧本包含：
- name: 剧本名称
- features: 特征列表（用于 LLM prompt 参考）
- aftermath: 后续走势描述
- signal: 对应交易信号（bullish / bearish / neutral）
- strategy_type: 反制策略类型（反向/规避/忍耐/跟随/顺势/时间）
- counter_strategy: 反制策略模板（进场/止损/止盈逻辑 + 确认信号 + 风险提醒）
"""

from typing import Literal

from pydantic import BaseModel, Field


class PlaybookStage(BaseModel):
    """剧本单个阶段定义。"""

    name: str                       # 阶段名称
    phase: str                      # 对应 MarketPhase 值
    typical_duration: str           # 典型持续时间（如 "2-5天"）
    features: list[str]             # 该阶段特征
    key_indicators: list[str]       # 关键指标
    next_stage_probability: float   # 进入下一阶段的概率（0~1）
    failure_signal: str             # 失效信号


class CounterStrategy(BaseModel):
    """剧本反制策略模板。"""

    action: str                     # 反制动作描述
    entry_logic: str                # 进场逻辑（自然语言，供 LLM 参考）
    stop_loss_logic: str            # 止损逻辑
    target_logic: str               # 止盈逻辑
    risk_level: Literal["aggressive", "moderate", "conservative"]
    wait_signal: str                # 进场确认信号（防止被二次骗线）
    risk_warning: str               # 风险提醒


class PlaybookPattern(BaseModel):
    """单个庄家操盘剧本模式。"""

    name: str
    features: list[str]
    aftermath: str
    signal: Literal["bullish", "bearish", "neutral"]
    strategy_type: Literal["反向策略", "规避策略", "忍耐策略", "跟随策略", "顺势策略", "时间策略"]
    counter_strategy: CounterStrategy
    stages: list[PlaybookStage] = []
    market_structure_type: str | None = None
    applicable_regimes: list[str] = []
    required_domains: list[str] = []
    confidence_boosters: list[str] = []
    invalidation_signals: list[str] = []
    market_structure_type: str | None = None
    applicable_regimes: list[str] = Field(default_factory=list)
    required_domains: list[str] = Field(default_factory=list)
    confidence_boosters: list[str] = Field(default_factory=list)
    invalidation_signals: list[str] = Field(default_factory=list)


PLAYBOOK_PATTERNS: list[PlaybookPattern] = [
    PlaybookPattern(
        name="假突破诱多",
        features=[
            "价格突破关键阻力",
            "成交量温和",
            "链上无大额流入",
            "巨鲸未增仓",
        ],
        aftermath="快速回落，散户追多被套",
        signal="bearish",
        strategy_type="反向策略",
        market_structure_type="false_breakout_bull_trap",
        applicable_regimes=["pre_breakout", "distribution", "volatile"],
        required_domains=["indicators", "derivatives", "coinglass"],
        confidence_boosters=["突破放量不足", "OI与资金费率追涨同步升温", "链上未见增量承接"],
        invalidation_signals=["突破后现货持续放量", "巨鲸开始增仓", "价格回踩突破位后重新站稳"],
        counter_strategy=CounterStrategy(
            action="等待假突破确认后反向做空",
            entry_logic="价格回落至突破位下方后，在突破位附近做空",
            stop_loss_logic="止损设在突破高点上方1.5ATR",
            target_logic="第一止盈目标为前低支撑位，第二止盈为下方FVG",
            risk_level="moderate",
            wait_signal="价格回落至阻力位下方+15min收盘确认",
            risk_warning="需等假突破确认，不可在突破中途做空",
        ),
        stages=[
            PlaybookStage(name="蓄势试探", phase="accumulation", typical_duration="1-3天", features=["价格逼近关键阻力", "成交量温和"], key_indicators=["EMA趋势", "RSI接近超买"], next_stage_probability=0.7, failure_signal="价格远离阻力位回落"),
            PlaybookStage(name="假突破", phase="markup", typical_duration="2-8小时", features=["价格短暂突破阻力", "成交量未显著放大"], key_indicators=["成交量比", "链上净流入"], next_stage_probability=0.8, failure_signal="突破后成交量持续放大+链上大额流入"),
            PlaybookStage(name="诱多陷阱", phase="distribution", typical_duration="4-12小时", features=["散户追多进场", "巨鲸未跟进"], key_indicators=["OI增长", "资金费率上升"], next_stage_probability=0.85, failure_signal="巨鲸开始增仓"),
            PlaybookStage(name="回落收割", phase="escape", typical_duration="1-4小时", features=["价格快速跌破突破位", "追多者爆仓"], key_indicators=["爆仓量", "价格跌幅"], next_stage_probability=0.9, failure_signal="跌破后迅速收复"),
        ],
    ),
    PlaybookPattern(
        name="恐慌洗盘",
        features=[
            "价格急跌5-15%",
            "交易所流入激增",
            "恐慌贪婪<25",
            "巨鲸反向增仓",
        ],
        aftermath="快速反弹，洗出弱手",
        signal="bullish",
        strategy_type="忍耐策略",
        market_structure_type="panic_washout_reversal",
        applicable_regimes=["washout", "accumulation", "volatile"],
        required_domains=["onchain", "derivatives", "coinglass"],
        confidence_boosters=["交易所净流入放大后快速钝化", "巨鲸逆势吸筹", "资金费率从极端负值修复"],
        invalidation_signals=["交易所流入持续扩张", "巨鲸同步减仓", "价格跌破洗盘低点后无承接"],
        counter_strategy=CounterStrategy(
            action="持仓等待反弹，分批接多",
            entry_logic="恐慌急跌企稳后，在下方支撑位分批挂多单",
            stop_loss_logic="止损设在洗盘低点下方2ATR（防二次下探）",
            target_logic="止盈目标为急跌起始位的80%回撤",
            risk_level="moderate",
            wait_signal="巨鲸链上增仓确认+资金费率转正+1H收阳线",
            risk_warning="急跌可能是真跌，必须确认巨鲸增仓后才能入场",
        ),
        stages=[
            PlaybookStage(name="制造恐慌", phase="washout", typical_duration="2-6小时", features=["价格急跌5-15%", "恐慌贪婪骤降"], key_indicators=["恐慌贪婪指数", "交易所流入"], next_stage_probability=0.75, failure_signal="巨鲸同步减仓"),
            PlaybookStage(name="散户恐慌抛售", phase="washout", typical_duration="4-12小时", features=["交易所流入激增", "社交媒体恐慌"], key_indicators=["交易所净流入", "社交情绪"], next_stage_probability=0.8, failure_signal="交易所流入持续超24h"),
            PlaybookStage(name="底部吸筹", phase="accumulation", typical_duration="6-24小时", features=["巨鲸反向增仓", "价格企稳"], key_indicators=["巨鲸持仓变化", "资金费率"], next_stage_probability=0.85, failure_signal="价格继续创新低"),
            PlaybookStage(name="快速反弹", phase="markup", typical_duration="1-3天", features=["V形反转", "空头被迫平仓"], key_indicators=["爆仓量", "价格回升幅度"], next_stage_probability=0.9, failure_signal="反弹无量"),
        ],
    ),
    PlaybookPattern(
        name="主升浪启动",
        features=[
            "交易所余额持续下降",
            "巨鲸增仓>2周",
            "ETF/ETP持续净流入",
            "现货强于永续合约",
            "期货基差温和走扩",
            "MVRV<2",
            "情绪低迷",
        ],
        aftermath="放量上涨，持续性强",
        signal="bullish",
        strategy_type="跟随策略",
        market_structure_type="etf_flow_led",
        applicable_regimes=["accumulation", "markup", "trend_up"],
        required_domains=["onchain", "derivatives", "coinglass"],
        confidence_boosters=["ETF连续3日净流入", "现货成交强于永续", "基差扩张但资金费率不过热"],
        invalidation_signals=["ETF净流入中断并转负", "期货基差快速收缩", "放量突破后现货承接消失"],
        counter_strategy=CounterStrategy(
            action="分批跟庄做多",
            entry_logic="回踩EMA25或前高突破回踩位入场",
            stop_loss_logic="止损设在EMA99下方1ATR",
            target_logic="持有至巨鲸开始减仓或MVRV>3.5，分三批止盈",
            risk_level="aggressive",
            wait_signal="突破放量+交易所持续流出+EMA多头排列",
            risk_warning="主升浪途中可能有剧烈回调洗盘，不要轻易止损出局",
        ),
        stages=[
            PlaybookStage(name="静默吸筹", phase="accumulation", typical_duration="2-4周", features=["交易所余额持续下降", "巨鲸增仓>2周"], key_indicators=["交易所余额", "巨鲸持仓"], next_stage_probability=0.6, failure_signal="巨鲸停止增仓"),
            PlaybookStage(name="试盘确认", phase="testing", typical_duration="3-7天", features=["小幅拉升测试抛压", "量能温和"], key_indicators=["成交量变化", "抛压测试"], next_stage_probability=0.7, failure_signal="试盘遇到大量抛压"),
            PlaybookStage(name="突破启动", phase="markup", typical_duration="1-3天", features=["放量突破关键位", "EMA多头排列"], key_indicators=["突破量能", "EMA排列"], next_stage_probability=0.8, failure_signal="假突破回落"),
            PlaybookStage(name="加速拉升", phase="markup", typical_duration="1-2周", features=["持续上涨", "FOMO情绪蔓延"], key_indicators=["涨幅", "社交热度"], next_stage_probability=0.85, failure_signal="巨鲸开始减仓"),
        ],
    ),
    PlaybookPattern(
        name="顶部派发",
        features=[
            "交易所流入激增",
            "巨鲸持仓下降",
            "ETF/ETP净流入钝化或转为流出",
            "期货基差收缩",
            "短端期权偏向防御",
            "MVRV>3.5",
            "情绪极度贪婪",
        ],
        aftermath="缓慢下跌或急跌",
        signal="bearish",
        strategy_type="反向策略",
        market_structure_type="distribution_with_derivatives_warning",
        applicable_regimes=["distribution", "escape", "trend_down"],
        required_domains=["onchain", "derivatives", "coinglass"],
        confidence_boosters=["ETF连续流出", "Put/Call比上升", "高位反弹承接明显减弱"],
        invalidation_signals=["现货再创新高且基差重新扩张", "巨鲸停止减仓", "交易所净流入迅速回落"],
        counter_strategy=CounterStrategy(
            action="逐步减仓/做空",
            entry_logic="确认派发后，在反弹至前高附近做空",
            stop_loss_logic="止损设在历史高点上方1ATR",
            target_logic="第一目标为前一轮吸筹区顶部，第二目标为50%回撤位",
            risk_level="moderate",
            wait_signal="巨鲸连续3日减仓+交易所净流入>前5日均值2倍",
            risk_warning="派发阶段可能持续数周，做空需分批且控制仓位",
        ),
        stages=[
            PlaybookStage(name="高位震荡", phase="distribution", typical_duration="3-7天", features=["价格高位窄幅震荡", "成交量放大"], key_indicators=["MVRV", "交易所流入"], next_stage_probability=0.7, failure_signal="价格创新高+巨鲸增仓"),
            PlaybookStage(name="出货试探", phase="distribution", typical_duration="2-5天", features=["巨鲸开始减仓", "交易所流入增加"], key_indicators=["巨鲸持仓变化", "交易所净流入"], next_stage_probability=0.8, failure_signal="巨鲸停止减仓"),
            PlaybookStage(name="加速派发", phase="distribution", typical_duration="1-3天", features=["情绪极度贪婪", "媒体看多"], key_indicators=["恐慌贪婪指数", "社交热度"], next_stage_probability=0.85, failure_signal="情绪降温后价格企稳"),
            PlaybookStage(name="破位下跌", phase="escape", typical_duration="1-7天", features=["跌破关键支撑", "加速下跌"], key_indicators=["支撑位", "跌幅"], next_stage_probability=0.9, failure_signal="迅速收复支撑位"),
        ],
    ),
    PlaybookPattern(
        name="横盘吸筹",
        features=[
            "价格长期窄幅震荡",
            "成交量持续萎缩",
            "巨鲸缓慢增仓",
            "交易所余额下降",
            "现货深度被持续吸收",
            "稳定币回流交易所",
            "期货基差缓慢抬升",
        ],
        aftermath="突破后放量上涨",
        signal="bullish",
        strategy_type="跟随策略",
        market_structure_type="spot_absorption",
        applicable_regimes=["accumulation", "range", "pre_breakout"],
        required_domains=["onchain", "coinglass", "derivatives"],
        confidence_boosters=["大单挂单集中在下方承接", "低波动但净买入持续为正", "突破前价差保持稳定"],
        invalidation_signals=["箱体下沿放量失守", "稳定币流入消失", "基差由升转降"],
        counter_strategy=CounterStrategy(
            action="在箱体下沿分批建仓，等待突破",
            entry_logic="在震荡箱体下沿附近分3批买入",
            stop_loss_logic="止损设在箱体下沿下方1.5ATR",
            target_logic="突破后持有，目标为箱体幅度等距测量位",
            risk_level="conservative",
            wait_signal="巨鲸持续增仓>1周+交易所余额持续下降",
            risk_warning="吸筹阶段可能持续数月，需要耐心；假突破概率较高",
        ),
        stages=[
            PlaybookStage(name="筑底盘整", phase="accumulation", typical_duration="2-6周", features=["价格窄幅震荡", "成交量萎缩"], key_indicators=["波动率", "成交量"], next_stage_probability=0.6, failure_signal="价格跌破箱体下沿"),
            PlaybookStage(name="暗中吸筹", phase="accumulation", typical_duration="2-4周", features=["巨鲸缓慢增仓", "交易所余额下降"], key_indicators=["巨鲸持仓", "交易所余额"], next_stage_probability=0.7, failure_signal="巨鲸停止增仓"),
            PlaybookStage(name="假跌洗盘", phase="washout", typical_duration="1-3天", features=["短暂跌破箱体", "弱手出局"], key_indicators=["跌幅", "恐慌指数"], next_stage_probability=0.8, failure_signal="未能收回箱体"),
            PlaybookStage(name="突破拉升", phase="markup", typical_duration="1-3天", features=["放量突破箱体上沿", "EMA多头排列"], key_indicators=["突破量能", "EMA趋势"], next_stage_probability=0.85, failure_signal="突破后缩量回落"),
        ],
    ),
    PlaybookPattern(
        name="诱空杀空",
        features=[
            "快速下跌5-10%",
            "空头持仓激增",
            "资金费率深度负值",
            "急速反弹收复跌幅",
        ],
        aftermath="空头被迫平仓推高价格",
        signal="bullish",
        strategy_type="反向策略",
        market_structure_type="short_squeeze_reversal",
        applicable_regimes=["washout", "volatile", "trend_up"],
        required_domains=["derivatives", "coinglass"],
        confidence_boosters=["资金费率深负但价格拒绝继续下行", "OI激增后快速回落", "爆仓集中在空头一侧"],
        invalidation_signals=["下跌后OI继续堆积", "反弹无量且迅速回吐", "空头持仓未被迫出清"],
        counter_strategy=CounterStrategy(
            action="识别诱空后反向做多",
            entry_logic="急跌触底企稳后做多，入场于急跌起始位附近",
            stop_loss_logic="止损设在急跌最低点下方1ATR",
            target_logic="目标为空头爆仓推动的惯性高点",
            risk_level="aggressive",
            wait_signal="资金费率深度负值+OI不降反升+1H收带长下影线阳线",
            risk_warning="诱空与真跌难以实时区分，必须等确认信号",
        ),
    ),
    PlaybookPattern(
        name="二次探底",
        features=[
            "价格回踩前低不破",
            "成交量缩量",
            "RSI底背离",
            "巨鲸未减仓",
        ],
        aftermath="形成W底后反弹",
        signal="bullish",
        strategy_type="跟随策略",
        market_structure_type="double_bottom_absorption",
        applicable_regimes=["accumulation", "range", "pre_breakout"],
        required_domains=["indicators", "onchain"],
        confidence_boosters=["RSI底背离", "回踩缩量", "巨鲸未减仓且现货承接增强"],
        invalidation_signals=["前低被有效跌破", "回踩放量转弱", "链上承接消失"],
        counter_strategy=CounterStrategy(
            action="在二次探底确认后做多",
            entry_logic="价格触及前低附近不破后，在颈线位附近入场",
            stop_loss_logic="止损设在前低下方1.5ATR",
            target_logic="目标为W底的颈线位等距测量位",
            risk_level="moderate",
            wait_signal="RSI底背离确认+成交量缩量+价格收在前低上方",
            risk_warning="二次探底可能失败变成下跌中继，破前低必须止损",
        ),
    ),
    PlaybookPattern(
        name="阶梯式拉升",
        features=[
            "每次回调不破前高",
            "逐步抬高底部",
            "成交量温和放大",
            "交易所持续流出",
        ],
        aftermath="持续上涨趋势",
        signal="bullish",
        strategy_type="顺势策略",
        market_structure_type="stair_step_markup",
        applicable_regimes=["markup", "trend_up", "post_euphoria"],
        required_domains=["indicators", "onchain", "derivatives"],
        confidence_boosters=["每轮回调缩量", "交易所余额持续流出", "基差温和扩张但不过热"],
        invalidation_signals=["某一阶梯低点失守", "成交量异常放大但价格滞涨", "巨鲸开始减仓"],
        counter_strategy=CounterStrategy(
            action="顺势做多，回调加仓",
            entry_logic="每次回调至前高（变支撑）附近做多",
            stop_loss_logic="止损设在前一个阶梯低点下方1ATR",
            target_logic="递减止盈：每个阶梯减仓20%",
            risk_level="moderate",
            wait_signal="回调不破前高+成交量缩量+EMA7支撑有效",
            risk_warning="阶梯式拉升末端可能变为拉高出货，注意成交量异常放大信号",
        ),
    ),
    PlaybookPattern(
        name="拉高出货",
        features=[
            "短时间成交量暴增3-10倍",
            "价格急速拉升10-30%",
            "巨鲸持仓开始下降",
            "交易所流入激增",
            "社交媒体异常活跃",
        ],
        aftermath="快速崩盘回落至拉升前水平",
        signal="bearish",
        strategy_type="反向策略",
        market_structure_type="parabolic_distribution",
        applicable_regimes=["markup", "distribution", "overheated"],
        required_domains=["onchain", "derivatives", "coinglass"],
        confidence_boosters=["社交热度失真飙升", "交易所净流入放大", "巨鲸边拉边出"],
        invalidation_signals=["拉升后现货持续放量承接", "巨鲸停止减仓", "高位横盘后再创新高"],
        counter_strategy=CounterStrategy(
            action="识别出货信号后做空或绝对回避",
            entry_logic="价格滞涨+巨鲸减仓确认后做空",
            stop_loss_logic="止损设在拉升最高点上方2ATR",
            target_logic="目标为拉升起始位",
            risk_level="aggressive",
            wait_signal="巨鲸减仓+交易所净流入激增+社交热度见顶",
            risk_warning="拉升过程中做空极其危险，只在确认出货后入场",
        ),
        stages=[
            PlaybookStage(name="预热造势", phase="markup", typical_duration="1-3天", features=["社交媒体造势", "KOL喊单"], key_indicators=["社交热度", "KOL活跃度"], next_stage_probability=0.7, failure_signal="市场无反应"),
            PlaybookStage(name="急速拉升", phase="markup", typical_duration="4-24小时", features=["价格急涨10-30%", "成交量暴增"], key_indicators=["涨幅", "成交量倍数"], next_stage_probability=0.85, failure_signal="拉升中途成交量骤降"),
            PlaybookStage(name="高位出货", phase="distribution", typical_duration="2-12小时", features=["巨鲸减仓", "交易所流入激增"], key_indicators=["巨鲸持仓", "交易所净流入"], next_stage_probability=0.9, failure_signal="巨鲸继续增仓"),
            PlaybookStage(name="崩盘回落", phase="escape", typical_duration="1-3天", features=["价格快速回落至拉升前", "恐慌抛售"], key_indicators=["跌幅", "恐慌指数"], next_stage_probability=0.95, failure_signal="在半途企稳反弹"),
        ],
    ),
    PlaybookPattern(
        name="流动性陷阱",
        features=[
            "低流动性环境下突然放量",
            "买卖价差急剧收窄后扩大",
            "大额挂单快速撤销",
            "价格短暂突破后迅速反转",
        ],
        aftermath="流动性抽离后价格剧烈波动",
        signal="bearish",
        strategy_type="规避策略",
        market_structure_type="liquidity_vacuum_trap",
        applicable_regimes=["liquidity_stress", "volatile", "event_driven"],
        required_domains=["coinglass", "orderbook", "large_orders"],
        confidence_boosters=["价差先收窄后急剧走阔", "挂单深度被抽空", "大额撤单与假突破同时出现"],
        invalidation_signals=["价差恢复正常", "深度重新补齐", "大额撤单现象停止"],
        counter_strategy=CounterStrategy(
            action="绝对回避，不参与任何方向操作",
            entry_logic="不入场，等待流动性恢复正常后再观察",
            stop_loss_logic="如已有持仓，立即设紧止损",
            target_logic="无操作目标，等待陷阱结束",
            risk_level="conservative",
            wait_signal="价差恢复正常+挂单深度回升",
            risk_warning="流动性陷阱中任何方向操作都可能被收割，最佳策略是不参与",
        ),
    ),
    PlaybookPattern(
        name="对倒洗售",
        features=[
            "成交量异常放大但价格波动极小",
            "买卖方向频繁交替且金额相近",
            "链上活跃地址数未同步增长",
            "OI未随成交量同步变化",
        ],
        aftermath="虚假繁荣消退后量价齐跌",
        signal="bearish",
        strategy_type="规避策略",
        market_structure_type="wash_trading_distortion",
        applicable_regimes=["range", "distribution", "event_driven"],
        required_domains=["onchain", "coinglass", "derivatives"],
        confidence_boosters=["成交量异常放大但价格不动", "活跃地址与成交量脱节", "OI未同步扩张"],
        invalidation_signals=["链上活跃度与成交重新同步", "价格开始伴随真实净流入突破", "成交量恢复正常结构"],
        counter_strategy=CounterStrategy(
            action="识别虚假繁荣后不追涨",
            entry_logic="不入场，等待对倒结束后观察真实供需",
            stop_loss_logic="如已有持仓，逐步减仓",
            target_logic="无做多目标，对倒结束后可能有做空机会",
            risk_level="conservative",
            wait_signal="成交量回归正常+链上活跃地址恢复相关性",
            risk_warning="对倒期间数据失真，任何基于量价的分析都不可靠",
        ),
    ),
    PlaybookPattern(
        name="插针收割",
        features=[
            "瞬间价格偏离超5%后快速回归",
            "爆仓集中在单一方向",
            "OI在插针前异常堆积",
            "资金费率极端偏离",
        ],
        aftermath="爆仓清算完成后价格恢复正常区间",
        signal="neutral",
        strategy_type="时间策略",
        market_structure_type="liquidation_wick_hunt",
        applicable_regimes=["volatile", "event_driven", "liquidity_stress"],
        required_domains=["derivatives", "coinglass", "oi"],
        confidence_boosters=["插针前OI异常堆积", "爆仓单边集中", "资金费率极端偏离"],
        invalidation_signals=["插针后价格不能回归区间", "OI未明显下降", "连续同向二次插针"],
        counter_strategy=CounterStrategy(
            action="避开插针时段，插针后反向操作",
            entry_logic="插针完成价格回归后，在回归位置顺插针反向入场",
            stop_loss_logic="止损设在插针极值外1ATR（已被清算区域不会再到）",
            target_logic="目标为插针前的正常价格区间中心",
            risk_level="moderate",
            wait_signal="OI显著下降（清算完成）+价格回归正常区间+资金费率回归中性",
            risk_warning="连续插针可能出现，第一次插针后不要立即All-in",
        ),
    ),
    PlaybookPattern(
        name="TWAP拆单吸筹",
        features=[
            "同一实体地址群高频小额买入（单笔<总量0.5%）",
            "买入时间间隔高度均匀（TWAP特征）或跟随成交量分布（VWAP特征）",
            "链上关联地址数量突然增多但最终归集到同一冷钱包",
            "价格波动率异常压缩但净买入持续为正",
            "交易所余额缓慢下降趋势与小额提币频率吻合",
        ],
        aftermath="吸筹完成后通常伴随突破性拉升，散户在低位已被洗出",
        signal="bullish",
        strategy_type="跟随策略",
        market_structure_type="twap_accumulation",
        applicable_regimes=["accumulation", "range", "pre_breakout"],
        required_domains=["onchain", "coinglass", "orderbook"],
        confidence_boosters=["归集地址持续增仓", "波动率压缩", "净买入稳定为正"],
        invalidation_signals=["归集停止并转为流出", "价格跌破吸筹区下沿", "小额买入节奏被破坏"],
        counter_strategy=CounterStrategy(
            action="识别拆单吸筹信号后跟随建仓，等待拉升启动",
            entry_logic="确认链上归集地址持续增仓且价格在窄幅区间时分批建仓",
            stop_loss_logic="止损设在吸筹区间下沿下方1.5ATR",
            target_logic="第一目标为吸筹区间上沿突破后1.5倍区间宽度，第二目标为前高",
            risk_level="moderate",
            wait_signal="链上归集地址连续3天净增仓+价格波动率降至30日最低+成交量萎缩至均值50%以下",
            risk_warning="拆单吸筹可能持续数周，需耐心持仓；若价格跌破吸筹区间下沿则判断失误需止损",
        ),
    ),
    PlaybookPattern(
        name="多交易所协同操纵",
        features=[
            "A交易所出现大额砸盘同时B交易所出现大额买入",
            "跨所价差短时间扩大至0.5%以上后快速收敛",
            "不同交易所订单簿深度同步异常变化",
            "爆仓主要集中在某一交易所而另一交易所价格稳定",
            "同一时间窗口内多所资金流向呈现镜像模式",
            "稳定币流动性在不同交易所间分层",
        ],
        aftermath="价差收敛后价格回归均值，被定向爆仓的交易所用户承受损失",
        signal="neutral",
        strategy_type="规避策略",
        market_structure_type="cross_venue_liquidity_fragmentation",
        applicable_regimes=["volatile", "event_driven", "liquidity_stress"],
        required_domains=["coinglass", "derivatives"],
        confidence_boosters=["跨所价差反复瞬时扩大", "深度恢复速度明显不一致", "被定向爆仓交易所的标记价格明显异常"],
        invalidation_signals=["价差稳定回归且深度恢复", "各交易所资金费率重新收敛"],
        counter_strategy=CounterStrategy(
            action="检测到跨所异常时暂停交易，等待价差收敛后评估真实方向",
            entry_logic="价差收敛至正常范围（<0.1%）后，在流动性最好的交易所按回归价位入场",
            stop_loss_logic="止损设在异常波动区间的极值外侧",
            target_logic="目标为异常波动前的正常价格区间中心",
            risk_level="conservative",
            wait_signal="跨所价差回归正常+订单簿深度恢复+资金费率无极端偏离",
            risk_warning="跨所操纵期间切勿在被操纵交易所下单，可能遭遇滑点陷阱和流动性真空",
        ),
    ),
    PlaybookPattern(
        name="资金费率操纵",
        features=[
            "现货持续买入推高价格同时期货空头持仓不减反增",
            "资金费率持续偏高（>0.03%/8h）超过3个周期",
            "现货-期货基差异常扩大",
            "大额现货买单与等量期货空单在相近时间出现",
            "OI持续攀升但价格上涨速度放缓",
            "标记价格与现货偏离扩大",
        ],
        aftermath="操纵者通过收取高额资金费率获利，最终现货抛售导致价格回落",
        signal="bearish",
        strategy_type="反向策略",
        market_structure_type="perp_basis_manipulation",
        applicable_regimes=["markup", "overheated", "distribution"],
        required_domains=["derivatives", "coinglass"],
        confidence_boosters=["资金费率高位钝化", "OI持续走高但动能衰减", "现货与永续结构性背离"],
        invalidation_signals=["高费率快速回落且价格无回撤", "OI显著下降后价格继续稳步走高"],
        counter_strategy=CounterStrategy(
            action="检测到费率操纵信号后避免追多，等待操纵者平仓现货后反向做空",
            entry_logic="资金费率开始从高位回落+现货出现大额卖出信号时做空",
            stop_loss_logic="止损设在费率操纵期间的价格最高点上方1ATR",
            target_logic="第一目标为操纵开始前的价格水平，第二目标为下方关键支撑",
            risk_level="aggressive",
            wait_signal="资金费率连续2个周期下降+现货大额转入交易所+期货空头开始减仓",
            risk_warning="费率操纵可持续数天，过早做空会被资金费率消耗；需等明确反转信号",
        ),
    ),
    PlaybookPattern(
        name="冰山订单吸筹",
        features=[
            "订单簿多档位挂单量高度均匀（变异系数<0.15），显示算法自动补单",
            "可见挂单量远小于实际成交量（成交/挂单比>5倍）",
            "价格在窄幅区间震荡但持续有成交，不形成明显趋势",
            "大单成交后同一价位迅速出现相同大小的新挂单（自动补单）",
            "买卖价差保持稳定，不因大单成交而显著扩大",
        ],
        aftermath="隐藏吸筹完成后通常伴随突破性拉升，冰山订单方向即为后续趋势方向",
        signal="bullish",
        strategy_type="跟随策略",
        market_structure_type="iceberg_absorption",
        applicable_regimes=["accumulation", "range", "pre_breakout"],
        required_domains=["orderbook", "large_orders", "coinglass"],
        confidence_boosters=["同价位反复自动补单", "成交/挂单比异常偏高", "价差保持稳定且价格不跌"],
        invalidation_signals=["补单行为消失", "挂单区被放量击穿", "链上/现货承接未同步出现"],
        counter_strategy=CounterStrategy(
            action="识别冰山订单方向后顺势建仓，等待隐藏买单撤出后的突破",
            entry_logic="确认买盘冰山订单持续存在且价格不跌时，在当前价位附近分批建仓",
            stop_loss_logic="止损设在冰山订单挂单区间下沿下方1ATR",
            target_logic="第一目标为冰山吸筹区间上沿突破后2倍区间宽度",
            risk_level="moderate",
            wait_signal="冰山订单持续存在超过1小时+价格不破区间下沿+成交量温和",
            risk_warning="冰山订单可能是做市商正常行为而非吸筹；需结合链上数据交叉验证",
        ),
    ),
    PlaybookPattern(
        name="抢跑交易",
        features=[
            "链上大额转账前数秒出现同方向的交易所买入/卖出",
            "异常精准的入场时机：在重大消息/大额链上操作前精确建仓",
            "mempool中出现与即将执行的大额交易方向一致的先行交易",
            "同一地址反复在链上大额操作前精准获利",
            "交易时间戳与链上事件高度吻合（秒级精度）",
        ],
        aftermath="抢跑者在大额交易推动价格后获利了结，价格回归或继续趋势",
        signal="neutral",
        strategy_type="规避策略",
        market_structure_type="front_run_information_leak",
        applicable_regimes=["event_driven", "volatile", "liquidity_stress"],
        required_domains=["onchain", "large_orders", "orderbook"],
        confidence_boosters=["链上大额操作前秒级提前建仓", "同类地址反复精准抢跑", "盘口提前朝同方向倾斜"],
        invalidation_signals=["事件后无价格冲击", "后续未见同类先行交易", "订单簿未提前出现偏置"],
        counter_strategy=CounterStrategy(
            action="检测到抢跑模式后避免跟风追涨杀跌，等待价格冲击消化后再评估",
            entry_logic="价格冲击消化（波动率回归正常）后按技术面信号入场",
            stop_loss_logic="止损设在价格冲击的起始点附近",
            target_logic="目标为冲击前趋势的自然延续位",
            risk_level="conservative",
            wait_signal="价格冲击后5-15分钟波动率回归+订单簿深度恢复+无后续大额链上操作",
            risk_warning="抢跑交易表明有内幕信息优势方存在，后续走势可能不按常规技术面演绎",
        ),
    ),
    PlaybookPattern(
        name="ETF申购驱动上行",
        features=[
            "ETF/ETP连续净流入",
            "现货强于永续合约",
            "资金费率温和偏多但不过热",
            "期货基差稳步走扩",
            "回撤浅且节奏偏机械",
        ],
        aftermath="资金驱动型慢牛推进，回调通常较浅，趋势延续性较强",
        signal="bullish",
        strategy_type="顺势策略",
        market_structure_type="etf_flow_led",
        applicable_regimes=["accumulation", "markup", "trend_up"],
        required_domains=["derivatives", "coinglass"],
        confidence_boosters=["连续多日净流入", "现货成交走强", "OI增长但资金费率保持克制"],
        invalidation_signals=["ETF净流入骤停", "基差快速收缩", "永续过热接管主导"],
        counter_strategy=CounterStrategy(
            action="顺着机构申购方向低吸跟随，不在加速段盲目追高",
            entry_logic="回踩VWAP或EMA25企稳后分批做多，优先在现货承接明显的时段介入",
            stop_loss_logic="止损设在最近一轮机构承接低点下方1ATR",
            target_logic="第一目标为近期高点突破位，第二目标为基差扩张后的趋势延伸区",
            risk_level="moderate",
            wait_signal="ETF连续净流入+现货强于永续+回踩后1H收盘站稳VWAP",
            risk_warning="若上涨开始由永续高杠杆接管，剧本可能退化为短线逼空而非机构慢牛",
        ),
    ),
    PlaybookPattern(
        name="ETF赎回驱动回撤",
        features=[
            "ETF/ETP连续净流出",
            "现货承接明显减弱",
            "期货基差持续收缩",
            "弱反弹后再创新低",
            "价格回撤呈阶梯式",
        ],
        aftermath="非恐慌式供给释放，市场以弱反弹和阴跌方式完成去仓位",
        signal="bearish",
        strategy_type="规避策略",
        market_structure_type="etf_redemption_supply",
        applicable_regimes=["distribution", "trend_down", "slow_deleveraging"],
        required_domains=["derivatives", "coinglass"],
        confidence_boosters=["ETF多日连续流出", "现货反弹无量", "基差与OI同步回落"],
        invalidation_signals=["现货放量收复关键位", "流出结束后重新转入", "空头拥挤导致逼空反弹"],
        counter_strategy=CounterStrategy(
            action="减少抄底频率，优先等待供给出清后再评估方向",
            entry_logic="若参与做空，仅在弱反弹至前压位、且现货无承接时入场",
            stop_loss_logic="止损设在最近弱反弹高点上方1ATR",
            target_logic="第一目标为前低，第二目标为赎回驱动下的下方流动性缺口",
            risk_level="moderate",
            wait_signal="ETF连续流出+基差收缩+反弹量能低于前一轮下跌",
            risk_warning="该类回撤往往节奏慢，过度追空容易被短线反抽清洗",
        ),
    ),
    PlaybookPattern(
        name="Gamma钉住",
        features=[
            "临近期权大到期日",
            "价格围绕关键行权价反复震荡",
            "短端隐含波动率偏高",
            "已实现波动率下降",
            "方向突破经常被拉回区间中心",
        ],
        aftermath="到期前价格被吸附在关键行权价附近，到期后才释放真实趋势",
        signal="neutral",
        strategy_type="时间策略",
        market_structure_type="options_gamma_pinning",
        applicable_regimes=["range", "event_driven", "expiry_window"],
        required_domains=["coinglass", "derivatives"],
        confidence_boosters=["存在明确max pain区域", "短端IV抬升", "突破后迅速被拉回"],
        invalidation_signals=["现货放量单边突破且未回到关键行权价附近", "到期窗口已结束"],
        counter_strategy=CounterStrategy(
            action="减少方向性追单，优先做区间和等待到期后再跟趋势",
            entry_logic="在关键行权价上下的震荡边界轻仓高抛低吸，或耐心等待到期后再顺势入场",
            stop_loss_logic="区间策略止损设在震荡边界外0.8ATR；若做突破，则需等待到期后确认",
            target_logic="区间策略目标为区间中轴和另一侧边界；到期后目标跟随放量突破方向",
            risk_level="conservative",
            wait_signal="max pain附近反复吸附+短端IV偏高+价格回到区间中轴",
            risk_warning="Gamma钉住环境下假突破频繁，方向性重仓最容易被来回磨损",
        ),
    ),
    PlaybookPattern(
        name="Put保护挤压下跌",
        features=[
            "期权Put/Call比显著抬升",
            "市场保护性买沽需求增强",
            "短端波动率偏高",
            "下跌时现货承接偏弱",
            "反弹难以持续",
        ],
        aftermath="下跌更像被动对冲放大而非单纯恐慌，短线反抽后仍容易延续弱势",
        signal="bearish",
        strategy_type="顺势策略",
        market_structure_type="protective_put_pressure",
        applicable_regimes=["distribution", "event_driven", "trend_down"],
        required_domains=["derivatives", "coinglass"],
        confidence_boosters=["Put/Call比持续高位", "期权总OI抬升", "下跌时反弹承接明显不足"],
        invalidation_signals=["Put/Call比快速回落", "现货放量收复关键位", "下跌后出现强力V反"],
        counter_strategy=CounterStrategy(
            action="把反弹视为减仓或顺势做空机会，避免把防御性对冲行情误判成普通洗盘",
            entry_logic="价格反弹至前压位且Put/Call比维持高位时，轻仓顺势参与空头",
            stop_loss_logic="止损设在最近弱反弹高点上方1ATR",
            target_logic="第一目标为前低，第二目标为保护性对冲持续发酵后的流动性缺口",
            risk_level="moderate",
            wait_signal="Put/Call比高位+短端IV偏高+反弹无法站稳VWAP/前压位",
            risk_warning="若Put保护被快速解除，空头延续性会明显下降，追空过深容易遭遇急反抽",
        ),
    ),
    PlaybookPattern(
        name="稳定币流动性迁移",
        features=[
            "稳定币保证金OI与币本位OI出现明显分化",
            "稳定币24h成交额放大但价格弹性下降",
            "同样成交量下市场深度恢复不均衡",
            "局部交易所流动性改善而整体趋势不强",
            "传统量价关系开始失真",
        ],
        aftermath="市场表面成交活跃，但真实流动性在不同保证金结构和场所间迁移，假突破和错价增多",
        signal="neutral",
        strategy_type="规避策略",
        market_structure_type="stablecoin_liquidity_rotation",
        applicable_regimes=["range", "event_driven", "liquidity_stress"],
        required_domains=["coinglass", "coingecko", "margin_oi"],
        confidence_boosters=["稳定币保证金OI显著走强", "币本位OI同步走弱", "稳定币成交额高但趋势延续性差"],
        invalidation_signals=["保证金结构重新收敛", "现货趋势重新主导并伴随深度同步恢复"],
        counter_strategy=CounterStrategy(
            action="降低方向性仓位，优先回避看似有量却缺乏持续性的突破",
            entry_logic="仅在深度恢复和价差收敛后轻仓参与，否则以观望为主",
            stop_loss_logic="若必须入场，止损设在异常流动性波动区间外1ATR",
            target_logic="无固定趋势目标，优先做短周期回归和等待结构稳定后的新方向",
            risk_level="conservative",
            wait_signal="稳定币/币本位保证金OI分化收敛+订单簿深度恢复+价格重新形成趋势跟随",
            risk_warning="这是流动性结构变化而非传统趋势行情，贸然追涨杀跌很容易被假突破收割",
        ),
    ),
    PlaybookPattern(
        name="Basis压缩去杠杆",
        features=[
            "期货基差快速收缩",
            "OI持续下降",
            "资金费率回归中性或转负",
            "现货无新增承接",
            "价格向更低均衡区回落",
        ],
        aftermath="杠杆和carry头寸退出后，市场以偏弱震荡或阶梯下跌完成再平衡",
        signal="bearish",
        strategy_type="规避策略",
        market_structure_type="basis_compression_deleveraging",
        applicable_regimes=["trend_down", "slow_deleveraging", "post_euphoria"],
        required_domains=["derivatives", "coinglass"],
        confidence_boosters=["basis与OI同步收缩", "资金费率钝化转负", "现货反弹缺乏持续买盘"],
        invalidation_signals=["现货重新吸收抛压", "OI下降后价格迅速V反", "基差恢复扩张"],
        counter_strategy=CounterStrategy(
            action="优先降杠杆和降低追涨意愿，等待去杠杆结束后再重新评估",
            entry_logic="仅在反弹至前期资金密集区失败时尝试顺势做空，否则以观望为主",
            stop_loss_logic="止损设在去杠杆反弹高点上方1ATR",
            target_logic="第一目标为最近低点，第二目标为去杠杆后的新均衡支撑区",
            risk_level="conservative",
            wait_signal="基差收缩+OI下降+反弹无法站稳VWAP",
            risk_warning="这类回撤常常不是暴跌而是磨跌，贸然重仓追空会被时间成本和反抽消耗",
        ),
    ),
]

# 剧本名称 → 信号 快速查找映射
PLAYBOOK_SIGNAL_MAP: dict[str, Literal["bullish", "bearish", "neutral"]] = {
    p.name: p.signal for p in PLAYBOOK_PATTERNS
}

# 合法剧本名称集合
VALID_PLAYBOOK_NAMES: set[str] = {p.name for p in PLAYBOOK_PATTERNS}
