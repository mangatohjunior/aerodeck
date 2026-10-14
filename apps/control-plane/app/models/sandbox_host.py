import enum

from sqlalchemy import Enum, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDPrimaryKeyMixin


class SandboxHostStatus(enum.StrEnum):
    enrolled = "enrolled"
    disabled = "disabled"


class SandboxHost(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """A KVM-capable bare-metal machine that runs Firecracker microVMs."""

    __tablename__ = "sandbox_hosts"

    name: Mapped[str] = mapped_column(String(63), unique=True, nullable=False)
    api_url: Mapped[str] = mapped_column(String(253), nullable=False)
    status: Mapped[SandboxHostStatus] = mapped_column(
        Enum(SandboxHostStatus, name="sandbox_host_status", native_enum=False, length=16),
        nullable=False,
        default=SandboxHostStatus.enrolled,
    )

    sandboxes: Mapped[list["Sandbox"]] = relationship(back_populates="host")
