"""Rotating the console client must keep the Google OAuth lines and not print them."""

import importlib.util
from pathlib import Path

_SPEC = importlib.util.spec_from_file_location(
    "dashboard_env",
    Path(__file__).resolve().parents[1] / "scripts" / "dashboard_env.py",
)
assert _SPEC is not None and _SPEC.loader is not None
_MODULE = importlib.util.module_from_spec(_SPEC)
_SPEC.loader.exec_module(_MODULE)
render_dashboard_env = _MODULE.render_dashboard_env

SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "enroll-console-client.sh"
TEXT = SCRIPT.read_text(encoding="utf-8")


def test_render_keeps_google_lines_and_replaces_the_console_secret() -> None:
    existing = "\n".join(
        [
            "CONTROL_PLANE_URL=http://127.0.0.1:8000",
            "CONTROL_PLANE_CLIENT_ID=console",
            "CONTROL_PLANE_CLIENT_SECRET=old-console-secret",
            "GOOGLE_CLIENT_ID=google-client",
            "GOOGLE_CLIENT_SECRET=google-secret",
        ]
    )
    rendered = render_dashboard_env(existing, client_id="console", client_secret="new-console-secret")
    assert "CONTROL_PLANE_CLIENT_SECRET=new-console-secret" in rendered
    assert "old-console-secret" not in rendered
    assert "GOOGLE_CLIENT_ID=google-client" in rendered
    assert "GOOGLE_CLIENT_SECRET=google-secret" in rendered


def test_render_omits_google_lines_when_they_are_absent() -> None:
    rendered = render_dashboard_env("", client_id="console", client_secret="new-console-secret")
    assert "GOOGLE_CLIENT_ID" not in rendered
    assert "GOOGLE_CLIENT_SECRET" not in rendered


def test_enroll_script_writes_env_through_the_helper_and_does_not_echo_google() -> None:
    assert "dashboard_env.py" in TEXT
    echo = TEXT[TEXT.rindex("echo "):]
    assert "GOOGLE_CLIENT" not in echo
    assert "${SECRET}" not in echo
