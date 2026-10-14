# AeroDeck IaC Engine — root module.
#
# DigitalOcean is the ONLY cloud provider permitted in this repository
# (see .cursor/rules/terraform-digitalocean.mdc). State is stored in a
# DigitalOcean Spaces bucket via Terraform's built-in S3-compatible backend.
#
# Initialise (CI does this; do not run from a laptop against shared state).
# Full procedure: docs/runbooks/terraform-state.md
#   terraform init -backend-config=backend.hcl -backend-config="key=${ENV}/platform/terraform.tfstate"
#   terraform plan -var-file=envs/${ENV}.tfvars

terraform {
  required_version = ">= 1.6.0, < 2.0.0"

  required_providers {
    digitalocean = {
      source  = "digitalocean/digitalocean"
      version = ">= 2.100.0, < 3.0.0"
    }
  }

  # Partial backend. Non-secret values live in backend.hcl; the state key is
  # supplied at init as <environment>/platform/terraform.tfstate. Credentials
  # are AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY (Spaces access keys in CI).
  backend "s3" {}
}

# --------------------------------------------------------------------------- #
# Provider
# --------------------------------------------------------------------------- #

provider "digitalocean" {
  token = var.do_token

  # Only needed when this stack manages Spaces buckets/objects. Left null
  # otherwise so no AWS-style credentials are required by the provider.
  spaces_access_id  = var.spaces_access_id
  spaces_secret_key = var.spaces_secret_key
}

# --------------------------------------------------------------------------- #
# Naming & tagging conventions
# --------------------------------------------------------------------------- #

locals {
  name_prefix = "aerodeck-${var.environment}"

  # DigitalOcean tags are plain strings; we use a key:value convention.
  common_tags = concat([
    "aerodeck",
    "env:${var.environment}",
    "managed-by:terraform",
    "stack:platform",
  ], var.extra_tags)
}

# --------------------------------------------------------------------------- #
# Foundational resources — one project and one private VPC per environment
# --------------------------------------------------------------------------- #

module "network" {
  source = "./modules/network"

  name_prefix            = local.name_prefix
  do_project_environment = var.do_project_environment
  region                 = var.region
  vpc_ip_range           = var.vpc_ip_range
}
