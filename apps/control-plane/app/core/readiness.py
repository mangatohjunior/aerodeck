"""Readiness checks shared by ``/readyz`` and ``/metrics``."""

from typing import Literal

from sqlalchemy.ext.asyncio import AsyncEngine

from app.core.db import ping
from app.core.logging import get_logger
from app.core.queue import ping_broker

logger = get_logger("readiness")

CheckStatus = Literal["ok", "failed", "skipped"]


async def collect_checks(engine: AsyncEngine | None, redis_url: str | None) -> dict[str, CheckStatus]:
    checks: dict[str, CheckStatus] = {}
    if engine is None:
        checks["database"] = "skipped"
    else:
        try:
            await ping(engine)
            checks["database"] = "ok"
        except Exception:
            logger.exception("database readiness check failed")
            checks["database"] = "failed"

    if redis_url is None:
        checks["queue"] = "skipped"
    else:
        try:
            await ping_broker(redis_url)
            checks["queue"] = "ok"
        except Exception:
            logger.exception("queue readiness check failed")
            checks["queue"] = "failed"
    return checks
