"""CI publishes the control-plane image to DigitalOcean Container Registry."""

import re
from pathlib import Path

IAC = Path(__file__).resolve().parents[1]
REPO = IAC.parents[1]
WORKFLOW = (REPO / ".github" / "workflows" / "control-plane-image.yml").read_text(
    encoding="utf-8"
)
DOCKERFILE = (REPO / "apps" / "control-plane" / "Dockerfile").read_text(encoding="utf-8")
VARS = (IAC / "variables.tf").read_text(encoding="utf-8")
OUTPUTS = (IAC / "outputs.tf").read_text(encoding="utf-8")
MAIN = (IAC / "main.tf").read_text(encoding="utf-8")
RUNTIME = (IAC / "modules" / "runtime" / "main.tf").read_text(encoding="utf-8")
CLOUD_INIT = (IAC / "modules" / "runtime" / "cloud-init.yaml").read_text(encoding="utf-8")


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
    if "pull_request_target" in WORKFLOW:
        raise SystemExit("control-plane-image.yml must not use pull_request_target")
    if "ghcr.io" in WORKFLOW or "ghcr.io" in VARS:
        raise SystemExit("publish to DigitalOcean Container Registry, not GHCR")

    _must(WORKFLOW, "apps/control-plane/**", "control-plane-image.yml")
    _must(WORKFLOW, "docker build", "control-plane-image.yml")
    _must(WORKFLOW, "registry.digitalocean.com", "control-plane-image.yml")
    _must(WORKFLOW, "docker push", "control-plane-image.yml")
    _must(WORKFLOW, 'github.event_name != \'pull_request\'', "control-plane-image.yml")
    _must(WORKFLOW, "github.ref == 'refs/heads/main'", "control-plane-image.yml")
    _must(WORKFLOW, "${GITHUB_SHA}", "control-plane-image.yml")
    _must(WORKFLOW, "${image}:main", "control-plane-image.yml")
    _must(WORKFLOW, "secrets.DIGITALOCEAN_TOKEN", "control-plane-image.yml")
    _must(WORKFLOW, "permissions:", "control-plane-image.yml")
    _must(WORKFLOW, "contents: read", "control-plane-image.yml")

    build_job, push_job = WORKFLOW.split("name: push to DigitalOcean Container Registry", 1)
    if "docker push" in build_job:
        raise SystemExit("docker push must not run in the build job")
    job_header = push_job.split("steps:")[0]
    if "github.event_name != 'pull_request'" not in job_header:
        raise SystemExit("push job must skip pull_request before docker push")

    uses = re.findall(r"(?m)^\s+uses:\s+(\S+)", _code_lines(WORKFLOW))
    if not uses:
        raise SystemExit("control-plane-image.yml must pin actions with uses:")
    for spec in uses:
        if "@" not in spec:
            raise SystemExit(f"action {spec} must be pinned to a git SHA")
        digest = spec.split("@", 1)[1]
        if not re.fullmatch(r"[0-9a-f]{40}", digest):
            raise SystemExit(f"action {spec} must be SHA-pinned (40 hex chars), not a floating tag")

    secret_arg = re.search(
        r"(?im)^ARG\s+\w*(TOKEN|SECRET|PASSWORD|KEY|CREDENTIAL)",
        DOCKERFILE,
    )
    secret_env = re.search(
        r"(?im)^ENV\s+\w*(TOKEN|SECRET|PASSWORD|KEY|CREDENTIAL)",
        DOCKERFILE,
    )
    if secret_arg or secret_env:
        raise SystemExit("Dockerfile must not put secrets in ARG or ENV")
    _must(DOCKERFILE, "USER aerodeck", "Dockerfile")
    _must(DOCKERFILE, "HEALTHCHECK", "Dockerfile")
    _must(DOCKERFILE, "packages/iac-engine/stacks/tenant", "Dockerfile")
    _must(DOCKERFILE, "packages/iac-engine/backend.hcl", "Dockerfile")
    if "packages/iac-engine /opt" in DOCKERFILE:
        raise SystemExit("copy only stacks/tenant plus backend.hcl, not the platform root module")
    _must(DOCKERFILE, "terraform", "Dockerfile")
    _must(WORKFLOW, "--file apps/control-plane/Dockerfile", "control-plane-image.yml")
    contexts = re.findall(
        r"docker build\s+\\?\s+--file apps/control-plane/Dockerfile[\s\S]*?((?:apps/control-plane)|\.)\s*$",
        WORKFLOW,
        re.M,
    )
    if not contexts or any(ctx != "." for ctx in contexts):
        raise SystemExit("docker build context must be the repository root (.) so stacks/tenant is copied")

    _must(VARS, 'variable "control_plane_image"', "variables.tf")
    _must(VARS, "registry.digitalocean.com", "variables.tf")
    _must(MAIN, "var.control_plane_image", "main.tf")
    _must(RUNTIME, "templatefile", "modules/runtime/main.tf")
    _must(CLOUD_INIT, "/etc/aerodeck/control-plane-image", "cloud-init.yaml")
    _must(OUTPUTS, 'output "control_plane_image"', "outputs.tf")

    print("control-plane image workflow, Dockerfile, and Terraform reference look right")


if __name__ == "__main__":
    main()
