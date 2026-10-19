"""JobService enqueue: persist failures after broker accept must not fail the ticket."""

import uuid
from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.models.deployment import Deployment, DeploymentStatus
from app.services.jobs import JobService
from app.services.provisioning import JobKind


def _deployment() -> Deployment:
    return Deployment(
        id=uuid.uuid4(),
        repo_url="https://github.com/acme/payments",
        owner="acme",
        repo="payments",
        status=DeploymentStatus.running,
        started_at=datetime.now(UTC),
    )


@pytest.mark.asyncio
async def test_enqueue_returns_ticket_when_provision_job_id_persist_fails() -> None:
    job_id = str(uuid.uuid4())
    deployment = _deployment()
    environment = MagicMock()
    environment.project_id = uuid.uuid4()
    environment.id = uuid.uuid4()
    environment.slug = "prod"
    environment.kind.value = "prod"
    environment.region = "nyc3"
    environment.project.slug = "payments"

    dispatcher = MagicMock()
    dispatcher.dispatch.return_value = job_id

    deployments = AsyncMock()
    deployments.get.return_value = deployment
    deployments.set_provision_job_id.side_effect = RuntimeError("session boom")

    environments = AsyncMock()
    environments.get.return_value = environment

    service = JobService(
        dispatcher,
        environments,
        deployments,
        redis_url=None,
        mark_deployment_failed=AsyncMock(),
    )

    ticket = await service.enqueue(
        JobKind.provision,
        environment.project_id,
        environment.id,
        deployment_id=deployment.id,
    )

    assert ticket.job_id == job_id
    deployments.set_provision_job_id.assert_awaited_once()


@pytest.mark.asyncio
async def test_enqueue_returns_ticket_when_job_id_is_not_a_uuid() -> None:
    deployment = _deployment()
    environment = MagicMock()
    environment.project_id = uuid.uuid4()
    environment.id = uuid.uuid4()
    environment.slug = "prod"
    environment.kind.value = "prod"
    environment.region = "nyc3"
    environment.project.slug = "payments"

    dispatcher = MagicMock()
    dispatcher.dispatch.return_value = "not-a-uuid"

    deployments = AsyncMock()
    deployments.get.return_value = deployment

    environments = AsyncMock()
    environments.get.return_value = environment

    service = JobService(
        dispatcher,
        environments,
        deployments,
        redis_url=None,
        mark_deployment_failed=AsyncMock(),
    )

    ticket = await service.enqueue(
        JobKind.provision,
        environment.project_id,
        environment.id,
        deployment_id=deployment.id,
    )

    assert ticket.job_id == "not-a-uuid"
    deployments.set_provision_job_id.assert_not_awaited()
