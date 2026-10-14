from httpx import AsyncClient

from tests.api.v1.test_environments import envs_url
from tests.api.v1.test_projects import PROJECTS, create_project
from tests.conftest import CLIENT_ID, CLIENT_SECRET

EDGE = "/api/v1/edge/traefik"
PROVIDER = "test-traefik-provider-token"


async def test_snapshot_requires_a_token(client: AsyncClient) -> None:
    response = await client.get(EDGE)
    assert response.status_code == 401
    assert response.json()["code"] == "invalid_token"


async def test_snapshot_accepts_an_api_client_token(client: AsyncClient, auth: dict[str, str]) -> None:
    response = await client.get(EDGE, headers=auth)
    assert response.status_code == 200
    assert response.json() == {"http": {"routers": {}, "services": {}}}


async def test_snapshot_accepts_the_traefik_provider_token(client: AsyncClient) -> None:
    response = await client.get(EDGE, headers={"Authorization": f"Bearer {PROVIDER}"})
    assert response.status_code == 200
    assert response.json()["http"]["routers"] == {}


async def test_provider_token_is_not_an_api_client_token(client: AsyncClient) -> None:
    login = await client.post(
        "/api/v1/auth/token",
        json={"client_id": CLIENT_ID, "client_secret": PROVIDER},
    )
    assert login.status_code == 401

    # The real client secret still mints a JWT; the static Traefik token is separate.
    real = await client.post(
        "/api/v1/auth/token",
        json={"client_id": CLIENT_ID, "client_secret": CLIENT_SECRET},
    )
    assert real.status_code == 200


async def test_empty_snapshot_then_one_router(client: AsyncClient, auth: dict[str, str]) -> None:
    project = await create_project(client, auth)
    environment = (
        await client.post(envs_url(project), json={"slug": "dev", "name": "Dev", "kind": "dev"}, headers=auth)
    ).json()
    created = await client.post(
        f"{PROJECTS}/{project['id']}/routes",
        json={
            "environment_id": environment["id"],
            "hostname": "app.example.com",
            "backend_host": "app-svc",
            "backend_port": 80,
        },
        headers=auth,
    )
    assert created.status_code == 201, created.text

    snapshot = await client.get(EDGE, headers={"Authorization": f"Bearer {PROVIDER}"})
    assert snapshot.status_code == 200
    routers = snapshot.json()["http"]["routers"]
    assert len(routers) == 1
    assert next(iter(routers.values()))["rule"] == "Host(`app.example.com`)"
