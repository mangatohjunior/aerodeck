"""Shared ``Depends()`` providers."""

from typing import Annotated

from fastapi import Depends, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.core.config import Settings, get_settings
from app.core.errors import InvalidTokenError
from app.repositories.clients import ClientRepository, SettingsClientRepository
from app.services.auth import AuthenticatedClient, AuthService

SettingsDep = Annotated[Settings, Depends(get_settings)]

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
