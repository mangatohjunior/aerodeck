# Root-module outputs. Keep descriptions; consumers (CI, later stacks) depend on these names.

output "project_id" {
  description = "ID of the DigitalOcean project for this environment."
  value       = digitalocean_project.platform.id
}

output "vpc_id" {
  description = "ID of the environment VPC."
  value       = digitalocean_vpc.platform.id
}

output "vpc_ip_range" {
  description = "CIDR range of the environment VPC."
  value       = digitalocean_vpc.platform.ip_range
}

output "state_key" {
  description = "Remote-state object key this environment should use: <env>/platform/terraform.tfstate."
  value       = "${var.environment}/platform/terraform.tfstate"
}
