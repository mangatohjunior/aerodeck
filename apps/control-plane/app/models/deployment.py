import enum
from datetime import datetime

from sqlalchemy import DateTime, Enum, String
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin, UUIDPrimaryKeyMixin


class DeploymentStatus(enum.StrEnum):
    queued = "queued"
    running = "running"
    succeeded = "succeeded"


class Deployment(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """A console deployment request. Creating one does not call DigitalOcean."""

    __tablename__ = "deployments"

    repo_url: Mapped[str] = mapped_column(String(512), nullable=False)
    owner: Mapped[str] = mapped_column(String(100), nullable=False)
    repo: Mapped[str] = mapped_column(String(100), nullable=False)
    status: Mapped[DeploymentStatus] = mapped_column(
        Enum(DeploymentStatus, name="deployment_status", native_enum=False, length=16),
        nullable=False,
        default=DeploymentStatus.running,
    )
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)

    def __repr__(self) -> str:
        return f"Deployment(id={self.id!s})"
