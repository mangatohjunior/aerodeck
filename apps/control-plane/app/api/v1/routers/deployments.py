"""Deployment log streams.

``GET /api/v1/deployments/{deployment_id}/logs`` is an SSE stub. It yields the
same event shape the dashboard Terminal already mocks. A later story replaces
the generator with worker-published events; the response media type does not
change.
"""

import asyncio
from collections.abc import AsyncIterator
from uuid import UUID

from fastapi import APIRouter
from fastapi.responses import StreamingResponse

from app.api.deps import ClientDep

router = APIRouter(prefix="/deployments", tags=["deployments"])

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
    client: ClientDep,
) -> StreamingResponse:
    """Stub SSE stream. `deployment_id` is accepted so the path is stable."""
    _ = client
    _ = deployment_id
    return StreamingResponse(
        _mock_log_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )
