#!/usr/bin/env python3
"""Stop Terraform deleting a DigitalOcean region-default VPC.

DELETE /v2/vpcs/:id returns 403 "Can not delete default VPCs". The default
flag cannot be unset; another VPC in the same region must be set default=true.
When that succeeds, try to DELETE the former stack VPC (frees name and CIDR)
or leave it in state for Terraform destroy. Only when it must remain as the
region default: rename to …-kept-default, drop from state, and require a
vpc_ip_range bump before the next apply (VPCs are free but CIDRs stay reserved).

Writes .rehome-vpc-dropped when state is changed so ci.sh can re-plan; a
stored plan taken *before* the drop still contains the doomed DELETE.

ci.sh must call this only on destroy-plan/destroy-apply. On plan/apply a
region-default live VPC would be dropped from state and ForceNew-replace
Postgres.
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
# Placeholder created so another VPC can become region default.
PLACEHOLDER_NAME_SUFFIX = "-default-keep"
# Renamed stack VPC left in the account after destroy; frees the stack name.
KEPT_DEFAULT_SUFFIX = "-kept-default"


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


def is_placeholder_or_kept(name: str) -> bool:
    return (
        name.startswith("default-")
        or name.endswith(PLACEHOLDER_NAME_SUFFIX)
        or name.endswith(KEPT_DEFAULT_SUFFIX)
    )


def pick_replacement(managed_id: str, region: str, vpcs: list[dict]) -> dict | None:
    same = [v for v in vpcs if v.get("region") == region and v.get("id") != managed_id]
    for v in same:
        if v.get("default"):
            return v
    for v in same:
        if is_placeholder_or_kept(str(v.get("name") or "")):
            return v
    return same[0] if same else None


def unused_cidr(vpcs: list[dict], region: str) -> str:
    used = {v.get("ip_range") for v in vpcs if v.get("region") == region}
    for n in range(254, 200, -1):
        cidr = f"10.{n}.0.0/20"
        if cidr not in used:
            return cidr
    raise SystemExit("rehome_default_vpc: no free 10.x.0.0/20 for a placeholder VPC")


def kept_default_name(old: str) -> str | None:
    if not old or old.endswith(KEPT_DEFAULT_SUFFIX):
        return None
    return f"{old}{KEPT_DEFAULT_SUFFIX}"


def release_stack_name(vpc_id: str, current: dict) -> bool:
    """Rename a kept default so the next apply can recreate the stack VPC name.

    Returns False if the API rename failed (caller must fail the job after
    dropping state so destroy never DELETEs the default).
    """
    old = str(current.get("name") or "")
    new_name = kept_default_name(old)
    if not new_name:
        return True
    body: dict = {
        "name": new_name,
        "description": current.get("description") or "",
    }
    if current.get("default"):
        body["default"] = True
    try:
        api("PUT", f"/vpcs/{vpc_id}", body)
        print(f"rehome_default_vpc: renamed {old!r} -> {new_name!r}")
        return True
    except ApiError as exc:
        print(f"rehome_default_vpc: rename to free stack name failed ({exc})")
        return False


def remove_from_state(address: str) -> None:
    subprocess.check_call(["terraform", "state", "rm", address])
    MARKER.write_text(address + "\n", encoding="utf-8")


def drop_from_state(address: str, current: dict | None = None) -> None:
    rename_ok = True
    if current and current.get("id"):
        rename_ok = release_stack_name(str(current["id"]), current)
    print(
        f"rehome_default_vpc: leaving the DigitalOcean default VPC in place; "
        f"removing {address} from Terraform state"
    )
    remove_from_state(address)
    if not rename_ok:
        raise SystemExit(
            "rehome_default_vpc: dropped default VPC from state but failed to "
            "rename it; free the stack VPC name before the next apply"
        )
    if current and current.get("id"):
        print(
            "rehome_default_vpc: kept VPC still reserves its ip_range in the region; "
            "bump vpc_ip_range in envs/<env>.tfvars before the next apply"
        )


def create_placeholder(region: str, listed: list[dict]) -> dict | None:
    name = f"aerodeck-{region}{PLACEHOLDER_NAME_SUFFIX}"
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
        print(f"rehome_default_vpc: POST /vpcs failed ({exc})")
        return None
    return created.get("vpc") or {}


def set_replacement_default(replacement: dict) -> bool:
    rid = replacement.get("id")
    rname = replacement.get("name")
    if not rid or not rname:
        return False
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
        print(f"rehome_default_vpc: set {rid} ({rname}) as region default")
        return True
    except ApiError as exc:
        print(f"rehome_default_vpc: PUT default failed ({exc})")
        return False


def try_delete_vpc(vpc_id: str) -> bool:
    try:
        api("DELETE", f"/vpcs/{vpc_id}")
        print(f"rehome_default_vpc: deleted former stack VPC {vpc_id}")
        return True
    except ApiError as exc:
        print(f"rehome_default_vpc: DELETE {vpc_id} failed ({exc})")
        return False


def try_delete_after_default_move(vpc_id: str) -> bool:
    """DELETE after moving default; re-GET and retry once if the first 403s."""
    if try_delete_vpc(vpc_id):
        return True
    try:
        again = (api("GET", f"/vpcs/{vpc_id}").get("vpc") or {})
    except ApiError as exc:
        print(f"rehome_default_vpc: GET /vpcs/{vpc_id} after DELETE failed ({exc})")
        return False
    if again.get("default"):
        print(
            f"rehome_default_vpc: {vpc_id} still reports default=true after move; "
            "leaving in state for Terraform DELETE"
        )
        return False
    print(f"rehome_default_vpc: {vpc_id} confirmed non-default; retrying DELETE")
    return try_delete_vpc(vpc_id)


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

    # Never Terraform-DELETE while this VPC is still the region default.
    # After a successful default move: API-DELETE (or leave in state) so the
    # CIDR is freed. Rename+drop only when it must remain.
    print(f"rehome_default_vpc: {managed_id} is the {region} default; will not DELETE it yet")
    try:
        listed = api("GET", "/vpcs").get("vpcs") or []
    except ApiError as exc:
        raise SystemExit(f"rehome_default_vpc: GET /vpcs -> {exc}") from exc

    replacement = pick_replacement(managed_id, region, listed)
    if replacement is None:
        replacement = create_placeholder(region, listed)
        if replacement is None:
            drop_from_state(address, {**current, "id": managed_id})
            return

    if not set_replacement_default(replacement):
        drop_from_state(address, {**current, "id": managed_id})
        return

    if try_delete_after_default_move(managed_id):
        # Gone from DO; remove from state without rename (name+CIDR freed).
        print(
            f"rehome_default_vpc: removing {address} from Terraform state after DELETE"
        )
        remove_from_state(address)
        return

    # Former default often immutable: leave in state so terraform destroy retries.
    print(
        f"rehome_default_vpc: {managed_id} still present after default move; "
        "leaving in state for Terraform DELETE"
    )


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
