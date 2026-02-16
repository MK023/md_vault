variable "aws_region" {
  description = "AWS region"
  type        = string
  default     = "eu-south-1"
}

variable "instance_type" {
  description = "EC2 instance type"
  type        = string
  default     = "t3.small"
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
  description = "Cloudflare account ID (different from zone ID)"
  type        = string
}

variable "cloudflare_zone_id" {
  description = "Cloudflare zone ID"
  type        = string
}

variable "ssh_public_key" {
  description = "SSH public key for EC2 access"
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
