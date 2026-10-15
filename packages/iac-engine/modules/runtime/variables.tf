variable "name_prefix" {
  description = "Resource name prefix, aerodeck-<environment>."
  type        = string
}

variable "region" {
  description = "DigitalOcean region slug. Must match the environment VPC."
  type        = string
}

variable "tags" {
  description = "DigitalOcean tags applied to the Droplet and database clusters."
  type        = list(string)
}

variable "vpc_id" {
  description = "Environment VPC UUID. Droplet vpc_uuid and database private_network_uuid."
  type        = string
}

variable "vpc_ip_range" {
  description = "RFC1918 CIDR of the environment VPC. Used as the default SSH and API source."
  type        = string
}

variable "project_id" {
  description = "DigitalOcean project ID. Droplet and databases attach with digitalocean_project_resources."
  type        = string
}

variable "droplet_size" {
  description = "Droplet size slug for the control-plane host (e.g. s-1vcpu-2gb-amd)."
  type        = string
}

variable "droplet_image" {
  description = "Droplet image slug. Ubuntu LTS; the stack does not pull or start the control-plane container."
  type        = string
}

variable "control_plane_image" {
  description = "OCI image reference written to /etc/aerodeck/control-plane-image (DigitalOcean Container Registry, :main or :<git sha>)."
  type        = string
}

variable "managed_cache_enabled" {
  description = "When true, create managed Valkey. When false, cloud-init runs Redis in Docker on the Droplet (one DBaaS cluster = Postgres only)."
  type        = bool
}

variable "postgres_size" {
  description = "Managed PostgreSQL size slug (e.g. db-s-1vcpu-1gb)."
  type        = string
}

variable "postgres_version" {
  description = "Managed PostgreSQL major version."
  type        = string
}

variable "postgres_node_count" {
  description = "PostgreSQL node count. 1 is a single primary; 2+ is DigitalOcean HA."
  type        = number

  validation {
    condition     = var.postgres_node_count >= 1 && var.postgres_node_count <= 3
    error_message = "postgres_node_count must be between 1 and 3."
  }
}

variable "redis_size" {
  description = "Managed Redis size slug (e.g. db-s-1vcpu-1gb)."
  type        = string
}

variable "redis_version" {
  description = "Managed Valkey (Redis-compatible) major version."
  type        = string
}

variable "redis_node_count" {
  description = "Redis node count. 1 is a single node."
  type        = number

  validation {
    condition     = var.redis_node_count >= 1 && var.redis_node_count <= 3
    error_message = "redis_node_count must be between 1 and 3."
  }
}

variable "ssh_key_ids" {
  description = "DigitalOcean SSH key IDs or fingerprints injected on the Droplet. Empty means console-only access."
  type        = list(string)
  default     = []
}

variable "ssh_allow_cidrs" {
  description = "CIDRs allowed to SSH to the Droplet. Empty means the environment VPC CIDR only."
  type        = list(string)
  default     = []

  validation {
    condition     = alltrue([for c in var.ssh_allow_cidrs : can(cidrnetmask(c))])
    error_message = "Each ssh_allow_cidrs entry must be an IPv4 CIDR block."
  }
}
