import uuid

import pytest
from httpx import AsyncClient

from tests.api.v1.test_projects import PROJECTS, create_project


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
    assert body["project_id"] == project["id"]
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
