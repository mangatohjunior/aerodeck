#!/usr/bin/env python3
"""Move the region default off a Terraform-managed VPC before destroy.

DigitalOcean returns 403 "Can not delete default VPCs". The default flag
cannot be unset; another VPC in the same region must be set default=true.
If this VPC is the only one, create a placeholder and make that the default.
If DigitalOcean still refuses, drop the VPC from Terraform state and leave
it in the account (VPCs are free).
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
import urllib.error
import urllib.request

API = "https://api.digitalocean.com/v2"


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
        raise SystemExit(f"rehome_default_vpc: {method} {path} -> {exc.code}: {detail}") from exc


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


def ensure_not_default(entry: dict[str, str]) -> None:
    managed_id = entry["id"]
    region = entry["region"]
    address = entry["address"]
    payload = api("GET", f"/vpcs/{managed_id}")
    current = payload.get("vpc") or {}
    if not current.get("default"):
        print(f"rehome_default_vpc: {managed_id} is not the region default")
        return

    print(f"rehome_default_vpc: {managed_id} is the {region} default; moving default away")
    listed = api("GET", "/vpcs").get("vpcs") or []
    replacement = pick_replacement(managed_id, region, listed)
    if replacement is None:
        name = f"aerodeck-{region}-default-keep"
        cidr = unused_cidr(listed, region)
        print(f"rehome_default_vpc: creating placeholder {name} {cidr}")
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
        replacement = created.get("vpc") or {}
        listed.append(replacement)

    rid = replacement.get("id")
    rname = replacement.get("name")
    if not rid or not rname:
        raise SystemExit("rehome_default_vpc: replacement VPC has no id/name")
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

    again = (api("GET", f"/vpcs/{managed_id}").get("vpc") or {}).get("default")
    if again:
        print(
            f"rehome_default_vpc: {managed_id} is still default; "
            f"removing {address} from Terraform state so destroy can finish"
        )
        subprocess.check_call(["terraform", "state", "rm", address])


def main() -> None:
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
