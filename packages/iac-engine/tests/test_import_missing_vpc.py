"""Recover a VPC UUID from Droplet/Postgres state when the VPC resource is gone."""

import importlib.util
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "scripts" / "import_missing_vpc.py"


def _load():
    spec = importlib.util.spec_from_file_location("import_missing_vpc", SCRIPT)
    if spec is None or spec.loader is None:
        raise SystemExit("could not load import_missing_vpc.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def main() -> None:
    mod = _load()
    empty = {"resources": []}
    if mod.vpc_id_from_state(empty) is not None:
        raise SystemExit("empty state must have no VPC")
    if mod.attached_vpc_id(empty) is not None:
        raise SystemExit("empty state must have no attached VPC")

    live = {
        "resources": [
            {
                "type": "digitalocean_database_cluster",
                "name": "postgres",
                "instances": [
                    {"attributes": {"private_network_uuid": "vpc-live"}},
                ],
            }
        ]
    }
    if mod.vpc_id_from_state(live) is not None:
        raise SystemExit("postgres-only state must not count as VPC resource")
    if mod.attached_vpc_id(live) != "vpc-live":
        raise SystemExit("must recover UUID from postgres private_network_uuid")

    with_vpc = {
        "resources": [
            {
                "type": "digitalocean_vpc",
                "name": "platform",
                "instances": [{"attributes": {"id": "vpc-in-state"}}],
            }
        ]
    }
    if mod.vpc_id_from_state(with_vpc) != "vpc-in-state":
        raise SystemExit("must see VPC already in state")
    print("import_missing_vpc helpers look right")


if __name__ == "__main__":
    main()
