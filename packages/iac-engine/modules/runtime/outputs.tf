output "droplet_id" {
  description = "Control-plane Droplet ID."
  value       = digitalocean_droplet.control.id
}

output "droplet_name" {
  description = "Control-plane Droplet name (aerodeck-<environment>-control)."
  value       = digitalocean_droplet.control.name
}

output "droplet_urn" {
  description = "Control-plane Droplet URN (project member)."
  value       = digitalocean_droplet.control.urn
}

output "droplet_ipv4" {
  description = "Public IPv4 of the control-plane Droplet. SSH only if ssh_allow_cidrs is set."
  value       = digitalocean_droplet.control.ipv4_address
}

output "droplet_private_ipv4" {
  description = "Private IPv4 of the control-plane Droplet on the environment VPC."
  value       = digitalocean_droplet.control.ipv4_address_private
}

output "postgres_id" {
  description = "Managed PostgreSQL cluster ID."
  value       = digitalocean_database_cluster.postgres.id
}

output "postgres_urn" {
  description = "Managed PostgreSQL cluster URN (project member)."
  value       = digitalocean_database_cluster.postgres.urn
}

output "postgres_private_host" {
  description = "Private hostname for PostgreSQL. Use this, not the public host."
  value       = digitalocean_database_cluster.postgres.private_host
}

output "postgres_private_uri" {
  description = "Private PostgreSQL URI (password included). Map to AERODECK_DATABASE_URL after rewriting the scheme to postgresql+asyncpg."
  value       = digitalocean_database_cluster.postgres.private_uri
  sensitive   = true
}

output "redis_id" {
  description = "Managed Valkey cluster ID, or null when Redis runs in Docker on the Droplet."
  value       = var.managed_cache_enabled ? digitalocean_database_cluster.redis[0].id : null
}

output "redis_urn" {
  description = "Managed Valkey cluster URN, or empty when Redis runs in Docker on the Droplet."
  value       = var.managed_cache_enabled ? digitalocean_database_cluster.redis[0].urn : ""
}

output "redis_private_host" {
  description = "Private hostname for Redis, or 127.0.0.1 when it runs in Docker on the Droplet."
  value       = var.managed_cache_enabled ? digitalocean_database_cluster.redis[0].private_host : "127.0.0.1"
}

output "redis_private_uri" {
  description = "Redis URI for AERODECK_REDIS_URL. Local Docker when managed_cache_enabled is false."
  value       = var.managed_cache_enabled ? digitalocean_database_cluster.redis[0].private_uri : "redis://127.0.0.1:6379/0"
  sensitive   = true
}
