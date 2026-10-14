import enum
import uuid

from sqlalchemy import Enum, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDPrimaryKeyMixin
from app.models.project import Project


class SandboxStatus(enum.StrEnum):
    running = "running"


class Sandbox(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """A Firecracker microVM booted from a declared image for one project."""

    __tablename__ = "sandboxes"

    project_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True
    )
    image: Mapped[str] = mapped_column(String(64), nullable=False)
    vcpu: Mapped[int] = mapped_column(Integer, nullable=False)
    memory_mib: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[SandboxStatus] = mapped_column(
        Enum(SandboxStatus, name="sandbox_status", native_enum=False, length=16),
        nullable=False,
        default=SandboxStatus.running,
    )
    hypervisor_vm_id: Mapped[str | None] = mapped_column(String(64))

    project: Mapped[Project] = relationship(back_populates="sandboxes")
