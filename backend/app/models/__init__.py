# Data models
# Import ORM models so Base.metadata registers all tables for Alembic
from app.models.db import (  # noqa: F401
    AgentReport,
    Case,
    ConsensusReport,
    Indicator,
    Kline,
    Membership,
    OnchainSnapshotRow,
    Payment,
    PushSetting,
    Strategy,
    User,
)
