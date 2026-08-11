"""add is_ai_generated, ai_model_used, is_draft to recipes; create recipe_favorites

Revision ID: 0006
Revises: 0005
Create Date: 2026-04-20
"""
from alembic import op
import sqlalchemy as sa

revision = "0006"
down_revision = "0005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("recipes", sa.Column("is_ai_generated", sa.Boolean(), nullable=False, server_default="false"))
    op.add_column("recipes", sa.Column("ai_model_used", sa.String(128), nullable=True))
    op.add_column("recipes", sa.Column("is_draft", sa.Boolean(), nullable=False, server_default="false"))

    op.create_table(
        "recipe_favorites",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("recipe_id", sa.String(36), sa.ForeignKey("recipes.id", ondelete="CASCADE"), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
        sa.UniqueConstraint("user_id", "recipe_id", name="uq_user_recipe_favorite"),
    )
    op.create_index("ix_recipe_favorites_user_id", "recipe_favorites", ["user_id"])
    op.create_index("ix_recipe_favorites_recipe_id", "recipe_favorites", ["recipe_id"])


def downgrade() -> None:
    op.drop_index("ix_recipe_favorites_recipe_id", table_name="recipe_favorites")
    op.drop_index("ix_recipe_favorites_user_id", table_name="recipe_favorites")
    op.drop_table("recipe_favorites")
    op.drop_column("recipes", "is_draft")
    op.drop_column("recipes", "ai_model_used")
    op.drop_column("recipes", "is_ai_generated")
