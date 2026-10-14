# Root-module outputs. Later stacks attach to these IDs; do not rename them.

output "project_id" {
  description = "DigitalOcean project ID for this environment. Attach later resources with digitalocean_project_resources."
  value       = module.network.project_id
}

output "project_name" {
  description = "DigitalOcean project name (aerodeck-<environment>)."
  value       = module.network.project_name
}

output "vpc_id" {
  description = "VPC UUID. Set vpc_uuid on every Droplet, database cluster, and Kubernetes cluster. Never use the default VPC."
  value       = module.network.vpc_id
}

output "vpc_urn" {
  description = "VPC URN. DigitalOcean Projects cannot own a VPC; attach later Droplets and clusters with project_id."
  value       = module.network.vpc_urn
}

output "vpc_ip_range" {
  description = "CIDR of the environment VPC."
  value       = module.network.vpc_ip_range
}

output "region" {
  description = "Region the VPC was created in."
  value       = module.network.region
}

output "state_key" {
  description = "Remote-state object key this environment should use: <env>/platform/terraform.tfstate."
  value       = "${var.environment}/platform/terraform.tfstate"
}
