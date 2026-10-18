"""Deployment records and log streams.

``POST /api/v1/deployments`` stores a GitHub repository request. It does not
call DigitalOcean. ``GET /api/v1/deployments/{deployment_id}/logs`` streams the stub for a stored
row. ``POST .../succeeded`` records that the stub finished. Neither call
touches DigitalOcean.
"""

import asyncio
import uuid
from collections.abc import AsyncIterator
from uuid import UUID

from fastapi import APIRouter, status
from fastapi.responses import StreamingResponse

from app.api.deps import ClientDep, DeploymentServiceDep, PaginationDep
from app.schemas.auth import ErrorResponse
from app.schemas.common import Page
from app.schemas.deployment import DeploymentCreate, DeploymentRead

router = APIRouter(prefix="/deployments", tags=["deployments"])

_NOT_FOUND = {status.HTTP_404_NOT_FOUND: {"model": ErrorResponse}}
_UNAUTHENTICATED = {status.HTTP_401_UNAUTHORIZED: {"model": ErrorResponse}}


@router.get("", response_model=Page[DeploymentRead], summary="List deployments")
async def list_deployments(page: PaginationDep, deployments: DeploymentServiceDep) -> Page[DeploymentRead]:
    items, total = await deployments.list(limit=page.limit, offset=page.offset)
    return Page(
        items=[DeploymentRead.model_validate(row) for row in items],
        total=total,
        limit=page.limit,
        offset=page.offset,
    )


@router.post(
    "",
    response_model=DeploymentRead,
    status_code=status.HTTP_201_CREATED,
    summary="Create a deployment",
    responses=_UNAUTHENTICATED,
)
async def create_deployment(body: DeploymentCreate, deployments: DeploymentServiceDep) -> DeploymentRead:
    return DeploymentRead.model_validate(await deployments.create(body))


@router.get(
    "/{deployment_id}",
    response_model=DeploymentRead,
    summary="Get a deployment",
    responses=_NOT_FOUND,
)
async def get_deployment(deployment_id: uuid.UUID, deployments: DeploymentServiceDep) -> DeploymentRead:
    return DeploymentRead.model_validate(await deployments.get(deployment_id))


@router.post(
    "/{deployment_id}/succeeded",
    response_model=DeploymentRead,
    summary="Record that a deployment stub finished",
    responses=_NOT_FOUND | _UNAUTHENTICATED,
)
async def succeed_deployment(deployment_id: uuid.UUID, deployments: DeploymentServiceDep) -> DeploymentRead:
    return DeploymentRead.model_validate(await deployments.mark_succeeded(deployment_id))


# Same lines the dashboard Terminal prints. Keep this list the contract until
# the worker publishes real events.
_MOCK_LOG_LINES = (
    "Initializing Terraform...",
    "Provisioning K3s...",
    "Done",
)


async def _mock_log_stream() -> AsyncIterator[bytes]:
    for line in _MOCK_LOG_LINES:
        yield f"data: {line}\n\n".encode()
        await asyncio.sleep(0.05)


@router.get(
    "/{deployment_id}/logs",
    summary="Stream deployment logs (SSE stub)",
    response_class=StreamingResponse,
)
async def stream_deployment_logs(
    deployment_id: UUID,
    deployments: DeploymentServiceDep,
    client: ClientDep,
) -> StreamingResponse:
    """Stub SSE stream for a stored deployment. An unknown id does not stream."""
    await deployments.get(deployment_id)
    _ = client
    return StreamingResponse(
        _mock_log_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )
