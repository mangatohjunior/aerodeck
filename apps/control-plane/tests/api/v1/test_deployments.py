from uuid import UUID, uuid4

from httpx import AsyncClient

from app.services.deployment_logs import publish_line

DEPLOYMENTS = "/api/v1/deployments"
REPO = "https://github.com/mangatohjunior/aerodeck"


async def test_deployment_logs_require_a_token(client: AsyncClient) -> None:
    response = await client.get(f"/api/v1/deployments/{uuid4()}/logs")
    assert response.status_code == 401


async def test_deployment_logs_stream_mock_sse_lines(
    client: AsyncClient, auth: dict[str, str]
) -> None:
    created = await client.post(DEPLOYMENTS, json={"repo_url": REPO}, headers=auth)
    assert created.status_code == 201, created.text
    deployment_id = created.json()["id"]

    response = await client.get(f"{DEPLOYMENTS}/{deployment_id}/logs", headers=auth)
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/event-stream")
    body = response.text
    assert "data: Initializing Terraform..." in body
    assert "data: Provisioning K3s..." in body
    assert "data: Done" in body

    finished = await client.post(f"{DEPLOYMENTS}/{deployment_id}/succeeded", headers=auth)
    assert finished.status_code == 200, finished.text
    assert finished.json()["status"] == "succeeded"

    fetched = await client.get(f"{DEPLOYMENTS}/{deployment_id}", headers=auth)
    assert fetched.status_code == 200, fetched.text
    assert fetched.json()["status"] == "succeeded"


async def test_deployment_logs_prefer_published_lines(
    client: AsyncClient, auth: dict[str, str]
) -> None:
    created = await client.post(DEPLOYMENTS, json={"repo_url": REPO}, headers=auth)
    assert created.status_code == 201, created.text
    deployment_id = UUID(created.json()["id"])

    await publish_line(None, deployment_id, "Plan: 1 to add")
    await publish_line(None, deployment_id, "Apply complete")

    response = await client.get(f"{DEPLOYMENTS}/{deployment_id}/logs", headers=auth)
    assert response.status_code == 200
    body = response.text
    assert "data: Plan: 1 to add" in body
    assert "data: Apply complete" in body
    assert "data: Done" in body
    assert body.count("data: Done") == 1
    assert "Initializing Terraform" not in body
    assert "Provisioning K3s" not in body


async def test_unknown_deployment_does_not_stream(client: AsyncClient, auth: dict[str, str]) -> None:
    missing = uuid4()
    response = await client.get(f"{DEPLOYMENTS}/{missing}/logs", headers=auth)

    assert response.status_code == 404
    assert response.json()["code"] == "not_found"
    assert "Initializing Terraform" not in response.text

    finished = await client.post(f"{DEPLOYMENTS}/{missing}/succeeded", headers=auth)
    assert finished.status_code == 404
    assert finished.json()["code"] == "not_found"


async def test_create_stores_a_github_repository(client: AsyncClient, auth: dict[str, str]) -> None:
    response = await client.post(
        DEPLOYMENTS,
        json={"repo_url": "http://www.github.com/mangatohjunior/aerodeck.git?token=secret"},
        headers=auth,
    )

    assert response.status_code == 201, response.text
    body = response.json()
    assert body["repo_url"] == REPO
    assert body["owner"] == "mangatohjunior"
    assert body["repo"] == "aerodeck"
    assert body["status"] == "running"
    assert "secret" not in response.text
    assert "token" not in response.text

    fetched = await client.get(f"{DEPLOYMENTS}/{body['id']}", headers=auth)
    assert fetched.status_code == 200, fetched.text
    assert fetched.json()["id"] == body["id"]

    listed = await client.get(DEPLOYMENTS, headers=auth)
    assert listed.status_code == 200, listed.text
    assert listed.json()["total"] == 1
    assert listed.json()["items"][0]["id"] == body["id"]


async def test_invalid_repository_url_stores_nothing(client: AsyncClient, auth: dict[str, str]) -> None:
    response = await client.post(DEPLOYMENTS, json={"repo_url": "https://gitlab.com/org/repo"}, headers=auth)

    assert response.status_code == 422
    listed = await client.get(DEPLOYMENTS, headers=auth)
    assert listed.status_code == 200, listed.text
    assert listed.json()["total"] == 0


async def test_missing_deployment_is_not_found(client: AsyncClient, auth: dict[str, str]) -> None:
    response = await client.get(f"{DEPLOYMENTS}/{uuid4()}", headers=auth)

    assert response.status_code == 404
    assert response.json()["code"] == "not_found"


async def test_deployment_routes_require_a_token(client: AsyncClient) -> None:
    created = await client.post(DEPLOYMENTS, json={"repo_url": REPO})
    listed = await client.get(DEPLOYMENTS)
    succeeded = await client.post(f"{DEPLOYMENTS}/{uuid4()}/succeeded")

    assert created.status_code == 401
    assert listed.status_code == 401
    assert succeeded.status_code == 401
