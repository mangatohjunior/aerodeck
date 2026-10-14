"""Shared ``Depends()`` providers."""

import secrets
from dataclasses import dataclass
from typing import Annotated

from fastapi import Depends, Query, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings, get_settings
from app.core.db import get_session
from app.core.errors import InvalidTokenError, QueueUnavailableError
from app.core.queue import create_celery_app
from app.repositories.clients import ClientRepository, SettingsClientRepository
from app.repositories.environments import EnvironmentRepository
from app.repositories.jobs import CeleryJobDispatcher
from app.repositories.projects import ProjectRepository
from app.repositories.routes import RouteRepository
from app.services.auth import AuthenticatedClient, AuthService
from app.services.environments import EnvironmentService
from app.services.jobs import JobDispatcher, JobService
from app.services.projects import ProjectService
from app.services.routes import RouteService

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


def get_environment_service(session: SessionDep, projects: ProjectServiceDep) -> EnvironmentService:
    return EnvironmentService(EnvironmentRepository(session), projects)


EnvironmentServiceDep = Annotated[EnvironmentService, Depends(get_environment_service)]


def get_route_service(
    session: SessionDep, projects: ProjectServiceDep, environments: EnvironmentServiceDep
) -> RouteService:
    return RouteService(RouteRepository(session), projects, environments)


RouteServiceDep = Annotated[RouteService, Depends(get_route_service)]


def get_job_dispatcher(settings: SettingsDep) -> JobDispatcher:
    if settings.redis_url is None:
        raise QueueUnavailableError("Job queue is not configured (AERODECK_REDIS_URL is unset)")
    return CeleryJobDispatcher(create_celery_app(settings))


JobDispatcherDep = Annotated[JobDispatcher, Depends(get_job_dispatcher)]


def get_job_service(dispatcher: JobDispatcherDep, environments: EnvironmentServiceDep) -> JobService:
    return JobService(dispatcher, environments)


JobServiceDep = Annotated[JobService, Depends(get_job_service)]

MUTATING_METHODS = frozenset({"POST", "PUT", "PATCH", "DELETE"})

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


async def require_client_for_mutations(request: Request, credentials: BearerDep, auth: AuthServiceDep) -> None:
    """Router-level guard: POST/PUT/PATCH/DELETE need a valid token, reads pass through."""
    if request.method not in MUTATING_METHODS:
        return
    if credentials is None:
        raise InvalidTokenError("Missing bearer token")
    await auth.authenticate(credentials.credentials)


MUTATION_GUARD = [Depends(require_client_for_mutations)]


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
