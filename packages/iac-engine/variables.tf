# AeroDeck IaC Engine — input variables.
#
# Secrets have no defaults and are marked sensitive; supply them via
# TF_VAR_* environment variables in CI. Non-secret values live in
# envs/<environment>.tfvars.

# --------------------------------------------------------------------------- #
# Credentials (sensitive, no defaults)
# --------------------------------------------------------------------------- #

variable "do_token" {
  description = "DigitalOcean API token with read/write scope. Supply via TF_VAR_do_token; never commit."
  type        = string
  sensitive   = true

  validation {
    condition     = length(var.do_token) > 0
    error_message = "do_token must not be empty."
  }
}

variable "spaces_access_id" {
  description = "DigitalOcean Spaces access key ID. Only required if this stack manages Spaces buckets/objects."
  type        = string
  sensitive   = true
  default     = null
}

variable "spaces_secret_key" {
  description = "DigitalOcean Spaces secret key. Only required if this stack manages Spaces buckets/objects."
  type        = string
  sensitive   = true
  default     = null
}

# --------------------------------------------------------------------------- #
# Environment & placement
# --------------------------------------------------------------------------- #

variable "environment" {
  description = "Deployment environment. Drives naming (aerodeck-<env>-*), tagging and the state key."
  type        = string

  validation {
    condition     = contains(["dev", "staging", "prod"], var.environment)
    error_message = "environment must be one of: dev, staging, prod."
  }
}

variable "do_project_environment" {
  description = "DigitalOcean Project 'environment' label. Must be one of DigitalOcean's accepted values."
  type        = string
  default     = "Development"

  validation {
    condition     = contains(["Development", "Staging", "Production"], var.do_project_environment)
    error_message = "do_project_environment must be one of: Development, Staging, Production."
  }
}

variable "region" {
  description = "DigitalOcean region slug where regional resources (VPC, Droplets, databases) are created."
  type        = string
  default     = "nyc3"

  validation {
    condition = contains([
      "nyc1", "nyc2", "nyc3",
      "ams3",
      "sfo2", "sfo3",
      "sgp1",
      "lon1",
      "fra1",
      "tor1",
      "blr1",
      "syd1",
      "atl1",
    ], var.region)
    error_message = "region must be a valid DigitalOcean region slug (e.g. nyc3, ams3, sfo3, lon1, fra1, sgp1, blr1, syd1, tor1, atl1)."
  }
}

variable "vpc_ip_range" {
  description = "CIDR block for the environment VPC. Must be RFC1918, /16–/24, unique per environment, and must not overlap other VPCs in the same DigitalOcean region."
  type        = string
  default     = "10.10.0.0/16"

  validation {
    condition     = can(cidrnetmask(var.vpc_ip_range))
    error_message = "vpc_ip_range must be a valid IPv4 CIDR block (e.g. 10.10.0.0/16)."
  }

  validation {
    condition = (
      tonumber(split("/", var.vpc_ip_range)[1]) >= 16 &&
      tonumber(split("/", var.vpc_ip_range)[1]) <= 24
    )
    error_message = "vpc_ip_range prefix length must be between /16 and /24 (DigitalOcean VPC limits)."
  }

  validation {
    condition = (
      cidrsubnet(var.vpc_ip_range, 0, 0) == var.vpc_ip_range &&
      (
        can(cidrhost(var.vpc_ip_range, 0)) &&
        (
          split(".", var.vpc_ip_range)[0] == "10" ||
          (split(".", var.vpc_ip_range)[0] == "192" && split(".", var.vpc_ip_range)[1] == "168") ||
          (
            split(".", var.vpc_ip_range)[0] == "172" &&
            tonumber(split(".", var.vpc_ip_range)[1]) >= 16 &&
            tonumber(split(".", var.vpc_ip_range)[1]) <= 31
          )
        )
      )
    )
    error_message = "vpc_ip_range must be RFC1918 (10.0.0.0/8, 172.16.0.0/12, or 192.168.0.0/16)."
  }
}

# --------------------------------------------------------------------------- #
# Tagging
# --------------------------------------------------------------------------- #

variable "extra_tags" {
  description = "Additional DigitalOcean tags (key:value strings) appended to local.common_tags on taggable resources."
  type        = list(string)
  default     = []

  validation {
    condition     = alltrue([for t in var.extra_tags : can(regex("^[A-Za-z0-9_:.-]{1,255}$", t))])
    error_message = "Each tag may only contain letters, digits, '_', ':', '.', '-' and must be 1–255 characters."
  }
}

# --------------------------------------------------------------------------- #
# Control-plane runtime (Droplet + managed Postgres + Redis)
# --------------------------------------------------------------------------- #

variable "droplet_size" {
  description = "Droplet size slug. New teams are Tier 1: Basic Shared CPU Regular only (no Premium -amd/-intel) up to $48. nyc3 no longer has Regular 1GB/2GB; use s-2vcpu-4gb until the account tier is raised."
  type        = string
  default     = "s-2vcpu-4gb"

  validation {
    condition     = can(regex("^s-[0-9]+vcpu-[0-9]+gb(-amd|-intel)?$", var.droplet_size))
    error_message = "droplet_size must be a DigitalOcean Droplet slug such as s-2vcpu-4gb."
  }
}

variable "droplet_image" {
  description = "Droplet image slug. Must be Ubuntu; this stack does not pull the control-plane container."
  type        = string
  default     = "ubuntu-24-04-x64"

  validation {
    condition     = startswith(var.droplet_image, "ubuntu-")
    error_message = "droplet_image must be an Ubuntu slug (ubuntu-*)."
  }
}

variable "control_plane_image" {
  description = "Control-plane OCI image (DigitalOcean Container Registry). CI publishes :<git sha> and a floating :main tag."
  type        = string
  default     = "registry.digitalocean.com/aerodeck/control-plane:main"

  validation {
    condition     = can(regex("^registry\\.digitalocean\\.com/[a-z0-9-]+/control-plane:[A-Za-z0-9._-]+$", var.control_plane_image))
    error_message = "control_plane_image must be registry.digitalocean.com/<registry>/control-plane:<tag> (no GHCR)."
  }
}

variable "postgres_size" {
  description = "Managed PostgreSQL size slug."
  type        = string
  default     = "db-s-1vcpu-1gb"

  validation {
    condition     = can(regex("^db-s-[0-9]+vcpu-[0-9]+gb$", var.postgres_size))
    error_message = "postgres_size must be a DigitalOcean database slug such as db-s-1vcpu-1gb."
  }
}

variable "postgres_version" {
  description = "Managed PostgreSQL major version."
  type        = string
  default     = "16"

  validation {
    condition     = contains(["14", "15", "16", "17"], var.postgres_version)
    error_message = "postgres_version must be a supported DigitalOcean PostgreSQL major version (14–17)."
  }
}

variable "postgres_node_count" {
  description = "PostgreSQL node count. 1 is a single primary."
  type        = number
  default     = 1

  validation {
    condition     = var.postgres_node_count >= 1 && var.postgres_node_count <= 3
    error_message = "postgres_node_count must be between 1 and 3."
  }
}

variable "redis_size" {
  description = "Managed Redis size slug."
  type        = string
  default     = "db-s-1vcpu-1gb"

  validation {
    condition     = can(regex("^db-s-[0-9]+vcpu-[0-9]+gb$", var.redis_size))
    error_message = "redis_size must be a DigitalOcean database slug such as db-s-1vcpu-1gb."
  }
}

variable "redis_version" {
  description = "Managed Valkey (Redis-compatible) major version."
  type        = string
  default     = "8"

  validation {
    condition     = contains(["8", "9"], var.redis_version)
    error_message = "redis_version must be a supported DigitalOcean Valkey major version (8 or 9)."
  }
}

variable "redis_node_count" {
  description = "Redis node count. 1 is a single node."
  type        = number
  default     = 1

  validation {
    condition     = var.redis_node_count >= 1 && var.redis_node_count <= 3
    error_message = "redis_node_count must be between 1 and 3."
  }
}

variable "managed_cache_enabled" {
  description = "When true, create a managed Valkey cluster. New DigitalOcean teams are often capped at one database cluster (Postgres already uses that slot); leave false so Redis runs in Docker on the Droplet."
  type        = bool
  default     = false
}

variable "ssh_key_ids" {
  description = "DigitalOcean SSH key IDs or fingerprints for the control-plane Droplet. Empty means console-only."
  type        = list(string)
  default     = []
}

variable "ssh_allow_cidrs" {
  description = "CIDRs allowed to SSH to the control-plane Droplet. Empty means the environment VPC only."
  type        = list(string)
  default     = []

  validation {
    condition     = alltrue([for c in var.ssh_allow_cidrs : can(cidrnetmask(c))])
    error_message = "Each ssh_allow_cidrs entry must be an IPv4 CIDR block."
  }
}
