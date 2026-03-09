"""SQLAlchemy ORM models — mirrors init.sql schema for Alembic tracking.

TimescaleDB hypertable creation is handled in init.sql (not via Alembic),
because SQLAlchemy has no native hypertable support.  These ORM definitions
let Alembic detect column-level changes and generate migrations for the
relational (PostgreSQL) tables.
"""

from __future__ import annotations

import uuid
from datetime import date, datetime

from sqlalchemy import (
    JSON,
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    Uuid,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


# ============================================================
# TimescaleDB 时序表 (hypertable creation in init.sql)
# ============================================================


class Kline(Base):
    __tablename__ = "klines"

    time: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), primary_key=True, nullable=False
    )
    symbol: Mapped[str] = mapped_column(
        String(20), primary_key=True, nullable=False
    )
    interval: Mapped[str] = mapped_column(
        String(5), primary_key=True, nullable=False
    )
    open: Mapped[float] = mapped_column(Numeric(20, 8), nullable=False)
    high: Mapped[float] = mapped_column(Numeric(20, 8), nullable=False)
    low: Mapped[float] = mapped_column(Numeric(20, 8), nullable=False)
    close: Mapped[float] = mapped_column(Numeric(20, 8), nullable=False)
    volume: Mapped[float] = mapped_column(Numeric(30, 8), nullable=False)

    __table_args__ = (
        Index("idx_klines_symbol_interval", "symbol", "interval", time.desc()),
    )


class Indicator(Base):
    __tablename__ = "indicators"

    time: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), primary_key=True, nullable=False
    )
    symbol: Mapped[str] = mapped_column(
        String(20), primary_key=True, nullable=False
    )
    interval: Mapped[str] = mapped_column(
        String(5), primary_key=True, nullable=False
    )
    ema7: Mapped[float | None] = mapped_column(Numeric(20, 8))
    ema25: Mapped[float | None] = mapped_column(Numeric(20, 8))
    ema99: Mapped[float | None] = mapped_column(Numeric(20, 8))
    rsi: Mapped[float | None] = mapped_column(Numeric(8, 4))
    macd: Mapped[float | None] = mapped_column(Numeric(20, 8))
    macd_signal: Mapped[float | None] = mapped_column(Numeric(20, 8))
    macd_histogram: Mapped[float | None] = mapped_column(Numeric(20, 8))
    bb_upper: Mapped[float | None] = mapped_column(Numeric(20, 8))
    bb_middle: Mapped[float | None] = mapped_column(Numeric(20, 8))
    bb_lower: Mapped[float | None] = mapped_column(Numeric(20, 8))

    __table_args__ = (
        Index("idx_indicators_symbol_interval", "symbol", "interval", time.desc()),
    )


class OnchainSnapshotRow(Base):
    __tablename__ = "onchain_snapshots"

    time: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), primary_key=True, nullable=False
    )
    symbol: Mapped[str] = mapped_column(
        String(20), primary_key=True, nullable=False
    )
    exchange_netflow: Mapped[float | None] = mapped_column(Numeric(20, 4))
    whale_change_24h: Mapped[float | None] = mapped_column(Numeric(8, 4))
    fear_greed_index: Mapped[int | None] = mapped_column(Integer)
    mvrv: Mapped[float | None] = mapped_column(Numeric(8, 4))

    __table_args__ = (
        Index("idx_onchain_symbol", "symbol", time.desc()),
    )


# ============================================================
# PostgreSQL 业务表
# ============================================================


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    )
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[str] = mapped_column(
        String(20), server_default=text("'user'"), nullable=False
    )
    is_active: Mapped[bool] = mapped_column(Boolean, server_default=text("true"))
    is_admin: Mapped[bool] = mapped_column(Boolean, server_default=text("false"))
    referral_code: Mapped[str | None] = mapped_column(
        String(20), unique=True, nullable=True
    )
    referred_by: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(), ForeignKey("users.id"), nullable=True
    )
    referred_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=text("NOW()")
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=text("NOW()")
    )

    membership: Mapped[Membership | None] = relationship(
        back_populates="user", uselist=False, cascade="all, delete-orphan"
    )
    push_setting: Mapped[PushSetting | None] = relationship(
        back_populates="user", uselist=False, cascade="all, delete-orphan"
    )
    partner_wallet: Mapped[PartnerWallet | None] = relationship(
        back_populates="user", uselist=False, cascade="all, delete-orphan"
    )

    __table_args__ = (
        Index("idx_users_email", "email"),
        Index("idx_users_referral_code", "referral_code"),
        Index("idx_users_role", "role"),
    )


class Membership(Base):
    __tablename__ = "memberships"

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(),
        ForeignKey("users.id", ondelete="CASCADE"),
        unique=True,
        nullable=False,
    )
    level: Mapped[int] = mapped_column(Integer, server_default=text("0"))
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    query_count_today: Mapped[int] = mapped_column(Integer, server_default=text("0"))
    query_reset_at: Mapped[date] = mapped_column(
        Date, server_default=text("CURRENT_DATE")
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=text("NOW()")
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=text("NOW()")
    )

    user: Mapped[User] = relationship(back_populates="membership")

    __table_args__ = (Index("idx_memberships_user_id", "user_id"),)


class Payment(Base):
    __tablename__ = "payments"

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    )
    payment_id: Mapped[str] = mapped_column(
        String(100), unique=True, nullable=False
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(), ForeignKey("users.id"), nullable=False
    )
    plan: Mapped[int] = mapped_column(Integer, nullable=False)
    amount_usd: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False)
    duration_months: Mapped[int] = mapped_column(
        Integer, server_default=text("1"), nullable=False
    )
    network: Mapped[str | None] = mapped_column(String(20))
    pay_address: Mapped[str | None] = mapped_column(Text)
    pay_amount: Mapped[float | None] = mapped_column(Numeric(24, 8))
    pay_currency: Mapped[str | None] = mapped_column(String(30))
    status: Mapped[str] = mapped_column(
        String(20), server_default=text("'pending'")
    )
    provider_status: Mapped[str | None] = mapped_column(String(40))
    status_reason: Mapped[str | None] = mapped_column(String(40))
    provider_payload_json: Mapped[str | None] = mapped_column(Text)
    provider_observed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    provider_observation_source: Mapped[str | None] = mapped_column(String(20))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=text("NOW()")
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=text("NOW()")
    )

    __table_args__ = (
        Index("idx_payments_user_id", "user_id"),
        Index("idx_payments_payment_id", "payment_id"),
        Index("idx_payments_status", "status"),
    )


class AgentReport(Base):
    __tablename__ = "agent_reports"

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    )
    agent_id: Mapped[str] = mapped_column(String(50), nullable=False)
    symbol: Mapped[str] = mapped_column(String(20), nullable=False)
    signal: Mapped[str] = mapped_column(String(20), nullable=False)
    confidence: Mapped[float | None] = mapped_column(Numeric(4, 3))
    reasoning: Mapped[str | None] = mapped_column(Text)
    findings: Mapped[dict | None] = mapped_column(JSON)
    raw_data: Mapped[dict | None] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=text("NOW()")
    )

    __table_args__ = (
        Index("idx_agent_reports_symbol", "symbol", created_at.desc()),
        Index("idx_agent_reports_agent_id", "agent_id", created_at.desc()),
    )


class Strategy(Base):
    __tablename__ = "strategies"

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    )
    symbol: Mapped[str] = mapped_column(String(20), nullable=False)
    direction: Mapped[str] = mapped_column(String(20), nullable=False)
    entry_low: Mapped[float | None] = mapped_column(Numeric(20, 8))
    entry_high: Mapped[float | None] = mapped_column(Numeric(20, 8))
    stop_loss: Mapped[float | None] = mapped_column(Numeric(20, 8))
    targets: Mapped[dict | None] = mapped_column(JSON)
    confidence: Mapped[float | None] = mapped_column(Numeric(4, 3))
    valid_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=text("NOW()")
    )

    __table_args__ = (
        Index("idx_strategies_symbol", "symbol", created_at.desc()),
    )


class ConsensusReport(Base):
    __tablename__ = "consensus_reports"

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    )
    symbol: Mapped[str] = mapped_column(String(20), nullable=False)
    final_signal: Mapped[str] = mapped_column(String(20), nullable=False)
    confidence: Mapped[float | None] = mapped_column(Numeric(4, 3))
    divergence: Mapped[float | None] = mapped_column(Numeric(4, 3))
    model_votes: Mapped[dict | None] = mapped_column(JSON)
    minority_alert: Mapped[bool] = mapped_column(
        Boolean, server_default=text("false")
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=text("NOW()")
    )

    __table_args__ = (
        Index("idx_consensus_symbol", "symbol", created_at.desc()),
    )


class Case(Base):
    __tablename__ = "cases"

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    )
    case_name: Mapped[str] = mapped_column(String(200), nullable=False)
    date: Mapped[date] = mapped_column(Date, nullable=False)
    symbol: Mapped[str] = mapped_column(String(20), nullable=False)
    pattern_type: Mapped[str] = mapped_column(String(50), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    similarity_features: Mapped[dict | None] = mapped_column(JSON)
    max_gain_pct: Mapped[float | None] = mapped_column(Numeric(8, 4))
    max_loss_pct: Mapped[float | None] = mapped_column(Numeric(8, 4))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=text("NOW()")
    )

    __table_args__ = (Index("idx_cases_pattern_type", "pattern_type"),)


class PushSetting(Base):
    __tablename__ = "push_settings"

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(),
        ForeignKey("users.id", ondelete="CASCADE"),
        unique=True,
        nullable=False,
    )
    email_enabled: Mapped[bool] = mapped_column(
        Boolean, server_default=text("true")
    )
    tg_enabled: Mapped[bool] = mapped_column(
        Boolean, server_default=text("false")
    )
    tg_chat_id: Mapped[str | None] = mapped_column(String(50))
    tg_bind_token: Mapped[str | None] = mapped_column(String(100), unique=True)
    events: Mapped[dict | None] = mapped_column(
        JSON, server_default=text("'[\"strategy_update\",\"risk_alert\"]'")
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=text("NOW()")
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=text("NOW()")
    )

    user: Mapped[User] = relationship(back_populates="push_setting")


# ============================================================
# 动态配置管理
# ============================================================


class SystemConfig(Base):
    __tablename__ = "system_configs"

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    )
    config_key: Mapped[str] = mapped_column(
        String(100), unique=True, nullable=False
    )
    encrypted_value: Mapped[str] = mapped_column(Text, nullable=False)
    category: Mapped[str] = mapped_column(String(50), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    is_secret: Mapped[bool] = mapped_column(
        Boolean, server_default=text("true")
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=text("NOW()")
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=text("NOW()")
    )

    __table_args__ = (
        Index("idx_system_configs_key", "config_key"),
        Index("idx_system_configs_category", "category"),
    )


class ConfigAuditLog(Base):
    __tablename__ = "config_audit_log"

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    )
    admin_user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(),
        ForeignKey("users.id"),
        nullable=False,
    )
    config_key: Mapped[str] = mapped_column(String(100), nullable=False)
    action: Mapped[str] = mapped_column(String(20), nullable=False)
    old_value_masked: Mapped[str | None] = mapped_column(Text)
    new_value_masked: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=text("NOW()")
    )

    __table_args__ = (
        Index("idx_audit_log_created", created_at.desc()),
    )


# ============================================================
# 增长体系 — 任务中心 + 合伙人系统
# ============================================================


class TaskTemplate(Base):
    __tablename__ = "task_templates"

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    )
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    platform: Mapped[str] = mapped_column(String(30), nullable=False)
    icon: Mapped[str | None] = mapped_column(String(50))
    description: Mapped[str | None] = mapped_column(Text)
    rules: Mapped[str | None] = mapped_column(Text)
    reward_mode: Mapped[str] = mapped_column(
        String(20), nullable=False, server_default=text("'scalping'")
    )
    reward_amount: Mapped[int] = mapped_column(
        Integer, nullable=False, server_default=text("5")
    )
    min_views: Mapped[int] = mapped_column(
        Integer, nullable=False, server_default=text("200")
    )
    verify_window_hours: Mapped[int] = mapped_column(
        Integer, nullable=False, server_default=text("72")
    )
    sort_order: Mapped[int] = mapped_column(
        Integer, nullable=False, server_default=text("0")
    )
    is_active: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default=text("true")
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=text("NOW()")
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=text("NOW()")
    )


class TaskSubmission(Base):
    __tablename__ = "task_submissions"

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(), ForeignKey("users.id"), nullable=False
    )
    template_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(), ForeignKey("task_templates.id"), nullable=False
    )
    post_url: Mapped[str] = mapped_column(String(500), unique=True, nullable=False)
    screenshot_url: Mapped[str] = mapped_column(String(500), nullable=False)
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, server_default=text("'pending'")
    )
    reject_reason: Mapped[str | None] = mapped_column(Text)
    reward_granted: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default=text("false")
    )
    reviewed_by: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(), ForeignKey("users.id"), nullable=True
    )
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    submitted_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=text("NOW()")
    )

    __table_args__ = (
        Index("idx_task_submissions_user", "user_id"),
        Index("idx_task_submissions_status", "status"),
        Index("idx_task_submissions_template", "template_id"),
        Index("idx_task_submissions_submitted", "user_id", "submitted_at"),
    )


class BonusCreditLog(Base):
    __tablename__ = "bonus_credit_logs"

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(), ForeignKey("users.id"), nullable=False
    )
    source_type: Mapped[str] = mapped_column(String(30), nullable=False)
    source_id: Mapped[uuid.UUID | None] = mapped_column(Uuid())
    mode: Mapped[str] = mapped_column(String(20), nullable=False)
    amount: Mapped[int] = mapped_column(Integer, nullable=False)
    note: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=text("NOW()")
    )

    __table_args__ = (Index("idx_bonus_credit_logs_user", "user_id"),)


class Commission(Base):
    __tablename__ = "commissions"

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    )
    partner_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(), ForeignKey("users.id"), nullable=False
    )
    referee_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(), ForeignKey("users.id"), nullable=False
    )
    payment_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(), ForeignKey("payments.id"), nullable=False
    )
    payment_amount_usd: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False)
    commission_rate: Mapped[float] = mapped_column(Numeric(5, 4), nullable=False)
    commission_amount: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False)
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, server_default=text("'pending'")
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=text("NOW()")
    )

    __table_args__ = (
        Index("idx_commissions_partner", "partner_id"),
        Index("idx_commissions_referee", "referee_id"),
        Index("idx_commissions_status", "status"),
    )


class PartnerWallet(Base):
    __tablename__ = "partner_wallets"

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(),
        ForeignKey("users.id", ondelete="CASCADE"),
        unique=True,
        nullable=False,
    )
    trc20_address: Mapped[str] = mapped_column(String(100), nullable=False)
    is_verified: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default=text("false")
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=text("NOW()")
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=text("NOW()")
    )

    user: Mapped[User] = relationship(back_populates="partner_wallet")


class Withdrawal(Base):
    __tablename__ = "withdrawals"

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(), ForeignKey("users.id"), nullable=False
    )
    amount: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False)
    trc20_address: Mapped[str] = mapped_column(String(100), nullable=False)
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, server_default=text("'pending'")
    )
    tx_hash: Mapped[str | None] = mapped_column(String(200))
    reject_reason: Mapped[str | None] = mapped_column(Text)
    reviewed_by: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(), ForeignKey("users.id"), nullable=True
    )
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=text("NOW()")
    )

    __table_args__ = (
        Index("idx_withdrawals_user", "user_id"),
        Index("idx_withdrawals_status", "status"),
    )
