import uuid
from datetime import datetime
from sqlalchemy import String, DateTime, ForeignKey, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class RecipeFavorite(Base):
    __tablename__ = "recipe_favorites"
    __table_args__ = (UniqueConstraint("user_id", "recipe_id", name="uq_user_recipe_favorite"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    recipe_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("recipes.id", ondelete="CASCADE"), nullable=False, index=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    recipe: Mapped["Recipe"] = relationship("Recipe", back_populates="favorites")  # noqa: F821
    user: Mapped["User"] = relationship("User")  # noqa: F821
