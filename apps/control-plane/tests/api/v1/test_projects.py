import uuid
from collections.abc import Callable

from asgi_lifespan import LifespanManager
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from app.core.config import Settings
from tests.conftest import make_settings, obtain_token

PROJECTS = "/api/v1/projects"


async def create_project(client: AsyncClient, auth: dict[str, str], slug: str = "payments") -> dict:
    response = await client.post(PROJECTS, json={"slug": slug, "name": slug.title()}, headers=auth)
    assert response.status_code == 201, response.text
    return response.json()


async def test_create_and_read_project(client: AsyncClient, auth: dict[str, str]) -> None:
    created = await create_project(client, auth)

    assert created["slug"] == "payments"
    assert created["description"] is None
    uuid.UUID(created["id"])

    fetched = await client.get(f"{PROJECTS}/{created['id']}")

    assert fetched.status_code == 200
    assert fetched.json() == created


async def test_duplicate_slug_is_a_conflict(client: AsyncClient, auth: dict[str, str]) -> None:
    await create_project(client, auth)

    response = await client.post(PROJECTS, json={"slug": "payments", "name": "Again"}, headers=auth)

    assert response.status_code == 409
    assert response.json()["code"] == "conflict"


async def test_slug_must_be_a_dns_label(client: AsyncClient, auth: dict[str, str]) -> None:
    response = await client.post(PROJECTS, json={"slug": "Not Valid!", "name": "x"}, headers=auth)

    assert response.status_code == 422


async def test_unknown_project_is_not_found(client: AsyncClient) -> None:
    response = await client.get(f"{PROJECTS}/{uuid.uuid4()}")

    assert response.status_code == 404
    assert response.json()["code"] == "not_found"


async def test_update_changes_only_given_fields(client: AsyncClient, auth: dict[str, str]) -> None:
    created = await create_project(client, auth)

    response = await client.patch(
        f"{PROJECTS}/{created['id']}", json={"description": "Card processing"}, headers=auth
    )

    assert response.status_code == 200
    body = response.json()
    assert body["name"] == "Payments"
    assert body["description"] == "Card processing"


async def test_update_rejects_slug_changes(client: AsyncClient, auth: dict[str, str]) -> None:
    created = await create_project(client, auth)

    response = await client.patch(f"{PROJECTS}/{created['id']}", json={"slug": "renamed"}, headers=auth)

    assert response.status_code == 422


async def test_delete_removes_project_and_its_environments(client: AsyncClient, auth: dict[str, str]) -> None:
    project = await create_project(client, auth)
    env = await client.post(
        f"{PROJECTS}/{project['id']}/environments",
        json={"slug": "dev", "name": "Dev", "kind": "dev"},
        headers=auth,
    )
    assert env.status_code == 201

    deleted = await client.delete(f"{PROJECTS}/{project['id']}", headers=auth)

    assert deleted.status_code == 204
    assert (await client.get(f"{PROJECTS}/{project['id']}")).status_code == 404
    assert (await client.get(f"{PROJECTS}/{project['id']}/environments")).status_code == 404


async def test_list_is_paginated_in_creation_order(client: AsyncClient, auth: dict[str, str]) -> None:
    for slug in ("alpha", "bravo", "charlie"):
        await create_project(client, auth, slug)

    page = await client.get(PROJECTS, params={"limit": 2, "offset": 1})

    assert page.status_code == 200
    body = page.json()
    assert body["total"] == 3
    assert body["limit"] == 2
    assert body["offset"] == 1
    assert [p["slug"] for p in body["items"]] == ["bravo", "charlie"]


async def test_pagination_bounds_are_enforced(client: AsyncClient) -> None:
    assert (await client.get(PROJECTS, params={"limit": 0})).status_code == 422
    assert (await client.get(PROJECTS, params={"limit": 201})).status_code == 422
    assert (await client.get(PROJECTS, params={"offset": -1})).status_code == 422


async def test_state_survives_an_application_restart(
    client: AsyncClient,
    auth: dict[str, str],
    settings: Settings,
    app_factory: Callable[[Settings], FastAPI],
) -> None:
    created = await create_project(client, auth, "durable")

    # A second, independent application process against the same database.
    restarted = app_factory(settings)
    async with LifespanManager(restarted):
        async with AsyncClient(transport=ASGITransport(app=restarted), base_url="http://test") as fresh:
            response = await fresh.get(f"{PROJECTS}/{created['id']}")

    assert response.status_code == 200
    assert response.json()["slug"] == "durable"


async def test_mutations_without_a_database_return_503(app_factory: Callable[[Settings], FastAPI]) -> None:
    detached = app_factory(make_settings(database_url=None))
    async with LifespanManager(detached):
        async with AsyncClient(transport=ASGITransport(app=detached), base_url="http://test") as http:
            token = await obtain_token(http)
            response = await http.post(
                PROJECTS, json={"slug": "x", "name": "x"}, headers={"Authorization": f"Bearer {token}"}
            )
            readiness = await http.get("/readyz")

    assert response.status_code == 503
    assert response.json()["code"] == "database_unavailable"
    assert readiness.json()["checks"]["database"] == "skipped"
