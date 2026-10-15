"""Applies run only from CI, against a stored plan, with a prod approval gate."""

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REPO = ROOT.parents[1]
SCRIPT = (ROOT / "scripts" / "ci.sh").read_text(encoding="utf-8")
WORKFLOW = (REPO / ".github" / "workflows" / "iac-plan-apply.yml").read_text(encoding="utf-8")


def _must(text: str, needle: str, where: str) -> None:
    if needle not in text:
        raise SystemExit(f"{where} must contain {needle!r}")


def _code_lines(text: str) -> str:
    """Drop comments so a warning about -auto-approve is not treated as using it."""
    lines = []
    for raw in text.splitlines():
        stripped = raw.strip()
        if stripped.startswith("#"):
            continue
        lines.append(raw.split("#", 1)[0])
    return "\n".join(lines)


def main() -> None:
    _must(SCRIPT, 'GITHUB_ACTIONS:-', "scripts/ci.sh")
    _must(SCRIPT, "Refusing terraform apply outside GitHub Actions", "scripts/ci.sh")
    _must(SCRIPT, 'terraform plan -input=false -var-file="${TFVARS}" -out="${PLANFILE}"', "scripts/ci.sh")
    _must(SCRIPT, 'terraform apply -input=false "${PLANFILE}"', "scripts/ci.sh")
    _must(SCRIPT, "python3 scripts/rehome_default_vpc.py", "scripts/ci.sh")
    _must(SCRIPT, "python3 scripts/import_missing_vpc.py", "scripts/ci.sh")
    _must(SCRIPT, 'CMD}" == destroy-plan || "${CMD}" == destroy-apply', "scripts/ci.sh")
    _must(SCRIPT, ".rehome-vpc-dropped", "scripts/ci.sh")
    _must(SCRIPT, ".import-vpc-recovered", "scripts/ci.sh")
    if "python3 scripts/import_missing_vpc.py" not in SCRIPT.split("python3 scripts/rehome_default_vpc.py")[-1]:
        raise SystemExit("import_missing_vpc.py must run on the plan/apply path, not destroy")
    if 'GITHUB_EVENT_NAME' in _code_lines(SCRIPT):
        raise SystemExit("import_missing_vpc.py must run on pull_request plans")
    if "-auto-approve" in _code_lines(SCRIPT):
        raise SystemExit("scripts/ci.sh must not pass -auto-approve")

    if "pull_request_target" in WORKFLOW:
        raise SystemExit("iac-plan-apply.yml must not use pull_request_target")
    _must(WORKFLOW, "github.event_name == 'workflow_dispatch'", "iac-plan-apply.yml")
    _must(WORKFLOW, "github.event.inputs.apply == 'true'", "iac-plan-apply.yml")
    _must(WORKFLOW, "github.event.inputs.environment == 'prod'", "iac-plan-apply.yml")
    _must(WORKFLOW, "environment: production", "iac-plan-apply.yml")
    _must(WORKFLOW, "bash scripts/ci.sh plan", "iac-plan-apply.yml")
    _must(WORKFLOW, "bash scripts/ci.sh apply prod", "iac-plan-apply.yml")
    _must(WORKFLOW, "name: tfplan-${{ matrix.environment }}", "iac-plan-apply.yml")
    _must(WORKFLOW, "name: tfplan-prod", "iac-plan-apply.yml")
    _must(WORKFLOW, "terraform_wrapper: false", "iac-plan-apply.yml")
    _must(WORKFLOW, "secrets.DIGITALOCEAN_TOKEN", "iac-plan-apply.yml")
    _must(WORKFLOW, "secrets.SPACES_ACCESS_KEY_ID", "iac-plan-apply.yml")
    _must(WORKFLOW, "secrets.SPACES_SECRET_ACCESS_KEY", "iac-plan-apply.yml")
    _must(WORKFLOW, "vars.SSH_KEY_IDS", "iac-plan-apply.yml")
    _must(WORKFLOW, "vars.SSH_ALLOW_CIDRS", "iac-plan-apply.yml")
    _must(SCRIPT, "SSH_KEY_IDS", "scripts/ci.sh")
    _must(SCRIPT, "TF_VAR_ssh_key_ids", "scripts/ci.sh")
    _must(SCRIPT, "TF_VAR_ssh_allow_cidrs", "scripts/ci.sh")
    if "-auto-approve" in _code_lines(WORKFLOW):
        raise SystemExit("iac-plan-apply.yml must not pass -auto-approve")
    # Apply jobs must not run on pull requests; the apply job names are unique.
    apply_block = WORKFLOW.split("apply-nonprod:")[1]
    if "pull_request:" in apply_block.split("apply-prod:")[0]:
        raise SystemExit("apply jobs must not subscribe to pull_request")

    print("CI plan/apply workflow and script look right")


if __name__ == "__main__":
    main()
