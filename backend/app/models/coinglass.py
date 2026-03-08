"""CoinGlass 数据采集层 Pydantic 数据模型。

定义 OI、Taker Volume、爆仓热力图、点杀预警、套餐管理等业务数据模型。
所有模型使用完整类型注解，禁止裸字典传递业务数据。
"""

from datetime import datetime
from enum import Enum
from typing import Dict, List, Optional

from pydantic import BaseModel, Field


# ============================================================
# 套餐管理
# ============================================================


class CoinGlassTier(str, Enum):
    """CoinGlass API 四级订阅等级。"""

    HOBBYIST = "hobbyist"
    STARTUP = "startup"
    STANDARD = "standard"
    PROFESSIONAL = "professional"


class TierCapabilities(BaseModel):
    """套餐能力矩阵，描述当前套餐的限频、覆盖范围和功能开关。"""

    tier: CoinGlassTier
    rate_limit_per_minute: int
    collect_interval_seconds: int
    max_symbols: int
    history_depth_days: int
    features: Dict[str, bool]
    websocket_enabled: bool


# ============================================================
# OI（持仓量）相关
# ============================================================


class OISnapshot(BaseModel):
    """OI 快照 — 对应 TimescaleDB oi_snapshots 表。"""

    ts: datetime
    symbol: str
    exchange: Optional[str] = None
    open_interest: float
    oi_change_1h: Optional[float] = None
    oi_change_4h: Optional[float] = None
    oi_change_24h: Optional[float] = None
    source: str = "coinglass"


class OISurgeEvent(BaseModel):
    """OI 突增事件 — 5 分钟窗口内 OI 增幅超阈值时生成。"""

    symbol: str
    ts: datetime
    oi_before: float
    oi_after: float
    change_pct: float
    window_minutes: int = 5


class OIExchangeData(BaseModel):
    """单个交易所的 OI 分布数据。"""

    exchange: str
    open_interest: float
    oi_change_pct: Optional[float] = None


# ============================================================
# Taker Volume（主动买卖量）相关
# ============================================================


class TakerVolumeSnapshot(BaseModel):
    """Taker Volume 快照 — 对应 TimescaleDB taker_volume_snapshots 表。"""

    ts: datetime
    symbol: str
    buy_volume: float
    sell_volume: float
    buy_sell_ratio: Optional[float] = None
    source: str = "coinglass"


class TakerImbalanceEvent(BaseModel):
    """Taker 方向性失衡事件 — Buy/Sell Ratio 偏离 1.0 超阈值时生成。"""

    symbol: str
    ts: datetime
    buy_volume: float
    sell_volume: float
    ratio: float
    threshold: float


# ============================================================
# 爆仓热力图相关
# ============================================================


class LiquidationZone(BaseModel):
    """爆仓密集区 — 对应 TimescaleDB liquidation_heatmap 表。"""

    ts: datetime
    symbol: str
    price_low: float
    price_high: float
    estimated_liq_usd: float
    model: str
    side: Optional[str] = None


class BasicLiquidationData(BaseModel):
    """Hobbyist 套餐基础爆仓数据（24h 爆仓总量、分多空）。"""

    symbol: str
    ts: datetime
    total_liq_usd: float
    long_liq_usd: float
    short_liq_usd: float


class LiquidationRecord(BaseModel):
    """爆仓订单明细记录。"""

    symbol: str
    ts: datetime
    exchange: str
    side: str
    price: float
    quantity: float
    usd_value: float


# ============================================================
# 净持仓与多空比
# ============================================================


class NetPositionSnapshot(BaseModel):
    """净持仓快照 — 主力方向核心指标。"""

    symbol: str
    ts: datetime
    net_position: float
    long_position: float
    short_position: float


class TopLongShortRatio(BaseModel):
    """大户多空比数据（账户或持仓维度）。"""

    symbol: str
    ts: datetime
    exchange: str
    long_account: float
    short_account: float
    long_short_ratio: float
    data_type: str  # "account" or "position"


# ============================================================
# 加权资金费率
# ============================================================


class WeightedFundingRate(BaseModel):
    """持仓加权 / 成交量加权资金费率。"""

    symbol: str
    ts: datetime
    oi_weighted_rate: Optional[float] = None
    vol_weighted_rate: Optional[float] = None


# ============================================================
# 点杀预警
# ============================================================


class KillZoneAlert(BaseModel):
    """点杀预警记录 — 对应 TimescaleDB kill_zone_alerts 表。"""

    ts: datetime
    symbol: str
    direction: str  # "long_kill" or "short_kill"
    risk_score: float = Field(ge=0, le=100)
    version: str  # "basic", "enhanced", "full"
    oi_change_pct: Optional[float] = None
    taker_ratio: Optional[float] = None
    ls_ratio: Optional[float] = None
    nearest_liq_usd: Optional[float] = None
    details: Optional[dict] = None


# ============================================================
# 资金费率历史
# ============================================================


class FundingRateSnapshot(BaseModel):
    """资金费率 OHLC 快照。"""

    ts: datetime
    symbol: str
    exchange: Optional[str] = None
    open: Optional[float] = None
    high: Optional[float] = None
    low: Optional[float] = None
    close: Optional[float] = None
    source: str = "coinglass"


class FundingRateExchangeData(BaseModel):
    """单交易所资金费率数据。"""

    exchange: str
    symbol: str
    funding_rate: float
    next_funding_time: Optional[datetime] = None


# ============================================================
# CVD（累计成交量差）
# ============================================================


class CVDSnapshot(BaseModel):
    """Cumulative Volume Delta 快照。"""

    ts: datetime
    symbol: str
    cvd: float
    buy_volume: Optional[float] = None
    sell_volume: Optional[float] = None
    source: str = "coinglass"


# ============================================================
# 订单簿
# ============================================================


class OrderBookLevel(BaseModel):
    """订单簿 Bid/Ask 某一档位数据。"""

    ts: datetime
    symbol: str
    exchange: Optional[str] = None
    bid_amount: float
    ask_amount: float
    bid_ask_ratio: Optional[float] = None
    range_pct: Optional[float] = None
    source: str = "coinglass"


class LargeOrder(BaseModel):
    """大单挂单记录。"""

    ts: datetime
    symbol: str
    exchange: str
    side: str  # "bid" or "ask"
    price: float
    amount: float
    usd_value: Optional[float] = None


# ============================================================
# 期货净流入/流出
# ============================================================


class NetFlowSnapshot(BaseModel):
    """期货资金净流入/流出快照。"""

    ts: datetime
    symbol: str
    net_flow: float
    inflow: Optional[float] = None
    outflow: Optional[float] = None
    source: str = "coinglass"


# ============================================================
# 期权
# ============================================================


class OptionMaxPain(BaseModel):
    """期权最大痛点数据。"""

    symbol: str
    ts: datetime
    max_pain_price: float
    call_oi: Optional[float] = None
    put_oi: Optional[float] = None


class OptionInfo(BaseModel):
    """期权概览信息。"""

    symbol: str
    ts: datetime
    total_oi: Optional[float] = None
    total_volume: Optional[float] = None
    put_call_ratio: Optional[float] = None


# ============================================================
# 爆仓辅助数据
# ============================================================


class LiquidationExchangeData(BaseModel):
    """爆仓分交易所数据。"""

    exchange: str
    total_liq_usd: float
    long_liq_usd: Optional[float] = None
    short_liq_usd: Optional[float] = None


class LiquidationCoinData(BaseModel):
    """爆仓分币种数据。"""

    symbol: str
    total_liq_usd: float
    long_liq_usd: Optional[float] = None
    short_liq_usd: Optional[float] = None
