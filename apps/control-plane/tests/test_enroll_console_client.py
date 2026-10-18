"""enroll-console-client.sh must not echo the generated secret."""

from pathlib import Path

SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "enroll-console-client.sh"
TEXT = SCRIPT.read_text(encoding="utf-8")


def test_stores_the_digest_and_does_not_echo_the_secret() -> None:
    assert "token_urlsafe" in TEXT
    assert "sha256" in TEXT
    assert "AERODECK_AUTH_CLIENTS=%q" in TEXT
    assert "CONTROL_PLANE_CLIENT_SECRET=${SECRET}" in TEXT
    assert "chmod 600" in TEXT
    assert "unset SECRET DIGEST" in TEXT
    assert "bash /root/start-on-droplet.sh" in TEXT
    echo_at = TEXT.index("echo \"enrolled client")
    assert "SECRET" not in TEXT[echo_at:]
