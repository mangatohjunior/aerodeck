from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest
from redis.exceptions import RedisError

from app.core.errors import QueueUnavailableError
from app.services import deployment_logs as deployment_logs_mod
from app.services.deployment_logs import (
    DONE_LINE,
    MAX_LINE_CHARS,
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


def _async_list_client(stored: list[bytes]) -> AsyncMock:
    client = AsyncMock()

    class Pipe:
        def __init__(self) -> None:
            self._pending: list[tuple[str, object]] = []

        def rpush(self, _key: str, text: object) -> object:
            self._pending.append(("rpush", text))
            return self

        def expire(self, _key: str, _ttl: int) -> object:
            self._pending.append(("expire", _ttl))
            return self

        async def execute(self) -> list[object]:
            for op, value in self._pending:
                if op == "rpush":
                    stored.append(value.encode() if isinstance(value, str) else value)  # type: ignore[arg-type]
            self._pending.clear()
            return []

    client.pipeline = MagicMock(return_value=Pipe())
    client.llen = AsyncMock(side_effect=lambda _key: len(stored))
    client.lrange = AsyncMock(side_effect=lambda _key, start, end: stored[start : end + 1])
    return client


def _sync_list_client(stored: list[bytes]) -> MagicMock:
    client = MagicMock()

    class Pipe:
        def __init__(self) -> None:
            self._pending: list[tuple[str, object]] = []

        def rpush(self, _key: str, text: object) -> object:
            self._pending.append(("rpush", text))
            return self

        def expire(self, _key: str, _ttl: int) -> object:
            self._pending.append(("expire", _ttl))
            return self

        def execute(self) -> list[object]:
            for op, value in self._pending:
                if op == "rpush":
                    stored.append(value.encode() if isinstance(value, str) else value)  # type: ignore[arg-type]
            self._pending.clear()
            return []

    client.pipeline = MagicMock(return_value=Pipe())
    return client


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
async def test_oversized_line_is_rejected() -> None:
    huge = "x" * (MAX_LINE_CHARS + 1)
    with pytest.raises(ValueError, match="at most"):
        await publish_line(None, uuid4(), huge)
    with pytest.raises(ValueError, match="at most"):
        publish_line_sync(None, uuid4(), huge)


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
async def test_publish_line_round_trips_through_redis(monkeypatch: pytest.MonkeyPatch) -> None:
    stored: list[bytes] = []
    client = _async_list_client(stored)
    monkeypatch.setattr(
        "app.services.deployment_logs.aioredis.from_url",
        lambda *_args, **_kwargs: client,
    )
    deployment_id = uuid4()
    await publish_line("redis://example/0", deployment_id, "hello")
    assert await published_lines("redis://example/0", deployment_id) == ["hello"]


def test_publish_line_sync_writes_through_pipeline(monkeypatch: pytest.MonkeyPatch) -> None:
    stored: list[bytes] = []
    client = _sync_list_client(stored)
    monkeypatch.setattr(
        "app.services.deployment_logs.Redis.from_url",
        lambda *_args, **_kwargs: client,
    )
    publish_line_sync("redis://example/0", uuid4(), "from-worker")
    assert stored == [b"from-worker"]


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
async def test_redis_empty_list_uses_stub_after_idle(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(deployment_logs_mod, "_SSE_PACE_SECONDS", 0)
    monkeypatch.setattr(deployment_logs_mod, "_FOLLOW_POLL_SECONDS", 0)
    client = AsyncMock()
    client.llen = AsyncMock(return_value=0)
    monkeypatch.setattr(
        "app.services.deployment_logs.aioredis.from_url",
        lambda *_args, **_kwargs: client,
    )
    body = b"".join(
        [
            chunk
            async for chunk in iter_deployment_log_sse(
                "redis://example/0",
                uuid4(),
                follow_idle_seconds=1,
            )
        ]
    )
    assert b"data: Initializing Terraform...\n\n" in body
    assert body.endswith(b"data: Done\n\n")
    client.lrange.assert_not_called()


@pytest.mark.asyncio
async def test_redis_waits_for_first_line_before_stubbing(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(deployment_logs_mod, "_SSE_PACE_SECONDS", 0)
    monkeypatch.setattr(deployment_logs_mod, "_FOLLOW_POLL_SECONDS", 0)
    stored: list[bytes] = []
    client = _async_list_client(stored)

    async def llen(_key: str) -> int:
        if len(stored) == 0:
            stored.extend([b"from-worker", b"Done"])
        return len(stored)

    client.llen = AsyncMock(side_effect=llen)
    monkeypatch.setattr(
        "app.services.deployment_logs.aioredis.from_url",
        lambda *_args, **_kwargs: client,
    )
    body = b"".join(
        [
            chunk
            async for chunk in iter_deployment_log_sse(
                "redis://example/0",
                uuid4(),
                follow_idle_seconds=1,
            )
        ]
    )
    assert body == b"data: from-worker\n\ndata: Done\n\n"
    assert b"Initializing Terraform" not in body


@pytest.mark.asyncio
async def test_redis_follow_cursor_survives_list_growth(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Regression: no left-trim, so paced readers keep a stable integer cursor."""
    monkeypatch.setattr(deployment_logs_mod, "_SSE_PACE_SECONDS", 0)
    monkeypatch.setattr(deployment_logs_mod, "_FOLLOW_POLL_SECONDS", 0)
    monkeypatch.setattr(deployment_logs_mod, "_READ_BATCH", 2)
    stored: list[bytes] = [b"a", b"b"]
    client = _async_list_client(stored)
    reads = {"n": 0}

    async def lrange(_key: str, start: int, end: int) -> list[bytes]:
        reads["n"] += 1
        if reads["n"] == 1:
            # Publisher appends far past MAX_LINES while the reader is mid-stream.
            stored.extend(f"x{i}".encode() for i in range(MAX_LINES))
            stored.append(b"Done")
        return stored[start : end + 1]

    client.lrange = AsyncMock(side_effect=lrange)
    monkeypatch.setattr(
        "app.services.deployment_logs.aioredis.from_url",
        lambda *_args, **_kwargs: client,
    )
    body = b"".join(
        [chunk async for chunk in iter_deployment_log_sse("redis://example/0", uuid4())]
    )
    assert body.startswith(b"data: a\n\ndata: b\n\n")
    assert b"data: x0\n\n" in body
    assert body.endswith(b"data: Done\n\n")
    assert body.count(b"data: Done\n\n") == 1


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
        [
            chunk
            async for chunk in iter_deployment_log_sse(
                "redis://example/0",
                uuid4(),
                follow_idle_seconds=1,
            )
        ]
    )
    assert body == b"data: still-running\n\n"
    assert b"data: Done" not in body


@pytest.mark.asyncio
async def test_ensure_log_store_ready_maps_redis_failure(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def boom(_url: str, timeout: float = 2.0) -> None:
        raise RedisError("down")

    monkeypatch.setattr("app.services.deployment_logs.ping_broker", boom)
    with pytest.raises(QueueUnavailableError):
        await ensure_log_store_ready("redis://example/0")


@pytest.mark.asyncio
async def test_redis_publish_failure_maps_to_queue_unavailable(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    client = AsyncMock()
    pipe = MagicMock()
    pipe.rpush = MagicMock(return_value=pipe)
    pipe.expire = MagicMock(return_value=pipe)
    pipe.execute = AsyncMock(side_effect=RedisError("down"))
    client.pipeline = MagicMock(return_value=pipe)
    monkeypatch.setattr(
        "app.services.deployment_logs.aioredis.from_url",
        lambda *_args, **_kwargs: client,
    )
    with pytest.raises(QueueUnavailableError):
        await publish_line("redis://example/0", uuid4(), "hello")
    client.aclose.assert_awaited_once()


@pytest.mark.asyncio
async def test_mid_stream_redis_failure_ends_cleanly(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(deployment_logs_mod, "_SSE_PACE_SECONDS", 0)
    client = AsyncMock()
    client.llen = AsyncMock(side_effect=[1, 1, RedisError("down")])
    client.lrange = AsyncMock(return_value=[b"partial"])
    monkeypatch.setattr(
        "app.services.deployment_logs.aioredis.from_url",
        lambda *_args, **_kwargs: client,
    )
    body = b"".join(
        [chunk async for chunk in iter_deployment_log_sse("redis://example/0", uuid4())]
    )
    assert body == b"data: partial\n\n"
    assert b"data: Done" not in body
    client.aclose.assert_awaited_once()
