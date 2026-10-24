# One DigitalOcean Project and one private VPC per environment.
# Child modules must not declare provider or backend blocks. They MAY declare
# required_providers so the source is digitalocean/digitalocean (not hashicorp/).
#
# DigitalOcean projects and VPCs are not taggable. local.common_tags at the
# root applies to later Droplets, databases, and clusters.
# DigitalOcean Projects cannot own a VPC (supported types: Droplet, database,
# Kubernetes, load balancer, volume, Space, domain, floating IP, App Platform).
# Later stacks attach those with digitalocean_project_resources using project_id.
#
# Every later Droplet, database, and Kubernetes cluster MUST set
# vpc_uuid = module.network.vpc_id (never the region's default VPC).

resource "digitalocean_project" "platform" {
  name        = var.name_prefix
  description = "${var.name_prefix} platform resources (managed by Terraform)"
  purpose     = "Web Application"
  environment = var.do_project_environment
  is_default  = false
}

resource "digitalocean_vpc" "platform" {
  # Region is in the name: VPC names are unique per account, not per region.
  # Suffix is "-private" (not "-vpc"): a prior stack VPC that became the region
  # default cannot be deleted and may still hold aerodeck-<env>-<region>-vpc.
  name        = "${var.name_prefix}-${var.region}-private"
  region      = var.region
  ip_range    = var.vpc_ip_range
  description = "${var.name_prefix} private network in ${var.region}. Workloads must use this VPC, never the default."
}
