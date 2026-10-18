"""Platform apply must create compute, Postgres, and Redis in the environment VPC."""

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MAIN = (ROOT / "main.tf").read_text(encoding="utf-8")
MODULE_DIR = ROOT / "modules" / "runtime"
MODULE = (MODULE_DIR / "main.tf").read_text(encoding="utf-8")
MODULE_OUTPUTS = (MODULE_DIR / "outputs.tf").read_text(encoding="utf-8")
VERSIONS = (MODULE_DIR / "versions.tf").read_text(encoding="utf-8")
OUTPUTS = (ROOT / "outputs.tf").read_text(encoding="utf-8")
VARS = (ROOT / "variables.tf").read_text(encoding="utf-8")
CHILD = "\n".join(p.read_text(encoding="utf-8") for p in sorted(MODULE_DIR.glob("*.tf")))


def _must(text: str, needle: str, where: str) -> None:
    if needle not in text:
        raise SystemExit(f"{where} must contain {needle!r}")


def main() -> None:
    _must(MAIN, 'module "runtime"', "main.tf")
    _must(MAIN, 'source = "./modules/runtime"', "main.tf")
    _must(MAIN, "module.network.vpc_id", "main.tf")
    _must(MAIN, "module.network.project_id", "main.tf")
    if 'resource "digitalocean_droplet"' in MAIN:
        raise SystemExit("Droplet must live in modules/runtime, not the root module")
    if 'resource "digitalocean_database_cluster"' in MAIN:
        raise SystemExit("database clusters must live in modules/runtime, not the root module")

    _must(MODULE, 'resource "digitalocean_droplet" "control"', "modules/runtime/main.tf")
    _must(MODULE, "vpc_uuid = var.vpc_id", "modules/runtime/main.tf")
    _must(MODULE, 'resource "digitalocean_database_cluster" "postgres"', "modules/runtime/main.tf")
    _must(MODULE, 'resource "digitalocean_database_cluster" "redis"', "modules/runtime/main.tf")
    _must(MODULE, 'engine               = "valkey"', "modules/runtime/main.tf")
    _must(MODULE, "private_network_uuid = var.vpc_id", "modules/runtime/main.tf")
    _must(MODULE, 'resource "digitalocean_database_firewall" "postgres"', "modules/runtime/main.tf")
    _must(MODULE, 'resource "digitalocean_database_firewall" "redis"', "modules/runtime/main.tf")
    _must(MODULE, 'resource "digitalocean_project_resources" "runtime"', "modules/runtime/main.tf")
    _must(MODULE, "digitalocean_droplet.control.urn", "modules/runtime/main.tf")
    _must(MODULE, "digitalocean_database_cluster.postgres.urn", "modules/runtime/main.tf")
    _must(MODULE, "digitalocean_database_cluster.redis[0].urn", "modules/runtime/main.tf")
    _must(MODULE, "managed_cache_enabled", "modules/runtime/main.tf")
    _must(MODULE, 'port_range       = "3000"', "modules/runtime/main.tf")
    console_rule = MODULE[MODULE.index('port_range       = "3000"') :][:180]
    if "0.0.0.0/0" in console_rule or "::/0" in console_rule:
        raise SystemExit("console :3000 must stay VPC-only")
    if "var.vpc_ip_range" not in console_rule:
        raise SystemExit("console :3000 must allow the VPC range")

    if MODULE.count("prevent_destroy = true") < 2:
        raise SystemExit("postgres and redis clusters must set lifecycle prevent_destroy")
    droplet_block = MODULE.split('resource "digitalocean_droplet"')[1].split("resource ")[0]
    if "prevent_destroy" in droplet_block:
        raise SystemExit("the Droplet is not a stateful store; do not prevent_destroy it")
    if "ignore_changes = [ssh_keys]" not in droplet_block:
        raise SystemExit("Droplet must ignore_changes ssh_keys so a live box is not replaced")

    if "hashicorp/aws" in CHILD or re.search(r'\baws_', CHILD):
        raise SystemExit("runtime module must not use AWS resources")
    if re.search(r"provisioner\s+\"", CHILD):
        raise SystemExit("runtime module must not use provisioners")
    _must(VERSIONS, 'source  = "digitalocean/digitalocean"', "modules/runtime/versions.tf")
    if re.search(r'(?m)^provider\s+"', CHILD) or re.search(r'(?m)^backend\s+"', CHILD):
        raise SystemExit("child modules must not declare provider or backend blocks")

    for output in (
        "droplet_id",
        "droplet_private_ipv4",
        "postgres_id",
        "postgres_private_uri",
        "redis_id",
        "redis_private_uri",
    ):
        _must(OUTPUTS, f'output "{output}"', "outputs.tf")
        _must(OUTPUTS, f"module.runtime.{output}", "outputs.tf")

    _must(MODULE_OUTPUTS, "digitalocean_database_cluster.postgres.private_uri", "modules/runtime/outputs.tf")
    _must(VARS, "droplet_size", "variables.tf")
    _must(VARS, "postgres_size", "variables.tf")
    _must(VARS, "redis_size", "variables.tf")
    _must(VARS, "control_plane_image", "variables.tf")
    _must(VARS, "managed_cache_enabled", "variables.tf")
    _must(OUTPUTS, 'output "control_plane_image"', "outputs.tf")

    for env in ("dev", "staging", "prod"):
        tfvars = (ROOT / "envs" / f"{env}.tfvars").read_text(encoding="utf-8")
        for key in ("droplet_size", "postgres_size", "redis_size"):
            if not re.search(rf'{key}\s*=\s*"', tfvars):
                raise SystemExit(f"envs/{env}.tfvars must set {key}")
        if "managed_cache_enabled" not in tfvars:
            raise SystemExit(f"envs/{env}.tfvars must set managed_cache_enabled")
        if 'droplet_size           = "s-1vcpu-1gb"' not in tfvars:
            raise SystemExit(
                f"envs/{env}.tfvars must start at Regular s-1vcpu-1gb "
                "(ams3 still sells it; NYC does not; Premium is Tier-restricted)"
            )
        if 'region                 = "ams3"' not in tfvars:
            raise SystemExit(
                f"envs/{env}.tfvars must use ams3 "
                "(Regular Basic plus Intel growth path; Spaces stays in NYC)"
            )

    print("runtime module, VPC attachment, and env sizes look right")


if __name__ == "__main__":
    main()
