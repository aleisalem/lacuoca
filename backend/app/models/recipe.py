import uuid
from datetime import datetime
from sqlalchemy import (
    String, Text, Integer, Float, Boolean, DateTime,
    ForeignKey, func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship
from pgvector.sqlalchemy import Vector
import enum

from app.database import Base


class RecipeCategory(str, enum.Enum):
    breakfast = "breakfast"
    lunch = "lunch"
    dinner = "dinner"
    dessert = "dessert"
    snack = "snack"
    drink = "drink"
    soup = "soup"
    salad = "salad"
    bread = "bread"
    other = "other"


class Recipe(Base):
    __tablename__ = "recipes"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    owner_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    category: Mapped[str] = mapped_column(
        String(50), default=RecipeCategory.other, nullable=False
    )
    prep_time_minutes: Mapped[int | None] = mapped_column(Integer, nullable=True)
    cook_time_minutes: Mapped[int | None] = mapped_column(Integer, nullable=True)
    servings: Mapped[int | None] = mapped_column(Integer, nullable=True)
    image_path: Mapped[str | None] = mapped_column(String(512), nullable=True)
    source_language: Mapped[str] = mapped_column(String(8), default="en", nullable=False)
    is_public: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    tags: Mapped[str | None] = mapped_column(String(512), nullable=True)  # comma-separated
    is_ai_generated: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    ai_model_used: Mapped[str | None] = mapped_column(String(128), nullable=True)
    is_draft: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    # Vector embedding for AI search — no fixed dimension so any embedding model works.
    # OpenAI text-embedding-3-small → 1536 dims; nomic-embed-text → 768; llama3.2 → 3072.
    # All recipes must be re-indexed if the embedding model is changed.
    embedding: Mapped[list[float] | None] = mapped_column(Vector(), nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now()
    )

    # Relationships
    owner: Mapped["User"] = relationship("User", back_populates="recipes")  # noqa: F821
    ingredients: Mapped[list["Ingredient"]] = relationship(
        "Ingredient", back_populates="recipe", cascade="all, delete-orphan",
        order_by="Ingredient.order"
    )
    steps: Mapped[list["Step"]] = relationship(
        "Step", back_populates="recipe", cascade="all, delete-orphan",
        order_by="Step.order"
    )
    shares: Mapped[list["RecipeShare"]] = relationship(  # noqa: F821
        "RecipeShare", back_populates="recipe", cascade="all, delete-orphan"
    )
    favorites: Mapped[list["RecipeFavorite"]] = relationship(  # noqa: F821
        "RecipeFavorite", back_populates="recipe", cascade="all, delete-orphan"
    )


class Ingredient(Base):
    __tablename__ = "ingredients"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    recipe_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("recipes.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    quantity: Mapped[float | None] = mapped_column(Float, nullable=True)
    unit: Mapped[str | None] = mapped_column(String(64), nullable=True)
    order: Mapped[int] = mapped_column(Integer, default=0)
    notes: Mapped[str | None] = mapped_column(String(255), nullable=True)

    recipe: Mapped["Recipe"] = relationship("Recipe", back_populates="ingredients")


class Step(Base):
    __tablename__ = "steps"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    recipe_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("recipes.id", ondelete="CASCADE"), nullable=False
    )
    order: Mapped[int] = mapped_column(Integer, nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    duration_minutes: Mapped[int | None] = mapped_column(Integer, nullable=True)

    recipe: Mapped["Recipe"] = relationship("Recipe", back_populates="steps")
