import enum
import uuid

from sqlalchemy import Enum, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDPrimaryKeyMixin
from app.models.route import Route


class DnsRecordType(enum.StrEnum):
    A = "A"
    AAAA = "AAAA"
    CNAME = "CNAME"


class DnsRecordStatus(enum.StrEnum):
    published = "published"
    unpublished = "unpublished"


class DnsRecord(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """Public address record for a route hostname. Aligns DNS with the declared route."""

    __tablename__ = "dns_records"
    __table_args__ = (UniqueConstraint("route_id", name="uq_dns_records_route_id"),)

    route_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("routes.id", ondelete="CASCADE"), nullable=False, index=True
    )
    hostname: Mapped[str] = mapped_column(String(253), nullable=False)
    record_type: Mapped[DnsRecordType] = mapped_column(
        Enum(DnsRecordType, name="dns_record_type", native_enum=False, length=8), nullable=False
    )
    data: Mapped[str] = mapped_column(String(253), nullable=False)
    ttl: Mapped[int] = mapped_column(Integer, nullable=False, default=300)
    provider_record_id: Mapped[str | None] = mapped_column(String(64))
    status: Mapped[DnsRecordStatus] = mapped_column(
        Enum(DnsRecordStatus, name="dns_record_status", native_enum=False, length=16),
        nullable=False,
        default=DnsRecordStatus.unpublished,
    )

    route: Mapped[Route] = relationship(back_populates="dns_record")
