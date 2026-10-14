import uuid

from fastapi import APIRouter, status

from app.api.deps import PaginationDep, SandboxHostServiceDep
from app.schemas.auth import ErrorResponse
from app.schemas.common import Page
from app.schemas.sandbox_host import SandboxHostCreate, SandboxHostRead, SandboxHostUpdate

router = APIRouter(prefix="/sandbox-hosts", tags=["sandbox-hosts"])

_NOT_FOUND = {status.HTTP_404_NOT_FOUND: {"model": ErrorResponse}}
_CONFLICT = {status.HTTP_409_CONFLICT: {"model": ErrorResponse}}
_UNAUTHENTICATED = {status.HTTP_401_UNAUTHORIZED: {"model": ErrorResponse}}


@router.get(
    "",
    response_model=Page[SandboxHostRead],
    status_code=status.HTTP_200_OK,
    summary="List enrolled sandbox hypervisor hosts",
)
async def list_sandbox_hosts(page: PaginationDep, hosts: SandboxHostServiceDep) -> Page[SandboxHostRead]:
    items, total = await hosts.list(limit=page.limit, offset=page.offset)
    return Page(
        items=[SandboxHostRead.model_validate(item) for item in items],
        total=total,
        limit=page.limit,
        offset=page.offset,
    )


@router.post(
    "",
    response_model=SandboxHostRead,
    status_code=status.HTTP_201_CREATED,
    summary="Enroll a bare-metal host as a sandbox hypervisor",
    responses=_UNAUTHENTICATED | _CONFLICT,
)
async def create_sandbox_host(body: SandboxHostCreate, hosts: SandboxHostServiceDep) -> SandboxHostRead:
    return SandboxHostRead.model_validate(await hosts.create(body))


@router.get(
    "/{host_id}",
    response_model=SandboxHostRead,
    status_code=status.HTTP_200_OK,
    summary="Get a sandbox host",
    responses=_NOT_FOUND,
)
async def get_sandbox_host(host_id: uuid.UUID, hosts: SandboxHostServiceDep) -> SandboxHostRead:
    return SandboxHostRead.model_validate(await hosts.get(host_id))


@router.patch(
    "/{host_id}",
    response_model=SandboxHostRead,
    status_code=status.HTTP_200_OK,
    summary="Update a sandbox host",
    responses=_UNAUTHENTICATED | _NOT_FOUND,
)
async def update_sandbox_host(
    host_id: uuid.UUID, body: SandboxHostUpdate, hosts: SandboxHostServiceDep
) -> SandboxHostRead:
    return SandboxHostRead.model_validate(await hosts.update(host_id, body))


@router.delete(
    "/{host_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Remove a sandbox host",
    responses=_UNAUTHENTICATED | _NOT_FOUND | _CONFLICT,
)
async def delete_sandbox_host(host_id: uuid.UUID, hosts: SandboxHostServiceDep) -> None:
    await hosts.delete(host_id)
