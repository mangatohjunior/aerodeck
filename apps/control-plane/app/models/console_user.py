from sqlalchemy import String
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin, UUIDPrimaryKeyMixin


class ConsoleUser(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """An operator account. The password is stored only as a hash."""

    __tablename__ = "console_users"

    email: Mapped[str] = mapped_column(String(254), unique=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(200), nullable=False)

    def __repr__(self) -> str:
        return f"ConsoleUser(id={self.id!s})"
