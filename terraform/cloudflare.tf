resource "cloudflare_tunnel" "md_vault" {
  account_id = var.cloudflare_account_id
  name       = "md-vault"
  secret     = random_password.tunnel_secret.result
}

resource "random_password" "tunnel_secret" {
  length  = 32
  special = false
}

resource "cloudflare_tunnel_config" "md_vault" {
  account_id = var.cloudflare_account_id
  tunnel_id  = cloudflare_tunnel.md_vault.id

  config {
    ingress_rule {
      hostname = var.domain
      service  = "http://ingress-nginx-controller.ingress-nginx.svc.cluster.local:80"
    }
    ingress_rule {
      service = "http_status:404"
    }
  }
}

resource "cloudflare_record" "vault" {
  zone_id = var.cloudflare_zone_id
  name    = split(".", var.domain)[0]
  content = "${cloudflare_tunnel.md_vault.id}.cfargotunnel.com"
  type    = "CNAME"
  proxied = true
}
