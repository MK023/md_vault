resource "google_compute_instance" "md_vault" {
  name         = "md-vault"
  machine_type = var.machine_type
  zone         = var.gcp_zone

  tags = ["md-vault"]

  boot_disk {
    initialize_params {
      image = "ubuntu-os-cloud/ubuntu-2204-lts"
      size  = 30
      type  = "pd-ssd"
    }
  }

  network_interface {
    subnetwork = google_compute_subnetwork.public.id

    access_config {
      # Ephemeral public IP
    }
  }

  metadata = {
    ssh-keys = "mdvault:${var.ssh_public_key}"
  }

  metadata_startup_script = file("${path.module}/scripts/startup.sh")

  labels = {
    project = "md-vault"
  }

  lifecycle {
    ignore_changes = [boot_disk[0].initialize_params[0].image]
  }
}
