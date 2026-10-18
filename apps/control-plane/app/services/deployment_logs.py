"""Deployment log lines for the SSE route.

Workers (and tests) publish lines keyed by deployment id. When at least one
line exists, ``GET .../logs`` streams those lines. Otherwise the fixed stub
sequence stays the contract.
"""

from __future__ import annotations

import uuid
from redis import Redis
from redis import asyncio as aioredis

# Same lines the dashboard Terminal prints. Keep this list the contract until
# the worker publishes real events.
STUB_LOG_LINES = (
    "Initializing Terraform...",
    "Provisioning K3s...",
    "Done",
)

_KEY_PREFIX = "aerodeck:deployment-logs:"
_TTL_SECONDS = 7 * 24 * 60 * 60
_MAX_LINE_CHARS = 4_096

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
    if len(text) > _MAX_LINE_CHARS:
        raise ValueError(f"log line must be at most {_MAX_LINE_CHARS} characters")
    return text


def publish_line_sync(redis_url: str | None, deployment_id: uuid.UUID, line: str) -> None:
    """Append one line. Safe for Celery workers (sync Redis client)."""
    text = _normalize_line(line)
    if not redis_url:
        _memory.setdefault(str(deployment_id), []).append(text)
        return
    client = Redis.from_url(redis_url, socket_connect_timeout=2, socket_timeout=2)
    try:
        key = _key(deployment_id)
        client.rpush(key, text)
        client.expire(key, _TTL_SECONDS)
    finally:
        client.close()


async def publish_line(redis_url: str | None, deployment_id: uuid.UUID, line: str) -> None:
    """Append one line from async API or test code."""
    text = _normalize_line(line)
    if not redis_url:
        _memory.setdefault(str(deployment_id), []).append(text)
        return
    client = aioredis.from_url(redis_url, socket_connect_timeout=2, socket_timeout=2)
    try:
        key = _key(deployment_id)
        await client.rpush(key, text)
        await client.expire(key, _TTL_SECONDS)
    finally:
        await client.aclose()


async def published_lines(redis_url: str | None, deployment_id: uuid.UUID) -> list[str] | None:
    """Return published lines, or ``None`` when the stub should be used."""
    if not redis_url:
        lines = _memory.get(str(deployment_id))
        return list(lines) if lines else None
    client = aioredis.from_url(redis_url, socket_connect_timeout=2, socket_timeout=2)
    try:
        raw = await client.lrange(_key(deployment_id), 0, -1)
    finally:
        await client.aclose()
    if not raw:
        return None
    return [item.decode() if isinstance(item, bytes) else str(item) for item in raw]

