from httpx import AsyncClient

from app.core.config import Settings
from tests.conftest import SIGNING_KEY


async def test_metrics_need_no_token_and_hide_secrets(client: AsyncClient, settings: Settings) -> None:
    response = await client.get("/metrics")

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/plain")
    body = response.text
    assert 'aerodeck_check_up{check="database"} 1' in body
    assert 'aerodeck_check_up{check="queue"} 1' in body
    assert "aerodeck_sandbox_reap_failures_total 0" in body
    assert "aerodeck_iac_apply_failures_total 0" in body
    assert SIGNING_KEY not in body
    assert "postgresql" not in body
    assert "PRIVATE KEY" not in body
    assert settings.auth_signing_key.get_secret_value() not in body
