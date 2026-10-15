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
  description = "Managed Redis cluster ID."
  value       = digitalocean_database_cluster.redis.id
}

output "redis_urn" {
  description = "Managed Redis cluster URN (project member)."
  value       = digitalocean_database_cluster.redis.urn
}

output "redis_private_host" {
  description = "Private hostname for Redis. Use this, not the public host."
  value       = digitalocean_database_cluster.redis.private_host
}

output "redis_private_uri" {
  description = "Private Redis URI (password included). Map to AERODECK_REDIS_URL."
  value       = digitalocean_database_cluster.redis.private_uri
  sensitive   = true
}
