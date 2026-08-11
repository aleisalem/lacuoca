"""create system_settings table

Revision ID: 0003
Revises: 0002
Create Date: 2026-04-06
"""
from alembic import op
import sqlalchemy as sa

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "system_settings",
        sa.Column("key", sa.String(100), primary_key=True),
        sa.Column("value", sa.String(1000), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("system_settings")
