#!/usr/bin/env python3
"""Publish the dev operator console at dev.app.aero-deck.app.

Run on the control Droplet:

    python3 /root/aerodeck/publish-console-route.py
    python3 /root/aerodeck/publish-console-route.py --renew

Reads the console client from /etc/aerodeck/dashboard.env. Does not print
the secret or the access token. Re-running reuses the console project,
dev environment, and route (updating backend_host if the VPC CIDR changed),
issues a certificate when missing/pending, and automatically renews onto
Let's Encrypt if the current certificate came from AeroDeck Fake CA or
a staging issuer (or when --renew is passed).
"""

import json
import os
from pathlib import Path
import sys
import urllib.error
import urllib.request

API = os.environ.get("CONTROL_PLANE_URL") or "http://127.0.0.1:8000"
ENV_FILE = Path(os.environ.get("AERODECK_DASHBOARD_ENV") or "/etc/aerodeck/dashboard.env")
HOSTNAME = "dev.app.aero-deck.app"
BACKEND_HOST = os.environ.get("AERODECK_CONTROL_PRIVATE_IP") or "10.41.0.2"
BACKEND_PORT = 3000
PROJECT_SLUG = "console"
ENVIRONMENT_SLUG = "dev"
FAKE_CA_ISSUER = "AeroDeck Fake CA"


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
    missing = [
        key
        for key in ("CONTROL_PLANE_CLIENT_ID", "CONTROL_PLANE_CLIENT_SECRET")
        if not values.get(key)
    ]
    if missing:
        raise SystemExit(f"missing {', '.join(missing)} in {path}")
    return values


def call(
    method: str,
    path: str,
    body: dict | None = None,
    token: str | None = None,
) -> dict | None:
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


def should_renew_certificate(certificate: dict | None, force_renew: bool) -> bool:
    if force_renew or not certificate:
        return force_renew
    issuer = str(certificate.get("issuer") or "")
    return issuer == FAKE_CA_ISSUER or "staging" in issuer.lower()


def ensure_route(project_id: str, environment_id: str, token: str) -> dict:
    routes = call("GET", f"/api/v1/projects/{project_id}/routes?limit=200", token=token)
    route = find_by(routes, "hostname", HOSTNAME)
    if route is None:
        created = call(
            "POST",
            f"/api/v1/projects/{project_id}/routes",
            {
                "environment_id": environment_id,
                "hostname": HOSTNAME,
                "path_prefix": "/",
                "backend_host": BACKEND_HOST,
                "backend_port": BACKEND_PORT,
            },
            token,
        )
        assert created is not None
        return created
    if route.get("backend_host") != BACKEND_HOST:
        updated = call(
            "PATCH",
            f"/api/v1/projects/{project_id}/routes/{route['id']}",
            {"backend_host": BACKEND_HOST},
            token,
        )
        if updated is not None:
            return updated
    return route


def ensure_certificate(
    project_id: str,
    route_id: str,
    token: str,
    force_renew: bool = False,
) -> dict | None:
    base = f"/api/v1/projects/{project_id}/routes/{route_id}/certificate"
    try:
        certificate = call("GET", base, token=token)
    except ApiError as error:
        if error.status != 404:
            raise
        certificate = None

    if certificate is None or certificate.get("status") != "issued":
        try:
            return call("POST", f"{base}/issue", token=token)
        except ApiError as error:
            if error.status != 409:
                raise
            return call("POST", f"{base}/renew", token=token)

    if should_renew_certificate(certificate, force_renew):
        return call("POST", f"{base}/renew", token=token)
    return certificate


def main(argv: list[str] | None = None) -> None:
    args = sys.argv[1:] if argv is None else argv
    force_renew = "--renew" in args
    if not ENV_FILE.is_file():
        raise SystemExit(f"missing {ENV_FILE}")
    env = load_env(ENV_FILE)
    token = call(
        "POST",
        "/api/v1/auth/token",
        {
            "client_id": env["CONTROL_PLANE_CLIENT_ID"],
            "client_secret": env["CONTROL_PLANE_CLIENT_SECRET"],
        },
    )
    if not token or "access_token" not in token:
        raise SystemExit("token response did not include an access token")
    access = str(token["access_token"])

    projects = call("GET", "/api/v1/projects?limit=200", token=access)
    project = find_by(projects, "slug", PROJECT_SLUG)
    if project is None:
        project = call("POST", "/api/v1/projects", {"slug": PROJECT_SLUG, "name": "Console"}, access)
    assert project is not None
    project_id = str(project["id"])

    environments = call("GET", f"/api/v1/projects/{project_id}/environments?limit=200", token=access)
    environment = find_by(environments, "slug", ENVIRONMENT_SLUG)
    if environment is None:
        environment = call(
            "POST",
            f"/api/v1/projects/{project_id}/environments",
            {"slug": ENVIRONMENT_SLUG, "name": "Dev", "kind": "dev", "region": "ams3"},
            access,
        )
    assert environment is not None

    route = ensure_route(project_id, str(environment["id"]), access)
    route_id = str(route["id"])
    certificate = ensure_certificate(project_id, route_id, access, force_renew=force_renew)

    print(f"hostname {HOSTNAME}")
    print(f"route {route_id}")
    print(f"certificate {certificate.get('status') if certificate else 'missing'}")


if __name__ == "__main__":
    try:
        main()
    except ApiError as error:
        print(str(error), file=sys.stderr)
        raise SystemExit(1) from None
