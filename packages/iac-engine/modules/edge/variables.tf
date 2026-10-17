variable "name_prefix" {
  description = "Resource name prefix, aerodeck-<environment>."
  type        = string
}

variable "region" {
  description = "DigitalOcean region slug. Must match the environment VPC."
  type        = string
}

variable "tags" {
  description = "DigitalOcean tags applied to the edge Droplet."
  type        = list(string)
}

variable "vpc_id" {
  description = "Environment VPC UUID. Edge Droplet vpc_uuid."
  type        = string
}

variable "vpc_ip_range" {
  description = "RFC1918 CIDR of the environment VPC. Default SSH source when ssh_allow_cidrs is empty."
  type        = string
}

variable "project_id" {
  description = "DigitalOcean project ID. Edge Droplet attaches with digitalocean_project_resources."
  type        = string
}

variable "droplet_size" {
  description = "Droplet size slug for the Traefik host (same Regular Basic as control)."
  type        = string
}

variable "droplet_image" {
  description = "Droplet image slug. Ubuntu LTS; cloud-init installs Docker and Traefik."
  type        = string
}

variable "ssh_key_ids" {
  description = "DigitalOcean SSH key IDs or fingerprints at Droplet create time only. Ignored after create."
  type        = list(string)
  default     = []
}

variable "ssh_allow_cidrs" {
  description = "CIDRs allowed to SSH to the edge Droplet. Empty means the environment VPC CIDR only."
  type        = list(string)
  default     = []

  validation {
    condition     = alltrue([for c in var.ssh_allow_cidrs : can(cidrnetmask(c))])
    error_message = "Each ssh_allow_cidrs entry must be an IPv4 CIDR block."
  }
}

variable "control_plane_private_ipv4" {
  description = "Private IPv4 of aerodeck-<env>-control. Traefik polls http://this:8000/api/v1/edge/traefik."
  type        = string
}

variable "traefik_image" {
  description = "Pinned Traefik OCI image. Never latest."
  type        = string
}

variable "dns_zone" {
  description = "DigitalOcean Domain name that already exists (aero-deck.app). Used for the edge A record."
  type        = string
}
