resource "google_compute_firewall" "allow_ssh" {
  name    = "md-vault-allow-ssh"
  network = google_compute_network.main.name

  allow {
    protocol = "tcp"
    ports    = ["22"]
  }

  source_ranges = [var.ssh_allowed_ip]
  target_tags   = ["md-vault"]
}

resource "google_compute_firewall" "allow_egress" {
  name      = "md-vault-allow-egress"
  network   = google_compute_network.main.name
  direction = "EGRESS"

  allow {
    protocol = "all"
  }

  destination_ranges = ["0.0.0.0/0"]
  target_tags        = ["md-vault"]
}
