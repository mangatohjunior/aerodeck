variable "do_token" {
  description = "DigitalOcean API token. Supply via TF_VAR_do_token; never commit."
  type        = string
  sensitive   = true

  validation {
    condition     = length(var.do_token) > 0
    error_message = "do_token must not be empty."
  }
}

variable "project_id" {
  description = "Control-plane project UUID. Used in the state key and resource name."
  type        = string

  validation {
    condition     = can(regex("^[0-9a-f-]{36}$", var.project_id))
    error_message = "project_id must be a UUID."
  }
}

variable "environment_id" {
  description = "Control-plane environment UUID. Used in the state key and resource name."
  type        = string

  validation {
    condition     = can(regex("^[0-9a-f-]{36}$", var.environment_id))
    error_message = "environment_id must be a UUID."
  }
}

variable "project_slug" {
  description = "Project slug for the DigitalOcean project description."
  type        = string
}

variable "environment_slug" {
  description = "Environment slug for the DigitalOcean project description."
  type        = string
}

variable "kind" {
  description = "Environment kind. Matches packages/iac-engine environment values."
  type        = string

  validation {
    condition     = contains(["dev", "staging", "prod"], var.kind)
    error_message = "kind must be dev, staging, or prod."
  }
}

variable "region" {
  description = "DigitalOcean region slug recorded on the project (stacks do not create regional compute here)."
  type        = string
}
