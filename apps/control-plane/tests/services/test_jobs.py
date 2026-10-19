"""JobService enqueue: provision_job_id persist must not fail a broker-accepted ticket."""

import uuid
from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.models.deployment import Deployment, DeploymentStatus
from app.services.jobs import JobService
from app.services.provisioning import JobKind
from app.tasks.deployment_status import try_set_provision_job_id_isolated


def _deployment() -> Deployment:
    return Deployment(
        id=uuid.uuid4(),
        repo_url="https://github.com/acme/payments",
        owner="acme",
        repo="payments",
        status=DeploymentStatus.running,
        started_at=datetime.now(UTC),
    )


def _environment() -> MagicMock:
    environment = MagicMock()
    environment.project_id = uuid.uuid4()
    environment.id = uuid.uuid4()
    environment.slug = "prod"
    environment.kind.value = "prod"
    environment.region = "nyc3"
    environment.project.slug = "payments"
    return environment


def _job_service(
    *,
    job_id: str,
    deployment: Deployment,
    environment: MagicMock,
    set_provision_job_id: AsyncMock | None = None,
) -> tuple[JobService, AsyncMock]:
    dispatcher = MagicMock()
    dispatcher.dispatch.return_value = job_id

    deployments = AsyncMock()
    deployments.get.return_value = deployment

    environments = AsyncMock()
    environments.get.return_value = environment

    persist = set_provision_job_id if set_provision_job_id is not None else AsyncMock()
    service = JobService(
        dispatcher,
        environments,
        deployments,
        redis_url=None,
        mark_deployment_failed=AsyncMock(),
        set_provision_job_id=persist,
    )
    return service, persist


@pytest.mark.asyncio
async def test_enqueue_persists_provision_job_id_via_injected_callback() -> None:
    job_id = str(uuid.uuid4())
    deployment = _deployment()
    environment = _environment()
    service, persist = _job_service(
        job_id=job_id,
        deployment=deployment,
        environment=environment,
    )

    ticket = await service.enqueue(
        JobKind.provision,
        environment.project_id,
        environment.id,
        deployment_id=deployment.id,
    )

    assert ticket.job_id == job_id
    persist.assert_awaited_once_with(deployment.id, uuid.UUID(job_id))


@pytest.mark.asyncio
async def test_enqueue_returns_ticket_when_job_id_is_not_a_uuid() -> None:
    deployment = _deployment()
    environment = _environment()
    service, persist = _job_service(
        job_id="not-a-uuid",
        deployment=deployment,
        environment=environment,
    )

    ticket = await service.enqueue(
        JobKind.provision,
        environment.project_id,
        environment.id,
        deployment_id=deployment.id,
    )

    assert ticket.job_id == "not-a-uuid"
    persist.assert_not_awaited()


@pytest.mark.asyncio
async def test_enqueue_returns_ticket_when_provision_job_id_persist_raises() -> None:
    job_id = str(uuid.uuid4())
    deployment = _deployment()
    environment = _environment()
    persist = AsyncMock(side_effect=RuntimeError("session boom"))
    service, _ = _job_service(
        job_id=job_id,
        deployment=deployment,
        environment=environment,
        set_provision_job_id=persist,
    )

    ticket = await service.enqueue(
        JobKind.provision,
        environment.project_id,
        environment.id,
        deployment_id=deployment.id,
    )

    assert ticket.job_id == job_id
    persist.assert_awaited_once()


@pytest.mark.asyncio
async def test_try_set_provision_job_id_isolated_swallows_errors(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def boom(_deployment_id: uuid.UUID, _job_id: uuid.UUID) -> None:
        raise RuntimeError("session boom")

    monkeypatch.setattr(
        "app.tasks.deployment_status.set_provision_job_id_isolated",
        boom,
    )
    await try_set_provision_job_id_isolated(uuid.uuid4(), uuid.uuid4())
