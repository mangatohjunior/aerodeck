"""Destroy runs only from CI, against a stored destroy plan, with confirm + prod gate."""

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REPO = ROOT.parents[1]
SCRIPT = (ROOT / "scripts" / "ci.sh").read_text(encoding="utf-8")
WORKFLOW = (REPO / ".github" / "workflows" / "iac-destroy.yml").read_text(encoding="utf-8")


def _must(text: str, needle: str, where: str) -> None:
    if needle not in text:
        raise SystemExit(f"{where} must contain {needle!r}")


def _code_lines(text: str) -> str:
    lines = []
    for raw in text.splitlines():
        stripped = raw.strip()
        if stripped.startswith("#"):
            continue
        lines.append(raw.split("#", 1)[0])
    return "\n".join(lines)


def main() -> None:
    _must(SCRIPT, "destroy-plan", "scripts/ci.sh")
    _must(SCRIPT, "destroy-apply", "scripts/ci.sh")
    _must(SCRIPT, "Refusing terraform destroy outside GitHub Actions", "scripts/ci.sh")
    _must(SCRIPT, "terraform plan -destroy", "scripts/ci.sh")
    _must(SCRIPT, "lift_prevent_destroy_in_runner", "scripts/ci.sh")
    if "-auto-approve" in _code_lines(SCRIPT):
        raise SystemExit("scripts/ci.sh must not pass -auto-approve")

    if "pull_request:" in WORKFLOW.split("on:")[1].split("jobs:")[0]:
        raise SystemExit("iac-destroy.yml must not subscribe to pull_request")
    if "pull_request_target" in WORKFLOW:
        raise SystemExit("iac-destroy.yml must not use pull_request_target")
    _must(WORKFLOW, "workflow_dispatch:", "iac-destroy.yml")
    _must(WORKFLOW, "destroy-${ENV_NAME}", "iac-destroy.yml")
    _must(WORKFLOW, 'github.ref == \'refs/heads/main\'', "iac-destroy.yml")
    _must(WORKFLOW, "bash scripts/ci.sh destroy-plan", "iac-destroy.yml")
    _must(WORKFLOW, "bash scripts/ci.sh destroy-apply", "iac-destroy.yml")
    _must(WORKFLOW, "apply_destroy == 'true'", "iac-destroy.yml")
    _must(WORKFLOW, "environment: ${{ github.event.inputs.environment == 'prod' && 'production' || github.event.inputs.environment }}", "iac-destroy.yml")
    _must(WORKFLOW, "name: tfdestroy-${{ github.event.inputs.environment }}", "iac-destroy.yml")
    _must(WORKFLOW, "terraform_wrapper: false", "iac-destroy.yml")
    _must(WORKFLOW, "secrets.DIGITALOCEAN_TOKEN", "iac-destroy.yml")
    if "aerodeck-tfstate" in _code_lines(WORKFLOW) and "terraform destroy" in _code_lines(WORKFLOW):
        raise SystemExit("destroy workflow must not target the Spaces bucket")
    if "-auto-approve" in _code_lines(WORKFLOW):
        raise SystemExit("iac-destroy.yml must not pass -auto-approve")

    apply_job = WORKFLOW.split("name: destroy apply")[1]
    if "pull_request:" in apply_job:
        raise SystemExit("destroy apply must not subscribe to pull_request")

    print("CI destroy workflow and script look right")


if __name__ == "__main__":
    main()
