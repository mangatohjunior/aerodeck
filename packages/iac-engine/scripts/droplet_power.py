#!/usr/bin/env python3
"""Start or stop the platform Droplets for one environment.

Looks up aerodeck-<env>-control and aerodeck-<env>-edge by the env:<env> tag
and those exact names. Start powers on control, then edge. Stop shuts down
edge, then control. A Droplet that is already in the requested state is left
alone.

Powering off does not stop DigitalOcean billing. Destroy is a different workflow.
"""

from __future__ import annotations

import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

API = "https://api.digitalocean.com/v2"
ENVIRONMENTS = ("dev", "staging", "prod")
ROLES = ("control", "edge")


class ApiError(Exception):
    def __init__(self, code: int, detail: str) -> None:
        super().__init__(f"{code}: {detail}")
        self.code = code
        self.detail = detail


def token() -> str:
    value = os.environ.get("DIGITALOCEAN_TOKEN") or ""
    if not value:
        raise SystemExit("droplet_power: DIGITALOCEAN_TOKEN is required")
    return value


def droplet_name(environment: str, role: str) -> str:
    if environment not in ENVIRONMENTS:
        raise SystemExit(f"droplet_power: environment must be one of {', '.join(ENVIRONMENTS)}")
    if role not in ROLES:
        raise SystemExit(f"droplet_power: role must be one of {', '.join(ROLES)}")
    return f"aerodeck-{environment}-{role}"


def power_order(action: str) -> tuple[str, ...]:
    if action == "start":
        return ROLES
    if action == "stop":
        return ("edge", "control")
    raise SystemExit("droplet_power: action must be start or stop")


def api_type(action: str) -> str:
    if action == "start":
        return "power_on"
    if action == "stop":
        return "shutdown"
    raise SystemExit("droplet_power: action must be start or stop")


def should_request(action: str, status: str) -> bool:
    if action == "start":
        return status != "active"
    if action == "stop":
        return status != "off"
    raise SystemExit("droplet_power: action must be start or stop")


def already_in_state(detail: str) -> bool:
    text = detail.lower()
    return "already" in text and ("power" in text or " off" in text or " on" in text)


def choose(droplets: list[dict], environment: str, action: str) -> list[dict]:
    wanted = [droplet_name(environment, role) for role in power_order(action)]
    found: dict[str, dict] = {}
    for droplet in droplets:
        name = droplet.get("name")
        if name not in wanted:
            continue
        if name in found:
            raise SystemExit(f"droplet_power: more than one Droplet named {name}")
        droplet_id = droplet.get("id")
        status = droplet.get("status")
        if not isinstance(droplet_id, int) or droplet_id <= 0:
            raise SystemExit(f"droplet_power: refusing {name} with id {droplet_id!r}")
        if status not in {"active", "off"}:
            raise SystemExit(f"droplet_power: {name} status {status} is not active or off")
        found[name] = droplet
    missing = [name for name in wanted if name not in found]
    if missing:
        raise SystemExit("droplet_power: missing " + ", ".join(missing))
    return [found[name] for name in wanted]


def api(method: str, path: str, body: dict | None = None) -> dict:
    if not path.startswith("/") and not path.startswith(f"{API}/"):
        raise SystemExit("droplet_power: refusing a Droplet API path outside DigitalOcean")
    url = path if path.startswith(API) else f"{API}{path}"
    if not url.startswith(f"{API}/"):
        raise SystemExit("droplet_power: refusing a Droplet API URL outside DigitalOcean")
    data = None if body is None else json.dumps(body).encode()
    request = urllib.request.Request(
        url,
        data=data,
        method=method,
        headers={
            "Authorization": f"Bearer {token()}",
            "Content-Type": "application/json",
            "Accept": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=60) as response:
            raw = response.read()
            return json.loads(raw.decode()) if raw else {}
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise ApiError(exc.code, detail) from exc


def list_droplets(environment: str) -> list[dict]:
    droplet_name(environment, "control")
    tag = urllib.parse.quote(f"env:{environment}", safe="")
    path: str | None = f"/droplets?tag_name={tag}&per_page=200"
    found: list[dict] = []
    while path:
        body = api("GET", path)
        found.extend(body.get("droplets") or [])
        path = ((body.get("links") or {}).get("pages") or {}).get("next") or None
    return found


def wait_action(droplet_id: int, action_id: int) -> str:
    for _ in range(24):
        body = api("GET", f"/droplets/{droplet_id}/actions/{action_id}")
        status = (body.get("action") or {}).get("status")
        if status == "completed":
            return status
        if status == "errored":
            raise SystemExit(f"droplet_power: Droplet {droplet_id} action {action_id} errored")
        time.sleep(5)
    raise SystemExit(f"droplet_power: Droplet {droplet_id} action {action_id} did not finish")


def note(line: str) -> None:
    print(line)
    summary = os.environ.get("GITHUB_STEP_SUMMARY")
    if not summary:
        return
    with open(summary, "a", encoding="utf-8") as handle:
        handle.write(line + "\n")


def main(argv: list[str] | None = None) -> None:
    args = list(sys.argv if argv is None else argv)
    if len(args) != 3:
        raise SystemExit("usage: droplet_power.py <start|stop> <dev|staging|prod>")
    action, environment = args[1], args[2]
    power_order(action)
    for droplet in choose(list_droplets(environment), environment, action):
        name = str(droplet["name"])
        droplet_id = int(droplet["id"])
        status = str(droplet["status"])
        if not should_request(action, status):
            note(f"{action} {name} ({droplet_id}) already {status}")
            continue
        try:
            body = api("POST", f"/droplets/{droplet_id}/actions", {"type": api_type(action)})
        except ApiError as exc:
            if exc.code == 422 and already_in_state(exc.detail):
                note(f"{action} {name} ({droplet_id}) already in requested state")
                continue
            raise SystemExit(f"droplet_power: {name}: {exc}") from None
        action_id = (body.get("action") or {}).get("id")
        if not isinstance(action_id, int):
            raise SystemExit(f"droplet_power: {name} returned no action id")
        final = wait_action(droplet_id, action_id)
        note(f"{action} {name} ({droplet_id}) {api_type(action)} {final}")


if __name__ == "__main__":
    main()
