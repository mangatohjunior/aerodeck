variable "name_prefix" {
  description = "Resource name prefix, aerodeck-<environment>."
  type        = string
}

variable "do_project_environment" {
  description = "DigitalOcean Project environment label: Development, Staging, or Production."
  type        = string

  validation {
    condition     = contains(["Development", "Staging", "Production"], var.do_project_environment)
    error_message = "do_project_environment must be one of: Development, Staging, Production."
  }
}

variable "region" {
  description = "DigitalOcean region slug for the VPC."
  type        = string
}

variable "vpc_ip_range" {
  description = "RFC1918 CIDR for the environment VPC, prefix length /16–/24."
  type        = string
}
