"""Isolated commits for deployment ``failed`` outside the request session.

Enqueue failure must mark the row even though the request then raises and rolls
back. ``DeploymentService`` stays constructor-injected; this module owns the
extra session (task bridge, not ``app.services``). Sync Celery entry points live
here too.
"""

import asyncio
import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.db import SessionLocal, bind_engine, create_engine, unbind_engine
from app.core.logging import get_logger
from app.repositories.deployments import DeploymentRepository
from app.repositories.environments import EnvironmentRepository
from app.repositories.projects import ProjectRepository
from app.services.deployments import DeploymentService
from app.services.environments import EnvironmentService
from app.services.projects import ProjectService

logger = get_logger("tasks.deployment_status")


def _deployment_service(session: AsyncSession) -> DeploymentService:
    deployments = DeploymentRepository(session)
    projects = ProjectService(ProjectRepository(session), deployments)
    environments = EnvironmentService(EnvironmentRepository(session), projects, deployments)
    return DeploymentService(deployments, environments)


async def mark_deployment_failed_isolated(deployment_id: uuid.UUID) -> None:
    """Commit failed on its own session so a later request rollback cannot undo it."""
    async with SessionLocal() as session:
        try:
            service = _deployment_service(session)
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
            exc_info=status_exc,
        )


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


def try_mark_deployment_failed_sync(deployment_id: uuid.UUID) -> None:
    """Best-effort sync mark; log and continue on failure."""
    try:
        mark_deployment_failed_sync(deployment_id)
    except Exception as status_exc:
        logger.warning(
            "event=deployment_failed_status_skipped deployment=%s error_type=%s",
            deployment_id,
            type(status_exc).__name__,
            exc_info=status_exc,
        )
