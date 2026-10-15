#!/usr/bin/env python3
"""Stop Terraform deleting a DigitalOcean region-default VPC.

DELETE /v2/vpcs/:id returns 403 "Can not delete default VPCs". The default
flag cannot be unset; another VPC in the same region must be set default=true.
If that is refused (the first VPC in a region is often immutable), drop the
VPC from Terraform state and leave it in the account. VPCs are free.

Writes .rehome-vpc-dropped when state is changed so ci.sh can re-plan; a
stored plan taken *before* the drop still contains the doomed DELETE.
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
import urllib.error
import urllib.request
from pathlib import Path

API = "https://api.digitalocean.com/v2"
MARKER = Path(".rehome-vpc-dropped")


class ApiError(Exception):
    def __init__(self, code: int, detail: str) -> None:
        super().__init__(f"{code}: {detail}")
        self.code = code
        self.detail = detail


def token() -> str:
    value = os.environ.get("TF_VAR_do_token") or os.environ.get("DIGITALOCEAN_TOKEN") or ""
    if not value:
        raise SystemExit(
            "rehome_default_vpc: TF_VAR_do_token or DIGITALOCEAN_TOKEN is required"
        )
    return value


def api(method: str, path: str, body: dict | None = None) -> dict:
    data = None if body is None else json.dumps(body).encode()
    req = urllib.request.Request(
        f"{API}{path}",
        data=data,
        method=method,
        headers={
            "Authorization": f"Bearer {token()}",
            "Content-Type": "application/json",
            "Accept": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            raw = resp.read()
            return json.loads(raw.decode()) if raw else {}
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise ApiError(exc.code, detail) from exc


def vpc_entries_from_state(state: dict) -> list[dict[str, str]]:
    found: list[dict[str, str]] = []
    for res in state.get("resources") or []:
        if res.get("type") != "digitalocean_vpc":
            continue
        module = res.get("module")
        name = res.get("name")
        address = f"{module}.{res['type']}.{name}" if module else f"{res['type']}.{name}"
        for inst in res.get("instances") or []:
            attrs = inst.get("attributes") or {}
            vid = attrs.get("id")
            if not vid:
                continue
            found.append(
                {
                    "address": address,
                    "id": vid,
                    "region": attrs.get("region") or "",
                }
            )
    return found


def pick_replacement(managed_id: str, region: str, vpcs: list[dict]) -> dict | None:
    same = [v for v in vpcs if v.get("region") == region and v.get("id") != managed_id]
    for v in same:
        if v.get("default"):
            return v
    for v in same:
        name = str(v.get("name") or "")
        if name.startswith("default-") or name.endswith("-default-keep"):
            return v
    return same[0] if same else None


def unused_cidr(vpcs: list[dict], region: str) -> str:
    used = {v.get("ip_range") for v in vpcs if v.get("region") == region}
    for n in range(254, 200, -1):
        cidr = f"10.{n}.0.0/20"
        if cidr not in used:
            return cidr
    raise SystemExit("rehome_default_vpc: no free 10.x.0.0/20 for a placeholder VPC")


def drop_from_state(address: str) -> None:
    print(
        f"rehome_default_vpc: leaving the DigitalOcean default VPC in place; "
        f"removing {address} from Terraform state"
    )
    subprocess.check_call(["terraform", "state", "rm", address])
    MARKER.write_text(address + "\n", encoding="utf-8")


def ensure_not_default(entry: dict[str, str]) -> None:
    managed_id = entry["id"]
    region = entry["region"]
    address = entry["address"]
    try:
        current = (api("GET", f"/vpcs/{managed_id}").get("vpc") or {})
    except ApiError as exc:
        if exc.code == 404:
            drop_from_state(address)
            return
        raise SystemExit(f"rehome_default_vpc: GET /vpcs/{managed_id} -> {exc}") from exc

    if not current.get("default"):
        print(f"rehome_default_vpc: {managed_id} is not the region default")
        return

    # Never let Terraform DELETE a VPC that is (or was) the region default.
    # PUT default onto another VPC when we can; always drop ours from state.
    print(f"rehome_default_vpc: {managed_id} is the {region} default; will not DELETE it")
    try:
        listed = api("GET", "/vpcs").get("vpcs") or []
    except ApiError as exc:
        raise SystemExit(f"rehome_default_vpc: GET /vpcs -> {exc}") from exc

    replacement = pick_replacement(managed_id, region, listed)
    if replacement is None:
        name = f"aerodeck-{region}-default-keep"
        cidr = unused_cidr(listed, region)
        print(f"rehome_default_vpc: creating placeholder {name} {cidr}")
        try:
            created = api(
                "POST",
                "/vpcs",
                {
                    "name": name,
                    "region": region,
                    "description": "Region default so Terraform can delete stack VPCs",
                    "ip_range": cidr,
                },
            )
        except ApiError as exc:
            print(f"rehome_default_vpc: POST /vpcs failed ({exc}); dropping from state")
            drop_from_state(address)
            return
        replacement = created.get("vpc") or {}

    rid = replacement.get("id")
    rname = replacement.get("name")
    if rid and rname:
        try:
            api(
                "PUT",
                f"/vpcs/{rid}",
                {
                    "name": rname,
                    "description": replacement.get("description") or "",
                    "default": True,
                },
            )
            print(f"rehome_default_vpc: set {rid} ({rname}) as {region} default")
        except ApiError as exc:
            print(f"rehome_default_vpc: PUT default failed ({exc})")

    drop_from_state(address)


def main() -> None:
    if MARKER.exists():
        MARKER.unlink()
    pulled = subprocess.check_output(["terraform", "state", "pull"], text=True)
    state = json.loads(pulled) if pulled.strip() else {}
    entries = vpc_entries_from_state(state)
    if not entries:
        print("rehome_default_vpc: no digitalocean_vpc in state")
        return
    for entry in entries:
        ensure_not_default(entry)


if __name__ == "__main__":
    try:
        main()
    except subprocess.CalledProcessError as exc:
        sys.exit(exc.returncode)
