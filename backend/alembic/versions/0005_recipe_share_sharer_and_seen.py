"""add shared_by_id and seen_at to recipe_shares

Revision ID: 0005
Revises: 0004
Create Date: 2026-04-09
"""
from alembic import op
import sqlalchemy as sa

revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "recipe_shares",
        sa.Column(
            "shared_by_id",
            sa.String(36),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.add_column(
        "recipe_shares",
        sa.Column("seen_at", sa.DateTime, nullable=True),
    )


def downgrade() -> None:
    op.drop_column("recipe_shares", "seen_at")
    op.drop_column("recipe_shares", "shared_by_id")
