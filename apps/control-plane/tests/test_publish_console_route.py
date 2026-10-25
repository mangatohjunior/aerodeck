"""publish-console-route.py must not print the client secret."""

from pathlib import Path

SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "publish-console-route.py"
TEXT = SCRIPT.read_text(encoding="utf-8")


def test_publishes_the_dev_console_without_echoing_the_secret() -> None:
    assert 'HOSTNAME = "dev.app.aero-deck.app"' in TEXT
    assert 'BACKEND_HOST = "10.41.0.2"' in TEXT
    assert "/etc/aerodeck/dashboard.env" in TEXT
    assert "certificate/issue" in TEXT
    printed = TEXT[TEXT.index('print(f"hostname'):]
    assert "SECRET" not in printed
    assert "access_token" not in printed
