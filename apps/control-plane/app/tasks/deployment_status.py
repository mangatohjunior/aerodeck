"""Isolated DB writes for deployment ``failed`` from workers and enqueue failure.

Celery and the enqueue path need a commit that survives the request/session
rollback. Bridges live here (like ``tasks/sandboxes.py``) so ``DeploymentService``
stays constructor-injected only.
"""

import asyncio
import uuid

from app.core.config import get_settings
from app.core.db import SessionLocal, bind_engine, create_engine, unbind_engine
from app.core.logging import get_logger
from app.repositories.deployments import DeploymentRepository
from app.services.deployments import DeploymentService

logger = get_logger("tasks.deployment_status")


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


def mark_deployment_failed_sync(deployment_id: uuid.UUID) -> None:
    """Worker-side bridge: sync Celery tasks mark a linked deployment failed."""
    settings = get_settings()
    if not settings.database_url:
        logger.info("deployment failed status skipped: AERODECK_DATABASE_URL is unset")
        return

    async def _run() -> None:
        owns_engine = False
        engine = None
        if SessionLocal.kw.get("bind") is None:
            engine = create_engine(settings.database_url)
            bind_engine(engine)
            owns_engine = True
        try:
            await mark_deployment_failed_isolated(deployment_id)
        finally:
            if owns_engine and engine is not None:
                unbind_engine()
                await engine.dispose()

    asyncio.run(_run())
