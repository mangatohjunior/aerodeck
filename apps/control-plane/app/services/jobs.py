"""Enqueue long-running work for an environment and report on it.

The dispatcher is a protocol so routes never import Celery, and tests can
swap in an in-process implementation.
"""

import uuid
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from typing import Protocol

from starlette.concurrency import run_in_threadpool

from app.core.logging import get_logger
from app.models.deployment import Deployment
from app.repositories.jobs import JobState
from app.services.deployment_logs import (
    PROVISION_QUEUE_FAILED_LINE,
    PROVISION_QUEUED_LINE,
    publish_line,
)
from app.services.deployments import DeploymentService
from app.services.environments import EnvironmentService
from app.services.provisioning import JobKind

logger = get_logger("services.jobs")

MarkDeploymentFailed = Callable[[uuid.UUID], Awaitable[None]]
SetProvisionJobId = Callable[[uuid.UUID, uuid.UUID], Awaitable[None]]


class JobDispatcher(Protocol):
    def dispatch(self, kind: JobKind, *, project_id: str, environment_id: str, **meta: str) -> str: ...

    def state(self, job_id: str) -> JobState: ...


@dataclass(frozen=True, slots=True)
class JobTicket:
    job_id: str
    kind: JobKind
    project_id: uuid.UUID
    environment_id: uuid.UUID


class JobService:
    def __init__(
        self,
        dispatcher: JobDispatcher,
        environments: EnvironmentService,
        deployments: DeploymentService,
        *,
        redis_url: str | None,
        mark_deployment_failed: MarkDeploymentFailed,
        set_provision_job_id: SetProvisionJobId,
    ) -> None:
        self._dispatcher = dispatcher
        self._environments = environments
        self._deployments = deployments
        self._redis_url = redis_url
        self._mark_deployment_failed = mark_deployment_failed
        self._set_provision_job_id = set_provision_job_id

    async def enqueue(
        self,
        kind: JobKind,
        project_id: uuid.UUID,
        environment_id: uuid.UUID,
        *,
        deployment_id: uuid.UUID | None = None,
    ) -> JobTicket:
        environment = await self._environments.get(project_id, environment_id)
        meta: dict[str, str] = {
            "project_slug": environment.project.slug,
            "environment_slug": environment.slug,
            "environment_kind": environment.kind.value,
            "region": environment.region,
        }
        linked_deployment: Deployment | None = None
        # Only provision publishes onto a deployment log stream (#121).
        if deployment_id is not None and kind is JobKind.provision:
            linked_deployment = await self._deployments.get(deployment_id)
            meta["deployment_id"] = str(linked_deployment.id)
            # Seed a non-Done line before the worker runs so SSE cannot stub Done
            # while the job is still queued (Terminal would mark succeeded).
            await publish_line(self._redis_url, linked_deployment.id, PROVISION_QUEUED_LINE)
        try:
            # Publishing to the broker is blocking I/O; keep it off the event loop.
            job_id = await run_in_threadpool(
                self._dispatcher.dispatch,
                kind,
                project_id=str(environment.project_id),
                environment_id=str(environment.id),
                **meta,
            )
        except Exception:
            if linked_deployment is not None:
                try:
                    await publish_line(
                        self._redis_url, linked_deployment.id, PROVISION_QUEUE_FAILED_LINE
                    )
                except Exception as publish_exc:
                    logger.warning(
                        "event=deployment_log_queue_failed_publish_skipped deployment=%s error_type=%s",
                        linked_deployment.id,
                        type(publish_exc).__name__,
                    )
                # Own session+commit: the request that raised will roll back.
                await self._mark_deployment_failed(linked_deployment.id)
            raise
        # Broker already accepted the task — persist on an isolated session so a
        # flush failure cannot poison the request session and turn 202 into 500 (#139).
        if linked_deployment is not None:
            try:
                job_uuid = uuid.UUID(job_id)
            except ValueError:
                logger.warning(
                    "event=deployment_provision_job_id_skipped deployment=%s job_id=%s error_type=ValueError",
                    linked_deployment.id,
                    job_id,
                )
            else:
                await self._set_provision_job_id(linked_deployment.id, job_uuid)
        logger.info("queued %s job %s for environment %s", kind.value, job_id, environment.id)
        return JobTicket(job_id=job_id, kind=kind, project_id=environment.project_id, environment_id=environment.id)

    async def state(self, job_id: uuid.UUID) -> JobState:
        return await run_in_threadpool(self._dispatcher.state, str(job_id))
