import uuid

from fastapi import APIRouter, status

from app.api.deps import EnvironmentServiceDep, PaginationDep
from app.schemas.auth import ErrorResponse
from app.schemas.common import Page
from app.schemas.environment import EnvironmentCreate, EnvironmentRead, EnvironmentUpdate

router = APIRouter(prefix="/projects/{project_id}/environments", tags=["environments"])

_NOT_FOUND = {status.HTTP_404_NOT_FOUND: {"model": ErrorResponse}}
_CONFLICT = {status.HTTP_409_CONFLICT: {"model": ErrorResponse}}
_UNAUTHENTICATED = {status.HTTP_401_UNAUTHORIZED: {"model": ErrorResponse}}


@router.get(
    "",
    response_model=Page[EnvironmentRead],
    status_code=status.HTTP_200_OK,
    summary="List a project's environments",
    responses=_NOT_FOUND,
)
async def list_environments(
    project_id: uuid.UUID, page: PaginationDep, environments: EnvironmentServiceDep
) -> Page[EnvironmentRead]:
    items, total = await environments.list(project_id, limit=page.limit, offset=page.offset)
    return Page(
        items=[EnvironmentRead.model_validate(e) for e in items], total=total, limit=page.limit, offset=page.offset
    )


@router.post(
    "",
    response_model=EnvironmentRead,
    status_code=status.HTTP_201_CREATED,
    summary="Create an environment in a project",
    responses=_UNAUTHENTICATED | _NOT_FOUND | _CONFLICT,
)
async def create_environment(
    project_id: uuid.UUID, body: EnvironmentCreate, environments: EnvironmentServiceDep
) -> EnvironmentRead:
    return EnvironmentRead.model_validate(await environments.create(project_id, body))


@router.get(
    "/{environment_id}",
    response_model=EnvironmentRead,
    status_code=status.HTTP_200_OK,
    summary="Get an environment",
    responses=_NOT_FOUND,
)
async def get_environment(
    project_id: uuid.UUID, environment_id: uuid.UUID, environments: EnvironmentServiceDep
) -> EnvironmentRead:
    return EnvironmentRead.model_validate(await environments.get(project_id, environment_id))


@router.patch(
    "/{environment_id}",
    response_model=EnvironmentRead,
    status_code=status.HTTP_200_OK,
    summary="Update an environment",
    responses=_UNAUTHENTICATED | _NOT_FOUND,
)
async def update_environment(
    project_id: uuid.UUID,
    environment_id: uuid.UUID,
    body: EnvironmentUpdate,
    environments: EnvironmentServiceDep,
) -> EnvironmentRead:
    return EnvironmentRead.model_validate(await environments.update(project_id, environment_id, body))


@router.delete(
    "/{environment_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete an environment",
    responses=_UNAUTHENTICATED | _NOT_FOUND,
)
async def delete_environment(
    project_id: uuid.UUID, environment_id: uuid.UUID, environments: EnvironmentServiceDep
) -> None:
    await environments.delete(project_id, environment_id)
