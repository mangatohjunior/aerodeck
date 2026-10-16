"""Tenant stack is a separate root module with its own state; no platform compute."""

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
STACK = ROOT / "stacks" / "tenant"
MAIN = (STACK / "main.tf").read_text(encoding="utf-8")
VARS = (STACK / "variables.tf").read_text(encoding="utf-8")
CHILD = "\n".join(p.read_text(encoding="utf-8") for p in sorted(STACK.glob("*.tf")))


def _must(text: str, needle: str, where: str) -> None:
    if needle not in text:
        raise SystemExit(f"{where} must contain {needle!r}")


def main() -> None:
    _must(MAIN, 'backend "s3" {}', "stacks/tenant/main.tf")
    _must(MAIN, 'source  = "digitalocean/digitalocean"', "stacks/tenant/main.tf")
    _must(MAIN, 'resource "digitalocean_project" "tenant"', "stacks/tenant/main.tf")
    _must(VARS, "project_id", "stacks/tenant/variables.tf")
    _must(VARS, "environment_id", "stacks/tenant/variables.tf")
    if 'resource "digitalocean_droplet"' in CHILD:
        raise SystemExit("tenant stack must not create Droplets (platform stack owns those)")
    if 'resource "digitalocean_database_cluster"' in CHILD:
        raise SystemExit("tenant stack must not create database clusters")
    if 'resource "digitalocean_vpc"' in CHILD:
        raise SystemExit("tenant stack must not create VPCs")
    if "hashicorp/aws" in CHILD or re.search(r"\baws_", CHILD):
        raise SystemExit("tenant stack must not use AWS")
    if re.search(r'(?m)^provider\s+"', (STACK / "variables.tf").read_text(encoding="utf-8")):
        raise SystemExit("variables.tf must not declare a provider")
    if "-auto-approve" in CHILD:
        raise SystemExit("tenant stack must not mention -auto-approve")
    print("tenant stack shape looks right")


if __name__ == "__main__":
    main()
