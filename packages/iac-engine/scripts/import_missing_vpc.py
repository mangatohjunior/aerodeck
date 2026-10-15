#!/usr/bin/env python3
"""Re-attach a VPC that was dropped from state but still used by the stack.

rehome_default_vpc.py used to run on every non-PR plan and `terraform state rm`
the region-default VPC. That removed the live ams3 VPC from state while
Postgres and the Droplet still pointed at it. The next plan then created a
new VPC and ForceNew-replaced Postgres (blocked by prevent_destroy).

Import the UUID still on those resources. Do not run this on pull_request.
"""

from __future__ import annotations

import json
import os
import subprocess
import sys


VPC_ADDRESS = "module.network.digitalocean_vpc.platform"


def vpc_id_from_state(state: dict) -> str | None:
    for res in state.get("resources") or []:
        if res.get("type") == "digitalocean_vpc":
            for inst in res.get("instances") or []:
                vid = (inst.get("attributes") or {}).get("id")
                if vid:
                    return vid
    return None


def attached_vpc_id(state: dict) -> str | None:
    for res in state.get("resources") or []:
        rtype = res.get("type")
        if rtype not in (
            "digitalocean_droplet",
            "digitalocean_database_cluster",
        ):
            continue
        for inst in res.get("instances") or []:
            attrs = inst.get("attributes") or {}
            vid = attrs.get("vpc_uuid") or attrs.get("private_network_uuid")
            if vid:
                return vid
    return None


def main() -> None:
    pulled = subprocess.check_output(["terraform", "state", "pull"], text=True)
    state = json.loads(pulled) if pulled.strip() else {}
    if vpc_id_from_state(state):
        print("import_missing_vpc: VPC already in state")
        return
    vid = attached_vpc_id(state)
    if not vid:
        print("import_missing_vpc: no VPC UUID on Droplet or databases")
        return
    tfvars = os.environ.get("TFVARS", "envs/dev.tfvars")
    print(f"import_missing_vpc: importing {vid} as {VPC_ADDRESS}")
    subprocess.check_call(
        [
            "terraform",
            "import",
            "-input=false",
            f"-var-file={tfvars}",
            VPC_ADDRESS,
            vid,
        ]
    )


if __name__ == "__main__":
    try:
        main()
    except subprocess.CalledProcessError as exc:
        sys.exit(exc.returncode)
