import uuid
from collections.abc import Sequence
from datetime import UTC, datetime

from app.core.errors import NotFoundError
from app.core.github import canonical_github_repo_url, parse_github_repo
from app.core.logging import get_logger
from app.models.deployment import Deployment, DeploymentStatus
from app.repositories.deployments import DeploymentRepository
from app.schemas.deployment import DeploymentCreate
from app.services.environments import EnvironmentService

logger = get_logger("services.deployments")


class DeploymentService:
    def __init__(
        self,
        deployments: DeploymentRepository,
        environments: EnvironmentService,
    ) -> None:
        self._deployments = deployments
        self._environments = environments

    async def create(self, data: DeploymentCreate) -> Deployment:
        parsed = parse_github_repo(data.repo_url)
        if parsed is None:
            raise ValueError("repo_url must be a GitHub repository URL")
        owner, repo = parsed
        project_id = data.project_id
        environment_id = data.environment_id
        if project_id is not None and environment_id is not None:
            await self._environments.get(project_id, environment_id)
        stored = await self._deployments.add(
            Deployment(
                repo_url=canonical_github_repo_url(owner, repo),
                owner=owner,
                repo=repo,
                project_id=project_id,
                environment_id=environment_id,
                status=DeploymentStatus.running,
                started_at=datetime.now(UTC),
            )
        )
        logger.info("created deployment %s", stored.id)
        return stored

    async def get(self, deployment_id: uuid.UUID) -> Deployment:
        deployment = await self._deployments.get(deployment_id)
        if deployment is None:
            raise NotFoundError(f"Deployment {deployment_id} not found")
        return deployment

    async def list(self, *, limit: int, offset: int) -> tuple[Sequence[Deployment], int]:
        return await self._deployments.list(limit=limit, offset=offset)

    async def mark_succeeded(self, deployment_id: uuid.UUID) -> Deployment:
        return await self._mark_terminal(deployment_id, DeploymentStatus.succeeded)

    async def mark_failed(self, deployment_id: uuid.UUID) -> Deployment:
        return await self._mark_terminal(deployment_id, DeploymentStatus.failed)

    async def _mark_terminal(
        self, deployment_id: uuid.UUID, status: DeploymentStatus
    ) -> Deployment:
        deployment = await self.get(deployment_id)
        if deployment.status in (DeploymentStatus.succeeded, DeploymentStatus.failed):
            logger.info(
                "deployment %s already %s; leave unchanged",
                deployment_id,
                deployment.status.value,
            )
            return deployment
        deployment.status = status
        stored = await self._deployments.save(deployment)
        logger.info("deployment %s %s", stored.id, status.value)
        return stored
