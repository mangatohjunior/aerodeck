"""Deployment records and log streams.

``POST /api/v1/deployments`` stores a GitHub repository request. It does not
call DigitalOcean. ``GET /api/v1/deployments/{deployment_id}/logs`` streams
worker-published lines when present, otherwise the stub. ``POST .../succeeded``
records that the stream finished. Neither call touches DigitalOcean.
"""

import uuid
from uuid import UUID

from fastapi import APIRouter, status
from fastapi.responses import StreamingResponse

from app.api.deps import DeploymentServiceDep, PaginationDep, SettingsDep
from app.schemas.auth import ErrorResponse
from app.schemas.common import Page
from app.schemas.deployment import DeploymentCreate, DeploymentRead
from app.services.deployment_logs import iter_deployment_log_sse

router = APIRouter(prefix="/deployments", tags=["deployments"])

_NOT_FOUND = {status.HTTP_404_NOT_FOUND: {"model": ErrorResponse}}
_UNAUTHENTICATED = {status.HTTP_401_UNAUTHORIZED: {"model": ErrorResponse}}
_UNAVAILABLE = {status.HTTP_503_SERVICE_UNAVAILABLE: {"model": ErrorResponse}}


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
    status_code=status.HTTP_200_OK,
    summary="Record that a deployment finished",
    responses=_NOT_FOUND | _UNAUTHENTICATED,
)
async def succeed_deployment(deployment_id: uuid.UUID, deployments: DeploymentServiceDep) -> DeploymentRead:
    return DeploymentRead.model_validate(await deployments.mark_succeeded(deployment_id))


@router.get(
    "/{deployment_id}/logs",
    summary="Stream deployment logs (SSE)",
    response_class=StreamingResponse,
    responses=_NOT_FOUND | _UNAUTHENTICATED | _UNAVAILABLE,
)
async def stream_deployment_logs(
    deployment_id: UUID,
    deployments: DeploymentServiceDep,
    settings: SettingsDep,
) -> StreamingResponse:
    """Stream published lines when present; otherwise the stub for a stored deployment."""
    await deployments.get(deployment_id)
    return StreamingResponse(
        iter_deployment_log_sse(settings.redis_url, deployment_id),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )
