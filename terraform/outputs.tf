output "public_ip" {
  description = "Public IP of the GCE instance"
  value       = google_compute_instance.md_vault.network_interface[0].access_config[0].nat_ip
}

output "instance_name" {
  description = "GCE instance name"
  value       = google_compute_instance.md_vault.name
}

output "ssh_command" {
  description = "SSH command to connect"
  value       = "ssh -i ~/.ssh/md-vault mdvault@${google_compute_instance.md_vault.network_interface[0].access_config[0].nat_ip}"
}

output "tunnel_id" {
  description = "Cloudflare tunnel ID"
  value       = cloudflare_tunnel.md_vault.id
}

output "tunnel_token" {
  description = "Cloudflare tunnel token for K8s secret"
  value       = cloudflare_tunnel.md_vault.tunnel_token
  sensitive   = true
}
