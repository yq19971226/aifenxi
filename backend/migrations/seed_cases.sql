-- 历史案例库种子数据 — 10个典型加密货币操盘案例
-- 执行方式: psql -d omnimind -f seed_cases.sql

-- 1. 2021-05 BTC 假突破诱多 — $64k假突破后暴跌至$30k
INSERT INTO cases (case_name, date, symbol, pattern_type, description, similarity_features, max_gain_pct, max_loss_pct)
VALUES (
    '2021-05 BTC 假突破诱多',
    '2021-05-10',
    'BTC',
    '假突破诱多',
    'BTC在2021年5月触及$64k后出现假突破，成交量未能有效放大，链上数据显示巨鲸未跟进增仓，交易所净流入激增。随后价格急速回落至$30k，大量追多散户被套。',
    '{"exchange_netflow": 850.0, "whale_change": -1.8, "fear_greed": 73, "mvrv": 3.2, "rsi": 72.5, "price_change_pct": 5.8}',
    8.5000,
    -53.0000
);

-- 2. 2022-06 BTC 恐慌洗盘 — Luna崩盘引发恐慌，BTC跌至$17.6k
INSERT INTO cases (case_name, date, symbol, pattern_type, description, similarity_features, max_gain_pct, max_loss_pct)
VALUES (
    '2022-06 BTC 恐慌洗盘',
    '2022-06-18',
    'BTC',
    '恐慌洗盘',
    'Luna/UST崩盘引发市场恐慌，BTC从$30k跌至$17.6k。交易所流入激增，恐慌贪婪指数跌至6，但链上数据显示巨鲸在低位大量吸筹，MVRV跌破1表明市场严重低估。',
    '{"exchange_netflow": 1200.0, "whale_change": 4.5, "fear_greed": 6, "mvrv": 0.85, "rsi": 18.5, "price_change_pct": -35.2}',
    0.0000,
    -41.0000
);

-- 3. 2023-01 BTC 主升浪启动 — BTC从$16k反弹至$25k
INSERT INTO cases (case_name, date, symbol, pattern_type, description, similarity_features, max_gain_pct, max_loss_pct)
VALUES (
    '2023-01 BTC 主升浪启动',
    '2023-01-10',
    'BTC',
    '主升浪启动',
    'BTC在$16k底部盘整数月后启动主升浪。交易所余额持续下降，巨鲸连续3周增仓，MVRV从0.9回升至1.5，市场情绪从极度恐慌转为谨慎乐观。价格在2个月内上涨至$25k。',
    '{"exchange_netflow": -680.0, "whale_change": 3.8, "fear_greed": 28, "mvrv": 1.1, "rsi": 45.0, "price_change_pct": 2.5}',
    56.0000,
    -5.0000
);

-- 4. 2021-11 BTC 顶部派发 — BTC $69k历史顶部
INSERT INTO cases (case_name, date, symbol, pattern_type, description, similarity_features, max_gain_pct, max_loss_pct)
VALUES (
    '2021-11 BTC 顶部派发',
    '2021-11-10',
    'BTC',
    '顶部派发',
    'BTC触及$69k历史新高，但链上数据显示交易所流入激增，巨鲸持仓连续下降，MVRV达到3.8的极端水平，恐慌贪婪指数高达84。典型的顶部派发特征，随后进入长达一年的熊市。',
    '{"exchange_netflow": 1500.0, "whale_change": -3.2, "fear_greed": 84, "mvrv": 3.8, "rsi": 78.0, "price_change_pct": 12.5}',
    3.0000,
    -77.0000
);

-- 5. 2024-03 BTC 假突破诱多 — BTC $73k假突破
INSERT INTO cases (case_name, date, symbol, pattern_type, description, similarity_features, max_gain_pct, max_loss_pct)
VALUES (
    '2024-03 BTC 假突破诱多',
    '2024-03-14',
    'BTC',
    '假突破诱多',
    'BTC在ETF资金推动下突破$73k创新高，但链上显示矿工和早期持有者大量转入交易所，巨鲸增仓放缓。RSI超买严重，随后回调至$60k区间震荡。',
    '{"exchange_netflow": 620.0, "whale_change": -0.5, "fear_greed": 82, "mvrv": 2.8, "rsi": 76.0, "price_change_pct": 8.2}',
    5.0000,
    -18.0000
);

-- 6. 2022-11 ETH 恐慌洗盘 — FTX崩盘引发恐慌，ETH跌至$1k
INSERT INTO cases (case_name, date, symbol, pattern_type, description, similarity_features, max_gain_pct, max_loss_pct)
VALUES (
    '2022-11 ETH 恐慌洗盘',
    '2022-11-09',
    'ETH',
    '恐慌洗盘',
    'FTX交易所崩盘引发全市场恐慌，ETH从$1.6k急跌至$1k附近。交易所流入创历史新高，恐慌贪婪指数跌至10。但DeFi巨鲸逆势增仓，链上活跃地址数未大幅下降，显示核心用户信心仍在。',
    '{"exchange_netflow": 980.0, "whale_change": 3.2, "fear_greed": 10, "mvrv": 0.75, "rsi": 22.0, "price_change_pct": -28.5}',
    0.0000,
    -37.0000
);

-- 7. 2023-10 BTC 主升浪启动 — ETF预期推动BTC上涨
INSERT INTO cases (case_name, date, symbol, pattern_type, description, similarity_features, max_gain_pct, max_loss_pct)
VALUES (
    '2023-10 BTC 主升浪启动',
    '2023-10-15',
    'BTC',
    '主升浪启动',
    'BTC ETF获批预期升温，交易所BTC余额降至5年新低，巨鲸持续增仓超过4周。MVRV从1.2回升至1.8，市场情绪从中性转为乐观。价格从$27k启动，3个月内突破$45k。',
    '{"exchange_netflow": -920.0, "whale_change": 5.2, "fear_greed": 52, "mvrv": 1.3, "rsi": 55.0, "price_change_pct": 5.0}',
    85.0000,
    -8.0000
);

-- 8. 2021-05 ETH 顶部派发 — ETH $4.3k顶部
INSERT INTO cases (case_name, date, symbol, pattern_type, description, similarity_features, max_gain_pct, max_loss_pct)
VALUES (
    '2021-05 ETH 顶部派发',
    '2021-05-12',
    'ETH',
    '顶部派发',
    'ETH在DeFi Summer余热中触及$4.3k，但Gas费飙升导致链上活动下降。交易所ETH流入激增，DeFi协议TVL开始下降，巨鲸持仓减少。MVRV达到3.5，随后ETH跌至$1.7k。',
    '{"exchange_netflow": 1100.0, "whale_change": -2.8, "fear_greed": 78, "mvrv": 3.5, "rsi": 75.0, "price_change_pct": 15.0}',
    5.0000,
    -60.0000
);

-- 9. 2024-01 BTC 恐慌洗盘 — ETF获批后"卖事实"回调
INSERT INTO cases (case_name, date, symbol, pattern_type, description, similarity_features, max_gain_pct, max_loss_pct)
VALUES (
    '2024-01 BTC 恐慌洗盘',
    '2024-01-12',
    'BTC',
    '恐慌洗盘',
    'BTC ETF正式获批后出现经典"买预期卖事实"行情，价格从$49k回调至$38k。灰度GBTC大量赎回导致交易所流入激增，短期恐慌蔓延。但新ETF持续净流入，巨鲸在$40k下方积极吸筹。',
    '{"exchange_netflow": 550.0, "whale_change": 2.8, "fear_greed": 35, "mvrv": 1.6, "rsi": 32.0, "price_change_pct": -15.8}',
    0.0000,
    -22.0000
);

-- 10. 2023-07 ETH 主升浪启动 — ETH从$1.6k复苏
INSERT INTO cases (case_name, date, symbol, pattern_type, description, similarity_features, max_gain_pct, max_loss_pct)
VALUES (
    '2023-07 ETH 主升浪启动',
    '2023-07-10',
    'ETH',
    '主升浪启动',
    'ETH在$1.6k附近完成底部构筑，质押量持续增长导致流通供应减少。交易所ETH余额降至多年新低，巨鲸地址数量增加。MVRV从0.95回升至1.3，链上活跃度回暖，DeFi TVL企稳回升。',
    '{"exchange_netflow": -450.0, "whale_change": 2.5, "fear_greed": 42, "mvrv": 1.05, "rsi": 48.0, "price_change_pct": 3.2}',
    50.0000,
    -6.0000
);
