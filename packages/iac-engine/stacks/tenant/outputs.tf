output "project_id" {
  description = "DigitalOcean project UUID for this tenant environment."
  value       = digitalocean_project.tenant.id
}

output "project_name" {
  description = "DigitalOcean project name."
  value       = digitalocean_project.tenant.name
}
