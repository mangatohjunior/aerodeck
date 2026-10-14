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
