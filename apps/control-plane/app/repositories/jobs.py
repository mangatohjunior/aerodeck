"""Job dispatch and state, stored in the Celery broker and result backend (Redis)."""

import uuid
from dataclasses import dataclass
from typing import Literal

from celery import Celery
from celery.result import AsyncResult

from app.services.provisioning import JobKind
from app.tasks.environments import PROVISION_TASK, RECONCILE_TASK

JobStatus = Literal["queued", "running", "retrying", "succeeded", "failed"]

_CELERY_STATE_TO_STATUS: dict[str, JobStatus] = {
    "PENDING": "queued",
    "RECEIVED": "queued",
    "STARTED": "running",
    "RETRY": "retrying",
    "SUCCESS": "succeeded",
    "FAILURE": "failed",
    "REVOKED": "failed",
}

_TASK_FOR_KIND = {JobKind.provision: PROVISION_TASK, JobKind.reconcile: RECONCILE_TASK}


@dataclass(frozen=True, slots=True)
class JobState:
    job_id: str
    status: JobStatus
    result: dict[str, str | bool] | None
    error: str | None


class CeleryJobDispatcher:
    """Publishes jobs and reads their state. Blocking; the service runs it in a thread."""

    def __init__(self, app: Celery) -> None:
        self._app = app

    def dispatch(self, kind: JobKind, *, project_id: str, environment_id: str, **meta: str) -> str:
        job_id = str(uuid.uuid4())
        self._app.tasks[_TASK_FOR_KIND[kind]].apply_async(
            kwargs={"project_id": project_id, "environment_id": environment_id, **meta},
            task_id=job_id,
        )
        return job_id

    def state(self, job_id: str) -> JobState:
        result = AsyncResult(job_id, app=self._app)
        status = _CELERY_STATE_TO_STATUS.get(result.state, "running")
        payload = result.result
        if status == "succeeded" and isinstance(payload, dict):
            return JobState(job_id, status, payload, None)
        if status == "failed":
            return JobState(job_id, status, None, _describe_failure(payload))
        return JobState(job_id, status, None, None)


def _describe_failure(exc: object) -> str:
    # Class name plus message; provider payloads stay in worker logs, not API responses.
    return f"{type(exc).__name__}: {exc}" if isinstance(exc, BaseException) else "Job failed"
