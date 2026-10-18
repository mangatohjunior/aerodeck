import uuid

import pytest
from httpx import AsyncClient

PROJECTS = "/api/v1/projects"


@pytest.fixture
async def project(client: AsyncClient, auth: dict[str, str]) -> dict:
    response = await client.post(PROJECTS, json={"slug": "payments", "name": "Payments"}, headers=auth)
    assert response.status_code == 201, response.text
    return response.json()


def envs_url(project: dict) -> str:
    return f"{PROJECTS}/{project['id']}/environments"


async def test_create_environment_defaults_region(client: AsyncClient, auth: dict[str, str], project: dict) -> None:
    response = await client.post(envs_url(project), json={"slug": "dev", "name": "Dev", "kind": "dev"}, headers=auth)

    assert response.status_code == 201
    body = response.json()
    assert body["project_id"] == project["id"]
    assert body["kind"] == "dev"
    assert body["region"] == "nyc3"


async def test_kind_is_restricted(client: AsyncClient, auth: dict[str, str], project: dict) -> None:
    response = await client.post(
        envs_url(project), json={"slug": "qa", "name": "QA", "kind": "qa"}, headers=auth
    )

    assert response.status_code == 422


async def test_same_slug_allowed_across_projects_but_not_within(
    client: AsyncClient, auth: dict[str, str], project: dict
) -> None:
    other = (await client.post(PROJECTS, json={"slug": "billing", "name": "Billing"}, headers=auth)).json()
    body = {"slug": "prod", "name": "Prod", "kind": "prod", "region": "fra1"}

    first = await client.post(envs_url(project), json=body, headers=auth)
    duplicate = await client.post(envs_url(project), json=body, headers=auth)
    elsewhere = await client.post(envs_url(other), json=body, headers=auth)

    assert first.status_code == 201
    assert duplicate.status_code == 409
    assert elsewhere.status_code == 201


async def test_environment_is_scoped_to_its_project(client: AsyncClient, auth: dict[str, str], project: dict) -> None:
    other = (await client.post(PROJECTS, json={"slug": "billing", "name": "Billing"}, headers=auth)).json()
    env = (
        await client.post(envs_url(project), json={"slug": "dev", "name": "Dev", "kind": "dev"}, headers=auth)
    ).json()

    via_other_project = await client.get(f"{envs_url(other)}/{env['id']}", headers=auth)

    assert via_other_project.status_code == 404


async def test_environments_of_unknown_project_are_not_found(client: AsyncClient, auth: dict[str, str]) -> None:
    missing = f"{PROJECTS}/{uuid.uuid4()}/environments"

    assert (await client.get(missing, headers=auth)).status_code == 404
    created = await client.post(missing, json={"slug": "dev", "name": "Dev", "kind": "dev"}, headers=auth)
    assert created.status_code == 404


async def test_update_and_delete_environment(client: AsyncClient, auth: dict[str, str], project: dict) -> None:
    env = (
        await client.post(envs_url(project), json={"slug": "stg", "name": "Staging", "kind": "staging"}, headers=auth)
    ).json()

    updated = await client.patch(f"{envs_url(project)}/{env['id']}", json={"region": "ams3"}, headers=auth)
    assert updated.status_code == 200
    assert updated.json()["region"] == "ams3"
    assert updated.json()["kind"] == "staging"

    deleted = await client.delete(f"{envs_url(project)}/{env['id']}", headers=auth)
    assert deleted.status_code == 204

    listing = await client.get(envs_url(project), headers=auth)
    assert listing.json()["total"] == 0


async def test_list_counts_only_this_project(client: AsyncClient, auth: dict[str, str], project: dict) -> None:
    other = (await client.post(PROJECTS, json={"slug": "billing", "name": "Billing"}, headers=auth)).json()
    for target, slugs in ((project, ("dev", "prod")), (other, ("dev",))):
        for slug in slugs:
            kind = "prod" if slug == "prod" else "dev"
            await client.post(envs_url(target), json={"slug": slug, "name": slug, "kind": kind}, headers=auth)

    listing = await client.get(envs_url(project), headers=auth)

    assert listing.json()["total"] == 2
    assert [e["slug"] for e in listing.json()["items"]] == ["dev", "prod"]
