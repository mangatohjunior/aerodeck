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
# Foundational resources
# --------------------------------------------------------------------------- #

# One DigitalOcean Project per environment. All other resources created by this
# stack (and by downstream stacks) should attach to it via `project_id`.
resource "digitalocean_project" "platform" {
  name        = local.name_prefix
  description = "AeroDeck ${var.environment} platform resources (managed by Terraform)"
  purpose     = "Web Application"
  environment = var.do_project_environment
}

# Private network boundary for the environment. Every Droplet, database cluster
# and Kubernetes cluster MUST be placed in this VPC (never the default VPC).
resource "digitalocean_vpc" "platform" {
  name        = "${local.name_prefix}-vpc"
  region      = var.region
  ip_range    = var.vpc_ip_range
  description = "AeroDeck ${var.environment} VPC"
}

# Outputs live in outputs.tf.
