"""Deployment log lines for the SSE route.

Workers (and tests) publish plain log lines keyed by deployment id. With Redis,
``iter_deployment_log_lines`` follows published lines until ``Done`` (or the long
follow-idle after the first line). If the list is still empty after a short
first-publish grace, it yields the three-line stub so the Terminal ``Done`` →
succeeded path still works until a worker publishes. Without Redis, the
in-memory store is a snapshot, or the stub when empty.

Redis lists are not left-trimmed while followers use an integer cursor; TTL
expires the key. Both stores refuse publishes beyond ``MAX_LINES``.
This module yields plain ``str`` lines; HTTP SSE framing belongs in the API layer.
"""

from __future__ import annotations

import asyncio
import time
import uuid
from collections.abc import AsyncIterator, Generator, Sequence
from contextlib import asynccontextmanager, contextmanager
from typing import Any

from redis import Redis
from redis import asyncio as aioredis
from redis.exceptions import RedisError

from app.core.config import (
    DEPLOYMENT_LOG_FIRST_PUBLISH_GRACE_SECONDS_DEFAULT,
    DEPLOYMENT_LOG_FOLLOW_IDLE_SECONDS_DEFAULT,
)
from app.core.errors import QueueUnavailableError
from app.core.logging import get_logger
from app.core.queue import ping_broker

logger = get_logger("services.deployment_logs")

DONE_LINE = "Done"
# Console Terminal treats Done as success → markDeploymentSucceeded. Publish Done
# only after a successful provision; failures publish the class-name line and stop.
PROVISION_START_LINE = "Starting environment provision..."
PROVISION_SUCCESS_LINE = "Environment provision finished."
MAX_LINES = 10_000
MAX_LINE_CHARS = 4_096
DEFAULT_FOLLOW_IDLE_SECONDS = DEPLOYMENT_LOG_FOLLOW_IDLE_SECONDS_DEFAULT
DEFAULT_FIRST_PUBLISH_GRACE_SECONDS = DEPLOYMENT_LOG_FIRST_PUBLISH_GRACE_SECONDS_DEFAULT

# Same lines the dashboard Terminal prints. Keep this list the contract until
# the worker publishes real events.
STUB_LOG_LINES = (
    "Initializing Terraform...",
    "Provisioning K3s...",
    DONE_LINE,
)

_KEY_PREFIX = "aerodeck:deployment-logs:"
_TTL_SECONDS = 7 * 24 * 60 * 60
_READ_BATCH = 64
_LINE_PACE_SECONDS = 0.05
_FOLLOW_POLL_SECONDS = 0.5

# Process-local fallback when Redis is unset (unit tests and local API without a broker).
_memory: dict[str, list[str]] = {}


def clear_memory_log_lines() -> None:
    """Test seam: drop in-memory lines between tests."""
    _memory.clear()


def memory_log_lines(deployment_id: uuid.UUID) -> list[str]:
    """Test seam: sync snapshot of in-memory lines (empty list when none)."""
    return list(_memory.get(str(deployment_id), []))


def _key(deployment_id: uuid.UUID) -> str:
    return f"{_KEY_PREFIX}{deployment_id}"


def _normalize_line(line: str) -> str:
    text = line.strip()
    if not text:
        raise ValueError("log line must not be empty")
    if "\n" in text or "\r" in text:
        raise ValueError("log line must be a single line")
    if len(text) > MAX_LINE_CHARS:
        raise ValueError(f"log line must be at most {MAX_LINE_CHARS} characters")
    return text


def _append_memory(deployment_id: uuid.UUID, text: str) -> None:
    key = str(deployment_id)
    bucket = _memory.setdefault(key, [])
    if len(bucket) >= MAX_LINES:
        raise ValueError(f"deployment log list is at most {MAX_LINES} lines")
    bucket.append(text)


def _decode_redis_item(item: object) -> str:
    if isinstance(item, bytes):
        return item.decode("utf-8", errors="replace")
    return str(item)


def _map_redis_error(exc: RedisError) -> QueueUnavailableError:
    logger.warning("event=deployment_logs_redis_failed error_type=%s", type(exc).__name__)
    return QueueUnavailableError("Deployment log store is unavailable")


@contextmanager
def _sync_redis(redis_url: str) -> Generator[Redis, None, None]:
    client = Redis.from_url(redis_url, socket_connect_timeout=2, socket_timeout=2)
    try:
        yield client
    finally:
        client.close()


@asynccontextmanager
async def _async_redis(redis_url: str) -> AsyncIterator[aioredis.Redis]:
    client = aioredis.from_url(redis_url, socket_connect_timeout=2, socket_timeout=2)
    try:
        yield client
    finally:
        await client.aclose()


def _queue_log_write(pipe: Any, key: str, text: str) -> None:
    pipe.rpush(key, text)
    pipe.expire(key, _TTL_SECONDS)


def _write_redis_sync(client: Redis, key: str, text: str) -> None:
    # No LTRIM: followers use a stable integer index; TTL cleans up the key.
    if int(client.llen(key)) >= MAX_LINES:
        raise ValueError(f"deployment log list is at most {MAX_LINES} lines")
    pipe = client.pipeline()
    _queue_log_write(pipe, key, text)
    pipe.execute()


async def _write_redis_async(client: aioredis.Redis, key: str, text: str) -> None:
    if int(await client.llen(key)) >= MAX_LINES:
        raise ValueError(f"deployment log list is at most {MAX_LINES} lines")
    pipe = client.pipeline()
    _queue_log_write(pipe, key, text)
    await pipe.execute()


def publish_line_sync(redis_url: str | None, deployment_id: uuid.UUID, line: str) -> None:
    """Append one line. Safe for Celery workers (sync Redis client)."""
    text = _normalize_line(line)
    if not redis_url:
        _append_memory(deployment_id, text)
        return
    try:
        with _sync_redis(redis_url) as client:
            _write_redis_sync(client, _key(deployment_id), text)
    except RedisError as exc:
        raise _map_redis_error(exc) from exc


def provision_failure_line(exc: BaseException) -> str:
    """Terminal failure line: exception class only — never ``str(exc)`` (may hold TF stderr)."""
    return f"Provision failed: {type(exc).__name__}"


def publish_provision_lines_sync(
    redis_url: str | None,
    deployment_id: uuid.UUID,
    *lines: str,
) -> None:
    """Publish worker progress. Log-store failures must not fail the provision job.

    Each line is attempted independently so a later ``Done`` still tries after a skip.
    """
    for line in lines:
        try:
            publish_line_sync(redis_url, deployment_id, line)
        except (QueueUnavailableError, ValueError) as exc:
            logger.warning(
                "event=deployment_log_publish_skipped deployment=%s error_type=%s",
                deployment_id,
                type(exc).__name__,
            )


async def publish_line(redis_url: str | None, deployment_id: uuid.UUID, line: str) -> None:
    """Append one line from async API or test code."""
    text = _normalize_line(line)
    if not redis_url:
        _append_memory(deployment_id, text)
        return
    try:
        async with _async_redis(redis_url) as client:
            await _write_redis_async(client, _key(deployment_id), text)
    except RedisError as exc:
        raise _map_redis_error(exc) from exc


async def ensure_log_store_ready(redis_url: str | None) -> None:
    """Touch Redis before SSE headers so a down broker can still become HTTP 503."""
    if not redis_url:
        return
    try:
        await ping_broker(redis_url)
    except RedisError as exc:
        raise _map_redis_error(exc) from exc


async def published_lines(redis_url: str | None, deployment_id: uuid.UUID) -> list[str] | None:
    """Return published lines for tests, or ``None`` when the stub should be used."""
    if not redis_url:
        lines = _memory.get(str(deployment_id))
        return list(lines) if lines else None
    try:
        async with _async_redis(redis_url) as client:
            key = _key(deployment_id)
            length = await client.llen(key)
            if length == 0:
                return None
            out: list[str] = []
            start = 0
            while start < length:
                raw = await client.lrange(key, start, start + _READ_BATCH - 1)
                if not raw:
                    break
                out.extend(_decode_redis_item(item) for item in raw)
                start += len(raw)
            return out or None
    except RedisError as exc:
        raise _map_redis_error(exc) from exc


async def _lines_from_sequence(lines: Sequence[str]) -> AsyncIterator[str]:
    for line in lines:
        yield line
        await asyncio.sleep(_LINE_PACE_SECONDS)


async def _lines_from_redis(
    redis_url: str,
    deployment_id: uuid.UUID,
    *,
    follow_idle_seconds: int,
    first_publish_grace_seconds: int,
) -> AsyncIterator[str]:
    """Follow published Redis lines until Done, or idle without inventing Done.

    Empty list: poll until the first line or ``first_publish_grace_seconds``,
    then stub. Long ``follow_idle_seconds`` applies only after a line exists.
    """
    try:
        async with _async_redis(redis_url) as client:
            key = _key(deployment_id)
            start = 0
            grace_deadline = time.monotonic() + first_publish_grace_seconds
            idle_deadline: float | None = None
            while True:
                length = await client.llen(key)
                if start < length:
                    idle_deadline = time.monotonic() + follow_idle_seconds
                    end = min(start + _READ_BATCH, length) - 1
                    raw = await client.lrange(key, start, end)
                    if not raw:
                        await asyncio.sleep(_FOLLOW_POLL_SECONDS)
                        continue
                    for item in raw:
                        text = _decode_redis_item(item)
                        yield text
                        await asyncio.sleep(_LINE_PACE_SECONDS)
                        start += 1
                        if text == DONE_LINE:
                            return
                    continue

                if idle_deadline is None:
                    if time.monotonic() >= grace_deadline:
                        async for line in _lines_from_sequence(STUB_LOG_LINES):
                            yield line
                        return
                elif time.monotonic() >= idle_deadline:
                    return
                await asyncio.sleep(_FOLLOW_POLL_SECONDS)
    except RedisError as exc:
        logger.warning("event=deployment_logs_redis_failed error_type=%s", type(exc).__name__)
        return


async def iter_deployment_log_lines(
    redis_url: str | None,
    deployment_id: uuid.UUID,
    *,
    follow_idle_seconds: int = DEFAULT_FOLLOW_IDLE_SECONDS,
    first_publish_grace_seconds: int = DEFAULT_FIRST_PUBLISH_GRACE_SECONDS,
) -> AsyncIterator[str]:
    """Yield plain log lines for a stored deployment (no HTTP framing).

    Does not invent ``Done`` after published lines. Empty Redis after the short
    first-publish grace (and empty memory) uses the stub, which ends with
    ``Done`` by contract.
    """
    if redis_url is None:
        lines = _memory.get(str(deployment_id))
        async for line in _lines_from_sequence(lines if lines else STUB_LOG_LINES):
            yield line
        return
    async for line in _lines_from_redis(
        redis_url,
        deployment_id,
        follow_idle_seconds=follow_idle_seconds,
        first_publish_grace_seconds=first_publish_grace_seconds,
    ):
        yield line
