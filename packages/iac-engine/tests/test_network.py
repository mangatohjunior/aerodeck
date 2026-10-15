"""The platform stack must declare one project and one private VPC per environment."""

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MAIN = (ROOT / "main.tf").read_text(encoding="utf-8")
MODULE_DIR = ROOT / "modules" / "network"
MODULE = (MODULE_DIR / "main.tf").read_text(encoding="utf-8")
MODULE_OUTPUTS = (MODULE_DIR / "outputs.tf").read_text(encoding="utf-8")
VERSIONS = (MODULE_DIR / "versions.tf").read_text(encoding="utf-8")
OUTPUTS = (ROOT / "outputs.tf").read_text(encoding="utf-8")
VARS = (ROOT / "variables.tf").read_text(encoding="utf-8")
# Concatenate child-module HCL so provider/backend checks cover every file.
CHILD = "\n".join(p.read_text(encoding="utf-8") for p in sorted(MODULE_DIR.glob("*.tf")))


def _must(text: str, needle: str, where: str) -> None:
    if needle not in text:
        raise SystemExit(f"{where} must contain {needle!r}")


def main() -> None:
    _must(MAIN, 'module "network"', "main.tf")
    _must(MAIN, 'source = "./modules/network"', "main.tf")
    if 'resource "digitalocean_vpc"' in MAIN:
        raise SystemExit("VPC must live in modules/network, not the root module")
    if 'resource "digitalocean_project"' in MAIN:
        raise SystemExit("project must live in modules/network, not the root module")

    _must(MODULE, 'resource "digitalocean_project" "platform"', "modules/network/main.tf")
    _must(MODULE, 'resource "digitalocean_vpc" "platform"', "modules/network/main.tf")
    if not re.search(r"is_default\s*=\s*false", MODULE):
        raise SystemExit("project must set is_default = false")
    if 'resource "digitalocean_project_resources"' in CHILD:
        raise SystemExit(
            "DigitalOcean Projects cannot own a VPC; do not assign the VPC with project_resources"
        )
    _must(MODULE_OUTPUTS, "digitalocean_vpc.platform.urn", "modules/network/outputs.tf")
    _must(VERSIONS, 'source  = "digitalocean/digitalocean"', "modules/network/versions.tf")
    # Child modules inherit the provider from the root. required_providers is
    # allowed (and required) so Terraform does not assume hashicorp/digitalocean.
    if re.search(r'(?m)^provider\s+"', CHILD) or re.search(r'(?m)^backend\s+"', CHILD):
        raise SystemExit("child modules must not declare provider or backend blocks")

    for output in ("project_id", "vpc_id", "vpc_ip_range", "vpc_urn", "region"):
        _must(OUTPUTS, f'output "{output}"', "outputs.tf")
        _must(OUTPUTS, f"module.network.{output}", "outputs.tf")

    _must(VARS, "RFC1918", "variables.tf")
    _must(VARS, 'split(".", var.vpc_ip_range)[0] == "10"', "variables.tf")

    cidrs: dict[str, str] = {}
    for env in ("dev", "staging", "prod"):
        tfvars = (ROOT / "envs" / f"{env}.tfvars").read_text(encoding="utf-8")
        match = re.search(r'vpc_ip_range\s*=\s*"([^"]+)"', tfvars)
        if not match:
            raise SystemExit(f"envs/{env}.tfvars must set vpc_ip_range")
        cidrs[env] = match.group(1)
        if not cidrs[env].startswith("10."):
            raise SystemExit(f"envs/{env}.tfvars vpc_ip_range must be RFC1918 10.x")
        if 'region                 = "ams3"' not in tfvars:
            raise SystemExit(f"envs/{env}.tfvars must set region to ams3")
    if len(set(cidrs.values())) != 3:
        raise SystemExit(f"environment VPC CIDRs must not overlap: {cidrs}")

    print("network module, outputs, and env CIDRs look right")


if __name__ == "__main__":
    main()
