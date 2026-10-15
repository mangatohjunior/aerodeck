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

output "droplet_id" {
  description = "Control-plane Droplet ID."
  value       = module.runtime.droplet_id
}

output "droplet_name" {
  description = "Control-plane Droplet name (aerodeck-<environment>-control)."
  value       = module.runtime.droplet_name
}

output "droplet_ipv4" {
  description = "Public IPv4 of the control-plane Droplet."
  value       = module.runtime.droplet_ipv4
}

output "droplet_private_ipv4" {
  description = "Private IPv4 of the control-plane Droplet on the environment VPC."
  value       = module.runtime.droplet_private_ipv4
}

output "postgres_id" {
  description = "Managed PostgreSQL cluster ID."
  value       = module.runtime.postgres_id
}

output "postgres_private_host" {
  description = "Private PostgreSQL hostname. Use with AERODECK_DATABASE_URL; do not use the public host."
  value       = module.runtime.postgres_private_host
}

output "postgres_private_uri" {
  description = "Private PostgreSQL URI. Rewrite the scheme to postgresql+asyncpg for AERODECK_DATABASE_URL."
  value       = module.runtime.postgres_private_uri
  sensitive   = true
}

output "redis_id" {
  description = "Managed Redis cluster ID."
  value       = module.runtime.redis_id
}

output "redis_private_host" {
  description = "Private Redis hostname. Use with AERODECK_REDIS_URL; do not use the public host."
  value       = module.runtime.redis_private_host
}

output "redis_private_uri" {
  description = "Private Redis URI for AERODECK_REDIS_URL."
  value       = module.runtime.redis_private_uri
  sensitive   = true
}

output "control_plane_image" {
  description = "OCI image reference written to the Droplet (/etc/aerodeck/control-plane-image). Pin a SHA tag in tfvars to freeze a build."
  value       = var.control_plane_image
}
