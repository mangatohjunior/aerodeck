"""Deployment log lines for the SSE route.

Workers (and tests) publish lines keyed by deployment id. When at least one
line exists, ``GET .../logs`` streams those lines. The stream ends only when
the publisher writes ``Done`` (or, for Redis live follow, after a short idle
wait with no new lines and no ``Done`` — it does **not** invent ``Done``).

Without Redis (``redis_url is None``), the in-memory store is a **snapshot**:
lines present at open are streamed once. With Redis, the stream **follows**
the list until ``Done`` or idle timeout.
"""

from __future__ import annotations

import asyncio
import uuid
from collections.abc import AsyncIterator, Sequence

from redis import Redis
from redis import asyncio as aioredis
from redis.exceptions import RedisError

from app.core.errors import QueueUnavailableError
from app.core.logging import get_logger

logger = get_logger("services.deployment_logs")

DONE_LINE = "Done"
MAX_LINES = 10_000

# Same lines the dashboard Terminal prints. Keep this list the contract until
# the worker publishes real events.
STUB_LOG_LINES = (
    "Initializing Terraform...",
    "Provisioning K3s...",
    DONE_LINE,
)

_KEY_PREFIX = "aerodeck:deployment-logs:"
_TTL_SECONDS = 7 * 24 * 60 * 60
_MAX_LINE_CHARS = 4_096
_READ_BATCH = 64
_SSE_PACE_SECONDS = 0.05
# After catching up with no Done, poll this many times then close without inventing Done.
_FOLLOW_POLL_SECONDS = 0.05
_FOLLOW_IDLE_ROUNDS = 40

# Process-local fallback when Redis is unset (unit tests and local API without a broker).
_memory: dict[str, list[str]] = {}


def clear_memory_log_lines() -> None:
    """Drop in-memory lines between tests."""
    _memory.clear()


def _key(deployment_id: uuid.UUID) -> str:
    return f"{_KEY_PREFIX}{deployment_id}"


def _normalize_line(line: str) -> str:
    text = line.strip()
    if not text:
        raise ValueError("log line must not be empty")
    if "\n" in text or "\r" in text:
        raise ValueError("log line must be a single line")
    if len(text) > _MAX_LINE_CHARS:
        raise ValueError(f"log line must be at most {_MAX_LINE_CHARS} characters")
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
    client = Redis.from_url(redis_url, socket_connect_timeout=2, socket_timeout=2)
    try:
        _write_redis_sync(client, _key(deployment_id), text)
    except RedisError as exc:
        raise _map_redis_error(exc) from exc
    finally:
        client.close()


async def publish_line(redis_url: str | None, deployment_id: uuid.UUID, line: str) -> None:
    """Append one line from async API or test code."""
    text = _normalize_line(line)
    if not redis_url:
        _append_memory(deployment_id, text)
        return
    client = aioredis.from_url(redis_url, socket_connect_timeout=2, socket_timeout=2)
    try:
        await _write_redis_async(client, _key(deployment_id), text)
    except RedisError as exc:
        raise _map_redis_error(exc) from exc
    finally:
        await client.aclose()


async def ensure_log_store_ready(redis_url: str | None) -> None:
    """Touch Redis before SSE headers so a down broker can still become HTTP 503."""
    if not redis_url:
        return
    client = aioredis.from_url(redis_url, socket_connect_timeout=2, socket_timeout=2)
    try:
        await client.ping()
    except RedisError as exc:
        raise _map_redis_error(exc) from exc
    finally:
        await client.aclose()


async def published_lines(redis_url: str | None, deployment_id: uuid.UUID) -> list[str] | None:
    """Return published lines for tests, or ``None`` when the stub should be used."""
    if not redis_url:
        lines = _memory.get(str(deployment_id))
        return list(lines) if lines else None
    client = aioredis.from_url(redis_url, socket_connect_timeout=2, socket_timeout=2)
    try:
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
    finally:
        await client.aclose()


async def _sse_from_sequence(lines: Sequence[str]) -> AsyncIterator[bytes]:
    for line in lines:
        yield _sse_frame(line)
        await asyncio.sleep(_SSE_PACE_SECONDS)


async def _sse_from_redis(redis_url: str, deployment_id: uuid.UUID) -> AsyncIterator[bytes]:
    """Follow the Redis list until the publisher writes Done, or idle out without inventing Done."""
    client = aioredis.from_url(redis_url, socket_connect_timeout=2, socket_timeout=2)
    try:
        key = _key(deployment_id)
        length = await client.llen(key)
        if length == 0:
            async for frame in _sse_from_sequence(STUB_LOG_LINES):
                yield frame
            return

        start = 0
        idle_rounds = 0
        while True:
            length = await client.llen(key)
            if start < length:
                idle_rounds = 0
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

            idle_rounds += 1
            if idle_rounds >= _FOLLOW_IDLE_ROUNDS:
                return
            await asyncio.sleep(_FOLLOW_POLL_SECONDS)
    except RedisError as exc:
        raise _map_redis_error(exc) from exc
    finally:
        await client.aclose()


async def iter_deployment_log_sse(
    redis_url: str | None,
    deployment_id: uuid.UUID,
) -> AsyncIterator[bytes]:
    """Yield SSE frames for a stored deployment. Never invents a trailing Done."""
    if redis_url is None:
        lines = _memory.get(str(deployment_id))
        async for frame in _sse_from_sequence(lines if lines else STUB_LOG_LINES):
            yield frame
        return
    async for frame in _sse_from_redis(redis_url, deployment_id):
        yield frame
