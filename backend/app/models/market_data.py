from datetime import datetime
from typing import Optional
from pydantic import BaseModel, field_validator

from app.models.coingecko import CoinGeckoData


class KlineData(BaseModel):
    symbol: str
    interval: str
    open_time: datetime
    open: float
    high: float
    low: float
    close: float
    volume: float
    close_time: datetime
    is_closed: bool

    @field_validator("open", "high", "low", "close", "volume", mode="before")
    @classmethod
    def coerce_float(cls, v: object) -> float:
        return float(v)


class IndicatorResult(BaseModel):
    symbol: str
    interval: str
    time: datetime
    ema7: Optional[float] = None
    ema25: Optional[float] = None
    ema99: Optional[float] = None
    rsi: Optional[float] = None
    macd: Optional[float] = None
    macd_signal: Optional[float] = None
    macd_histogram: Optional[float] = None
    bb_upper: Optional[float] = None
    bb_middle: Optional[float] = None
    bb_lower: Optional[float] = None
    support_levels: list[float] = []
    resistance_levels: list[float] = []
    atr: float | None = None
    obv: Optional[float] = None
    vwap: Optional[float] = None
    volume_ratio: Optional[float] = None
    volume_price_divergence: Optional[str] = None  # "bullish_divergence" | "bearish_divergence" | "none"


class OnchainSnapshot(BaseModel):
    """链上数据快照 — 对应 TimescaleDB onchain_snapshots 表。

    基础字段由 CryptoQuant / Alternative.me 提供，
    T3 扩展字段由 Glassnode Professional 提供。
    """

    time: datetime
    symbol: str
    # ── 基础字段 ──
    exchange_netflow: Optional[float] = None
    whale_change_24h: Optional[float] = None
    fear_greed_index: Optional[int] = None
    mvrv: Optional[float] = None
    active_addresses: Optional[int] = None
    new_addresses: Optional[int] = None
    exchange_balance: Optional[float] = None
    large_tx_count: Optional[int] = None
    large_tx_volume: Optional[float] = None
    miner_reserve_change: Optional[float] = None

    # ── Glassnode T3 扩展字段 ──
    nupl: Optional[float] = None                    # 净未实现盈亏（周期判断核心）
    sopr: Optional[float] = None                    # 已实现盈亏比（短线顶底）
    asopr: Optional[float] = None                   # 调整版 SOPR
    lth_sopr: Optional[float] = None                # 长期持有者 SOPR
    sth_sopr: Optional[float] = None                # 短期持有者 SOPR
    lth_nupl: Optional[float] = None                # 长期持有者 NUPL
    sth_nupl: Optional[float] = None                # 短期持有者 NUPL
    puell_multiple: Optional[float] = None           # 矿工收入估值
    reserve_risk: Optional[float] = None             # 持有者信心/价格比
    accumulation_score: Optional[float] = None       # 积累趋势评分 (T3独占)
    hodler_net_change: Optional[float] = None        # HODLer 净仓位变化
    net_realized_pl: Optional[float] = None          # 净已实现盈亏
    ssr: Optional[float] = None                      # 稳定币供应比
    addresses_in_profit_pct: Optional[float] = None  # 盈利地址占比
    hash_ribbon: Optional[float] = None              # 矿工投降/复苏信号 (T3独占)
    mvrv_entity_adj: Optional[float] = None          # Entity-Adjusted MVRV (T3独占)
    nvt_signal: Optional[float] = None               # NVT Signal 改进版
    liveliness: Optional[float] = None               # 持有 vs 消费倾向
    rhodl_ratio: Optional[float] = None              # RHODL 长短期比 (T3独占)
    exchange_inflow: Optional[float] = None          # 交易所流入总量


class DerivativesData(BaseModel):
    """合约数据摘要 — 嵌入 MarketData。"""

    funding_rate: Optional[float] = None
    predicted_funding_rate: Optional[float] = None
    long_short_ratio: Optional[float] = None
    top_long_short_ratio: Optional[float] = None
    liquidation_1h_usd: Optional[float] = None
    liquidation_1h_long_pct: Optional[float] = None


class DerivativesSnapshot(BaseModel):
    """合约数据快照。"""

    time: datetime
    symbol: str
    funding_rate: Optional[float] = None
    predicted_funding_rate: Optional[float] = None
    long_short_account_ratio: Optional[float] = None
    long_short_position_ratio: Optional[float] = None
    top_long_short_account_ratio: Optional[float] = None
    top_long_short_position_ratio: Optional[float] = None


class LiquidationEvent(BaseModel):
    """爆仓事件。"""

    time: datetime
    symbol: str
    side: str  # "LONG" | "SHORT"
    quantity: float
    price: float
    usd_value: float


class CoinGlassData(BaseModel):
    """CoinGlass 衍生品丰富数据 — 注入智能体 prompt 的聚合视图。"""

    # OI（持仓量）
    oi_snapshots: list[dict] = []          # cg_oi:{symbol}
    # 稳定币保证金 OI
    stablecoin_margin_oi_snapshots: list[dict] = []  # cg_oi_stablecoin:{symbol}
    # 币本位保证金 OI
    coin_margin_oi_snapshots: list[dict] = []        # cg_oi_coin:{symbol}
    # CVD（累计成交量差）
    cvd_snapshots: list[dict] = []         # cg_cvd:{symbol}
    # 期货净流入/流出
    netflow_snapshots: list[dict] = []     # cg_netflow:{symbol}
    # 聚合订单簿
    orderbook_levels: list[dict] = []      # cg_orderbook:{symbol}
    # 大单挂单
    large_orders: list[dict] = []          # cg_large_orders:{symbol}
    # 资金费率历史
    funding_rate_history: list[dict] = []  # cg_fr:{symbol}
    # 期权 Max Pain
    option_max_pain: Optional[dict] = None # cg_option_maxpain:{symbol}
    # 期权概览
    option_info: Optional[dict] = None     # cg_option_info:{symbol}
    # 爆仓基础数据
    liquidation: Optional[dict] = None     # cg_liquidation:{symbol}


class MarketData(BaseModel):
    symbol: str
    current_price: float
    klines_5m: list[KlineData] = []
    klines_15m: list[KlineData] = []
    klines_30m: list[KlineData] = []
    klines_1h: list[KlineData] = []
    klines_4h: list[KlineData] = []
    klines_1d: list[KlineData] = []
    klines_1w: list[KlineData] = []
    indicators: Optional[IndicatorResult] = None
    onchain: Optional[OnchainSnapshot] = None
    derivatives: Optional[DerivativesData] = None
    coinglass: Optional[CoinGlassData] = None
    coingecko: Optional[CoinGeckoData] = None
    locale: str = "zh-CN"
