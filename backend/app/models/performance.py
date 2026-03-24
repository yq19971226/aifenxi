"""策略绩效追踪数据模型。"""

from datetime import datetime
from enum import Enum
from uuid import UUID

from pydantic import BaseModel


class SettlementStatus(str, Enum):
    """策略结算状态。"""

    PENDING = "pending"
    HIT_STOP_LOSS = "hit_stop_loss"
    HIT_TARGET = "hit_target"
    TIMEOUT = "timeout"


class StrategyDirection(str, Enum):
    """策略方向。"""

    LONG = "long"
    SHORT = "short"
    NEUTRAL = "neutral"


class StrategySnapshotCreate(BaseModel):
    """创建策略快照的请求模型。"""

    strategy_id: UUID
    symbol: str
    direction: StrategyDirection
    entry_low: float
    entry_high: float
    stop_loss: float
    targets: list[float]
    confidence: float
    price_at_generation: float
    user_id: UUID | None = None
    analysis_mode: str | None = None


class PerfCheckpoint(BaseModel):
    """策略生成后的定时价格记录点。"""

    snapshot_id: UUID
    checkpoint_hours: int
    actual_price: float
    recorded_at: datetime


class SettlementResult(BaseModel):
    """策略结算结果。"""

    snapshot_id: UUID
    status: SettlementStatus
    settlement_price: float
    settlement_time: datetime
    pnl_pct: float


class PerformanceStats(BaseModel):
    """绩效统计汇总。"""

    total_strategies: int
    settled_count: int
    win_rate: float
    avg_profit_pct: float
    avg_loss_pct: float
    profit_loss_ratio: float
    sharpe_ratio: float = 0.0
    by_agent: dict[str, float]
