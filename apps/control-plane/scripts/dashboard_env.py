"""Rewrite the dashboard env file without dropping the Google OAuth client."""

from __future__ import annotations

import os
from pathlib import Path

GOOGLE_KEYS = ("GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET")


def kept_google_lines(existing: str) -> dict[str, str]:
    found: dict[str, str] = {}
    for line in existing.splitlines():
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        if key in GOOGLE_KEYS and value and "\n" not in value and "\r" not in value:
            found[key] = value
    return found


def render_dashboard_env(existing: str, *, client_id: str, client_secret: str) -> str:
    lines = [
        "CONTROL_PLANE_URL=http://127.0.0.1:8000",
        f"CONTROL_PLANE_CLIENT_ID={client_id}",
        f"CONTROL_PLANE_CLIENT_SECRET={client_secret}",
    ]
    kept = kept_google_lines(existing)
    for key in GOOGLE_KEYS:
        if key in kept:
            lines.append(f"{key}={kept[key]}")
    return "\n".join(lines) + "\n"


def write_dashboard_env(path: Path, *, client_id: str, client_secret: str) -> None:
    existing = path.read_text(encoding="utf-8") if path.is_file() else ""
    path.write_text(
        render_dashboard_env(existing, client_id=client_id, client_secret=client_secret),
        encoding="utf-8",
    )
    os.chmod(path, 0o600)


def main() -> None:
    path = Path(os.environ["DASHBOARD_ENV"])
    write_dashboard_env(
        path,
        client_id=os.environ["CLIENT_ID"],
        client_secret=os.environ["SECRET"],
    )


if __name__ == "__main__":
    main()
