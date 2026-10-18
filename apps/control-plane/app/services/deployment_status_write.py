"""Isolated commits for deployment ``failed`` outside the request session.

Enqueue failure must mark the row even though the request then raises and rolls
back. ``DeploymentService`` stays constructor-injected; this module owns the
extra session. The sync Celery bridge lives in ``app.tasks.deployment_status``.
"""

import uuid

from app.core.db import SessionLocal
from app.core.logging import get_logger
from app.repositories.deployments import DeploymentRepository
from app.services.deployments import DeploymentService

logger = get_logger("services.deployment_status_write")


async def mark_deployment_failed_isolated(deployment_id: uuid.UUID) -> None:
    """Commit failed on its own session so a later request rollback cannot undo it."""
    async with SessionLocal() as session:
        try:
            service = DeploymentService(DeploymentRepository(session))
            await service.mark_failed(deployment_id)
            await session.commit()
        except Exception:
            await session.rollback()
            raise


async def try_mark_deployment_failed_isolated(deployment_id: uuid.UUID) -> None:
    """Best-effort isolated mark; log and continue on failure."""
    try:
        await mark_deployment_failed_isolated(deployment_id)
    except Exception as status_exc:
        logger.warning(
            "event=deployment_failed_status_skipped deployment=%s error_type=%s",
            deployment_id,
            type(status_exc).__name__,
        )
