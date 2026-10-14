from datetime import UTC, datetime, timedelta

from httpx import AsyncClient

from app.core.config import Settings
from app.core.security import issue_access_token
from tests.conftest import CLIENT_ID, CLIENT_SECRET, SIGNING_KEY

TOKEN_URL = "/api/v1/auth/token"


def bearer(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


async def test_enrolled_client_receives_short_lived_token(client: AsyncClient) -> None:
    response = await client.post(TOKEN_URL, json={"client_id": CLIENT_ID, "client_secret": CLIENT_SECRET})

    assert response.status_code == 200
    body = response.json()
    assert body["token_type"] == "Bearer"
    assert body["expires_in"] == 300
    expires_at = datetime.fromisoformat(body["expires_at"])
    assert timedelta(seconds=290) < expires_at - datetime.now(UTC) <= timedelta(seconds=300)


async def test_wrong_secret_is_rejected(client: AsyncClient) -> None:
    response = await client.post(TOKEN_URL, json={"client_id": CLIENT_ID, "client_secret": "nope"})

    assert response.status_code == 401
    assert response.json() == {"detail": "Unknown client or wrong client secret", "code": "invalid_client"}
    assert response.headers["WWW-Authenticate"] == "Bearer"


async def test_unknown_client_gets_same_answer_as_wrong_secret(client: AsyncClient) -> None:
    response = await client.post(TOKEN_URL, json={"client_id": "stranger", "client_secret": CLIENT_SECRET})

    assert response.status_code == 401
    assert response.json()["code"] == "invalid_client"


async def test_token_request_rejects_unknown_fields(client: AsyncClient) -> None:
    response = await client.post(
        TOKEN_URL,
        json={"client_id": CLIENT_ID, "client_secret": CLIENT_SECRET, "scope": "admin"},
    )

    assert response.status_code == 422


async def test_me_identifies_the_token_holder(client: AsyncClient, token: str) -> None:
    response = await client.get("/api/v1/auth/me", headers=bearer(token))

    assert response.status_code == 200
    body = response.json()
    assert body["client_id"] == CLIENT_ID
    assert body["token_id"]


async def test_me_without_token_is_unauthenticated(client: AsyncClient) -> None:
    response = await client.get("/api/v1/auth/me")

    assert response.status_code == 401
    assert response.json() == {"detail": "Missing bearer token", "code": "invalid_token"}


async def test_tampered_token_is_rejected(client: AsyncClient, token: str) -> None:
    header, payload, signature = token.split(".")
    forged = f"{header}.{payload}.{signature[:-2]}AA"

    response = await client.get("/api/v1/auth/me", headers=bearer(forged))

    assert response.status_code == 401
    assert response.json()["code"] == "invalid_token"


async def test_expired_token_is_rejected(client: AsyncClient, settings: Settings) -> None:
    expired, _ = issue_access_token(
        subject=CLIENT_ID,
        signing_key=SIGNING_KEY,
        issuer=settings.auth_issuer,
        audience=settings.auth_audience,
        ttl=timedelta(minutes=5),
        now=datetime.now(UTC) - timedelta(minutes=10),
    )

    response = await client.get("/api/v1/auth/me", headers=bearer(expired))

    assert response.status_code == 401
    assert response.json()["code"] == "invalid_token"


async def test_token_for_other_audience_is_rejected(client: AsyncClient, settings: Settings) -> None:
    foreign, _ = issue_access_token(
        subject=CLIENT_ID,
        signing_key=SIGNING_KEY,
        issuer=settings.auth_issuer,
        audience="some-other-service",
        ttl=timedelta(minutes=5),
    )

    response = await client.get("/api/v1/auth/me", headers=bearer(foreign))

    assert response.status_code == 401


async def test_token_for_unenrolled_client_is_rejected(client: AsyncClient, settings: Settings) -> None:
    # Correctly signed, but the subject is no longer in the enrolment list.
    revoked, _ = issue_access_token(
        subject="former-client",
        signing_key=SIGNING_KEY,
        issuer=settings.auth_issuer,
        audience=settings.auth_audience,
        ttl=timedelta(minutes=5),
    )

    response = await client.get("/api/v1/auth/me", headers=bearer(revoked))

    assert response.status_code == 401
    assert response.json()["detail"] == "Client is no longer enrolled"


async def test_mutations_require_a_token(client: AsyncClient) -> None:
    post = await client.post("/api/v1/probe")
    delete = await client.delete("/api/v1/probe/abc")

    assert post.status_code == 401
    assert delete.status_code == 401
    assert post.json()["code"] == "invalid_token"


async def test_mutations_succeed_with_a_valid_token(client: AsyncClient, token: str) -> None:
    post = await client.post("/api/v1/probe", headers=bearer(token))
    delete = await client.delete("/api/v1/probe/abc", headers=bearer(token))

    assert post.status_code == 201
    assert delete.status_code == 204


async def test_reads_do_not_require_a_token(client: AsyncClient) -> None:
    response = await client.get("/api/v1/probe")

    assert response.status_code == 200
    assert response.json() == {"ok": "read"}


async def test_health_endpoints_stay_open(client: AsyncClient) -> None:
    healthz = await client.get("/healthz")
    readyz = await client.get("/readyz")

    assert healthz.status_code == 200
    assert readyz.status_code == 200
