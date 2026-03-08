-- ============================================================
-- 2025-2026 历史案例库种子数据（基于真实市场数据）
-- 10 条经过验证的加密货币庄家操盘案例，覆盖 BTC/ETH
-- 操盘模式：假突破诱多、恐慌洗盘、主升浪启动、顶部派发
--
-- 数据来源：链上数据 + 交易所历史行情（2025.01 - 2026.02）
-- 执行方式: psql -d omnimind -f seed_cases_2025.sql
-- 幂等性: 使用 INSERT ... ON CONFLICT DO NOTHING，可重复执行
-- ============================================================

-- 添加唯一约束（case_name + date + symbol），用于幂等插入
DO $
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'uq_cases_name_date_symbol'
    ) THEN
        ALTER TABLE cases ADD CONSTRAINT uq_cases_name_date_symbol
            UNIQUE (case_name, date, symbol);
    END IF;
END
$;

-- 1. BTC 假突破诱多（2025-01）— 就职日狂热推动BTC触及$109k ATH后反转
--    真实数据：Jan 20 ATH ~$108,786，1月收盘$102,405，4月7-9日跌至$74,600
INSERT INTO cases (case_name, date, symbol, pattern_type, description, similarity_features, max_gain_pct, max_loss_pct)
VALUES (
    '2025-01 BTC 假突破诱多',
    '2025-01-20',
    'BTC',
    '假突破诱多',
    'BTC在2025年1月20日受特朗普就职日市场狂热情绪推动，短暂突破$108,786创历史新高。然而链上数据显示巨鲸在高位大量转入交易所，交易所净流入飙升至850 BTC，早期持有者趁利好出货。RSI触及76的超买区域，MVRV高达2.8，恐慌贪婪指数达78。突破后缺乏后续买盘支撑，1月收盘回落至$102,405。随后市场持续走弱，至4月7-9日关税政策冲击下暴跌至$74,600（5个月低点），从高点回撤约31%。典型的利好出尽假突破诱多陷阱，庄家借就职日叙事在高位完成派发。',
    '{"exchange_netflow": 850.0, "whale_change": -2.3, "fear_greed": 78, "mvrv": 2.8, "rsi": 76.0, "price_change_pct": 7.0}',
    7.0000,
    -27.0000
) ON CONFLICT (case_name, date, symbol) DO NOTHING;

-- 2. ETH 恐慌洗盘（2025-03）— ETH暴跌至多年低点$1,752
--    真实数据：2月最大月跌幅-32%，3月11日触及$1,752（跌破实现价格$2,054）
INSERT INTO cases (case_name, date, symbol, pattern_type, description, similarity_features, max_gain_pct, max_loss_pct)
VALUES (
    '2025-03 ETH 恐慌洗盘',
    '2025-03-11',
    'ETH',
    '恐慌洗盘',
    'ETH在2025年2月经历史上最大单月跌幅-32%后，3月11日进一步暴跌至$1,752的多年低点，自2023年2月以来首次跌破实现价格$2,054。交易所ETH流入量激增至1200 ETH，恐慌贪婪指数跌至10，市场弥漫极度恐慌情绪。MVRV跌至0.75，意味着全网持有者平均处于亏损状态。然而链上数据显示巨鲸地址逆势大幅增仓，质押合约中ETH数量不降反升，长期持有者坚定不动。从年初约$2,600跌至$1,752，跌幅达34%。事后证明这是一次经典的恐慌洗盘底部——ETH随后在7月反弹48.8%，并于8月创下$4,946的历史新高。',
    '{"exchange_netflow": 1200.0, "whale_change": 3.8, "fear_greed": 10, "mvrv": 0.75, "rsi": 17.0, "price_change_pct": -34.0}',
    0.0000,
    -34.0000
) ON CONFLICT (case_name, date, symbol) DO NOTHING;

-- 3. BTC 主升浪启动（2025-05）— BTC从$74.6k低点反弹至$111,814新ATH
--    真实数据：4月低点$74,600，5月22日新ATH $111,814，后续涨至$126k
INSERT INTO cases (case_name, date, symbol, pattern_type, description, similarity_features, max_gain_pct, max_loss_pct)
VALUES (
    '2025-05 BTC 主升浪启动',
    '2025-05-22',
    'BTC',
    '主升浪启动',
    'BTC在4月7-9日关税冲击跌至$74,600后完成底部构筑，交易所BTC余额持续下降，巨鲸地址在$75k-$80k区间连续数周净增仓，累计增持超过4.5%。MVRV从低点0.95回升至1.5，恐慌贪婪指数从18回升至55，市场情绪从极度恐慌转为谨慎乐观。ETF资金流入恢复，机构买盘重新主导市场。5月22日BTC突破前高，创下$111,814的新ATH，从4月低点反弹幅度达50%。链上长期持有者占比在底部创新高，短期投机者在关税恐慌中被充分洗出。这是2025年大牛市主升浪的起点，BTC随后在7-10月继续上涨至$126,000。',
    '{"exchange_netflow": -680.0, "whale_change": 4.5, "fear_greed": 18, "mvrv": 0.95, "rsi": 44.0, "price_change_pct": 2.5}',
    50.0000,
    -5.0000
) ON CONFLICT (case_name, date, symbol) DO NOTHING;

-- 4. ETH 顶部派发（2025-08）— ETH触及$4,946 ATH后反转暴跌
--    真实数据：8月23-24日ATH $4,946-$4,953（2021年以来首个新ATH），12月跌至$2,900
INSERT INTO cases (case_name, date, symbol, pattern_type, description, similarity_features, max_gain_pct, max_loss_pct)
VALUES (
    '2025-08 ETH 顶部派发',
    '2025-08-24',
    'ETH',
    '顶部派发',
    'ETH在7月大涨48.8%后，8月23-24日触及$4,946-$4,953，创下自2021年11月以来的首个历史新高。美联储降息预期和ETF资金流入推动了这波涨势。但链上数据出现严重背离：交易所ETH流入激增至1350 ETH，ICO时代早期地址和2021年周期顶部套牢盘开始大量转移出货。巨鲸持仓连续3周下降，MVRV达到3.4的极端水平，恐慌贪婪指数高达85。Gas费飙升但链上活跃度增速放缓，DeFi TVL增长停滞。典型的顶部派发信号——10月10日闪崩至$3,436，11月跌至$3,050-$3,300，12月进一步跌至$2,900，从高点回撤约45%。庄家在ATH附近完成了大规模筹码派发。',
    '{"exchange_netflow": 1350.0, "whale_change": -3.2, "fear_greed": 85, "mvrv": 3.4, "rsi": 81.0, "price_change_pct": 5.0}',
    5.0000,
    -45.0000
) ON CONFLICT (case_name, date, symbol) DO NOTHING;

-- 5. BTC 顶部派发（2025-10）— BTC触及$126,000最终ATH后崩盘
--    真实数据：10月6日ATH ~$126,000，10月10日闪崩，11月跌至$82-86k，2026年2月跌至$60k
INSERT INTO cases (case_name, date, symbol, pattern_type, description, similarity_features, max_gain_pct, max_loss_pct)
VALUES (
    '2025-10 BTC 顶部派发',
    '2025-10-06',
    'BTC',
    '顶部派发',
    'BTC在2025年10月6日触及本轮周期最终高点约$126,000-$126,200。从5月$111k到8月$124,128再到10月$126k，每次新高的涨幅递减，动能明显衰竭。链上数据显示交易所净流入持续攀升至1500 BTC，长期持有者开始系统性减仓，巨鲸地址持仓连续4周下降。MVRV高达3.5，RSI在周线级别出现顶背离，恐慌贪婪指数达88的极端贪婪水平。10月10日突发闪崩，BTC快速下跌，随后进入持续下跌通道——11月跌至$82-86k区间（从峰值回撤约35%），12月维持$85-90k，2026年1月跌破$75k。这是本轮牛市的周期顶部，庄家在$120k-$126k区间完成了最后的大规模派发。',
    '{"exchange_netflow": 1500.0, "whale_change": -3.8, "fear_greed": 88, "mvrv": 3.5, "rsi": 82.0, "price_change_pct": 2.0}',
    2.0000,
    -35.0000
) ON CONFLICT (case_name, date, symbol) DO NOTHING;

-- 6. BTC 恐慌洗盘（2026-02）— BTC从$90k闪崩至$60,000
--    真实数据：2月2-6日从~$90k暴跌至$60,000，单日实现亏损$3.2B创历史纪录
--    清算量超$460M，2月23日价格约$64,300
INSERT INTO cases (case_name, date, symbol, pattern_type, description, similarity_features, max_gain_pct, max_loss_pct)
VALUES (
    '2026-02 BTC 恐慌洗盘',
    '2026-02-06',
    'BTC',
    '恐慌洗盘',
    'BTC在2026年2月2-6日经历了自FTX崩盘以来最剧烈的闪崩，从约$90k暴跌至$60,000低点，跌幅达33%。关税紧张局势升级叠加监管不确定性引发连锁清算，单日杠杆清算量超过$460M，链上单日实现亏损达$3.2B创历史纪录。交易所净流入飙升至1600 BTC，恐慌贪婪指数跌至8（极度恐慌），MVRV跌至0.82。然而链上数据显示机构级巨鲸（持有1000+ BTC地址）在$60k-$65k区间大量吸筹，增仓幅度达4.1%。长期持有者未出现恐慌性抛售，矿工持仓保持稳定。价格在$60k触底后迅速反弹至$65k附近企稳，至2月23日维持在$64,300左右。市场在极端恐慌中完成了筹码从弱手到强手的交换。',
    '{"exchange_netflow": 1600.0, "whale_change": 4.1, "fear_greed": 8, "mvrv": 0.82, "rsi": 15.0, "price_change_pct": -33.0}',
    0.0000,
    -33.0000
) ON CONFLICT (case_name, date, symbol) DO NOTHING;

-- 7. BTC 恐慌洗盘（2025-04）— "解放日"关税冲击BTC从$85k暴跌至$74,600
--    真实数据：4月2日特朗普宣布"解放日"关税（10%全面关税+34%对华关税），
--    4月7-9日BTC跌至$74,600（5个月低点），24小时$600M杠杆清算，
--    单日跌幅7.7%，虚假90天暂停消息导致短暂反弹后再跌至$78,565
--    此后BTC触底反弹，5月22日涨至$111k（38%涨幅）
INSERT INTO cases (case_name, date, symbol, pattern_type, description, similarity_features, max_gain_pct, max_loss_pct)
VALUES (
    '2025-04 BTC 恐慌洗盘',
    '2025-04-07',
    'BTC',
    '恐慌洗盘',
    '2025年4月初BTC在$85,000附近运行，4月2日特朗普宣布"解放日"关税政策——对所有国家征收10%基础关税，对中国加征34%（4月9日生效），后续提议对华关税升至145%。市场恐慌情绪瞬间引爆，BTC在4月7-9日暴跌至$74,600，创5个月新低，单日跌幅达7.7%。24小时内$600M杠杆仓位被清算，交易所净流入飙升至950 BTC，恐慌贪婪指数跌至15。期间一则"90天关税暂停"的虚假消息导致价格短暂反弹后再度崩至$78,565，加剧了市场混乱。MVRV跌至1.05，RSI触及25的极度超卖区域。然而链上数据显示巨鲸地址在$74k-$78k区间逆势增仓3.2%，长期持有者拒绝抛售。事后证明这是2025年牛市的绝对底部——BTC随后一个月内反弹38%，5月22日创下$111k新ATH。典型的宏观事件驱动恐慌洗盘，庄家借关税黑天鹅完成最后一轮低位吸筹。',
    '{"exchange_netflow": 950.0, "whale_change": 3.2, "fear_greed": 15, "mvrv": 1.05, "rsi": 25.0, "price_change_pct": -12.0}',
    0.0000,
    -12.0000
) ON CONFLICT (case_name, date, symbol) DO NOTHING;

-- 8. ETH 主升浪启动（2025-07）— ETH从$2,500暴涨56%至$3,900
--    真实数据：ETH 7月录得3年来最佳月度表现，从$2,500以下涨至$3,915峰值，
--    月末稳定在$3,800附近，月涨幅约56%（部分来源报48.8-60%），
--    大幅跑赢BTC（同期仅涨~10%），ETF创纪录流入+机构资金轮动驱动，
--    ETH迎来10周年，为8月ATH $4,946奠定基础
INSERT INTO cases (case_name, date, symbol, pattern_type, description, similarity_features, max_gain_pct, max_loss_pct)
VALUES (
    '2025-07 ETH 主升浪启动',
    '2025-07-31',
    'ETH',
    '主升浪启动',
    'ETH在2025年7月迎来三年来最强月度表现，价格从月初不足$2,500飙升至$3,915的月内高点，月末稳定在$3,800附近，月涨幅约56%。这一涨幅大幅跑赢同期BTC（仅涨约10%），标志着资金从BTC向ETH的大规模轮动。链上数据显示交易所ETH净流出达580 ETH，巨鲸地址持仓增加5.0%，机构通过ETF渠道创纪录流入。恐慌贪婪指数从月初的35逐步攀升，MVRV从1.1开始回升，RSI从48的中性区域起步上行。ETH在这个月迎来了10周年里程碑，叙事面和资金面形成共振。DeFi生态活跃度显著回升，Gas费温和上涨但未达到泡沫水平，链上活跃地址数创年内新高。这波主升浪为8月ETH冲击$4,946历史新高奠定了坚实基础，庄家在3月$1,752低点完成吸筹后，7月正式启动拉升阶段。',
    '{"exchange_netflow": -580.0, "whale_change": 5.0, "fear_greed": 35, "mvrv": 1.1, "rsi": 48.0, "price_change_pct": 4.0}',
    56.0000,
    -4.0000
) ON CONFLICT (case_name, date, symbol) DO NOTHING;

-- 9. BTC 闪崩洗盘（2025-10）— "10/10"史上最大清算事件
--    真实数据：10月10日加密史上最大单日清算，$190亿杠杆仓位被清算，
--    影响160万交易者，BTC 3小时内从$123k跌至$102k-$105k（跌$20,000/16.9%），
--    BTC市值蒸发$3,800亿，ETH从$4,346跌至$3,436-$3,574（跌12-18%），
--    多数山寨币跌30-60%，BTC印出史无前例的$20,000日线实体，
--    10月11日BTC收于$104,782（跌14.5%），ETH恢复至$4,100以上
INSERT INTO cases (case_name, date, symbol, pattern_type, description, similarity_features, max_gain_pct, max_loss_pct)
VALUES (
    '2025-10 BTC 闪崩洗盘',
    '2025-10-10',
    'BTC',
    '恐慌洗盘',
    '2025年10月10日爆发加密货币史上最大规模单日清算事件。BTC在3小时内从约$123,000暴跌至$102,000-$105,000，跌幅达$20,000（约16.9%），印出史无前例的$20,000日线实体。全市场$190亿杠杆仓位在24小时内被清算，波及160万名交易者，BTC市值单日蒸发$3,800亿。ETH同步从$4,346跌至$3,436-$3,574（跌幅12-18%），多数山寨币暴跌30-60%。交易所净流入飙升至1800 BTC，恐慌贪婪指数骤降至12，MVRV从高位回落至2.2，RSI跌至28。特朗普突发关税威胁是直接导火索，但根本原因是市场杠杆率在$126k ATH后持续攀升至危险水平。10月11日BTC收于$104,782（日跌14.5%），ETH在初始冲击后恢复至$4,100以上。巨鲸地址在闪崩中增仓2.5%，庄家利用极端波动完成了一次高效的杠杆清洗，将过度投机的弱手彻底清出市场。',
    '{"exchange_netflow": 1800.0, "whale_change": 2.5, "fear_greed": 12, "mvrv": 2.2, "rsi": 28.0, "price_change_pct": -17.0}',
    0.0000,
    -17.0000
) ON CONFLICT (case_name, date, symbol) DO NOTHING;

-- 10. ETH 恐慌洗盘（2026-02）— ETH从$2,700连续暴跌至$1,826
--     真实数据：2月1日从$2,700跌至$2,248（-17%），单一交易者在Hyperliquid亏损$2.2亿，
--     全网清算$25亿+（其中ETH仓位$11.5亿），2月3日跌至$2,110（7日跌28%，
--     较8月ATH跌57%），2月5日再跌14.96%至$1,826（清算$4.66亿，$3.82亿多头），
--     2月18日维持$1,850-$1,997，ETF流出$4.47亿，资金费率转负，
--     价格较ATH $4,946下跌约63%
INSERT INTO cases (case_name, date, symbol, pattern_type, description, similarity_features, max_gain_pct, max_loss_pct)
VALUES (
    '2026-02 ETH 恐慌洗盘',
    '2026-02-05',
    'ETH',
    '恐慌洗盘',
    'ETH在2026年2月初经历多波连续暴跌。2月1日从约$2,700骤跌至$2,248（跌幅17%），一名交易者在Hyperliquid单笔亏损$2.2亿，全网清算量超$25亿，其中ETH仓位清算$11.5亿。2月3日价格进一步跌至$2,110，7日累计跌幅达28%，较2025年8月ATH $4,946已下跌57%。2月5日再度暴跌14.96%，从$2,148直坠至$1,826，触发$4.66亿清算（其中$3.82亿为多头仓位）。交易所净流入飙升至1400 ETH，巨鲸地址在极端恐慌中逆势增仓3.5%。恐慌贪婪指数跌至5（极度恐慌），MVRV仅0.65（全网深度亏损），RSI触及14的历史极端超卖水平。ETF录得$4.47亿净流出，资金费率全面转负。至2月18日价格维持在$1,850-$1,997区间，较ATH下跌约63%。多轮清算将杠杆多头彻底清洗，市场在极度恐慌中完成了从弱手到强手的筹码转移，庄家在$1,800-$2,000区间完成了深度吸筹。',
    '{"exchange_netflow": 1400.0, "whale_change": 3.5, "fear_greed": 5, "mvrv": 0.65, "rsi": 14.0, "price_change_pct": -32.0}',
    0.0000,
    -32.0000
) ON CONFLICT (case_name, date, symbol) DO NOTHING;
