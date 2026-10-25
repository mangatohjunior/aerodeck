"""publish-console-route.py must not print the client secret and renews fake certs."""

import importlib.util
from pathlib import Path

SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "publish-console-route.py"
TEXT = SCRIPT.read_text(encoding="utf-8")


def _load_module():
    spec = importlib.util.spec_from_file_location("publish_console_route", SCRIPT)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_publishes_the_dev_console_without_echoing_the_secret() -> None:
    assert 'HOSTNAME = "dev.app.aero-deck.app"' in TEXT
    assert 'BACKEND_HOST = os.environ.get("AERODECK_CONTROL_PRIVATE_IP") or "10.41.0.2"' in TEXT
    assert "/etc/aerodeck/dashboard.env" in TEXT
    assert "certificate" in TEXT
    assert "/issue" in TEXT
    assert "/renew" in TEXT
    printed = TEXT[TEXT.index('print(f"hostname'):]
    assert "SECRET" not in printed
    assert "access_token" not in printed


def test_environment_variable_defaults() -> None:
    mod = _load_module()
    assert mod.HOSTNAME == "dev.app.aero-deck.app"
    assert mod.BACKEND_HOST == "10.41.0.2"
    assert mod.API == "http://127.0.0.1:8000"
    assert str(mod.ENV_FILE).replace("\\", "/") == "/etc/aerodeck/dashboard.env" 


def test_should_renew_when_fake_or_staging_or_forced() -> None:
    mod = _load_module()
    assert mod.should_renew_certificate({"status": "issued", "issuer": "AeroDeck Fake CA"}, False) is True
    assert mod.should_renew_certificate({"status": "issued", "issuer": "(STAGING) Let's Encrypt"}, False) is True
    assert mod.should_renew_certificate({"status": "issued", "issuer": "Let's Encrypt"}, False) is False
    assert mod.should_renew_certificate({"status": "issued", "issuer": "Let's Encrypt"}, True) is True
