from uuid import uuid4

from httpx import AsyncClient


async def test_deployment_logs_require_a_token(client: AsyncClient) -> None:
    response = await client.get(f"/api/v1/deployments/{uuid4()}/logs")
    assert response.status_code == 401


async def test_deployment_logs_stream_mock_sse_lines(
    client: AsyncClient, auth: dict[str, str]
) -> None:
    response = await client.get(f"/api/v1/deployments/{uuid4()}/logs", headers=auth)
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/event-stream")
    body = response.text
    assert "data: Initializing Terraform..." in body
    assert "data: Provisioning K3s..." in body
    assert "data: Done" in body
