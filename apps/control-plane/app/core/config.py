"""Runtime configuration. The only module that reads environment variables.

Enrolling a client
------------------
Clients authenticate with a ``client_id`` and a high-entropy ``client_secret``
(at least 32 random bytes). Only the SHA-256 hex digest of the secret is kept
in configuration::

    python -c "import secrets; print(secrets.token_urlsafe(48))"      # the secret, give to the client
    python -c "import hashlib,sys; print(hashlib.sha256(sys.argv[1].encode()).hexdigest())" <secret>

    AERODECK_AUTH_CLIENTS='{"ci-deployer": "<sha256 hex>"}'
"""

from functools import lru_cache
from typing import Literal

from pydantic import Field, SecretStr, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

SHA256_HEX_LENGTH = 64


class Settings(BaseSettings):
    """Loaded from ``AERODECK_*`` environment variables or a local ``.env`` file."""

    model_config = SettingsConfigDict(
        env_prefix="AERODECK_",
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_name: str = "AeroDeck Control Plane"
    version: str = "0.1.0"
    env: Literal["local", "dev", "staging", "production"] = "local"
    log_level: Literal["DEBUG", "INFO", "WARNING", "ERROR"] = "INFO"

    # Explicit allow-list; wildcard is only tolerated for local development.
    cors_origins: list[str] = Field(default_factory=list)

    # Async SQLAlchemy URL, e.g. postgresql+asyncpg://user:pass@host:5432/aerodeck
    # Optional at this stage; the readiness probe reports "skipped" when unset.
    database_url: str | None = None

    # HMAC key for signing access tokens. Required; rotate by restarting with a new value.
    auth_signing_key: SecretStr = Field(min_length=32)
    auth_token_ttl_seconds: int = Field(default=900, ge=60, le=3600)
    auth_issuer: str = "aerodeck-control-plane"
    auth_audience: str = "aerodeck-api"

    # client_id -> SHA-256 hex digest of the client secret. See module docstring.
    auth_clients: dict[str, str] = Field(default_factory=dict)

    # Celery broker and result backend, e.g. redis://localhost:6379/0.
    # Optional at this stage; job routes return 503 when unset.
    redis_url: str | None = None
    job_queue: str = "aerodeck"
    # Transient failures retry with exponential backoff and jitter up to this many times.
    job_max_retries: int = Field(default=5, ge=0, le=20)
    job_retry_backoff_max_seconds: int = Field(default=600, ge=1, le=3600)
    # Results are kept in Redis this long so GET /api/v1/jobs/{id} can report them.
    job_result_ttl_seconds: int = Field(default=86_400, ge=60)

    # Optional static bearer Traefik sends when polling GET /api/v1/edge/traefik.
    # When unset, any enrolled API client token is accepted instead.
    traefik_provider_token: SecretStr | None = None

    # DNS-01 TXT publisher. "memory" is the fake used in tests and local laptops.
    dns01_provider: Literal["memory", "digitalocean"] = "memory"
    digitalocean_token: SecretStr | None = None
    # Fake ACME lifetime. Real Let's Encrypt is not wired until an account exists.
    acme_lifetime_days: int = Field(default=90, ge=1, le=366)
    certificate_renew_before_days: int = Field(default=30, ge=1, le=60)

    # Public address record created and deleted with each route.
    dns_records_provider: Literal["memory", "digitalocean"] = "memory"
    dns_record_type: Literal["A", "AAAA", "CNAME"] = "CNAME"
    dns_record_target: str = "edge.example.com"
    dns_record_ttl: int = Field(default=300, ge=30, le=86_400)

    # Firecracker microVMs. "memory" is the fake used in tests and local laptops.
    sandbox_hypervisor: Literal["memory", "firecracker"] = "memory"
    sandbox_image_root: str = "/var/lib/aerodeck/images"
    firecracker_api_url: str = "http://127.0.0.1:8080"

    @field_validator("auth_clients")
    @classmethod
    def _secret_hashes_are_sha256_hex(cls, clients: dict[str, str]) -> dict[str, str]:
        for client_id, digest in clients.items():
            if len(digest) != SHA256_HEX_LENGTH or any(c not in "0123456789abcdef" for c in digest.lower()):
                raise ValueError(
                    f"auth_clients[{client_id!r}] must be the SHA-256 hex digest of the client secret"
                )
        return {client_id: digest.lower() for client_id, digest in clients.items()}

    @property
    def docs_enabled(self) -> bool:
        return self.env != "production"


@lru_cache
def get_settings() -> Settings:
    return Settings()
