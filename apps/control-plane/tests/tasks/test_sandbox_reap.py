"""Scheduled sandbox reap. Uses the memory hypervisor — no KVM."""

from fastapi import FastAPI
from httpx import AsyncClient

from app.core.config import Settings
from app.core.queue import create_celery_app
from app.tasks.sandboxes import REAP_TASK, reap_expired_once
from tests.api.v1.test_projects import create_project
from tests.api.v1.test_sandboxes import _expire, sandbox_body, sandboxes_url
from tests.conftest import make_settings


async def test_scheduled_reap_stops_expired_sandboxes(
    client: AsyncClient, auth: dict[str, str], settings: Settings
) -> None:
    project = await create_project(client, auth)
    stale = await client.post(sandboxes_url(project), json=sandbox_body("alpine-3.20"), headers=auth)
    live = await client.post(sandboxes_url(project), json=sandbox_body("debian-12"), headers=auth)
    assert stale.status_code == 201 and live.status_code == 201
    await _expire(stale.json()["id"])

    assert await reap_expired_once(settings=settings) == {"reaped": 1}

    assert (await client.get(f"{sandboxes_url(project)}/{stale.json()['id']}", headers=auth)).json()["status"] == "stopped"
    assert (await client.get(f"{sandboxes_url(project)}/{live.json()['id']}", headers=auth)).json()["status"] == "running"


async def test_scheduled_reap_is_a_noop_when_nothing_is_expired(app: FastAPI, settings: Settings) -> None:
    assert await reap_expired_once(settings=settings) == {"reaped": 0}


def test_beat_schedules_the_reap_from_settings() -> None:
    app = create_celery_app(make_settings(database_url=None, redis_url="memory://", sandbox_reap_interval_seconds=45))

    entry = app.conf.beat_schedule["reap-expired-sandboxes"]
    assert entry["task"] == REAP_TASK
    assert entry["schedule"] == 45.0
    assert REAP_TASK in app.tasks


def test_zero_interval_disables_beat() -> None:
    app = create_celery_app(make_settings(database_url=None, redis_url="memory://", sandbox_reap_interval_seconds=0))

    assert app.conf.beat_schedule == {}
