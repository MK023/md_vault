output "public_ip" {
  description = "Public IP of the EC2 instance"
  value       = aws_instance.md_vault.public_ip
}

output "instance_id" {
  description = "EC2 instance ID"
  value       = aws_instance.md_vault.id
}

output "ssh_command" {
  description = "SSH command to connect"
  value       = "ssh -i ~/.ssh/md-vault ubuntu@${aws_instance.md_vault.public_ip}"
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
