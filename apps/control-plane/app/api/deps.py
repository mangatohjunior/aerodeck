"""Shared ``Depends()`` providers."""

import secrets
from dataclasses import dataclass
from datetime import timedelta
from typing import Annotated

from fastapi import Depends, Query
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings, get_settings
from app.core.db import get_session
from app.core.errors import InvalidTokenError, QueueUnavailableError
from app.core.queue import create_celery_app
from app.models.dns_record import DnsRecordType
from app.repositories.certificates import CertificateRepository
from app.repositories.clients import ClientRepository, SettingsClientRepository
from app.repositories.dns_records import DnsRecordRepository
from app.repositories.environments import EnvironmentRepository
from app.repositories.jobs import CeleryJobDispatcher
from app.repositories.projects import ProjectRepository
from app.repositories.routes import RouteRepository
from app.repositories.sandbox_hosts import SandboxHostRepository
from app.repositories.sandboxes import SandboxRepository
from app.services.acme import AcmeIssuer, AcmeUnavailableError, FakeAcmeIssuer
from app.services.auth import AuthenticatedClient, AuthService
from app.services.certificate_keys import FileCertificateKeyStore
from app.services.certificates import CertificateService
from app.services.dns01 import DigitalOceanDns01, Dns01Provider, Dns01UnavailableError, MemoryDns01
from app.services.dns_records import (
    DigitalOceanDnsRecords,
    DnsRecordPublisher,
    DnsRecordService,
    DnsRecordUnavailableError,
    MemoryDnsRecords,
)
from app.services.environments import EnvironmentService
from app.services.hypervisor import FirecrackerHypervisor, Hypervisor, MemoryHypervisor, SandboxUnavailableError
from app.services.jobs import JobDispatcher, JobService
from app.services.letsencrypt import LetsEncryptIssuer
from app.services.projects import ProjectService
from app.services.routes import RouteService
from app.services.sandbox_hosts import SandboxHostService
from app.services.sandboxes import SandboxService

SettingsDep = Annotated[Settings, Depends(get_settings)]
SessionDep = Annotated[AsyncSession, Depends(get_session)]


@dataclass(frozen=True, slots=True)
class PaginationParams:
    limit: int
    offset: int


def get_pagination(
    limit: Annotated[int, Query(ge=1, le=200, description="Page size")] = 50,
    offset: Annotated[int, Query(ge=0, description="Items to skip")] = 0,
) -> PaginationParams:
    return PaginationParams(limit=limit, offset=offset)


PaginationDep = Annotated[PaginationParams, Depends(get_pagination)]


def get_project_service(session: SessionDep) -> ProjectService:
    return ProjectService(ProjectRepository(session))


ProjectServiceDep = Annotated[ProjectService, Depends(get_project_service)]


def get_hypervisor(settings: SettingsDep) -> Hypervisor:
    if settings.sandbox_hypervisor == "firecracker":
        url = settings.firecracker_api_url.strip()
        if not url:
            raise SandboxUnavailableError("AERODECK_FIRECRACKER_API_URL is unset")
        return FirecrackerHypervisor(api_url=url, image_root=settings.sandbox_image_root)
    return MemoryHypervisor()


HypervisorDep = Annotated[Hypervisor, Depends(get_hypervisor)]


def get_sandbox_host_service(session: SessionDep) -> SandboxHostService:
    return SandboxHostService(SandboxHostRepository(session), SandboxRepository(session))


SandboxHostServiceDep = Annotated[SandboxHostService, Depends(get_sandbox_host_service)]


def get_sandbox_service(
    session: SessionDep,
    projects: ProjectServiceDep,
    hypervisor: HypervisorDep,
    hosts: SandboxHostServiceDep,
    settings: SettingsDep,
) -> SandboxService:
    return SandboxService(
        SandboxRepository(session),
        projects,
        hypervisor,
        hosts,
        require_host=settings.sandbox_hypervisor == "firecracker",
    )


SandboxServiceDep = Annotated[SandboxService, Depends(get_sandbox_service)]


def get_environment_service(session: SessionDep, projects: ProjectServiceDep) -> EnvironmentService:
    return EnvironmentService(EnvironmentRepository(session), projects)


EnvironmentServiceDep = Annotated[EnvironmentService, Depends(get_environment_service)]


def get_dns_record_publisher(settings: SettingsDep) -> DnsRecordPublisher:
    if settings.dns_records_provider == "digitalocean":
        token = settings.digitalocean_token
        if token is None:
            raise DnsRecordUnavailableError("AERODECK_DIGITALOCEAN_TOKEN is unset")
        return DigitalOceanDnsRecords(token.get_secret_value())
    return MemoryDnsRecords()


DnsRecordPublisherDep = Annotated[DnsRecordPublisher, Depends(get_dns_record_publisher)]


def get_dns_record_service(
    session: SessionDep, publisher: DnsRecordPublisherDep, settings: SettingsDep
) -> DnsRecordService:
    return DnsRecordService(
        DnsRecordRepository(session),
        publisher,
        record_type=DnsRecordType(settings.dns_record_type),
        data=settings.dns_record_target,
        ttl=settings.dns_record_ttl,
    )


DnsRecordServiceDep = Annotated[DnsRecordService, Depends(get_dns_record_service)]


def get_certificate_key_store(settings: SettingsDep) -> FileCertificateKeyStore:
    return FileCertificateKeyStore(settings.certificate_key_dir)


CertificateKeyStoreDep = Annotated[FileCertificateKeyStore, Depends(get_certificate_key_store)]


def get_route_service(
    session: SessionDep,
    projects: ProjectServiceDep,
    environments: EnvironmentServiceDep,
    dns_records: DnsRecordServiceDep,
    keys: CertificateKeyStoreDep,
) -> RouteService:
    return RouteService(
        RouteRepository(session), projects, environments, CertificateRepository(session), dns_records, keys
    )


RouteServiceDep = Annotated[RouteService, Depends(get_route_service)]


def get_dns01_provider(settings: SettingsDep) -> Dns01Provider:
    if settings.dns01_provider == "digitalocean":
        token = settings.digitalocean_token
        if token is None:
            raise Dns01UnavailableError("AERODECK_DIGITALOCEAN_TOKEN is unset")
        return DigitalOceanDns01(token.get_secret_value())
    return MemoryDns01()


Dns01ProviderDep = Annotated[Dns01Provider, Depends(get_dns01_provider)]


def get_acme_issuer(dns: Dns01ProviderDep, settings: SettingsDep) -> AcmeIssuer:
    if settings.acme_issuer == "letsencrypt":
        email = (settings.acme_account_email or "").strip()
        key = settings.acme_account_key.get_secret_value() if settings.acme_account_key else ""
        if not email or not key:
            raise AcmeUnavailableError("AERODECK_ACME_ACCOUNT_EMAIL and AERODECK_ACME_ACCOUNT_KEY are required")
        return LetsEncryptIssuer(
            dns,
            directory_url=settings.acme_directory_url,
            account_email=email,
            account_key_pem=key,
        )
    return FakeAcmeIssuer(dns, lifetime=timedelta(days=settings.acme_lifetime_days))


AcmeIssuerDep = Annotated[AcmeIssuer, Depends(get_acme_issuer)]


def get_certificate_service(
    session: SessionDep,
    routes: RouteServiceDep,
    issuer: AcmeIssuerDep,
    keys: CertificateKeyStoreDep,
    settings: SettingsDep,
) -> CertificateService:
    return CertificateService(
        CertificateRepository(session),
        routes,
        issuer,
        keys,
        renew_before=timedelta(days=settings.certificate_renew_before_days),
    )


CertificateServiceDep = Annotated[CertificateService, Depends(get_certificate_service)]


def get_job_dispatcher(settings: SettingsDep) -> JobDispatcher:
    if settings.redis_url is None:
        raise QueueUnavailableError("Job queue is not configured (AERODECK_REDIS_URL is unset)")
    return CeleryJobDispatcher(create_celery_app(settings))


JobDispatcherDep = Annotated[JobDispatcher, Depends(get_job_dispatcher)]


def get_job_service(dispatcher: JobDispatcherDep, environments: EnvironmentServiceDep) -> JobService:
    return JobService(dispatcher, environments)


JobServiceDep = Annotated[JobService, Depends(get_job_service)]

# auto_error=False so a missing header becomes our {"detail", "code"} 401, not FastAPI's 403.
_bearer = HTTPBearer(auto_error=False, description="Access token from POST /api/v1/auth/token")
BearerDep = Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)]


def get_client_repository(settings: SettingsDep) -> ClientRepository:
    return SettingsClientRepository(settings.auth_clients)


ClientRepositoryDep = Annotated[ClientRepository, Depends(get_client_repository)]


def get_auth_service(clients: ClientRepositoryDep, settings: SettingsDep) -> AuthService:
    return AuthService(clients, settings)


AuthServiceDep = Annotated[AuthService, Depends(get_auth_service)]


async def get_current_client(credentials: BearerDep, auth: AuthServiceDep) -> AuthenticatedClient:
    if credentials is None:
        raise InvalidTokenError("Missing bearer token")
    return await auth.authenticate(credentials.credentials)


ClientDep = Annotated[AuthenticatedClient, Depends(get_current_client)]


async def require_client(credentials: BearerDep, auth: AuthServiceDep) -> None:
    """Router-level guard: every method needs a valid enrolled-client token."""
    if credentials is None:
        raise InvalidTokenError("Missing bearer token")
    await auth.authenticate(credentials.credentials)


AUTH_GUARD = [Depends(require_client)]
# Kept so existing routers that imported MUTATION_GUARD stay equivalent (#36).
MUTATION_GUARD = AUTH_GUARD


def _bearer_matches(provided: str, expected: str) -> bool:
    if len(provided) != len(expected):
        return False
    return secrets.compare_digest(provided, expected)


async def require_edge_reader(credentials: BearerDep, auth: AuthServiceDep, settings: SettingsDep) -> None:
    """Traefik (static provider token) or any enrolled API client may read the snapshot."""
    if credentials is None:
        raise InvalidTokenError("Missing bearer token")
    provider = settings.traefik_provider_token
    if provider is not None and _bearer_matches(credentials.credentials, provider.get_secret_value()):
        return
    await auth.authenticate(credentials.credentials)


EdgeReaderDep = Annotated[None, Depends(require_edge_reader)]
