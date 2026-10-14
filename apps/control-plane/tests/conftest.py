from collections.abc import AsyncIterator

import pytest
from fastapi import APIRouter, FastAPI, status
from httpx import ASGITransport, AsyncClient

from app.api.deps import MUTATION_GUARD
from app.core.config import Settings, get_settings
from app.core.security import hash_client_secret
from main import create_app

CLIENT_ID = "ci-deployer"
CLIENT_SECRET = "a-test-secret-that-is-long-enough-to-be-realistic"
SIGNING_KEY = "unit-test-signing-key-0123456789abcdef-0123456789"


@pytest.fixture
def settings() -> Settings:
    return Settings(
        _env_file=None,
        env="local",
        auth_signing_key=SIGNING_KEY,
        auth_token_ttl_seconds=300,
        auth_clients={CLIENT_ID: hash_client_secret(CLIENT_SECRET)},
    )


@pytest.fixture
def app(settings: Settings) -> FastAPI:
    application = create_app(settings)
    application.dependency_overrides[get_settings] = lambda: settings

    # Stand-in for a future resource router, included the same way real ones will be.
    probe = APIRouter(prefix="/probe", tags=["probe"])

    @probe.get("", status_code=status.HTTP_200_OK)
    async def read_probe() -> dict[str, str]:
        return {"ok": "read"}

    @probe.post("", status_code=status.HTTP_201_CREATED)
    async def write_probe() -> dict[str, str]:
        return {"ok": "write"}

    @probe.delete("/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
    async def delete_probe(item_id: str) -> None:
        return None

    application.include_router(probe, prefix="/api/v1", dependencies=MUTATION_GUARD)
    return application


@pytest.fixture
async def client(app: FastAPI) -> AsyncIterator[AsyncClient]:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as http:
        yield http


@pytest.fixture
async def token(client: AsyncClient) -> str:
    response = await client.post(
        "/api/v1/auth/token",
        json={"client_id": CLIENT_ID, "client_secret": CLIENT_SECRET},
    )
    assert response.status_code == 200, response.text
    return response.json()["access_token"]
