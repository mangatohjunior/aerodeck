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

    kept_listed = [
        {"id": "vpc-dev", "region": "ams3", "name": "aerodeck-dev-ams3-private", "default": True},
        {
            "id": "vpc-old",
            "region": "ams3",
            "name": "aerodeck-dev-ams3-vpc-kept-default",
            "default": False,
        },
        {"id": "vpc-other", "region": "ams3", "name": "random-ams3", "default": False},
    ]
    kept_pick = mod.pick_replacement("vpc-dev", "ams3", kept_listed)
    if not kept_pick or kept_pick.get("id") != "vpc-old":
        raise SystemExit(f"should prefer -kept-default leftover, got {kept_pick}")

    cidr = mod.unused_cidr(
        [{"region": "nyc3", "ip_range": "10.254.0.0/20"}],
        "nyc3",
    )
    if cidr == "10.254.0.0/20":
        raise SystemExit("unused_cidr must skip CIDRs already in the region")
    if not cidr.startswith("10.") or not cidr.endswith(".0.0/20"):
        raise SystemExit(f"unexpected placeholder cidr {cidr}")

    expected_kept = f"aerodeck-dev-ams3-private{mod.KEPT_DEFAULT_SUFFIX}"
    if mod.kept_default_name("aerodeck-dev-ams3-private") != expected_kept:
        raise SystemExit("kept_default_name must free the stack VPC name")
    if mod.kept_default_name(expected_kept) is not None:
        raise SystemExit("already-kept names must not be renamed again")
    if not mod.is_placeholder_or_kept(f"aerodeck-ams3{mod.PLACEHOLDER_NAME_SUFFIX}"):
        raise SystemExit("placeholder suffix must match pick_replacement")

    calls: list[tuple[str, str]] = []

    def failing_rename(method: str, path: str, body: dict | None = None) -> dict:
        calls.append((method, path))
        raise mod.ApiError(422, "rename refused")

    mod.api = failing_rename  # type: ignore[method-assign]
    ok = mod.release_stack_name(
        "vpc-1",
        {"name": "aerodeck-dev-ams3-private", "description": "", "default": True},
    )
    if ok:
        raise SystemExit("release_stack_name must return False when PUT fails")
    if ("PUT", "/vpcs/vpc-1") not in calls:
        raise SystemExit("release_stack_name must PUT the VPC")

    state_rms: list[list[str]] = []

    def fake_check_call(cmd: list[str], *args, **kwargs) -> None:
        state_rms.append(cmd)

    mod.subprocess.check_call = fake_check_call  # type: ignore[method-assign]
    marker = ROOT / ".rehome-vpc-dropped-test"
    orig_marker = mod.MARKER
    mod.MARKER = marker
    try:
        if marker.exists():
            marker.unlink()
        try:
            mod.drop_from_state(
                "module.network.digitalocean_vpc.platform",
                {
                    "id": "vpc-1",
                    "name": "aerodeck-dev-ams3-private",
                    "description": "",
                    "default": True,
                },
            )
        except SystemExit as exc:
            if "failed to rename" not in str(exc):
                raise SystemExit(f"unexpected SystemExit: {exc}") from exc
        else:
            raise SystemExit("drop_from_state must exit when rename fails")
        if not state_rms or "state" not in state_rms[0] or "rm" not in state_rms[0]:
            raise SystemExit("drop_from_state must state rm before exiting")
        if not marker.is_file():
            raise SystemExit("drop_from_state must write marker before exiting")
    finally:
        mod.MARKER = orig_marker
        marker.unlink(missing_ok=True)

    print("rehome_default_vpc helpers look right")


if __name__ == "__main__":
    main()
