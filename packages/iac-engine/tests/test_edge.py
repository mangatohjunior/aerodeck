"""Traefik lives in modules/edge: public 80/443, VPC to control :8000, no AWS."""

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MAIN = (ROOT / "main.tf").read_text(encoding="utf-8")
MODULE_DIR = ROOT / "modules" / "edge"
MODULE = (MODULE_DIR / "main.tf").read_text(encoding="utf-8")
CLOUD = (MODULE_DIR / "cloud-init.yaml").read_text(encoding="utf-8")
MODULE_OUTPUTS = (MODULE_DIR / "outputs.tf").read_text(encoding="utf-8")
VERSIONS = (MODULE_DIR / "versions.tf").read_text(encoding="utf-8")
OUTPUTS = (ROOT / "outputs.tf").read_text(encoding="utf-8")
VARS = (ROOT / "variables.tf").read_text(encoding="utf-8")
CHILD = "\n".join(p.read_text(encoding="utf-8") for p in sorted(MODULE_DIR.glob("*.tf")))


def _must(text: str, needle: str, where: str) -> None:
    if needle not in text:
        raise SystemExit(f"{where} must contain {needle!r}")


def main() -> None:
    _must(MAIN, 'module "edge"', "main.tf")
    _must(MAIN, 'source = "./modules/edge"', "main.tf")
    _must(MAIN, "module.runtime.droplet_private_ipv4", "main.tf")
    if 'resource "digitalocean_droplet" "edge"' in MAIN:
        raise SystemExit("edge Droplet must live in modules/edge, not the root module")

    _must(MODULE, 'resource "digitalocean_droplet" "edge"', "modules/edge/main.tf")
    _must(MODULE, "vpc_uuid = var.vpc_id", "modules/edge/main.tf")
    _must(MODULE, 'resource "digitalocean_firewall" "edge"', "modules/edge/main.tf")
    _must(MODULE, 'port_range       = "80"', "modules/edge/main.tf")
    _must(MODULE, 'port_range       = "443"', "modules/edge/main.tf")
    _must(MODULE, 'resource "digitalocean_record" "edge"', "modules/edge/main.tf")
    _must(MODULE, 'resource "digitalocean_project_resources" "edge"', "modules/edge/main.tf")
    _must(MODULE, "digitalocean_droplet.edge.urn", "modules/edge/main.tf")
    _must(MODULE, "ignore_changes = [ssh_keys]", "modules/edge/main.tf")
    _must(MODULE, 'resource "random_password" "traefik_provider_token"', "modules/edge/main.tf")

    droplet_block = MODULE.split('resource "digitalocean_droplet"')[1].split("resource ")[0]
    if "prevent_destroy" in droplet_block:
        raise SystemExit("the edge Droplet is not a stateful store; do not prevent_destroy it")
    if 'port_range       = "8000"' in MODULE:
        raise SystemExit("edge firewall must not expose control-plane :8000")

    _must(CLOUD, "/api/v1/edge/traefik", "cloud-init.yaml")
    _must(CLOUD, "--network host", "cloud-init.yaml")
    if "latest" in CLOUD.lower() and "traefik:latest" in CLOUD:
        raise SystemExit("do not pull traefik:latest")

    if "hashicorp/aws" in CHILD or re.search(r"\baws_", CHILD):
        raise SystemExit("edge module must not use AWS resources")
    if re.search(r"provisioner\s+\"", CHILD):
        raise SystemExit("edge module must not use provisioners")
    _must(VERSIONS, 'source  = "digitalocean/digitalocean"', "modules/edge/versions.tf")
    if re.search(r'(?m)^provider\s+"', CHILD) or re.search(r'(?m)^backend\s+"', CHILD):
        raise SystemExit("child modules must not declare provider or backend blocks")

    for output in ("edge_id", "edge_ipv4", "edge_private_ipv4", "traefik_provider_token"):
        _must(OUTPUTS, f'output "{output}"', "outputs.tf")
        _must(OUTPUTS, f"module.edge.{output}", "outputs.tf")

    _must(MODULE_OUTPUTS, "digitalocean_droplet.edge.ipv4_address", "modules/edge/outputs.tf")
    _must(VARS, "dns_zone", "variables.tf")
    _must(VARS, "traefik_image", "variables.tf")
    _must(VARS, "aero-deck.app", "variables.tf")
    print("edge module shape looks right")


if __name__ == "__main__":
    main()
