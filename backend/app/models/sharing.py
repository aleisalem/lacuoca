import uuid
from datetime import datetime
from sqlalchemy import String, DateTime, ForeignKey, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
import enum

from app.database import Base


class SharePermission(str, enum.Enum):
    read = "read"
    edit = "edit"


class RecipeShare(Base):
    __tablename__ = "recipe_shares"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    recipe_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("recipes.id", ondelete="CASCADE"), nullable=False, index=True
    )
    shared_with_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    # Who created this share (owner or a user re-sharing)
    shared_by_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    permission: Mapped[str] = mapped_column(
        String(20), default=SharePermission.read, nullable=False
    )
    # NULL = not yet seen by the recipient
    seen_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    # Relationships
    recipe: Mapped["Recipe"] = relationship("Recipe", back_populates="shares")  # noqa: F821
    shared_with: Mapped["User"] = relationship(  # noqa: F821
        "User", foreign_keys=[shared_with_id], back_populates="shared_recipes"
    )
