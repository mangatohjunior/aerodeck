"""Issue certificates after a DNS-01 TXT record is in place.

The fake issuer is the default. ``LetsEncryptIssuer`` is selected when
``AERODECK_ACME_ISSUER=letsencrypt``. Both drive Dns01Provider.
"""

from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from hashlib import sha256
from typing import Protocol

from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.x509.oid import NameOID

from app.core.errors import AppError
from app.services.dns01 import Dns01Provider


class IssuerError(AppError):
    status_code = 502
    code = "issuer_failed"


class AcmeUnavailableError(AppError):
    status_code = 503
    code = "acme_unavailable"


@dataclass(frozen=True, slots=True)
class IssuedCertificate:
    certificate_pem: str
    private_key_pem: str
    not_after: datetime
    fingerprint_sha256: str


class AcmeIssuer(Protocol):
    def issue(self, hostname: str) -> IssuedCertificate: ...

    def renew(self, hostname: str) -> IssuedCertificate: ...


def self_signed(hostname: str, *, lifetime: timedelta) -> IssuedCertificate:
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    now = datetime.now(UTC)
    cert = (
        x509.CertificateBuilder()
        .subject_name(x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, hostname)]))
        .issuer_name(x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, "AeroDeck Fake CA")]))
        .public_key(key.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(now)
        .not_valid_after(now + lifetime)
        .add_extension(x509.SubjectAlternativeName([x509.DNSName(hostname)]), critical=False)
        .sign(key, hashes.SHA256())
    )
    certificate_pem = cert.public_bytes(serialization.Encoding.PEM).decode()
    private_key_pem = key.private_bytes(
        serialization.Encoding.PEM,
        serialization.PrivateFormat.PKCS8,
        serialization.NoEncryption(),
    ).decode()
    fingerprint = sha256(cert.public_bytes(serialization.Encoding.DER)).hexdigest()
    return IssuedCertificate(certificate_pem, private_key_pem, now + lifetime, fingerprint)


class FakeAcmeIssuer:
    """Presents a DNS-01 TXT record, then mints a self-signed certificate."""

    def __init__(self, dns: Dns01Provider, *, lifetime: timedelta = timedelta(days=90)) -> None:
        self._dns = dns
        self._lifetime = lifetime

    def issue(self, hostname: str) -> IssuedCertificate:
        digest = f"dns01-{hostname}"
        self._dns.present(hostname, digest)
        try:
            records = getattr(self._dns, "records", None)
            if isinstance(records, dict) and records.get(hostname) != digest:
                raise IssuerError(f"DNS-01 record for {hostname} was not present")
            return self_signed(hostname, lifetime=self._lifetime)
        finally:
            self._dns.cleanup(hostname)

    def renew(self, hostname: str) -> IssuedCertificate:
        return self.issue(hostname)


def _aware(value: datetime) -> datetime:
    return value if value.tzinfo is not None else value.replace(tzinfo=UTC)


def is_due_for_renewal(not_after: datetime, *, now: datetime, window: timedelta) -> bool:
    return _aware(not_after) <= _aware(now) + window
