"""Deployment log lines for the SSE route.

Workers (and tests) publish lines keyed by deployment id. With Redis,
``GET .../logs`` follows published lines until ``Done`` (or idle). If the
list is still empty (no publisher yet), it emits the three-line stub so the
Terminal ``Done`` → succeeded path keeps working until a worker publishes.
Without Redis, the in-memory store is a snapshot, or the stub when empty.
"""

from __future__ import annotations

import asyncio
import time
import uuid
from collections.abc import AsyncIterator, Generator, Sequence
from contextlib import asynccontextmanager, contextmanager

from redis import Redis
from redis import asyncio as aioredis
from redis.exceptions import RedisError

from app.core.config import DEPLOYMENT_LOG_FOLLOW_IDLE_SECONDS_DEFAULT
from app.core.errors import QueueUnavailableError
from app.core.logging import get_logger
from app.core.queue import ping_broker

logger = get_logger("services.deployment_logs")

DONE_LINE = "Done"
MAX_LINES = 10_000
MAX_LINE_CHARS = 4_096
DEFAULT_FOLLOW_IDLE_SECONDS = DEPLOYMENT_LOG_FOLLOW_IDLE_SECONDS_DEFAULT

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
_SSE_PACE_SECONDS = 0.05
_FOLLOW_POLL_SECONDS = 0.5

# Process-local fallback when Redis is unset (unit tests and local API without a broker).
_memory: dict[str, list[str]] = {}


def clear_memory_log_lines() -> None:
    """Test seam: drop in-memory lines between tests."""
    _memory.clear()


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
    bucket.append(text)
    if len(bucket) > MAX_LINES:
        _memory[key] = bucket[-MAX_LINES:]


def _sse_frame(line: str) -> bytes:
    return f"data: {line}\n\n".encode()


def _decode_redis_item(item: object) -> str:
    if isinstance(item, bytes):
        return item.decode("utf-8", errors="replace")
    return str(item)


def _map_redis_error(exc: RedisError) -> QueueUnavailableError:
    logger.warning("event=deployment_logs_redis_failed detail=%s", exc)
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


def _write_redis_sync(client: Redis, key: str, text: str) -> None:
    client.rpush(key, text)
    client.ltrim(key, -MAX_LINES, -1)
    client.expire(key, _TTL_SECONDS)


async def _write_redis_async(client: aioredis.Redis, key: str, text: str) -> None:
    await client.rpush(key, text)
    await client.ltrim(key, -MAX_LINES, -1)
    await client.expire(key, _TTL_SECONDS)


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


async def _sse_from_sequence(lines: Sequence[str]) -> AsyncIterator[bytes]:
    for line in lines:
        yield _sse_frame(line)
        await asyncio.sleep(_SSE_PACE_SECONDS)


async def _sse_from_redis(
    redis_url: str,
    deployment_id: uuid.UUID,
    *,
    follow_idle_seconds: int,
) -> AsyncIterator[bytes]:
    """Follow published Redis lines until Done, or idle without inventing Done.

    If the list is empty when the stream opens, emit the stub (until a worker
    publisher exists). Once any line has been published, never fall back to the
    stub mid-stream.
    """
    try:
        async with _async_redis(redis_url) as client:
            key = _key(deployment_id)
            length = await client.llen(key)
            if length == 0:
                async for frame in _sse_from_sequence(STUB_LOG_LINES):
                    yield frame
                return

            start = 0
            idle_deadline = time.monotonic() + follow_idle_seconds
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
                        yield _sse_frame(text)
                        await asyncio.sleep(_SSE_PACE_SECONDS)
                        start += 1
                        if text == DONE_LINE:
                            return
                    continue

                if time.monotonic() >= idle_deadline:
                    return
                await asyncio.sleep(_FOLLOW_POLL_SECONDS)
    except RedisError as exc:
        # Headers may already be sent; end the body without inventing Done.
        logger.warning("event=deployment_logs_redis_failed detail=%s", exc)
        return


async def iter_deployment_log_sse(
    redis_url: str | None,
    deployment_id: uuid.UUID,
    *,
    follow_idle_seconds: int = DEFAULT_FOLLOW_IDLE_SECONDS,
) -> AsyncIterator[bytes]:
    """Yield SSE frames for a stored deployment.

    Does not invent ``Done`` after published lines. Empty Redis (and empty
    memory) still use the stub, which ends with ``Done`` by contract.
    """
    if redis_url is None:
        lines = _memory.get(str(deployment_id))
        async for frame in _sse_from_sequence(lines if lines else STUB_LOG_LINES):
            yield frame
        return
    async for frame in _sse_from_redis(
        redis_url,
        deployment_id,
        follow_idle_seconds=follow_idle_seconds,
    ):
        yield frame
