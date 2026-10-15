"""Placeholder default VPC selection for destroy must stay in-region."""

import importlib.util
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "scripts" / "rehome_default_vpc.py"


def _load():
    spec = importlib.util.spec_from_file_location("rehome_default_vpc", SCRIPT)
    if spec is None or spec.loader is None:
        raise SystemExit("could not load rehome_default_vpc.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def main() -> None:
    mod = _load()
    state = {
        "resources": [
            {
                "module": "module.network",
                "type": "digitalocean_vpc",
                "name": "platform",
                "instances": [
                    {"attributes": {"id": "vpc-dev", "region": "nyc3"}},
                ],
            }
        ]
    }
    entries = mod.vpc_entries_from_state(state)
    if entries != [{"address": "module.network.digitalocean_vpc.platform", "id": "vpc-dev", "region": "nyc3"}]:
        raise SystemExit(f"unexpected vpc entries: {entries}")

    listed = [
        {"id": "vpc-dev", "region": "nyc3", "name": "aerodeck-dev-vpc", "default": True},
        {"id": "vpc-keep", "region": "nyc3", "name": "default-nyc3", "default": False},
        {"id": "vpc-ams", "region": "ams3", "name": "default-ams3", "default": True},
    ]
    picked = mod.pick_replacement("vpc-dev", "nyc3", listed)
    if not picked or picked.get("id") != "vpc-keep":
        raise SystemExit(f"should pick same-region non-managed VPC, got {picked}")

    cidr = mod.unused_cidr(
        [{"region": "nyc3", "ip_range": "10.254.0.0/20"}],
        "nyc3",
    )
    if cidr == "10.254.0.0/20":
        raise SystemExit("unused_cidr must skip CIDRs already in the region")
    if not cidr.startswith("10.") or not cidr.endswith(".0.0/20"):
        raise SystemExit(f"unexpected placeholder cidr {cidr}")

    print("rehome_default_vpc helpers look right")


if __name__ == "__main__":
    main()
