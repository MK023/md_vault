variable "gcp_project" {
  description = "Google Cloud project ID"
  type        = string
  default     = "mdvault"
}

variable "gcp_region" {
  description = "GCP region"
  type        = string
  default     = "europe-west8"
}

variable "gcp_zone" {
  description = "GCP zone"
  type        = string
  default     = "europe-west8-a"
}

variable "machine_type" {
  description = "GCE machine type"
  type        = string
  default     = "e2-small"
}

variable "domain" {
  description = "Domain name for the vault"
  type        = string
  default     = "mdvault.site"
}

variable "cloudflare_api_token" {
  description = "Cloudflare API token"
  type        = string
  sensitive   = true
}

variable "cloudflare_account_id" {
  description = "Cloudflare account ID"
  type        = string
}

variable "cloudflare_zone_id" {
  description = "Cloudflare zone ID"
  type        = string
}

variable "ssh_public_key" {
  description = "SSH public key for VM access"
  type        = string
}

variable "ssh_allowed_ip" {
  description = "IP address allowed to SSH (CIDR notation, e.g. 1.2.3.4/32)"
  type        = string

  validation {
    condition     = can(cidrhost(var.ssh_allowed_ip, 0))
    error_message = "ssh_allowed_ip must be a valid CIDR block (e.g. 1.2.3.4/32)."
  }
}
