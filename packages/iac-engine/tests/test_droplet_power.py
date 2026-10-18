"""Droplet power only starts or stops the named control and edge Droplets."""

import importlib.util
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REPO = ROOT.parents[1]
SCRIPT = ROOT / "scripts" / "droplet_power.py"
WORKFLOW = (REPO / ".github" / "workflows" / "droplet-power.yml").read_text(encoding="utf-8")


def _load():
    spec = importlib.util.spec_from_file_location("droplet_power", SCRIPT)
    if spec is None or spec.loader is None:
        raise SystemExit("could not load droplet_power.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _must(text: str, needle: str, where: str) -> None:
    if needle not in text:
        raise SystemExit(f"{where} must contain {needle!r}")


def main() -> None:
    module = _load()
    if module.droplet_name("dev", "control") != "aerodeck-dev-control":
        raise SystemExit("control Droplet name drifted")
    if module.droplet_name("dev", "edge") != "aerodeck-dev-edge":
        raise SystemExit("edge Droplet name drifted")
    if module.power_order("start") != ("control", "edge"):
        raise SystemExit("start must power on control before edge")
    if module.power_order("stop") != ("edge", "control"):
        raise SystemExit("stop must shut down edge before control")
    if module.api_type("stop") != "shutdown":
        raise SystemExit("stop must be a graceful shutdown")
    if module.should_request("start", "active") or module.should_request("stop", "off"):
        raise SystemExit("an in-state Droplet must be skipped")
    if not module.already_in_state('{"message":"Droplet already powered off."}'):
        raise SystemExit("already powered off must be treated as success")

    listed = [
        {"id": 1, "name": "aerodeck-dev-control", "status": "active"},
        {"id": 2, "name": "aerodeck-dev-edge", "status": "off"},
        {"id": 9, "name": "aerodeck-dev-other", "status": "active"},
    ]
    started = module.choose(listed, "dev", "start")
    if [item["name"] for item in started] != ["aerodeck-dev-control", "aerodeck-dev-edge"]:
        raise SystemExit(f"start selection drifted: {started}")
    stopped = module.choose(listed, "dev", "stop")
    if [item["id"] for item in stopped] != [2, 1]:
        raise SystemExit(f"stop order drifted: {stopped}")

    try:
        module.droplet_name("production", "control")
    except SystemExit:
        pass
    else:
        raise SystemExit("environment production must be refused")

    try:
        module.choose([{"id": 1, "name": "aerodeck-dev-control", "status": "active"}], "dev", "start")
    except SystemExit as exc:
        if "missing" not in str(exc):
            raise
    else:
        raise SystemExit("a missing edge Droplet must fail")

    on_block = WORKFLOW.split("on:", 1)[1].split("jobs:", 1)[0]
    if "pull_request:" in on_block or "pull_request_target" in WORKFLOW:
        raise SystemExit("droplet-power.yml must be manual only")
    _must(WORKFLOW, "workflow_dispatch:", "droplet-power.yml")
    _must(WORKFLOW, "github.ref == 'refs/heads/main'", "droplet-power.yml")
    _must(WORKFLOW, "environment: production", "droplet-power.yml")
    _must(WORKFLOW, "packages/iac-engine/scripts/droplet_power.py", "droplet-power.yml")
    _must(WORKFLOW, "contents: read", "droplet-power.yml")
    if "power_off" in WORKFLOW or "destroy" in WORKFLOW.split("jobs:", 1)[1]:
        raise SystemExit("droplet-power.yml must not hard-power-off or destroy")
    print("droplet power helpers look right")


if __name__ == "__main__":
    main()
