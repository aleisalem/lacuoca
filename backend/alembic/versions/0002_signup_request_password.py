"""add hashed_password to signup_requests

Revision ID: 0002
Revises: 0001
Create Date: 2026-04-05
"""
from alembic import op
import sqlalchemy as sa

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "signup_requests",
        sa.Column("hashed_password", sa.String(255), nullable=False, server_default=""),
    )
    # Remove the server_default after backfilling so future rows must supply a value
    op.alter_column("signup_requests", "hashed_password", server_default=None)


def downgrade() -> None:
    op.drop_column("signup_requests", "hashed_password")
