import enum
import uuid
from datetime import datetime

from sqlalchemy import DateTime, Enum, ForeignKey, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDPrimaryKeyMixin
from app.models.route import Route


class CertificateStatus(enum.StrEnum):
    pending = "pending"
    issued = "issued"
    failed = "failed"


class Certificate(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """TLS metadata for one route. The private key is a file, not a column."""

    __tablename__ = "certificates"
    __table_args__ = (UniqueConstraint("route_id", name="uq_certificates_route_id"),)

    route_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("routes.id", ondelete="CASCADE"), nullable=False, index=True
    )
    hostname: Mapped[str] = mapped_column(String(253), nullable=False)
    status: Mapped[CertificateStatus] = mapped_column(
        Enum(CertificateStatus, name="certificate_status", native_enum=False, length=16),
        nullable=False,
        default=CertificateStatus.pending,
    )
    not_after: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    fingerprint_sha256: Mapped[str | None] = mapped_column(String(64))
    certificate_pem: Mapped[str | None] = mapped_column(Text)
    last_error: Mapped[str | None] = mapped_column(String(500))

    route: Mapped[Route] = relationship(back_populates="certificate")
