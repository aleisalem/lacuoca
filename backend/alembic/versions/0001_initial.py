"""initial schema

Revision ID: 0001
Revises:
Create Date: 2026-04-05
"""
from alembic import op
import sqlalchemy as sa
from pgvector.sqlalchemy import Vector

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Enable pgvector extension
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")

    # users
    op.create_table(
        "users",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("username", sa.String(64), nullable=False, unique=True),
        sa.Column("email", sa.String(255), nullable=False, unique=True),
        sa.Column("hashed_password", sa.String(255), nullable=False),
        sa.Column("role", sa.String(20), nullable=False, server_default="user"),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default="true"),
        sa.Column("totp_secret", sa.String(64), nullable=True),
        sa.Column("totp_enabled", sa.Boolean, nullable=False, server_default="false"),
        sa.Column("unit_system", sa.String(20), nullable=False, server_default="metric"),
        sa.Column("preferred_language", sa.String(8), nullable=False, server_default="en"),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime, server_default=sa.func.now()),
    )
    op.create_index("ix_users_username", "users", ["username"])
    op.create_index("ix_users_email", "users", ["email"])

    # signup_requests
    op.create_table(
        "signup_requests",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("username", sa.String(64), nullable=False),
        sa.Column("email", sa.String(255), nullable=False),
        sa.Column("message", sa.String(500), nullable=True),
        sa.Column("status", sa.String(20), nullable=False, server_default="pending"),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now()),
    )

    # recipes
    op.create_table(
        "recipes",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("owner_id", sa.String(36), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("category", sa.String(50), nullable=False, server_default="other"),
        sa.Column("prep_time_minutes", sa.Integer, nullable=True),
        sa.Column("cook_time_minutes", sa.Integer, nullable=True),
        sa.Column("servings", sa.Integer, nullable=True),
        sa.Column("image_path", sa.String(512), nullable=True),
        sa.Column("source_language", sa.String(8), nullable=False, server_default="en"),
        sa.Column("is_public", sa.Boolean, nullable=False, server_default="false"),
        sa.Column("tags", sa.String(512), nullable=True),
        sa.Column("embedding", Vector(1536), nullable=True),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime, server_default=sa.func.now()),
    )
    op.create_index("ix_recipes_owner_id", "recipes", ["owner_id"])

    # ingredients
    op.create_table(
        "ingredients",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("recipe_id", sa.String(36), sa.ForeignKey("recipes.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("quantity", sa.Float, nullable=True),
        sa.Column("unit", sa.String(64), nullable=True),
        sa.Column("order", sa.Integer, nullable=False, server_default="0"),
        sa.Column("notes", sa.String(255), nullable=True),
    )

    # steps
    op.create_table(
        "steps",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("recipe_id", sa.String(36), sa.ForeignKey("recipes.id", ondelete="CASCADE"), nullable=False),
        sa.Column("order", sa.Integer, nullable=False),
        sa.Column("description", sa.Text, nullable=False),
        sa.Column("duration_minutes", sa.Integer, nullable=True),
    )

    # recipe_shares
    op.create_table(
        "recipe_shares",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("recipe_id", sa.String(36), sa.ForeignKey("recipes.id", ondelete="CASCADE"), nullable=False),
        sa.Column("shared_with_id", sa.String(36), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("permission", sa.String(20), nullable=False, server_default="read"),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now()),
    )
    op.create_index("ix_recipe_shares_recipe_id", "recipe_shares", ["recipe_id"])
    op.create_index("ix_recipe_shares_shared_with_id", "recipe_shares", ["shared_with_id"])


def downgrade() -> None:
    op.drop_table("recipe_shares")
    op.drop_table("steps")
    op.drop_table("ingredients")
    op.drop_table("recipes")
    op.drop_table("signup_requests")
    op.drop_table("users")
    op.execute("DROP EXTENSION IF EXISTS vector")
