"""Celery application factory and broker health check. No connections at import time."""

from celery import Celery
from redis import asyncio as aioredis

from app.core.config import Settings, get_settings
from app.tasks.environments import TASK_NAMES


def create_celery_app(settings: Settings) -> Celery:
    app = Celery(
        "aerodeck",
        broker=settings.redis_url,
        backend=settings.redis_url,
        include=["app.tasks.environments"],
    )
    app.conf.update(
        task_default_queue=settings.job_queue,
        task_serializer="json",
        result_serializer="json",
        accept_content=["json"],
        timezone="UTC",
        enable_utc=True,
        # A job is acknowledged only after it finishes, so a worker that dies
        # mid-run hands the job to another worker instead of losing it.
        task_acks_late=True,
        task_reject_on_worker_lost=True,
        worker_prefetch_multiplier=1,
        task_track_started=True,
        result_expires=settings.job_result_ttl_seconds,
        result_extended=True,
        broker_connection_retry_on_startup=True,
    )
    app.finalize()
    for name in TASK_NAMES:
        task = app.tasks[name]
        task.max_retries = settings.job_max_retries
        task.retry_backoff_max = settings.job_retry_backoff_max_seconds
    return app


def get_celery_app() -> Celery:
    """Worker entrypoint. The API process uses ``create_celery_app(settings)`` instead."""
    return create_celery_app(get_settings())


async def ping_broker(redis_url: str, timeout: float = 2.0) -> None:
    client = aioredis.from_url(redis_url, socket_connect_timeout=timeout, socket_timeout=timeout)
    try:
        await client.ping()
    finally:
        await client.aclose()
