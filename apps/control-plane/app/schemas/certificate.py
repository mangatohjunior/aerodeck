import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict

from app.models.certificate import CertificateStatus


class CertificateRead(BaseModel):
    """Public certificate status. PEM and private key are never included."""

    model_config = ConfigDict(extra="forbid", from_attributes=True)

    id: uuid.UUID
    route_id: uuid.UUID
    hostname: str
    status: CertificateStatus
    not_after: datetime | None
    fingerprint_sha256: str | None
    last_error: str | None
    created_at: datetime
    updated_at: datetime


class TraefikTlsCertificate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    certFile: str
    keyFile: str


class TraefikTls(BaseModel):
    model_config = ConfigDict(extra="forbid")

    certificates: list[TraefikTlsCertificate]


class TraefikRouterTls(BaseModel):
    """Empty object enables TLS on the router. Certificates live under `tls.certificates`."""

    model_config = ConfigDict(extra="forbid")
