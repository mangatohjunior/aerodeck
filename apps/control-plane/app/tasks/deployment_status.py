"""Isolated commits for deployment fields outside the request session.

Enqueue failure must mark the row even though the request then raises and rolls
back. Successful provision enqueue persists ``provision_job_id`` on its own
session so a flush failure cannot poison the request session and turn 202 into
500 (#139). Writers go through ``DeploymentTerminalService``; ``JobService`` owns
best-effort handling when persisting the job id after broker accept.
"""

import asyncio
import uuid

from app.core.config import get_settings
from app.core.db import SessionLocal, bind_engine, create_engine, unbind_engine
from app.core.logging import get_logger
from app.models.deployment import DeploymentStatus
from app.repositories.deployments import DeploymentRepository
from app.services.deployment_terminal import DeploymentTerminalService

logger = get_logger("tasks.deployment_status")


async def mark_deployment_failed_isolated(deployment_id: uuid.UUID) -> None:
    """Commit failed on its own session so a later request rollback cannot undo it."""
    async with SessionLocal() as session:
        try:
            stored = await DeploymentTerminalService(DeploymentRepository(session)).mark(
                deployment_id, DeploymentStatus.failed
            )
            if stored is None:
                raise LookupError(f"Deployment {deployment_id} not found")
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


async def set_provision_job_id_isolated(deployment_id: uuid.UUID, job_id: uuid.UUID) -> None:
    """Commit provision_job_id on its own session so request-session errors stay isolated."""
    async with SessionLocal() as session:
        try:
            stored = await DeploymentTerminalService(DeploymentRepository(session)).set_provision_job_id(
                deployment_id, job_id
            )
            if stored is None:
                raise LookupError(f"Deployment {deployment_id} not found")
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
