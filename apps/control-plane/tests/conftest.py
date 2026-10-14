import os
from collections.abc import AsyncIterator, Callable
from pathlib import Path

import pytest
from asgi_lifespan import LifespanManager
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from app.core.config import Settings, get_settings
from app.core.security import hash_client_secret
from app.models import Base
from main import create_app

CLIENT_ID = "ci-deployer"
CLIENT_SECRET = "a-test-secret-that-is-long-enough-to-be-realistic"
SIGNING_KEY = "unit-test-signing-key-0123456789abcdef-0123456789"


def make_settings(database_url: str | None) -> Settings:
    return Settings(
        _env_file=None,
        env="local",
        database_url=database_url,
        auth_signing_key=SIGNING_KEY,
        auth_token_ttl_seconds=300,
        auth_clients={CLIENT_ID: hash_client_secret(CLIENT_SECRET)},
    )


# Set AERODECK_TEST_DATABASE_URL (CI does, to a PostgreSQL service) to run the
# suite against the production driver. Unset, each test gets a file-backed
# SQLite database so "survives a restart" can still use two app instances.
TEST_DATABASE_URL = os.environ.get("AERODECK_TEST_DATABASE_URL")


@pytest.fixture
def database_url(tmp_path: Path) -> str:
    if TEST_DATABASE_URL:
        return TEST_DATABASE_URL
    return f"sqlite+aiosqlite:///{(tmp_path / 'control-plane.db').as_posix()}"


@pytest.fixture
def settings(database_url: str) -> Settings:
    return make_settings(database_url)


@pytest.fixture
def app_factory() -> Callable[[Settings], FastAPI]:
    def build(settings: Settings) -> FastAPI:
        application = create_app(settings)
        application.dependency_overrides[get_settings] = lambda: settings
        return application

    return build


@pytest.fixture
async def app(settings: Settings, app_factory: Callable[[Settings], FastAPI]) -> AsyncIterator[FastAPI]:
    application = app_factory(settings)
    async with LifespanManager(application):
        engine = application.state.engine
        async with engine.begin() as connection:
            await connection.run_sync(Base.metadata.drop_all)
            await connection.run_sync(Base.metadata.create_all)
        try:
            yield application
        finally:
            # A shared PostgreSQL database must be left empty for the next test.
            async with engine.begin() as connection:
                await connection.run_sync(Base.metadata.drop_all)


@pytest.fixture
async def client(app: FastAPI) -> AsyncIterator[AsyncClient]:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as http:
        yield http


async def obtain_token(client: AsyncClient) -> str:
    response = await client.post(
        "/api/v1/auth/token",
        json={"client_id": CLIENT_ID, "client_secret": CLIENT_SECRET},
    )
    assert response.status_code == 200, response.text
    return response.json()["access_token"]


@pytest.fixture
async def token(client: AsyncClient) -> str:
    return await obtain_token(client)


@pytest.fixture
def auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}
