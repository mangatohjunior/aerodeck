from uuid import uuid4

import pytest

from app.services.deployment_logs import (
    clear_memory_log_lines,
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
