from sqlalchemy import Text
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base


class SystemSetting(Base):
    """Key-value store for admin-configurable runtime settings."""
    __tablename__ = "system_settings"

    key: Mapped[str] = mapped_column(Text, primary_key=True)
    value: Mapped[str] = mapped_column(Text, nullable=False)
