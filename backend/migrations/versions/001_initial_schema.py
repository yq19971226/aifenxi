"""initial schema — baseline from init.sql

Revision ID: 001
Revises:
Create Date: 2025-01-01 00:00:00.000000

This migration is intentionally empty.  The initial schema is applied via
docker-entrypoint-initdb.d/init.sql (which also handles TimescaleDB
hypertable creation that Alembic cannot express).

To mark an existing database as up-to-date run:
    alembic stamp 001
"""
from typing import Sequence, Union

from alembic import op  # noqa: F401
import sqlalchemy as sa  # noqa: F401

revision: str = "001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Schema created by init.sql — nothing to do here.
    pass


def downgrade() -> None:
    # Dropping everything is destructive; use init.sql as the source of truth.
    pass
