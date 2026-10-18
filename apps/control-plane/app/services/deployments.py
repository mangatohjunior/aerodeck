import uuid
from collections.abc import Sequence
from datetime import UTC, datetime

from app.core.errors import NotFoundError
from app.core.github import canonical_github_repo_url, parse_github_repo
from app.core.logging import get_logger
from app.models.deployment import Deployment, DeploymentStatus
from app.repositories.deployments import DeploymentRepository
from app.schemas.deployment import DeploymentCreate

logger = get_logger("services.deployments")


class DeploymentService:
    def __init__(self, deployments: DeploymentRepository) -> None:
        self._deployments = deployments

    async def create(self, data: DeploymentCreate) -> Deployment:
        parsed = parse_github_repo(data.repo_url)
        if parsed is None:
            raise ValueError("repo_url must be a GitHub repository URL")
        owner, repo = parsed
        stored = await self._deployments.add(
            Deployment(
                repo_url=canonical_github_repo_url(owner, repo),
                owner=owner,
                repo=repo,
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
        deployment = await self.get(deployment_id)
        if deployment.status == DeploymentStatus.succeeded:
            logger.info("deployment %s already succeeded; leave unchanged", deployment_id)
            return deployment
        if deployment.status == DeploymentStatus.failed:
            logger.info("deployment %s already failed; leave unchanged", deployment_id)
            return deployment
        deployment.status = DeploymentStatus.succeeded
        stored = await self._deployments.save(deployment)
        logger.info("deployment succeeded %s", stored.id)
        return stored

    async def mark_failed(self, deployment_id: uuid.UUID) -> Deployment:
        deployment = await self.get(deployment_id)
        if deployment.status == DeploymentStatus.succeeded:
            logger.info("deployment %s already succeeded; leave unchanged", deployment_id)
            return deployment
        if deployment.status == DeploymentStatus.failed:
            logger.info("deployment %s already failed; leave unchanged", deployment_id)
            return deployment
        deployment.status = DeploymentStatus.failed
        stored = await self._deployments.save(deployment)
        logger.info("deployment failed %s", stored.id)
        return stored
