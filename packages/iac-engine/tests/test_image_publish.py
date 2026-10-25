"""CI publishes control-plane and dashboard images to DigitalOcean Container Registry."""

from __future__ import annotations

import re
from pathlib import Path

IAC = Path(__file__).resolve().parents[1]
REPO = IAC.parents[1]
WORKFLOW = (REPO / ".github" / "workflows" / "control-plane-image.yml").read_text(
    encoding="utf-8"
)
DASHBOARD_WORKFLOW = (
    REPO / ".github" / "workflows" / "dashboard-image.yml"
).read_text(encoding="utf-8")
DOCKERFILE = (REPO / "apps" / "control-plane" / "Dockerfile").read_text(encoding="utf-8")
DASHBOARD_DOCKERFILE = (REPO / "apps" / "dashboard" / "Dockerfile").read_text(
    encoding="utf-8"
)
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


def _check_docr_workflow(
    text: str,
    name: str,
    path_glob: str,
    floating_tag: str,
) -> None:
    if "pull_request_target" in text:
        raise SystemExit(f"{name} must not use pull_request_target")
    if "ghcr.io" in text:
        raise SystemExit(f"{name} must publish to DOCR, not GHCR")
    for required in (
        path_glob,
        "docker build",
        "registry.digitalocean.com",
        "docker push",
        "github.event_name != 'pull_request'",
        "github.ref == 'refs/heads/main'",
        "${GITHUB_SHA}",
        floating_tag,
        "secrets.DOCR_TOKEN",
        "secrets.DIGITALOCEAN_TOKEN",
        "prune_docr_images.py",
        "permissions:",
        "contents: read",
    ):
        _must(text, required, name)
    build_job, push_job = text.split("name: push to DigitalOcean Container Registry", 1)
    if "docker push" in build_job:
        raise SystemExit(f"{name}: docker push must not run in the build job")
    job_header = push_job.split("steps:")[0]
    if "github.event_name != 'pull_request'" not in job_header:
        raise SystemExit(f"{name}: push job must skip pull_request before docker push")
    uses = re.findall(r"(?m)^\s+uses:\s+(\S+)", _code_lines(text))
    if not uses:
        raise SystemExit(f"{name} must pin actions with uses:")
    for spec in uses:
        if "@" not in spec or not re.fullmatch(r"[0-9a-f]{40}", spec.split("@", 1)[1]):
            raise SystemExit(f"{name}: action {spec} must be SHA-pinned (40 hex chars)")


def _check_dockerfiles() -> None:
    for label, text in (
        ("control-plane Dockerfile", DOCKERFILE),
        ("dashboard Dockerfile", DASHBOARD_DOCKERFILE),
    ):
        secret_arg = re.search(
            r"(?im)^ARG\s+\w*(TOKEN|SECRET|PASSWORD|KEY|CREDENTIAL)", text
        )
        secret_env = re.search(
            r"(?im)^ENV\s+\w*(TOKEN|SECRET|PASSWORD|KEY|CREDENTIAL)", text
        )
        if secret_arg or secret_env:
            raise SystemExit(f"{label} must not put secrets in ARG or ENV")
        _must(text, "HEALTHCHECK", label)


def main() -> None:
    if "ghcr.io" in VARS:
        raise SystemExit("publish to DigitalOcean Container Registry, not GHCR")
    _check_docr_workflow(
        WORKFLOW,
        "control-plane-image.yml",
        "apps/control-plane/**",
        "${image}:main",
    )
    _check_docr_workflow(
        DASHBOARD_WORKFLOW,
        "dashboard-image.yml",
        "apps/dashboard/**",
        "${image}:dashboard-main",
    )
    _check_dockerfiles()

    _must(DOCKERFILE, "USER aerodeck", "Dockerfile")
    _must(DOCKERFILE, "packages/iac-engine/stacks/tenant", "Dockerfile")
    _must(DOCKERFILE, "packages/iac-engine/backend.hcl", "Dockerfile")
    if "packages/iac-engine /opt" in DOCKERFILE:
        raise SystemExit("copy only stacks/tenant plus backend.hcl, not the platform root module")
    _must(DOCKERFILE, "terraform", "Dockerfile")
    _must(WORKFLOW, "--file apps/control-plane/Dockerfile", "control-plane-image.yml")
    _must(DASHBOARD_WORKFLOW, "--file apps/dashboard/Dockerfile", "dashboard-image.yml")

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

    print("control-plane and dashboard image workflows, Dockerfiles, and Terraform reference look right")


if __name__ == "__main__":
    main()
