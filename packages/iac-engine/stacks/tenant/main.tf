# Tenant environment stack. Applied by the control-plane worker (#34), never
# from a laptop. State key is tenants/<project_id>/<environment_id>/terraform.tfstate
# — never <env>/platform/. This stack must not create Droplets, databases, or
# VPCs (those belong to the platform root module).

terraform {
  required_version = ">= 1.6.0, < 2.0.0"

  required_providers {
    digitalocean = {
      source  = "digitalocean/digitalocean"
      version = ">= 2.100.0, < 3.0.0"
    }
  }

  backend "s3" {}
}

provider "digitalocean" {
  token = var.do_token
}

locals {
  name = "aerodeck-t-${substr(var.project_id, 0, 8)}-${substr(var.environment_id, 0, 8)}"

  do_environment = {
    dev     = "Development"
    staging = "Staging"
    prod    = "Production"
  }[var.kind]
}

resource "digitalocean_project" "tenant" {
  name        = local.name
  description = "AeroDeck tenant ${var.project_slug}/${var.environment_slug} (${var.environment_id}) in ${var.region}"
  purpose     = "Web Application"
  environment = local.do_environment
  is_default  = false
}
