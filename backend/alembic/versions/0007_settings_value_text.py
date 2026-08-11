"""widen system_settings columns to TEXT for long prompt values

Revision ID: 0007
Revises: 0006
Create Date: 2026-04-23
"""
from alembic import op
import sqlalchemy as sa

revision = "0007"
down_revision = "0006"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column("system_settings", "key",
                    type_=sa.Text, existing_type=sa.String(100), existing_nullable=False)
    op.alter_column("system_settings", "value",
                    type_=sa.Text, existing_type=sa.String(1000), existing_nullable=False)


def downgrade() -> None:
    op.alter_column("system_settings", "key",
                    type_=sa.String(100), existing_type=sa.Text, existing_nullable=False)
    op.alter_column("system_settings", "value",
                    type_=sa.String(1000), existing_type=sa.Text, existing_nullable=False)
