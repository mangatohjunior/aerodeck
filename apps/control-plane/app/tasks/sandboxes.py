"""Scheduled teardown of sandboxes whose TTL has elapsed.

Celery beat enqueues this on ``AERODECK_SANDBOX_REAP_INTERVAL_SECONDS``.
``POST /api/v1/sandboxes/reap-expired`` stays for a manual run. The worker
is a sync process, so the task bridges to the async service with one
``asyncio.run``.
"""

import asyncio

from celery import shared_task
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings, get_settings
from app.core.db import SessionLocal, bind_engine, create_engine, unbind_engine
from app.core.logging import get_logger
from app.repositories.projects import ProjectRepository
from app.repositories.sandbox_hosts import SandboxHostRepository
from app.repositories.sandboxes import SandboxRepository
from app.services.hypervisor import FirecrackerHypervisor, Hypervisor, MemoryHypervisor
from app.services.projects import ProjectService
from app.services.sandbox_hosts import SandboxHostService
from app.services.sandboxes import SandboxService

logger = get_logger("tasks.sandboxes")

REAP_TASK = "aerodeck.sandboxes.reap_expired"


def _hypervisor(settings: Settings) -> Hypervisor:
    if settings.sandbox_hypervisor == "firecracker":
        return FirecrackerHypervisor(api_url=settings.firecracker_api_url, image_root=settings.sandbox_image_root)
    return MemoryHypervisor()


def _sandbox_service(session: AsyncSession, settings: Settings, hypervisor: Hypervisor) -> SandboxService:
    sandboxes = SandboxRepository(session)
    return SandboxService(
        sandboxes,
        ProjectService(ProjectRepository(session)),
        hypervisor,
        SandboxHostService(SandboxHostRepository(session), sandboxes),
        require_host=settings.sandbox_hypervisor == "firecracker",
    )


async def reap_expired_once(
    *,
    settings: Settings | None = None,
    hypervisor: Hypervisor | None = None,
) -> dict[str, int]:
    """Stop every expired sandbox. Empty set is a no-op. One 502 does not abort the batch."""
    cfg = settings or get_settings()
    owns_engine = False
    engine = None
    if SessionLocal.kw.get("bind") is None:
        if not cfg.database_url:
            logger.info("sandbox reap skipped: AERODECK_DATABASE_URL is unset")
            return {"reaped": 0}
        engine = create_engine(cfg.database_url)
        bind_engine(engine)
        owns_engine = True
    try:
        async with SessionLocal() as session:
            try:
                service = _sandbox_service(session, cfg, hypervisor or _hypervisor(cfg))
                stopped = await service.reap_expired()
                await session.commit()
                logger.info("sandbox reap stopped %d expired microVM(s)", len(stopped))
                return {"reaped": len(stopped)}
            except Exception:
                await session.rollback()
                raise
    finally:
        if owns_engine and engine is not None:
            unbind_engine()
            await engine.dispose()


@shared_task(name=REAP_TASK, acks_late=True)
def reap_expired_sandboxes() -> dict[str, int]:
    return asyncio.run(reap_expired_once())
