"""enroll-console-client.sh must not echo the generated secret."""

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1] / "scripts"
SCRIPT = ROOT / "enroll-console-client.sh"
HELPER = ROOT / "dashboard_env.py"
TEXT = SCRIPT.read_text(encoding="utf-8")
HELPER_TEXT = HELPER.read_text(encoding="utf-8")


def test_stores_the_digest_and_does_not_echo_the_secret() -> None:
    assert "token_urlsafe" in TEXT
    assert "sha256" in TEXT
    assert "AERODECK_AUTH_CLIENTS=%q" in TEXT
    assert "dashboard_env.py" in TEXT
    assert "CONTROL_PLANE_CLIENT_SECRET=" in HELPER_TEXT
    assert "0o600" in HELPER_TEXT
    assert "unset SECRET DIGEST" in TEXT
    assert "bash /root/start-on-droplet.sh" in TEXT
    echo_at = TEXT.index("echo \"enrolled client")
    assert "SECRET" not in TEXT[echo_at:]
