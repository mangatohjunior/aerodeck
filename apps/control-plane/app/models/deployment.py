import enum
import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, Enum, ForeignKeyConstraint, String
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin, UUIDPrimaryKeyMixin


class DeploymentStatus(enum.StrEnum):
    queued = "queued"
    running = "running"
    succeeded = "succeeded"
    failed = "failed"


class Deployment(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """A console deployment request. Creating one does not call DigitalOcean."""

    __tablename__ = "deployments"
    __table_args__ = (
        ForeignKeyConstraint(
            ["project_id", "environment_id"],
            ["environments.project_id", "environments.id"],
            name="fk_deployments_project_environment",
            ondelete="SET NULL",
        ),
        CheckConstraint(
            "(project_id IS NULL) = (environment_id IS NULL)",
            name="ck_deployments_project_environment_pair",
        ),
    )

    repo_url: Mapped[str] = mapped_column(String(512), nullable=False)
    owner: Mapped[str] = mapped_column(String(100), nullable=False)
    repo: Mapped[str] = mapped_column(String(100), nullable=False)
    project_id: Mapped[uuid.UUID | None] = mapped_column(nullable=True, index=True)
    environment_id: Mapped[uuid.UUID | None] = mapped_column(nullable=True, index=True)
    status: Mapped[DeploymentStatus] = mapped_column(
        Enum(DeploymentStatus, name="deployment_status", native_enum=False, length=16),
        nullable=False,
        default=DeploymentStatus.running,
    )
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)

    def __repr__(self) -> str:
        return f"Deployment(id={self.id!s})"
