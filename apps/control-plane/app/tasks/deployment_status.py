"""Sync Celery bridge for deployment ``failed`` status.

Async isolated writes live in ``app.services.deployment_status_write``.
"""

import asyncio
import uuid

from app.core.config import get_settings
from app.core.db import SessionLocal, bind_engine, create_engine, unbind_engine
from app.core.logging import get_logger
from app.services.deployment_status_write import mark_deployment_failed_isolated

logger = get_logger("tasks.deployment_status")


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
