import uuid

from fastapi import APIRouter, status

from app.api.deps import ClientDep, JobServiceDep
from app.schemas.auth import ErrorResponse
from app.schemas.job import JobRead

router = APIRouter(prefix="/jobs", tags=["jobs"])


@router.get(
    "/{job_id}",
    response_model=JobRead,
    status_code=status.HTTP_200_OK,
    summary="Get a job's status and outcome",
    description=(
        "Status reflects the result backend. A job id that was never issued is "
        "indistinguishable from one still waiting for a worker: both report `queued`."
    ),
    responses={
        status.HTTP_401_UNAUTHORIZED: {"model": ErrorResponse},
        status.HTTP_503_SERVICE_UNAVAILABLE: {"model": ErrorResponse},
    },
)
async def get_job(job_id: uuid.UUID, jobs: JobServiceDep, client: ClientDep) -> JobRead:
    """`client` is required so only an enrolled caller can inspect job status."""
    _ = client
    state = await jobs.state(job_id)
    return JobRead(job_id=job_id, status=state.status, result=state.result, error=state.error)
