data "aws_ami" "ubuntu" {
  most_recent = true
  owners      = ["099720109477"] # Canonical

  filter {
    name   = "name"
    values = ["ubuntu/images/hvm-ssd/ubuntu-jammy-22.04-amd64-server-*"]
  }

  filter {
    name   = "virtualization-type"
    values = ["hvm"]
  }
}

resource "aws_key_pair" "md_vault" {
  key_name   = "md-vault-key"
  public_key = var.ssh_public_key
}

resource "aws_instance" "md_vault" {
  ami                    = data.aws_ami.ubuntu.id
  instance_type          = var.instance_type
  key_name               = aws_key_pair.md_vault.key_name
  subnet_id              = aws_subnet.public.id
  vpc_security_group_ids = [aws_security_group.md_vault.id]

  root_block_device {
    volume_size = 30
    volume_type = "gp3"
    encrypted   = true
  }

  user_data                   = file("${path.module}/scripts/user_data.sh")
  user_data_replace_on_change = true

  tags = {
    Name    = "md-vault"
    Project = "md-vault"
  }

  lifecycle {
    ignore_changes = [ami]
  }
}
