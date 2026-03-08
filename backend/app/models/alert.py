"""预警规则数据模型。"""

from datetime import datetime
from enum import Enum
from uuid import UUID

from pydantic import BaseModel, Field, field_validator


class MetricType(str, Enum):
    """预警支持的指标类型。"""

    PRICE = "price"
    RSI = "rsi"
    MACD = "macd"
    EMA = "ema"
    BB_UPPER = "bb_upper"
    BB_LOWER = "bb_lower"
    EXCHANGE_NETFLOW = "exchange_netflow"
    WHALE_CHANGE_24H = "whale_change_24h"
    FEAR_GREED_INDEX = "fear_greed_index"
    MVRV = "mvrv"
    FUNDING_RATE = "funding_rate"


class Operator(str, Enum):
    """预警支持的比较运算符。"""

    GT = "gt"
    LT = "lt"
    GTE = "gte"
    LTE = "lte"
    CROSS_ABOVE = "cross_above"
    CROSS_BELOW = "cross_below"


class LogicGroup(str, Enum):
    """条件组合逻辑。"""

    AND = "and"
    OR = "or"


class Condition(BaseModel):
    """单个预警条件。"""

    metric: MetricType
    operator: Operator
    threshold: float


class ConditionExpression(BaseModel):
    """支持最多2层嵌套的条件组合。"""

    logic: LogicGroup = LogicGroup.AND
    conditions: list[Condition] = Field(min_length=1, max_length=10)
    sub_groups: list["ConditionExpression"] = Field(default=[], max_length=2)

    @field_validator("sub_groups")
    @classmethod
    def limit_nesting(cls, v: list["ConditionExpression"]) -> list["ConditionExpression"]:
        """校验子组不能再包含子组，确保最多2层嵌套。"""
        for sg in v:
            if sg.sub_groups:
                raise ValueError("条件组合最多支持2层嵌套")
        return v


class AlertRuleCreate(BaseModel):
    """创建预警规则的请求模型。"""

    name: str = Field(max_length=100)
    symbol: str = Field(max_length=20)
    expression: ConditionExpression
    notify_channels: list[str] = Field(default=["websocket"])


class AlertRuleUpdate(BaseModel):
    """修改预警规则的请求模型。"""

    name: str | None = Field(default=None, max_length=100)
    expression: ConditionExpression | None = None
    enabled: bool | None = None
    notify_channels: list[str] | None = None


class AlertRuleResponse(BaseModel):
    """预警规则响应模型。"""

    id: UUID
    name: str
    symbol: str
    expression: ConditionExpression
    enabled: bool
    notify_channels: list[str]
    last_triggered_at: datetime | None
    created_at: datetime


class AlertTriggerResponse(BaseModel):
    """预警触发记录响应模型。"""

    id: UUID
    rule_id: UUID
    rule_name: str
    triggered_value: float
    metric_type: str
    notify_channel: str
    notify_status: str
    triggered_at: datetime
