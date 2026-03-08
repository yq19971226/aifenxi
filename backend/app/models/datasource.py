"""多数据源管理框架 — Pydantic 数据模型。"""

from __future__ import annotations

from datetime import datetime
from enum import Enum

from pydantic import BaseModel, Field


# ── 枚举 ──────────────────────────────────────────────────────


class DataSourceStatus(str, Enum):
    """数据源状态枚举。"""

    ENABLED = "enabled"
    DISABLED = "disabled"
    ERROR = "error"
    STALE = "stale"


class DataSourceType(str, Enum):
    """数据源类型。"""

    WEBSOCKET = "websocket"
    REST = "rest"


class GroupType(str, Enum):
    """数据源组类型。"""

    PAID = "paid"
    FREE = "free"


# ── 数据源配置模型 ─────────────────────────────────────────────


class DataSourceInfo(BaseModel):
    """子数据源元信息。"""

    source_id: str = Field(description="唯一标识符，如 binance_futures")
    name: str = Field(description="显示名称，如 Binance Futures")
    source_type: DataSourceType
    base_url: str
    channels: list[str] = Field(default_factory=list, description="可订阅频道列表")
    auth_method: str = Field(default="none", description="认证方式: none/api_key/json_rpc")
    status: DataSourceStatus = DataSourceStatus.DISABLED
    weight: float = Field(default=0.0, description="信号完整度权重（仅 Combo 内交易所）")
    enabled: bool = Field(default=False, description="交易所级开关")


class DataSourceGroup(BaseModel):
    """数据源组。"""

    group_id: str = Field(description="组标识符: coinglass_source / exchange_direct_combo")
    name: str
    group_type: GroupType
    enabled: bool = Field(default=True, description="组合级开关")
    sources: list[DataSourceInfo] = Field(default_factory=list)


class OperationResult(BaseModel):
    """开关操作结果。"""

    success: bool
    message: str
    source_id: str | None = None
    completeness_score: float | None = None
    errors: list[str] = Field(default_factory=list)


# ── 标准化数据模型 ─────────────────────────────────────────────


class StandardTrade(BaseModel):
    """标准化成交模型。"""

    source_id: str
    symbol: str
    price: float
    quantity: float
    side: str  # "buy" | "sell"
    timestamp: datetime
    trade_id: str | None = None
    received_at: datetime = Field(default_factory=datetime.utcnow)


class StandardLiquidation(BaseModel):
    """标准化强平模型。"""

    source_id: str
    symbol: str
    side: str  # "long" | "short"
    price: float
    quantity: float
    usd_value: float
    timestamp: datetime
    received_at: datetime = Field(default_factory=datetime.utcnow)


class StandardTicker(BaseModel):
    """标准化行情模型。"""

    source_id: str
    symbol: str
    last_price: float
    mark_price: float | None = None
    index_price: float | None = None
    volume_24h: float
    open_interest: float | None = None
    funding_rate: float | None = None
    timestamp: datetime
    received_at: datetime = Field(default_factory=datetime.utcnow)


class StandardOrderBook(BaseModel):
    """标准化订单簿模型。"""

    source_id: str
    symbol: str
    bids: list[tuple[float, float]]  # [(price, qty), ...]
    asks: list[tuple[float, float]]
    timestamp: datetime
    received_at: datetime = Field(default_factory=datetime.utcnow)


class StandardFundingRate(BaseModel):
    """标准化资金费率模型。"""

    source_id: str
    symbol: str
    funding_rate: float
    predicted_rate: float | None = None
    next_funding_time: datetime | None = None
    timestamp: datetime
    received_at: datetime = Field(default_factory=datetime.utcnow)


class StandardOptionTicker(BaseModel):
    """标准化期权行情模型（Deribit 专用扩展）。"""

    source_id: str
    symbol: str
    underlying: str
    strike: float
    option_type: str  # "call" | "put"
    expiry: datetime
    mark_price: float
    delta: float | None = None
    gamma: float | None = None
    vega: float | None = None
    theta: float | None = None
    open_interest: float | None = None
    volume_24h: float | None = None
    timestamp: datetime
    received_at: datetime = Field(default_factory=datetime.utcnow)


# ── 标准化消息联合类型 ─────────────────────────────────────────

StandardMessage = (
    StandardTrade
    | StandardLiquidation
    | StandardTicker
    | StandardOrderBook
    | StandardFundingRate
    | StandardOptionTicker
)


# ── 健康监控模型 ───────────────────────────────────────────────


class HealthStatus(BaseModel):
    """单个数据源的健康状态。"""

    source_id: str
    connected: bool
    status: DataSourceStatus
    last_message_at: datetime | None = None
    message_rate: float = 0.0  # 条/秒
    reconnect_count: int = 0
    error_count: int = 0
    circuit_breaker_state: str = "closed"  # closed/open/half_open
    checked_at: datetime = Field(default_factory=datetime.utcnow)


class HealthSummary(BaseModel):
    """所有数据源的健康汇总。"""

    sources: dict[str, HealthStatus]
    overall_healthy: bool
    completeness_score: float
    checked_at: datetime = Field(default_factory=datetime.utcnow)


# ── API 响应模型 ───────────────────────────────────────────────


class ExchangeStatusItem(BaseModel):
    """单个交易所状态。"""

    source_id: str
    name: str
    enabled: bool
    status: DataSourceStatus
    weight: float


class PrimarySourceStatusItem(BaseModel):
    """单个一级数据源状态。"""

    source_id: str
    name: str
    domain: str
    owner: str
    enabled: bool
    status: DataSourceStatus
    ready_count: int = 0
    target_count: int = 0
    detail: str = ""


class DataSourceStatusSnapshot(BaseModel):
    """前端状态查询 API 响应模型。"""

    combo_enabled: bool
    exchanges: list[ExchangeStatusItem]
    completeness_score: float
    primary_sources: list[PrimarySourceStatusItem] = Field(default_factory=list)
    domain_completeness: float = 0.0
    missing_domains: list[str] = Field(default_factory=list)
    coinglass_enabled: bool
    coinglass_tier: str
    coingecko_enabled: bool = False
    coingecko_tier: str = "demo"


class DataSourceDetailResponse(BaseModel):
    """数据源详情响应（管理员）。"""

    source_id: str
    name: str
    source_type: DataSourceType
    base_url: str
    channels: list[str]
    subscribed_channels: list[str]
    auth_method: str
    status: DataSourceStatus
    health: HealthStatus | None = None


# ── 智能体数据上下文 ───────────────────────────────────────────


class AnalysisContext(BaseModel):
    """传递给智能体的数据上下文，包含数据完整度信息。"""

    data_completeness: float = Field(default=1.0, ge=0.0, le=1.0)
    missing_sources: list[str] = Field(default_factory=list)
    completeness_warning: str | None = None
