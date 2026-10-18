import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDPrimaryKeyMixin
from app.models.console_user import ConsoleUser


class ConsoleSession(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """A console sign-in. Only the token hash is stored."""

    __tablename__ = "console_sessions"

    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("console_users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    user: Mapped[ConsoleUser] = relationship(lazy="selectin")

    def __repr__(self) -> str:
        return f"ConsoleSession(id={self.id!s})"
