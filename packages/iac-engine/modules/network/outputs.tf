output "project_id" {
  description = "DigitalOcean project ID. Attach later resources with digitalocean_project_resources."
  value       = digitalocean_project.platform.id
}

output "project_name" {
  description = "DigitalOcean project name (aerodeck-<environment>)."
  value       = digitalocean_project.platform.name
}

output "vpc_id" {
  description = "VPC UUID. Set vpc_uuid on Droplets, databases, and clusters."
  value       = digitalocean_vpc.platform.id
}

output "vpc_urn" {
  description = "VPC URN. DigitalOcean Projects cannot own a VPC; later Droplets and clusters attach via project_id."
  value       = digitalocean_vpc.platform.urn
}

output "vpc_ip_range" {
  description = "CIDR of the environment VPC."
  value       = digitalocean_vpc.platform.ip_range
}

output "region" {
  description = "Region the VPC was created in."
  value       = digitalocean_vpc.platform.region
}
