"""Deployment log lines for the SSE route.

Workers (and tests) publish lines keyed by deployment id. When at least one
line exists, ``GET .../logs`` streams those lines (and appends ``Done`` if the
publisher omitted it). Otherwise the fixed stub sequence stays the contract.
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
_MAX_LINES = 10_000
_READ_BATCH = 64
_SSE_PACE_SECONDS = 0.05

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


def _trim_memory(deployment_id: str) -> None:
    bucket = _memory.get(deployment_id)
    if bucket is not None and len(bucket) > _MAX_LINES:
        _memory[deployment_id] = bucket[-_MAX_LINES:]


def _sse_frame(line: str) -> bytes:
    return f"data: {line}\n\n".encode()


def _decode_redis_item(item: object) -> str:
    if isinstance(item, bytes):
        return item.decode()
    return str(item)


def publish_line_sync(redis_url: str | None, deployment_id: uuid.UUID, line: str) -> None:
    """Append one line. Safe for Celery workers (sync Redis client)."""
    text = _normalize_line(line)
    if not redis_url:
        key = str(deployment_id)
        _memory.setdefault(key, []).append(text)
        _trim_memory(key)
        return
    client = Redis.from_url(redis_url, socket_connect_timeout=2, socket_timeout=2)
    try:
        key = _key(deployment_id)
        client.rpush(key, text)
        client.ltrim(key, -_MAX_LINES, -1)
        client.expire(key, _TTL_SECONDS)
    except RedisError as exc:
        logger.warning("event=deployment_logs_redis_failed detail=%s", exc)
        raise QueueUnavailableError("Deployment log store is unavailable") from exc
    finally:
        client.close()


async def publish_line(redis_url: str | None, deployment_id: uuid.UUID, line: str) -> None:
    """Append one line from async API or test code."""
    text = _normalize_line(line)
    if not redis_url:
        key = str(deployment_id)
        _memory.setdefault(key, []).append(text)
        _trim_memory(key)
        return
    client = aioredis.from_url(redis_url, socket_connect_timeout=2, socket_timeout=2)
    try:
        key = _key(deployment_id)
        await client.rpush(key, text)
        await client.ltrim(key, -_MAX_LINES, -1)
        await client.expire(key, _TTL_SECONDS)
    except RedisError as exc:
        logger.warning("event=deployment_logs_redis_failed detail=%s", exc)
        raise QueueUnavailableError("Deployment log store is unavailable") from exc
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
        logger.warning("event=deployment_logs_redis_failed detail=%s", exc)
        raise QueueUnavailableError("Deployment log store is unavailable") from exc
    finally:
        await client.aclose()


async def _sse_from_sequence(lines: Sequence[str], *, ensure_done: bool) -> AsyncIterator[bytes]:
    last: str | None = None
    for line in lines:
        last = line
        yield _sse_frame(line)
        await asyncio.sleep(_SSE_PACE_SECONDS)
    if ensure_done and last != DONE_LINE:
        yield _sse_frame(DONE_LINE)


async def _sse_from_redis(redis_url: str, deployment_id: uuid.UUID) -> AsyncIterator[bytes]:
    client = aioredis.from_url(redis_url, socket_connect_timeout=2, socket_timeout=2)
    try:
        key = _key(deployment_id)
        length = await client.llen(key)
        if length == 0:
            async for frame in _sse_from_sequence(STUB_LOG_LINES, ensure_done=False):
                yield frame
            return
        last: str | None = None
        start = 0
        while start < length:
            raw = await client.lrange(key, start, start + _READ_BATCH - 1)
            if not raw:
                break
            for item in raw:
                text = _decode_redis_item(item)
                last = text
                yield _sse_frame(text)
                await asyncio.sleep(_SSE_PACE_SECONDS)
            start += len(raw)
            # Pick up lines published while we stream, without reloading prior ones.
            length = await client.llen(key)
        if last != DONE_LINE:
            yield _sse_frame(DONE_LINE)
    except RedisError as exc:
        logger.warning("event=deployment_logs_redis_failed detail=%s", exc)
        raise QueueUnavailableError("Deployment log store is unavailable") from exc
    finally:
        await client.aclose()


async def iter_deployment_log_sse(
    redis_url: str | None,
    deployment_id: uuid.UUID,
) -> AsyncIterator[bytes]:
    """Yield SSE frames for a stored deployment. Appends ``Done`` when publishers omit it."""
    if redis_url is None:
        lines = _memory.get(str(deployment_id))
        if not lines:
            async for frame in _sse_from_sequence(STUB_LOG_LINES, ensure_done=False):
                yield frame
            return
        async for frame in _sse_from_sequence(lines, ensure_done=True):
            yield frame
        return
    async for frame in _sse_from_redis(redis_url, deployment_id):
        yield frame
