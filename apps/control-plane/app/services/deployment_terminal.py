"""Sticky terminal status updates (no environment lookup).

Used by ``DeploymentService`` for API succeed/fail and by the Celery/isolated
bridge so repositories stay persistence-only.
"""

import uuid

from app.core.logging import get_logger
from app.models.deployment import Deployment, DeploymentStatus
from app.repositories.deployments import DeploymentRepository

logger = get_logger("services.deployment_terminal")


class DeploymentTerminalService:
    def __init__(self, deployments: DeploymentRepository) -> None:
        self._deployments = deployments

    async def mark(
        self, deployment_id: uuid.UUID, status: DeploymentStatus
    ) -> Deployment | None:
        """Set succeeded/failed if not already terminal. ``None`` if the row is missing."""
        deployment = await self._deployments.get(deployment_id)
        if deployment is None:
            return None
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
