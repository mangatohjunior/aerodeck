#!/usr/bin/env python3
"""Publish the dev operator console at dev.app.aero-deck.app.

Run on the control Droplet:

    python3 /root/aerodeck/publish-console-route.py

Reads the console client from /etc/aerodeck/dashboard.env. Does not print
the secret or the access token. Re-running reuses the console project,
dev environment, and route, and issues a certificate only when one is
not already issued.
"""

from __future__ import annotations

import json
import sys
import urllib.error
import urllib.request
from pathlib import Path

API = "http://127.0.0.1:8000"
ENV_FILE = Path("/etc/aerodeck/dashboard.env")
HOSTNAME = "dev.app.aero-deck.app"
BACKEND_HOST = "10.41.0.2"
BACKEND_PORT = 3000
PROJECT_SLUG = "console"
ENVIRONMENT_SLUG = "dev"


class ApiError(Exception):
    def __init__(self, status: int, detail: str) -> None:
        super().__init__(f"{status} {detail}")
        self.status = status


def load_env(path: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        values[key] = value
    missing = [key for key in ("CONTROL_PLANE_CLIENT_ID", "CONTROL_PLANE_CLIENT_SECRET") if not values.get(key)]
    if missing:
        raise SystemExit(f"missing {', '.join(missing)} in {path}")
    return values


def call(method: str, path: str, body: dict | None = None, token: str | None = None) -> dict | None:
    data = None if body is None else json.dumps(body).encode()
    headers = {"content-type": "application/json", "accept": "application/json"}
    if token:
        headers["authorization"] = f"Bearer {token}"
    request = urllib.request.Request(f"{API}{path}", data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(request, timeout=180) as response:
            raw = response.read()
    except urllib.error.HTTPError as error:
        detail = error.read().decode("utf-8", errors="replace")
        try:
            parsed = json.loads(detail)
            detail = str(parsed.get("detail") or parsed.get("code") or error.reason)
        except json.JSONDecodeError:
            detail = error.reason or "request failed"
        raise ApiError(error.code, detail) from None
    if not raw:
        return None
    parsed = json.loads(raw)
    if not isinstance(parsed, dict):
        raise ApiError(200, "response was not an object")
    return parsed


def find_by(page: dict | None, field: str, expected: str) -> dict | None:
    for item in (page or {}).get("items") or []:
        if item.get(field) == expected:
            return item
    return None


def main() -> None:
    if not ENV_FILE.is_file():
        raise SystemExit(f"missing {ENV_FILE}")
    env = load_env(ENV_FILE)
    token = call(
        "POST",
        "/api/v1/auth/token",
        {"client_id": env["CONTROL_PLANE_CLIENT_ID"], "client_secret": env["CONTROL_PLANE_CLIENT_SECRET"]},
    )
    if not token or "access_token" not in token:
        raise SystemExit("token response did not include an access token")
    access = str(token["access_token"])

    projects = call("GET", "/api/v1/projects?limit=200", token=access)
    project = find_by(projects, "slug", PROJECT_SLUG)
    if project is None:
        project = call(
            "POST",
            "/api/v1/projects",
            {"slug": PROJECT_SLUG, "name": "Console"},
            access,
        )
    project_id = project["id"]

    environments = call("GET", f"/api/v1/projects/{project_id}/environments?limit=200", token=access)
    environment = find_by(environments, "slug", ENVIRONMENT_SLUG)
    if environment is None:
        environment = call(
            "POST",
            f"/api/v1/projects/{project_id}/environments",
            {"slug": ENVIRONMENT_SLUG, "name": "Dev", "kind": "dev", "region": "ams3"},
            access,
        )

    routes = call("GET", f"/api/v1/projects/{project_id}/routes?limit=200", token=access)
    route = find_by(routes, "hostname", HOSTNAME)
    if route is None:
        route = call(
            "POST",
            f"/api/v1/projects/{project_id}/routes",
            {
                "environment_id": environment["id"],
                "hostname": HOSTNAME,
                "path_prefix": "/",
                "backend_host": BACKEND_HOST,
                "backend_port": BACKEND_PORT,
            },
            access,
        )
    route_id = route["id"]

    try:
        certificate = call("GET", f"/api/v1/projects/{project_id}/routes/{route_id}/certificate", token=access)
    except ApiError as error:
        if error.status != 404:
            raise
        certificate = None
    if certificate is None or certificate.get("status") != "issued":
        certificate = call(
            "POST",
            f"/api/v1/projects/{project_id}/routes/{route_id}/certificate/issue",
            token=access,
        )

    print(f"hostname {HOSTNAME}")
    print(f"route {route_id}")
    print(f"certificate {certificate.get('status') if certificate else 'missing'}")


if __name__ == "__main__":
    try:
        main()
    except ApiError as error:
        print(str(error), file=sys.stderr)
        raise SystemExit(1) from None
