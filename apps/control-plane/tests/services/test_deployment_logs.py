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
    PROVISION_QUEUED_LINE,
    clear_memory_log_lines,
    ensure_log_store_ready,
    iter_deployment_log_lines,
    provision_failure_line,
    publish_line,
    publish_line_sync,
    publish_provision_lines_sync,
    published_lines,
)
from app.services.provisioning import PermanentJobError


@pytest.fixture(autouse=True)
def _clean_memory() -> None:
    clear_memory_log_lines()
    yield
    clear_memory_log_lines()


async def _collect(lines) -> list[str]:
    return [line async for line in lines]


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
    client.llen = MagicMock(side_effect=lambda _key: len(stored))
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
    assert await _collect(iter_deployment_log_lines(None, deployment_id)) == ["Plan: 1 to add"]


@pytest.mark.asyncio
async def test_queued_seed_line_prevents_stub_done() -> None:
    """Enqueue seeds a non-Done line so empty-store stub Done cannot race the worker."""
    deployment_id = uuid4()
    await publish_line(None, deployment_id, PROVISION_QUEUED_LINE)
    lines = await _collect(iter_deployment_log_lines(None, deployment_id))
    assert lines == [PROVISION_QUEUED_LINE]
    assert DONE_LINE not in lines


@pytest.mark.asyncio
async def test_memory_stream_includes_publisher_done() -> None:
    deployment_id = uuid4()
    await publish_line(None, deployment_id, "Apply complete")
    await publish_line(None, deployment_id, DONE_LINE)
    lines = await _collect(iter_deployment_log_lines(None, deployment_id))
    assert lines.count(DONE_LINE) == 1


@pytest.mark.asyncio
async def test_memory_list_refuses_past_max_lines() -> None:
    deployment_id = uuid4()
    for index in range(MAX_LINES):
        await publish_line(None, deployment_id, f"line-{index}")
    with pytest.raises(ValueError, match="at most"):
        await publish_line(None, deployment_id, "one-more")
    lines = await published_lines(None, deployment_id)
    assert lines is not None
    assert len(lines) == MAX_LINES


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
async def test_redis_empty_list_stubs_after_short_grace(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(deployment_logs_mod, "_LINE_PACE_SECONDS", 0)
    monkeypatch.setattr(deployment_logs_mod, "_FOLLOW_POLL_SECONDS", 0)
    client = AsyncMock()
    client.llen = AsyncMock(return_value=0)
    monkeypatch.setattr(
        "app.services.deployment_logs.aioredis.from_url",
        lambda *_args, **_kwargs: client,
    )
    lines = await _collect(
        iter_deployment_log_lines(
            "redis://example/0",
            uuid4(),
            first_publish_grace_seconds=0,
        )
    )
    assert lines == ["Initializing Terraform...", "Provisioning K3s...", DONE_LINE]
    client.lrange.assert_not_called()


@pytest.mark.asyncio
async def test_redis_queued_seed_follows_without_stubbing_done(monkeypatch: pytest.MonkeyPatch) -> None:
    """A pre-worker queued line keeps SSE on follow-idle, not the stub Done path."""
    monkeypatch.setattr(deployment_logs_mod, "_LINE_PACE_SECONDS", 0)
    monkeypatch.setattr(deployment_logs_mod, "_FOLLOW_POLL_SECONDS", 0)
    stored = [PROVISION_QUEUED_LINE.encode()]
    client = _async_list_client(stored)
    monkeypatch.setattr(
        "app.services.deployment_logs.aioredis.from_url",
        lambda *_args, **_kwargs: client,
    )
    lines = await _collect(
        iter_deployment_log_lines(
            "redis://example/0",
            uuid4(),
            follow_idle_seconds=0,
            first_publish_grace_seconds=0,
        )
    )
    assert lines == [PROVISION_QUEUED_LINE]
    assert DONE_LINE not in lines


@pytest.mark.asyncio
async def test_redis_empty_list_follows_first_publish_within_grace(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(deployment_logs_mod, "_LINE_PACE_SECONDS", 0)
    monkeypatch.setattr(deployment_logs_mod, "_FOLLOW_POLL_SECONDS", 0)
    stored: list[bytes] = []
    client = _async_list_client(stored)
    polls = {"n": 0}

    async def llen(_key: str) -> int:
        polls["n"] += 1
        if polls["n"] >= 2 and not stored:
            stored.extend([b"from-worker", b"Done"])
        return len(stored)

    client.llen = AsyncMock(side_effect=llen)
    monkeypatch.setattr(
        "app.services.deployment_logs.aioredis.from_url",
        lambda *_args, **_kwargs: client,
    )
    lines = await _collect(
        iter_deployment_log_lines(
            "redis://example/0",
            uuid4(),
            first_publish_grace_seconds=1,
        )
    )
    assert lines == ["from-worker", DONE_LINE]


@pytest.mark.asyncio
async def test_redis_publish_refuses_when_at_max_lines(monkeypatch: pytest.MonkeyPatch) -> None:
    stored: list[bytes] = [f"x{i}".encode() for i in range(MAX_LINES)]
    client = _async_list_client(stored)
    monkeypatch.setattr(
        "app.services.deployment_logs.aioredis.from_url",
        lambda *_args, **_kwargs: client,
    )
    with pytest.raises(ValueError, match="at most"):
        await publish_line("redis://example/0", uuid4(), "one-more")


@pytest.mark.asyncio
async def test_redis_follow_cursor_survives_list_growth(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Regression: no left-trim, so paced readers keep a stable integer cursor."""
    monkeypatch.setattr(deployment_logs_mod, "_LINE_PACE_SECONDS", 0)
    monkeypatch.setattr(deployment_logs_mod, "_FOLLOW_POLL_SECONDS", 0)
    monkeypatch.setattr(deployment_logs_mod, "_READ_BATCH", 2)
    stored: list[bytes] = [b"a", b"b"]
    client = _async_list_client(stored)
    reads = {"n": 0}

    async def lrange(_key: str, start: int, end: int) -> list[bytes]:
        reads["n"] += 1
        if reads["n"] == 1:
            stored.extend(f"x{i}".encode() for i in range(MAX_LINES))
            stored.append(b"Done")
        return stored[start : end + 1]

    client.lrange = AsyncMock(side_effect=lrange)
    monkeypatch.setattr(
        "app.services.deployment_logs.aioredis.from_url",
        lambda *_args, **_kwargs: client,
    )
    lines = await _collect(iter_deployment_log_lines("redis://example/0", uuid4()))
    assert lines[0:2] == ["a", "b"]
    assert "x0" in lines
    assert lines[-1] == DONE_LINE
    assert lines.count(DONE_LINE) == 1


@pytest.mark.asyncio
async def test_redis_stream_stops_on_publisher_done(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(deployment_logs_mod, "_LINE_PACE_SECONDS", 0)
    client = AsyncMock()
    client.llen = AsyncMock(return_value=2)
    client.lrange = AsyncMock(return_value=[b"alpha", b"Done"])
    monkeypatch.setattr(
        "app.services.deployment_logs.aioredis.from_url",
        lambda *_args, **_kwargs: client,
    )
    lines = await _collect(iter_deployment_log_lines("redis://example/0", uuid4()))
    assert lines == ["alpha", DONE_LINE]
    client.aclose.assert_awaited_once()


@pytest.mark.asyncio
async def test_redis_stream_does_not_invent_done_after_idle(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(deployment_logs_mod, "_FOLLOW_POLL_SECONDS", 0)
    monkeypatch.setattr(deployment_logs_mod, "_LINE_PACE_SECONDS", 0)
    client = AsyncMock()
    client.llen = AsyncMock(return_value=1)
    client.lrange = AsyncMock(return_value=[b"still-running"])
    monkeypatch.setattr(
        "app.services.deployment_logs.aioredis.from_url",
        lambda *_args, **_kwargs: client,
    )
    lines = await _collect(
        iter_deployment_log_lines(
            "redis://example/0",
            uuid4(),
            follow_idle_seconds=1,
        )
    )
    assert lines == ["still-running"]


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
    client.llen = AsyncMock(return_value=0)
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
    monkeypatch.setattr(deployment_logs_mod, "_LINE_PACE_SECONDS", 0)
    client = AsyncMock()
    client.llen = AsyncMock(side_effect=[1, 1, RedisError("down")])
    client.lrange = AsyncMock(return_value=[b"partial"])
    monkeypatch.setattr(
        "app.services.deployment_logs.aioredis.from_url",
        lambda *_args, **_kwargs: client,
    )
    lines = await _collect(iter_deployment_log_lines("redis://example/0", uuid4()))
    assert lines == ["partial"]
    client.aclose.assert_awaited_once()


def test_provision_failure_line_is_class_name_only() -> None:
    exc = PermanentJobError("terraform stderr with dop_v1_live_SECRET and spaces keys")
    assert provision_failure_line(exc) == "Provision failed: PermanentJobError"
    assert "dop_v1" not in provision_failure_line(exc)
    assert "SECRET" not in provision_failure_line(exc)


@pytest.mark.asyncio
async def test_publish_provision_lines_sync_writes_all_lines() -> None:
    deployment_id = uuid4()
    publish_provision_lines_sync(None, deployment_id, "one", "two", DONE_LINE)
    assert await published_lines(None, deployment_id) == ["one", "two", DONE_LINE]


@pytest.mark.asyncio
async def test_publish_provision_lines_sync_keeps_trying_after_error(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    deployment_id = uuid4()
    calls: list[str] = []

    def flaky(_redis_url: str | None, _deployment_id: object, line: str) -> None:
        calls.append(line)
        if line == "boom":
            raise RuntimeError("unexpected store failure")

    monkeypatch.setattr(deployment_logs_mod, "publish_line_sync", flaky)
    publish_provision_lines_sync(None, deployment_id, "ok", "boom", DONE_LINE)
    assert calls == ["ok", "boom", DONE_LINE]
