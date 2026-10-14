import pytest
from httpx import AsyncClient

from tests.api.v1.test_environments import envs_url
from tests.api.v1.test_projects import PROJECTS, create_project
from tests.api.v1.test_routes import route_body, routes_url


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


def dns_url(project: dict, route_id: str) -> str:
    return f"{routes_url(project)}/{route_id}/dns"


async def test_creating_a_route_publishes_dns(
    client: AsyncClient, auth: dict[str, str], project: dict, environment: dict
) -> None:
    created = await client.post(routes_url(project), json=route_body(environment), headers=auth)
    assert created.status_code == 201, created.text

    response = await client.get(dns_url(project, created.json()["id"]))
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["hostname"] == "payments.example.com"
    assert body["record_type"] == "CNAME"
    assert body["data"] == "edge.example.com"
    assert body["ttl"] == 300
    assert body["status"] == "published"
    assert "provider_record_id" not in body


async def test_disabled_route_has_no_public_dns(
    client: AsyncClient, auth: dict[str, str], project: dict, environment: dict
) -> None:
    created = await client.post(
        routes_url(project), json=route_body(environment, enabled=False), headers=auth
    )
    assert created.status_code == 201
    response = await client.get(dns_url(project, created.json()["id"]))
    assert response.status_code == 404
    assert response.json()["code"] == "not_found"


async def test_disabling_a_route_withdraws_dns(
    client: AsyncClient, auth: dict[str, str], project: dict, environment: dict
) -> None:
    created = await client.post(routes_url(project), json=route_body(environment), headers=auth)
    route_id = created.json()["id"]
    assert (await client.get(dns_url(project, route_id))).status_code == 200

    updated = await client.patch(f"{routes_url(project)}/{route_id}", json={"enabled": False}, headers=auth)
    assert updated.status_code == 200
    withdrawn = await client.get(dns_url(project, route_id))
    assert withdrawn.status_code == 404
    assert withdrawn.json()["code"] == "not_found"

    enabled = await client.patch(f"{routes_url(project)}/{route_id}", json={"enabled": True}, headers=auth)
    assert enabled.status_code == 200
    body = (await client.get(dns_url(project, route_id))).json()
    assert body["status"] == "published"


async def test_hostname_change_moves_the_dns_record(
    client: AsyncClient, auth: dict[str, str], project: dict, environment: dict
) -> None:
    created = await client.post(routes_url(project), json=route_body(environment), headers=auth)
    route_id = created.json()["id"]

    updated = await client.patch(
        f"{routes_url(project)}/{route_id}", json={"hostname": "api.example.com"}, headers=auth
    )
    assert updated.status_code == 200
    body = (await client.get(dns_url(project, route_id))).json()
    assert body["hostname"] == "api.example.com"
    assert body["status"] == "published"


async def test_deleting_a_route_withdraws_dns(
    client: AsyncClient, auth: dict[str, str], project: dict, environment: dict
) -> None:
    created = await client.post(routes_url(project), json=route_body(environment), headers=auth)
    route_id = created.json()["id"]
    deleted = await client.delete(f"{routes_url(project)}/{route_id}", headers=auth)
    assert deleted.status_code == 204
    assert (await client.get(dns_url(project, route_id))).status_code == 404
