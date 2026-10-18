import uuid

from fastapi import APIRouter, status

from app.api.deps import EnvironmentServiceDep, JobServiceDep, PaginationDep
from app.schemas.auth import ErrorResponse
from app.schemas.common import Page
from app.schemas.environment import EnvironmentCreate, EnvironmentRead, EnvironmentUpdate
from app.schemas.job import JobAccepted, ProvisionJobCreate
from app.services.provisioning import JobKind

router = APIRouter(prefix="/projects/{project_id}/environments", tags=["environments"])

_NOT_FOUND = {status.HTTP_404_NOT_FOUND: {"model": ErrorResponse}}
_CONFLICT = {status.HTTP_409_CONFLICT: {"model": ErrorResponse}}
_UNAUTHENTICATED = {status.HTTP_401_UNAUTHORIZED: {"model": ErrorResponse}}
_QUEUE_DOWN = {status.HTTP_503_SERVICE_UNAVAILABLE: {"model": ErrorResponse}}


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


async def _enqueue(
    kind: JobKind,
    project_id: uuid.UUID,
    environment_id: uuid.UUID,
    jobs: JobServiceDep,
    *,
    deployment_id: uuid.UUID | None = None,
) -> JobAccepted:
    ticket = await jobs.enqueue(kind, project_id, environment_id, deployment_id=deployment_id)
    return JobAccepted(
        job_id=uuid.UUID(ticket.job_id),
        kind=ticket.kind,
        project_id=ticket.project_id,
        environment_id=ticket.environment_id,
    )


@router.post(
    "/{environment_id}/provision",
    response_model=JobAccepted,
    status_code=status.HTTP_202_ACCEPTED,
    summary="Queue a provisioning job for an environment",
    description=(
        "Returns at once with a job id. Poll `GET /api/v1/jobs/{job_id}` for the outcome. "
        "Optional body `deployment_id` ties the job to a console deployment so the worker "
        "publishes progress onto `GET /api/v1/deployments/{id}/logs`."
    ),
    responses=_UNAUTHENTICATED | _NOT_FOUND | _QUEUE_DOWN,
)
async def provision_environment(
    project_id: uuid.UUID,
    environment_id: uuid.UUID,
    jobs: JobServiceDep,
    body: ProvisionJobCreate | None = None,
) -> JobAccepted:
    deployment_id = body.deployment_id if body is not None else None
    return await _enqueue(JobKind.provision, project_id, environment_id, jobs, deployment_id=deployment_id)


@router.post(
    "/{environment_id}/reconcile",
    response_model=JobAccepted,
    status_code=status.HTTP_202_ACCEPTED,
    summary="Queue a reconciliation job for an environment",
    description="Returns at once with a job id. Poll `GET /api/v1/jobs/{job_id}` for the outcome.",
    responses=_UNAUTHENTICATED | _NOT_FOUND | _QUEUE_DOWN,
)
async def reconcile_environment(
    project_id: uuid.UUID, environment_id: uuid.UUID, jobs: JobServiceDep
) -> JobAccepted:
    return await _enqueue(JobKind.reconcile, project_id, environment_id, jobs)
