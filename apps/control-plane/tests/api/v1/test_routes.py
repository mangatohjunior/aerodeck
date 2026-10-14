import uuid

import pytest
from httpx import AsyncClient

from tests.api.v1.test_environments import envs_url
from tests.api.v1.test_projects import PROJECTS, create_project

EDGE = "/api/v1/edge/traefik"


@pytest.fixture
async def project(client: AsyncClient, auth: dict[str, str]) -> dict:
    return await create_project(client, auth)


@pytest.fixture
async def environment(client: AsyncClient, auth: dict[str, str], project: dict) -> dict:
    response = await client.post(
        envs_url(project), json={"slug": "dev", "name": "Dev", "kind": "dev"}, headers=auth
    )
    assert response.status_code == 201, response.text
    return response.json()


def routes_url(project: dict) -> str:
    return f"{PROJECTS}/{project['id']}/routes"


def route_body(environment: dict, hostname: str = "payments.example.com", **overrides: object) -> dict:
    payload = {
        "environment_id": environment["id"],
        "hostname": hostname,
        "backend_host": "10.10.1.20",
        "backend_port": 8080,
    }
    payload.update(overrides)
    return payload


async def test_create_route_appears_in_traefik_snapshot(
    client: AsyncClient, auth: dict[str, str], project: dict, environment: dict
) -> None:
    created = await client.post(routes_url(project), json=route_body(environment), headers=auth)

    assert created.status_code == 201, created.text
    body = created.json()
    assert body["hostname"] == "payments.example.com"
    assert body["path_prefix"] == "/"
    assert body["entrypoint"] == "web"
    assert body["enabled"] is True
    uuid.UUID(body["id"])

    snapshot = await client.get(EDGE, headers=auth)
    assert snapshot.status_code == 200, snapshot.text
    name = f"rt-{uuid.UUID(body['id']).hex}"
    http = snapshot.json()["http"]
    assert http["routers"][name]["rule"] == "Host(`payments.example.com`)"
    assert http["routers"][name]["entryPoints"] == ["web"]
    assert http["services"][name]["loadBalancer"]["servers"] == [{"url": "http://10.10.1.20:8080"}]


async def test_path_prefix_is_part_of_the_traefik_rule(
    client: AsyncClient, auth: dict[str, str], project: dict, environment: dict
) -> None:
    created = await client.post(
        routes_url(project),
        json=route_body(environment, path_prefix="/api/"),
        headers=auth,
    )
    assert created.status_code == 201, created.text
    assert created.json()["path_prefix"] == "/api"

    snapshot = await client.get(EDGE, headers=auth)
    name = f"rt-{uuid.UUID(created.json()['id']).hex}"
    assert snapshot.json()["http"]["routers"][name]["rule"] == "Host(`payments.example.com`) && PathPrefix(`/api`)"


async def test_duplicate_hostname_is_a_conflict(
    client: AsyncClient, auth: dict[str, str], project: dict, environment: dict
) -> None:
    other = await create_project(client, auth, "billing")
    other_env = (
        await client.post(envs_url(other), json={"slug": "dev", "name": "Dev", "kind": "dev"}, headers=auth)
    ).json()
    first = await client.post(routes_url(project), json=route_body(environment), headers=auth)
    duplicate = await client.post(routes_url(other), json=route_body(other_env), headers=auth)

    assert first.status_code == 201
    assert duplicate.status_code == 409
    assert duplicate.json()["code"] == "conflict"


async def test_disabled_route_is_omitted_from_snapshot(
    client: AsyncClient, auth: dict[str, str], project: dict, environment: dict
) -> None:
    created = await client.post(
        routes_url(project), json=route_body(environment, enabled=False), headers=auth
    )
    assert created.status_code == 201

    snapshot = await client.get(EDGE, headers=auth)
    assert snapshot.json()["http"]["routers"] == {}
    assert snapshot.json()["http"]["services"] == {}


async def test_delete_removes_route_from_snapshot(
    client: AsyncClient, auth: dict[str, str], project: dict, environment: dict
) -> None:
    created = await client.post(routes_url(project), json=route_body(environment), headers=auth)
    route_id = created.json()["id"]

    deleted = await client.delete(f"{routes_url(project)}/{route_id}", headers=auth)
    assert deleted.status_code == 204

    snapshot = await client.get(EDGE, headers=auth)
    assert snapshot.json()["http"]["routers"] == {}


async def test_environment_must_belong_to_the_project(
    client: AsyncClient, auth: dict[str, str], project: dict, environment: dict
) -> None:
    other = await create_project(client, auth, "billing")
    response = await client.post(routes_url(other), json=route_body(environment), headers=auth)

    assert response.status_code == 404
    assert response.json()["code"] == "not_found"


async def test_invalid_hostname_is_rejected(
    client: AsyncClient, auth: dict[str, str], project: dict, environment: dict
) -> None:
    response = await client.post(
        routes_url(project), json=route_body(environment, hostname="Not a host"), headers=auth
    )
    assert response.status_code == 422


async def test_create_requires_a_token(
    client: AsyncClient, project: dict, environment: dict
) -> None:
    response = await client.post(routes_url(project), json=route_body(environment))
    assert response.status_code == 401
    assert response.json()["code"] in {"unauthenticated", "invalid_token"}


async def test_list_is_paginated(client: AsyncClient, auth: dict[str, str], project: dict, environment: dict) -> None:
    for host in ("a.example.com", "b.example.com", "c.example.com"):
        created = await client.post(routes_url(project), json=route_body(environment, hostname=host), headers=auth)
        assert created.status_code == 201, created.text

    page = await client.get(routes_url(project), params={"limit": 2, "offset": 1})
    assert page.status_code == 200
    body = page.json()
    assert body["total"] == 3
    assert [item["hostname"] for item in body["items"]] == ["b.example.com", "c.example.com"]


async def test_update_backend_and_hostname(
    client: AsyncClient, auth: dict[str, str], project: dict, environment: dict
) -> None:
    created = await client.post(routes_url(project), json=route_body(environment), headers=auth)
    route_id = created.json()["id"]

    updated = await client.patch(
        f"{routes_url(project)}/{route_id}",
        json={"hostname": "api.example.com", "backend_port": 9090},
        headers=auth,
    )
    assert updated.status_code == 200
    assert updated.json()["hostname"] == "api.example.com"
    assert updated.json()["backend_port"] == 9090
    assert updated.json()["backend_host"] == "10.10.1.20"
