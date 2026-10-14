import uuid

from fastapi import APIRouter, status

from app.api.deps import PaginationDep, SandboxServiceDep
from app.schemas.auth import ErrorResponse
from app.schemas.common import Page
from app.schemas.sandbox import SandboxCreate, SandboxRead

router = APIRouter(prefix="/projects/{project_id}/sandboxes", tags=["sandboxes"])
platform_router = APIRouter(prefix="/sandboxes", tags=["sandboxes"])

_NOT_FOUND = {status.HTTP_404_NOT_FOUND: {"model": ErrorResponse}}
_UNAUTHENTICATED = {status.HTTP_401_UNAUTHORIZED: {"model": ErrorResponse}}
_BAD_GATEWAY = {status.HTTP_502_BAD_GATEWAY: {"model": ErrorResponse}}
_UNAVAILABLE = {status.HTTP_503_SERVICE_UNAVAILABLE: {"model": ErrorResponse}}


@router.get(
    "",
    response_model=Page[SandboxRead],
    status_code=status.HTTP_200_OK,
    summary="List a project's sandboxes",
    responses=_NOT_FOUND,
)
async def list_sandboxes(
    project_id: uuid.UUID, page: PaginationDep, sandboxes: SandboxServiceDep
) -> Page[SandboxRead]:
    items, total = await sandboxes.list(project_id, limit=page.limit, offset=page.offset)
    return Page(
        items=[SandboxRead.model_validate(item) for item in items],
        total=total,
        limit=page.limit,
        offset=page.offset,
    )


@router.post(
    "",
    response_model=SandboxRead,
    status_code=status.HTTP_201_CREATED,
    summary="Boot a Firecracker microVM from a declared image",
    responses=_UNAUTHENTICATED | _NOT_FOUND | _BAD_GATEWAY | _UNAVAILABLE,
)
async def create_sandbox(project_id: uuid.UUID, body: SandboxCreate, sandboxes: SandboxServiceDep) -> SandboxRead:
    return SandboxRead.model_validate(await sandboxes.create(project_id, body))


@router.get(
    "/{sandbox_id}",
    response_model=SandboxRead,
    status_code=status.HTTP_200_OK,
    summary="Get a sandbox",
    responses=_NOT_FOUND,
)
async def get_sandbox(project_id: uuid.UUID, sandbox_id: uuid.UUID, sandboxes: SandboxServiceDep) -> SandboxRead:
    return SandboxRead.model_validate(await sandboxes.get(project_id, sandbox_id))


@platform_router.post(
    "/reap-expired",
    response_model=list[SandboxRead],
    status_code=status.HTTP_200_OK,
    summary="Destroy sandboxes whose TTL has elapsed",
    responses=_UNAUTHENTICATED,
)
async def reap_expired_sandboxes(sandboxes: SandboxServiceDep) -> list[SandboxRead]:
    return [SandboxRead.model_validate(item) for item in await sandboxes.reap_expired()]
