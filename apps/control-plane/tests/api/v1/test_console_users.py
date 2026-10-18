from httpx import AsyncClient

USERS = "/api/v1/console-users"
PASSWORD = "correct-horse"


async def test_register_stores_a_user_without_the_password(client: AsyncClient, auth: dict[str, str]) -> None:
    response = await client.post(USERS, json={"email": "Ada@Example.com", "password": PASSWORD}, headers=auth)

    assert response.status_code == 201, response.text
    body = response.json()
    assert body["email"] == "ada@example.com"
    assert "password" not in body
    assert "password_hash" not in body
    assert PASSWORD not in response.text


async def test_duplicate_email_is_a_conflict(client: AsyncClient, auth: dict[str, str]) -> None:
    payload = {"email": "ada@example.com", "password": PASSWORD}
    created = await client.post(USERS, json=payload, headers=auth)
    assert created.status_code == 201, created.text

    again = await client.post(USERS, json={"email": "ADA@example.com", "password": "another-pass"}, headers=auth)

    assert again.status_code == 409
    assert again.json()["code"] == "conflict"
    assert PASSWORD not in again.text
    assert "another-pass" not in again.text

async def test_register_requires_a_token(client: AsyncClient) -> None:
    response = await client.post(USERS, json={"email": "ada@example.com", "password": PASSWORD})

    assert response.status_code == 401
    assert PASSWORD not in response.text


async def test_short_password_is_rejected(client: AsyncClient, auth: dict[str, str]) -> None:
    response = await client.post(USERS, json={"email": "ada@example.com", "password": "short"}, headers=auth)

    assert response.status_code == 422


async def test_login_returns_the_user_without_the_password(client: AsyncClient, auth: dict[str, str]) -> None:
    created = await client.post(USERS, json={"email": "Ada@Example.com", "password": PASSWORD}, headers=auth)
    assert created.status_code == 201, created.text

    response = await client.post(
        f"{USERS}/login",
        json={"email": "ADA@example.com", "password": PASSWORD},
        headers=auth,
    )

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["email"] == "ada@example.com"
    assert body["id"] == created.json()["id"]
    assert "password" not in body
    assert "password_hash" not in body
    assert PASSWORD not in response.text


async def test_wrong_password_matches_unknown_email(client: AsyncClient, auth: dict[str, str]) -> None:
    created = await client.post(USERS, json={"email": "ada@example.com", "password": PASSWORD}, headers=auth)
    assert created.status_code == 201, created.text

    wrong = await client.post(
        f"{USERS}/login",
        json={"email": "ada@example.com", "password": "another-pass"},
        headers=auth,
    )
    missing = await client.post(
        f"{USERS}/login",
        json={"email": "missing@example.com", "password": "another-pass"},
        headers=auth,
    )

    assert wrong.status_code == 401
    assert missing.status_code == 401
    assert wrong.json() == missing.json()
    assert wrong.json()["code"] == "invalid_credentials"
    assert "ada@example.com" not in wrong.text
    assert "missing@example.com" not in missing.text
    assert "another-pass" not in wrong.text
    assert "another-pass" not in missing.text
