"""SQLAlchemy ORM models. Import every model here so Alembic sees the full metadata."""

from app.models.base import Base
from app.models.certificate import Certificate, CertificateStatus
from app.models.dns_record import DnsRecord, DnsRecordStatus, DnsRecordType
from app.models.project import Environment, EnvironmentKind, Project
from app.models.route import Route

__all__ = [
    "Base",
    "Certificate",
    "CertificateStatus",
    "DnsRecord",
    "DnsRecordStatus",
    "DnsRecordType",
    "Environment",
    "EnvironmentKind",
    "Project",
    "Route",
]
