output "edge_id" {
  description = "Traefik Droplet ID."
  value       = digitalocean_droplet.edge.id
}

output "edge_name" {
  description = "Traefik Droplet name (aerodeck-<environment>-edge)."
  value       = digitalocean_droplet.edge.name
}

output "edge_urn" {
  description = "Traefik Droplet URN (project member)."
  value       = digitalocean_droplet.edge.urn
}

output "edge_ipv4" {
  description = "Public IPv4 of the Traefik Droplet. Point edge.<zone> here."
  value       = digitalocean_droplet.edge.ipv4_address
}

output "edge_private_ipv4" {
  description = "Private IPv4 of the Traefik Droplet on the environment VPC."
  value       = digitalocean_droplet.edge.ipv4_address_private
}

output "traefik_provider_token" {
  description = "Bearer Traefik sends to GET /api/v1/edge/traefik. Set the same value on the control plane as AERODECK_TRAEFIK_PROVIDER_TOKEN."
  value       = random_password.traefik_provider_token.result
  sensitive   = true
}
