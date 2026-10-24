"""Placeholder default VPC selection for destroy must stay in-region."""

from __future__ import annotations

import importlib.util
from pathlib import Path
from typing import Any, Callable

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "scripts" / "rehome_default_vpc.py"
ADDRESS = "module.network.digitalocean_vpc.platform"
ENTRY = {"address": ADDRESS, "id": "vpc-dev", "region": "ams3"}


def _load():
    spec = importlib.util.spec_from_file_location("rehome_default_vpc", SCRIPT)
    if spec is None or spec.loader is None:
        raise SystemExit("could not load rehome_default_vpc.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def _assert_entries(mod: Any) -> None:
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
    if entries != [
        {
            "address": "module.network.digitalocean_vpc.platform",
            "id": "vpc-dev",
            "region": "nyc3",
        }
    ]:
        raise SystemExit(f"unexpected vpc entries: {entries}")


def _assert_pick_replacement(mod: Any) -> None:
    listed = [
        {"id": "vpc-dev", "region": "nyc3", "name": "aerodeck-dev-vpc", "default": True},
        {"id": "vpc-keep", "region": "nyc3", "name": "default-nyc3", "default": False},
        {"id": "vpc-ams", "region": "ams3", "name": "default-ams3", "default": True},
    ]
    picked = mod.pick_replacement("vpc-dev", "nyc3", listed)
    if not picked or picked.get("id") != "vpc-keep":
        raise SystemExit(f"should pick same-region non-managed VPC, got {picked}")

    kept_listed = [
        {
            "id": "vpc-dev",
            "region": "ams3",
            "name": "aerodeck-dev-ams3-private",
            "default": True,
        },
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


def _assert_cidr_and_names(mod: Any) -> None:
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


def _assert_rename_failure_exits(mod: Any) -> None:
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
        marker.unlink(missing_ok=True)
        try:
            mod.drop_from_state(
                ADDRESS,
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


def _stub_ensure(
    mod: Any,
    *,
    api_handler: Callable[..., dict],
    marker: Path,
) -> list[list[str]]:
    state_rms: list[list[str]] = []

    def fake_check_call(cmd: list[str], *args, **kwargs) -> None:
        state_rms.append(cmd)

    mod.api = api_handler  # type: ignore[method-assign]
    mod.subprocess.check_call = fake_check_call  # type: ignore[method-assign]
    mod.MARKER = marker
    marker.unlink(missing_ok=True)
    return state_rms


def _api_stack_default(
    mod: Any,
    *,
    on_delete: Callable[[], dict] | None = None,
    on_put_keep: Callable[[], dict] | None = None,
    on_reget: Callable[[], dict] | None = None,
) -> Callable[..., dict]:
    """Shared GET fixtures for a region-default stack VPC + placeholder keep."""
    get_count = {"vpc_dev": 0}

    def api_handler(method: str, path: str, body: dict | None = None) -> dict:
        if method == "GET" and path == "/vpcs/vpc-dev":
            get_count["vpc_dev"] += 1
            if get_count["vpc_dev"] > 1 and on_reget is not None:
                return on_reget()
            return {
                "vpc": {
                    "id": "vpc-dev",
                    "name": "aerodeck-dev-ams3-private",
                    "default": True,
                    "description": "",
                }
            }
        if method == "GET" and path == "/vpcs":
            return {
                "vpcs": [
                    {
                        "id": "vpc-dev",
                        "region": "ams3",
                        "name": "aerodeck-dev-ams3-private",
                        "default": True,
                    },
                    {
                        "id": "vpc-keep",
                        "region": "ams3",
                        "name": "default-ams3",
                        "default": False,
                        "description": "",
                    },
                ]
            }
        if method == "PUT" and path == "/vpcs/vpc-keep":
            if on_put_keep is not None:
                return on_put_keep()
            return {}
        if method == "DELETE" and path == "/vpcs/vpc-dev":
            if on_delete is not None:
                return on_delete()
            return {}
        if method == "PUT" and path == "/vpcs/vpc-dev":
            return {}
        raise SystemExit(f"unexpected api call {method} {path}")

    return api_handler


def _assert_ensure_delete_success(mod: Any) -> None:
    """Default moved + DELETE ok → state rm + marker, no rename PUT."""
    orig_marker = mod.MARKER
    marker = ROOT / ".rehome-vpc-dropped-delete-ok"
    deletes = {"n": 0}

    def on_delete() -> dict:
        deletes["n"] += 1
        return {}

    def forbid_rename(method: str, path: str, body: dict | None = None) -> dict:
        if method == "PUT" and path == "/vpcs/vpc-dev":
            raise SystemExit("DELETE path must not rename the stack VPC")
        return base(method, path, body)

    base = _api_stack_default(mod, on_delete=on_delete)
    try:
        state_rms = _stub_ensure(mod, api_handler=forbid_rename, marker=marker)
        mod.ensure_not_default(ENTRY)
        if deletes["n"] != 1:
            raise SystemExit("ensure_not_default must DELETE after default move")
        if not state_rms or "rm" not in state_rms[0]:
            raise SystemExit("successful DELETE must remove_from_state")
        if not marker.is_file():
            raise SystemExit("successful DELETE must write marker")
    finally:
        mod.MARKER = orig_marker
        marker.unlink(missing_ok=True)


def _assert_ensure_delete_refused(mod: Any) -> None:
    """Non-default + DELETE refused twice → leave in state (no state rm)."""
    orig_marker = mod.MARKER
    marker = ROOT / ".rehome-vpc-dropped-delete-fail"
    deletes = {"n": 0}

    def on_delete() -> dict:
        deletes["n"] += 1
        raise mod.ApiError(403, "Can not delete default VPCs")

    def on_reget() -> dict:
        return {
            "vpc": {
                "id": "vpc-dev",
                "name": "aerodeck-dev-ams3-private",
                "default": False,
                "description": "",
            }
        }

    handler = _api_stack_default(mod, on_delete=on_delete, on_reget=on_reget)
    try:
        state_rms = _stub_ensure(mod, api_handler=handler, marker=marker)
        mod.ensure_not_default(ENTRY)
        if deletes["n"] != 2:
            raise SystemExit("must retry DELETE once after confirming non-default")
        if state_rms:
            raise SystemExit("failed DELETE after default move must not state rm")
        if marker.is_file():
            raise SystemExit("failed DELETE must not write marker")
    finally:
        mod.MARKER = orig_marker
        marker.unlink(missing_ok=True)


def _assert_ensure_still_default_drops(mod: Any) -> None:
    """Still default=true after move → rename + state rm (not Terraform DELETE)."""
    orig_marker = mod.MARKER
    marker = ROOT / ".rehome-vpc-dropped-still-default"
    deletes = {"n": 0}
    renames = {"n": 0}

    def on_delete() -> dict:
        deletes["n"] += 1
        raise mod.ApiError(403, "Can not delete default VPCs")

    def on_reget() -> dict:
        return {
            "vpc": {
                "id": "vpc-dev",
                "name": "aerodeck-dev-ams3-private",
                "default": True,
                "description": "",
            }
        }

    def handler(method: str, path: str, body: dict | None = None) -> dict:
        if method == "PUT" and path == "/vpcs/vpc-dev":
            renames["n"] += 1
            return {}
        return base(method, path, body)

    base = _api_stack_default(mod, on_delete=on_delete, on_reget=on_reget)
    try:
        state_rms = _stub_ensure(mod, api_handler=handler, marker=marker)
        mod.ensure_not_default(ENTRY)
        if deletes["n"] != 1:
            raise SystemExit("still-default path must try DELETE once then stop")
        if renames["n"] != 1:
            raise SystemExit("still-default path must rename via drop_from_state")
        if not state_rms or "rm" not in state_rms[0]:
            raise SystemExit("still-default path must state rm")
        if not marker.is_file():
            raise SystemExit("still-default path must write marker")
    finally:
        mod.MARKER = orig_marker
        marker.unlink(missing_ok=True)


def _assert_ensure_default_move_fails(mod: Any) -> None:
    """set_replacement_default fails → drop_from_state (rename + state rm)."""
    orig_marker = mod.MARKER
    marker = ROOT / ".rehome-vpc-dropped-put-fail"
    renames = {"n": 0}

    def on_put_keep() -> dict:
        raise mod.ApiError(422, "cannot set default")

    def handler(method: str, path: str, body: dict | None = None) -> dict:
        if method == "PUT" and path == "/vpcs/vpc-dev":
            renames["n"] += 1
            return {}
        return base(method, path, body)

    base = _api_stack_default(mod, on_put_keep=on_put_keep)
    try:
        state_rms = _stub_ensure(mod, api_handler=handler, marker=marker)
        mod.ensure_not_default(ENTRY)
        if renames["n"] != 1:
            raise SystemExit("failed default move must rename via drop_from_state")
        if not state_rms or "rm" not in state_rms[0]:
            raise SystemExit("failed default move must state rm")
        if not marker.is_file():
            raise SystemExit("failed default move must write marker")
    finally:
        mod.MARKER = orig_marker
        marker.unlink(missing_ok=True)


def main() -> None:
    mod = _load()
    _assert_entries(mod)
    _assert_pick_replacement(mod)
    _assert_cidr_and_names(mod)
    _assert_rename_failure_exits(mod)
    _assert_ensure_delete_success(mod)
    _assert_ensure_delete_refused(mod)
    _assert_ensure_still_default_drops(mod)
    _assert_ensure_default_move_fails(mod)
    print("rehome_default_vpc helpers look right")


if __name__ == "__main__":
    main()
