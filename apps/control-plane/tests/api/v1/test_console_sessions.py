import hashlib

from httpx import AsyncClient

USERS = "/api/v1/console-users"
SESSIONS = "/api/v1/console-sessions"
PASSWORD = "correct-horse"


async def test_session_round_trip_hides_the_token(client: AsyncClient, auth: dict[str, str]) -> None:
    created = await client.post(USERS, json={"email": "ada@example.com", "password": PASSWORD}, headers=auth)
    assert created.status_code == 201, created.text

    opened = await client.post(SESSIONS, json={"user_id": created.json()["id"]}, headers=auth)

    assert opened.status_code == 201, opened.text
    token = opened.json()["token"]
    digest = hashlib.sha256(token.encode("utf-8")).hexdigest()
    assert opened.json()["user"]["id"] == created.json()["id"]
    assert "password" not in opened.text
    assert digest not in opened.text

    resolved = await client.post(f"{SESSIONS}/resolve", json={"token": token}, headers=auth)
    assert resolved.status_code == 200, resolved.text
    assert resolved.json()["email"] == "ada@example.com"
    assert token not in resolved.text
    assert digest not in resolved.text

    logout = await client.post(f"{SESSIONS}/logout", json={"token": token}, headers=auth)
    assert logout.status_code == 204, logout.text

    again = await client.post(f"{SESSIONS}/resolve", json={"token": token}, headers=auth)
    missing = await client.post(f"{SESSIONS}/resolve", json={"token": "missing-session-token"}, headers=auth)
    assert again.status_code == 404
    assert missing.status_code == 404
    assert again.json() == missing.json()
    assert token not in again.text
    assert "missing-session-token" not in missing.text


async def test_unknown_user_does_not_open_a_session(client: AsyncClient, auth: dict[str, str]) -> None:
    user_id = "11111111-1111-4111-8111-111111111111"
    response = await client.post(SESSIONS, json={"user_id": user_id}, headers=auth)

    assert response.status_code == 404
    assert response.json()["code"] == "not_found"
    assert user_id not in response.text


async def test_session_routes_require_a_token(client: AsyncClient) -> None:
    opened = await client.post(SESSIONS, json={"user_id": "11111111-1111-4111-8111-111111111111"})
    resolved = await client.post(f"{SESSIONS}/resolve", json={"token": "missing-session-token"})
    logout = await client.post(f"{SESSIONS}/logout", json={"token": "missing-session-token"})

    assert opened.status_code == 401
    assert resolved.status_code == 401
    assert logout.status_code == 401
    assert "missing-session-token" not in resolved.text
    assert "missing-session-token" not in logout.text
