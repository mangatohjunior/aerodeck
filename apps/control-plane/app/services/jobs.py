"""Enqueue long-running work for an environment and report on it.

The dispatcher is a protocol so routes never import Celery, and tests can
swap in an in-process implementation.
"""

import uuid
from dataclasses import dataclass
from typing import Protocol

from starlette.concurrency import run_in_threadpool

from app.core.logging import get_logger
from app.repositories.jobs import JobState
from app.services.environments import EnvironmentService
from app.services.provisioning import JobKind

logger = get_logger("services.jobs")


class JobDispatcher(Protocol):
    def dispatch(self, kind: JobKind, *, project_id: str, environment_id: str) -> str: ...

    def state(self, job_id: str) -> JobState: ...


@dataclass(frozen=True, slots=True)
class JobTicket:
    job_id: str
    kind: JobKind
    project_id: uuid.UUID
    environment_id: uuid.UUID


class JobService:
    def __init__(self, dispatcher: JobDispatcher, environments: EnvironmentService) -> None:
        self._dispatcher = dispatcher
        self._environments = environments

    async def enqueue(self, kind: JobKind, project_id: uuid.UUID, environment_id: uuid.UUID) -> JobTicket:
        environment = await self._environments.get(project_id, environment_id)
        # Publishing to the broker is blocking I/O; keep it off the event loop.
        job_id = await run_in_threadpool(
            self._dispatcher.dispatch,
            kind,
            project_id=str(environment.project_id),
            environment_id=str(environment.id),
        )
        logger.info("queued %s job %s for environment %s", kind.value, job_id, environment.id)
        return JobTicket(job_id=job_id, kind=kind, project_id=environment.project_id, environment_id=environment.id)

    async def state(self, job_id: uuid.UUID) -> JobState:
        return await run_in_threadpool(self._dispatcher.state, str(job_id))
