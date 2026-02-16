resource "aws_security_group" "md_vault" {
  name        = "md-vault-sg"
  description = "Security group for MD Vault EC2"
  vpc_id      = aws_vpc.main.id

  # SSH - restricted to your IP only
  ingress {
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = [var.ssh_allowed_ip]
    description = "SSH access"
  }

  # All outbound (needed for Cloudflare tunnel, apt, etc.)
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
    description = "All outbound traffic"
  }

  tags = {
    Name    = "md-vault-sg"
    Project = "md-vault"
  }
}
