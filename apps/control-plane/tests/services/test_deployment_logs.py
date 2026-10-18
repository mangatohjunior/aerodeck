from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest
from redis.exceptions import RedisError

from app.core.errors import QueueUnavailableError
from app.services import deployment_logs as deployment_logs_mod
from app.services.deployment_logs import (
    DONE_LINE,
    MAX_LINES,
    clear_memory_log_lines,
    ensure_log_store_ready,
    iter_deployment_log_sse,
    publish_line,
    publish_line_sync,
    published_lines,
)


@pytest.fixture(autouse=True)
def _clean_memory() -> None:
    clear_memory_log_lines()
    yield
    clear_memory_log_lines()


@pytest.mark.asyncio
async def test_published_lines_return_none_until_a_line_exists() -> None:
    deployment_id = uuid4()
    assert await published_lines(None, deployment_id) is None

    await publish_line(None, deployment_id, "  hello  ")
    assert await published_lines(None, deployment_id) == ["hello"]


@pytest.mark.asyncio
async def test_sync_publish_is_visible_to_async_read() -> None:
    deployment_id = uuid4()
    publish_line_sync(None, deployment_id, "from-worker")
    assert await published_lines(None, deployment_id) == ["from-worker"]


@pytest.mark.asyncio
async def test_empty_line_is_rejected() -> None:
    with pytest.raises(ValueError, match="empty"):
        await publish_line(None, uuid4(), "   ")


@pytest.mark.asyncio
async def test_multiline_payload_is_rejected() -> None:
    with pytest.raises(ValueError, match="single line"):
        await publish_line(None, uuid4(), "one\ntwo")
    with pytest.raises(ValueError, match="single line"):
        publish_line_sync(None, uuid4(), "one\rtwo")


@pytest.mark.asyncio
async def test_memory_stream_does_not_invent_done() -> None:
    deployment_id = uuid4()
    await publish_line(None, deployment_id, "Plan: 1 to add")
    body = b"".join([chunk async for chunk in iter_deployment_log_sse(None, deployment_id)])
    assert body == b"data: Plan: 1 to add\n\n"
    assert b"data: Done" not in body


@pytest.mark.asyncio
async def test_memory_stream_includes_publisher_done() -> None:
    deployment_id = uuid4()
    await publish_line(None, deployment_id, "Apply complete")
    await publish_line(None, deployment_id, DONE_LINE)
    body = b"".join([chunk async for chunk in iter_deployment_log_sse(None, deployment_id)])
    assert body.count(b"data: Done\n\n") == 1


@pytest.mark.asyncio
async def test_memory_list_is_capped() -> None:
    deployment_id = uuid4()
    for index in range(MAX_LINES + 25):
        await publish_line(None, deployment_id, f"line-{index}")
    lines = await published_lines(None, deployment_id)
    assert lines is not None
    assert len(lines) == MAX_LINES
    assert lines[0] == "line-25"
    assert lines[-1] == f"line-{MAX_LINES + 24}"


@pytest.mark.asyncio
async def test_publish_line_uses_redis_rpush_ltrim_expire(monkeypatch: pytest.MonkeyPatch) -> None:
    client = AsyncMock()
    monkeypatch.setattr(
        "app.services.deployment_logs.aioredis.from_url",
        lambda *_args, **_kwargs: client,
    )
    deployment_id = uuid4()
    await publish_line("redis://example/0", deployment_id, "hello")
    client.rpush.assert_awaited_once()
    client.ltrim.assert_awaited_once()
    client.expire.assert_awaited_once()
    client.aclose.assert_awaited_once()


def test_publish_line_sync_uses_redis_rpush_ltrim_expire(monkeypatch: pytest.MonkeyPatch) -> None:
    client = MagicMock()
    monkeypatch.setattr(
        "app.services.deployment_logs.Redis.from_url",
        lambda *_args, **_kwargs: client,
    )
    deployment_id = uuid4()
    publish_line_sync("redis://example/0", deployment_id, "hello")
    client.rpush.assert_called_once()
    client.ltrim.assert_called_once()
    client.expire.assert_called_once()
    client.close.assert_called_once()


@pytest.mark.asyncio
async def test_published_lines_empty_redis_list_is_none(monkeypatch: pytest.MonkeyPatch) -> None:
    client = AsyncMock()
    client.llen = AsyncMock(return_value=0)
    monkeypatch.setattr(
        "app.services.deployment_logs.aioredis.from_url",
        lambda *_args, **_kwargs: client,
    )
    assert await published_lines("redis://example/0", uuid4()) is None
    client.lrange.assert_not_called()
    client.aclose.assert_awaited_once()


@pytest.mark.asyncio
async def test_published_lines_reads_redis_in_batches(monkeypatch: pytest.MonkeyPatch) -> None:
    client = AsyncMock()
    client.llen = AsyncMock(return_value=2)
    client.lrange = AsyncMock(return_value=[b"one", b"two"])
    monkeypatch.setattr(
        "app.services.deployment_logs.aioredis.from_url",
        lambda *_args, **_kwargs: client,
    )
    assert await published_lines("redis://example/0", uuid4()) == ["one", "two"]
    client.lrange.assert_awaited()
    client.aclose.assert_awaited_once()


@pytest.mark.asyncio
async def test_redis_stream_stops_on_publisher_done(monkeypatch: pytest.MonkeyPatch) -> None:
    client = AsyncMock()
    client.llen = AsyncMock(return_value=2)
    client.lrange = AsyncMock(return_value=[b"alpha", b"Done"])
    monkeypatch.setattr(
        "app.services.deployment_logs.aioredis.from_url",
        lambda *_args, **_kwargs: client,
    )
    body = b"".join(
        [chunk async for chunk in iter_deployment_log_sse("redis://example/0", uuid4())]
    )
    assert body == b"data: alpha\n\ndata: Done\n\n"
    client.aclose.assert_awaited_once()


@pytest.mark.asyncio
async def test_redis_stream_does_not_invent_done_after_idle(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(deployment_logs_mod, "_FOLLOW_IDLE_ROUNDS", 2)
    monkeypatch.setattr(deployment_logs_mod, "_FOLLOW_POLL_SECONDS", 0)
    monkeypatch.setattr(deployment_logs_mod, "_SSE_PACE_SECONDS", 0)
    client = AsyncMock()
    client.llen = AsyncMock(return_value=1)
    client.lrange = AsyncMock(return_value=[b"still-running"])
    monkeypatch.setattr(
        "app.services.deployment_logs.aioredis.from_url",
        lambda *_args, **_kwargs: client,
    )
    body = b"".join(
        [chunk async for chunk in iter_deployment_log_sse("redis://example/0", uuid4())]
    )
    assert body == b"data: still-running\n\n"
    assert b"data: Done" not in body


@pytest.mark.asyncio
async def test_ensure_log_store_ready_maps_redis_failure(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    client = AsyncMock()
    client.ping = AsyncMock(side_effect=RedisError("down"))
    monkeypatch.setattr(
        "app.services.deployment_logs.aioredis.from_url",
        lambda *_args, **_kwargs: client,
    )
    with pytest.raises(QueueUnavailableError):
        await ensure_log_store_ready("redis://example/0")
    client.aclose.assert_awaited_once()


@pytest.mark.asyncio
async def test_redis_publish_failure_maps_to_queue_unavailable(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    client = AsyncMock()
    client.rpush = AsyncMock(side_effect=RedisError("down"))
    monkeypatch.setattr(
        "app.services.deployment_logs.aioredis.from_url",
        lambda *_args, **_kwargs: client,
    )
    with pytest.raises(QueueUnavailableError):
        await publish_line("redis://example/0", uuid4(), "hello")
    client.aclose.assert_awaited_once()
