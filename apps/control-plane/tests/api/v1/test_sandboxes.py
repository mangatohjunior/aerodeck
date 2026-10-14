import uuid
from datetime import UTC, datetime, timedelta

import pytest
from httpx import AsyncClient

from app.core.db import SessionLocal
from app.models.sandbox import Sandbox
from tests.api.v1.test_projects import PROJECTS, create_project

REAP = "/api/v1/sandboxes/reap-expired"


@pytest.fixture
async def project(client: AsyncClient, auth: dict[str, str]) -> dict:
    return await create_project(client, auth)


def sandboxes_url(project: dict) -> str:
    return f"{PROJECTS}/{project['id']}/sandboxes"


def sandbox_body(image: str = "alpine-3.20", **overrides: object) -> dict:
    payload: dict[str, object] = {"image": image}
    payload.update(overrides)
    return payload


async def test_create_sandbox_boots_a_running_microvm(
    client: AsyncClient, auth: dict[str, str], project: dict
) -> None:
    created = await client.post(sandboxes_url(project), json=sandbox_body(), headers=auth)
    assert created.status_code == 201, created.text
    body = created.json()
    assert body["image"] == "alpine-3.20"
    assert body["vcpu"] == 1
    assert body["memory_mib"] == 128
    assert body["status"] == "running"
    assert body["ttl_seconds"] == 3600
    assert body["expires_at"]
    assert body["project_id"] == project["id"]
    assert body["host_id"] is None
    assert "hypervisor_vm_id" not in body
    uuid.UUID(body["id"])

    fetched = await client.get(f"{sandboxes_url(project)}/{body['id']}")
    assert fetched.status_code == 200
    assert fetched.json()["status"] == "running"


async def test_create_sandbox_accepts_vcpu_and_memory(
    client: AsyncClient, auth: dict[str, str], project: dict
) -> None:
    created = await client.post(
        sandboxes_url(project), json=sandbox_body(vcpu=2, memory_mib=256), headers=auth
    )
    assert created.status_code == 201, created.text
    assert created.json()["vcpu"] == 2
    assert created.json()["memory_mib"] == 256


async def test_invalid_image_is_rejected(client: AsyncClient, auth: dict[str, str], project: dict) -> None:
    response = await client.post(
        sandboxes_url(project), json=sandbox_body(image="../etc/passwd"), headers=auth
    )
    assert response.status_code == 422


async def test_unknown_project_is_not_found(client: AsyncClient, auth: dict[str, str]) -> None:
    response = await client.post(
        f"{PROJECTS}/{uuid.uuid4()}/sandboxes", json=sandbox_body(), headers=auth
    )
    assert response.status_code == 404
    assert response.json()["code"] == "not_found"


async def test_unknown_sandbox_is_not_found(client: AsyncClient, auth: dict[str, str], project: dict) -> None:
    response = await client.get(f"{sandboxes_url(project)}/{uuid.uuid4()}")
    assert response.status_code == 404
    assert response.json()["code"] == "not_found"


async def test_create_requires_a_token(client: AsyncClient, project: dict) -> None:
    response = await client.post(sandboxes_url(project), json=sandbox_body())
    assert response.status_code == 401
    assert response.json()["code"] in {"unauthenticated", "invalid_token"}


async def test_list_is_paginated(client: AsyncClient, auth: dict[str, str], project: dict) -> None:
    for image in ("alpine-3.20", "debian-12", "ubuntu-24.04"):
        created = await client.post(sandboxes_url(project), json=sandbox_body(image=image), headers=auth)
        assert created.status_code == 201, created.text

    page = await client.get(sandboxes_url(project), params={"limit": 2, "offset": 1})
    assert page.status_code == 200
    body = page.json()
    assert body["total"] == 3
    assert [item["image"] for item in body["items"]] == ["debian-12", "ubuntu-24.04"]


async def _expire(sandbox_id: str) -> None:
    async with SessionLocal() as session:
        row = await session.get(Sandbox, uuid.UUID(sandbox_id))
        assert row is not None
        row.expires_at = datetime.now(UTC) - timedelta(seconds=1)
        await session.commit()


async def test_create_accepts_a_custom_ttl(
    client: AsyncClient, auth: dict[str, str], project: dict
) -> None:
    created = await client.post(
        sandboxes_url(project), json=sandbox_body(ttl_seconds=120), headers=auth
    )
    assert created.status_code == 201, created.text
    assert created.json()["ttl_seconds"] == 120


async def test_ttl_below_minimum_is_rejected(
    client: AsyncClient, auth: dict[str, str], project: dict
) -> None:
    response = await client.post(
        sandboxes_url(project), json=sandbox_body(ttl_seconds=10), headers=auth
    )
    assert response.status_code == 422


async def test_get_stops_an_expired_sandbox(
    client: AsyncClient, auth: dict[str, str], project: dict
) -> None:
    created = await client.post(sandboxes_url(project), json=sandbox_body(), headers=auth)
    sandbox_id = created.json()["id"]
    await _expire(sandbox_id)

    fetched = await client.get(f"{sandboxes_url(project)}/{sandbox_id}")
    assert fetched.status_code == 200
    assert fetched.json()["status"] == "stopped"


async def test_reap_expired_stops_only_elapsed_sandboxes(
    client: AsyncClient, auth: dict[str, str], project: dict
) -> None:
    live = await client.post(sandboxes_url(project), json=sandbox_body("alpine-3.20"), headers=auth)
    stale = await client.post(sandboxes_url(project), json=sandbox_body("debian-12"), headers=auth)
    assert live.status_code == 201 and stale.status_code == 201
    await _expire(stale.json()["id"])

    reaped = await client.post(REAP, headers=auth)
    assert reaped.status_code == 200, reaped.text
    assert [item["id"] for item in reaped.json()] == [stale.json()["id"]]
    assert reaped.json()[0]["status"] == "stopped"

    assert (await client.get(f"{sandboxes_url(project)}/{live.json()['id']}")).json()["status"] == "running"
    assert (await client.get(f"{sandboxes_url(project)}/{stale.json()['id']}")).json()["status"] == "stopped"

    again = await client.post(REAP, headers=auth)
    assert again.status_code == 200
    assert again.json() == []


async def test_reap_expired_requires_a_token(client: AsyncClient) -> None:
    response = await client.post(REAP)
    assert response.status_code == 401
    assert response.json()["code"] in {"unauthenticated", "invalid_token"}
