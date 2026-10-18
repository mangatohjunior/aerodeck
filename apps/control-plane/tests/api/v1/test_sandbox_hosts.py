import uuid

import pytest
from fastapi import FastAPI
from httpx import AsyncClient

from app.core.config import get_settings
from tests.api.v1.test_projects import create_project
from tests.api.v1.test_sandboxes import sandbox_body, sandboxes_url
from tests.conftest import make_settings

HOSTS = "/api/v1/sandbox-hosts"


@pytest.fixture
async def project(client: AsyncClient, auth: dict[str, str]) -> dict:
    return await create_project(client, auth)


def host_body(name: str = "kvm-1", api_url: str = "http://10.0.20.4:8080") -> dict:
    return {"name": name, "api_url": api_url}


async def enroll(client: AsyncClient, auth: dict[str, str], **overrides: object) -> dict:
    body = host_body()
    body.update(overrides)
    response = await client.post(HOSTS, json=body, headers=auth)
    assert response.status_code == 201, response.text
    return response.json()


async def test_enroll_and_read_a_host(client: AsyncClient, auth: dict[str, str]) -> None:
    created = await enroll(client, auth)
    assert created["name"] == "kvm-1"
    assert created["api_url"] == "http://10.0.20.4:8080"
    assert created["status"] == "enrolled"
    uuid.UUID(created["id"])

    fetched = await client.get(f"{HOSTS}/{created['id']}", headers=auth)
    assert fetched.status_code == 200
    assert fetched.json()["name"] == "kvm-1"


async def test_duplicate_name_is_a_conflict(client: AsyncClient, auth: dict[str, str]) -> None:
    await enroll(client, auth)
    again = await client.post(HOSTS, json=host_body(), headers=auth)
    assert again.status_code == 409
    assert again.json()["code"] == "conflict"


async def test_non_http_api_url_is_rejected(client: AsyncClient, auth: dict[str, str]) -> None:
    response = await client.post(HOSTS, json=host_body(api_url="ftp://10.0.20.4/firecracker"), headers=auth)
    assert response.status_code == 422


async def test_create_requires_a_token(client: AsyncClient) -> None:
    response = await client.post(HOSTS, json=host_body())
    assert response.status_code == 401


async def test_sandbox_is_placed_on_the_least_loaded_host(
    client: AsyncClient, auth: dict[str, str], project: dict
) -> None:
    first = await enroll(client, auth, name="kvm-a", api_url="http://10.0.20.4:8080")
    second = await enroll(client, auth, name="kvm-b", api_url="http://10.0.20.5:8080")

    one = await client.post(sandboxes_url(project), json=sandbox_body("alpine-3.20"), headers=auth)
    two = await client.post(sandboxes_url(project), json=sandbox_body("debian-12"), headers=auth)
    assert one.status_code == 201 and two.status_code == 201
    assert one.json()["host_id"] == first["id"]
    assert two.json()["host_id"] == second["id"]


async def test_disabled_host_is_not_scheduled(
    client: AsyncClient, auth: dict[str, str], project: dict
) -> None:
    disabled = await enroll(client, auth, name="kvm-a")
    live = await enroll(client, auth, name="kvm-b", api_url="http://10.0.20.5:8080")
    patched = await client.patch(f"{HOSTS}/{disabled['id']}", json={"status": "disabled"}, headers=auth)
    assert patched.status_code == 200
    assert patched.json()["status"] == "disabled"

    created = await client.post(sandboxes_url(project), json=sandbox_body(), headers=auth)
    assert created.status_code == 201
    assert created.json()["host_id"] == live["id"]


async def test_cannot_delete_a_host_with_running_sandboxes(
    client: AsyncClient, auth: dict[str, str], project: dict
) -> None:
    host = await enroll(client, auth)
    created = await client.post(sandboxes_url(project), json=sandbox_body(), headers=auth)
    assert created.status_code == 201
    assert created.json()["host_id"] == host["id"]

    deleted = await client.delete(f"{HOSTS}/{host['id']}", headers=auth)
    assert deleted.status_code == 409
    assert deleted.json()["code"] == "conflict"


async def test_delete_removes_an_idle_host(client: AsyncClient, auth: dict[str, str]) -> None:
    host = await enroll(client, auth)
    deleted = await client.delete(f"{HOSTS}/{host['id']}", headers=auth)
    assert deleted.status_code == 204
    assert (await client.get(f"{HOSTS}/{host['id']}", headers=auth)).status_code == 404


async def test_firecracker_without_a_host_is_unavailable(
    client: AsyncClient, auth: dict[str, str], project: dict, app: FastAPI, settings
) -> None:
    app.dependency_overrides[get_settings] = lambda: make_settings(
        settings.database_url, sandbox_hypervisor="firecracker"
    )
    response = await client.post(sandboxes_url(project), json=sandbox_body(), headers=auth)
    assert response.status_code == 503
    assert response.json()["code"] == "sandbox_unavailable"
