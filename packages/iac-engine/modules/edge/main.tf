# Traefik edge Droplet in the environment VPC (#35). Child modules must not
# declare provider or backend blocks. Applies stay in CI.
#
# Public 80/443. Traefik polls the control plane on VPC :8000. Port 8000 on
# the control host stays VPC-only.

locals {
  ssh_sources = length(var.ssh_allow_cidrs) > 0 ? var.ssh_allow_cidrs : [var.vpc_ip_range]
}

resource "random_password" "traefik_provider_token" {
  length  = 48
  special = false
}

resource "digitalocean_droplet" "edge" {
  name     = "${var.name_prefix}-edge"
  region   = var.region
  size     = var.droplet_size
  image    = var.droplet_image
  vpc_uuid = var.vpc_id
  ssh_keys = var.ssh_key_ids
  tags     = var.tags

  ipv6       = false
  monitoring = true
  user_data = templatefile("${path.module}/cloud-init.yaml", {
    control_plane_private_ipv4 = var.control_plane_private_ipv4
    traefik_provider_token     = random_password.traefik_provider_token.result
    traefik_image              = var.traefik_image
  })

  lifecycle {
    ignore_changes = [ssh_keys]
  }
}

resource "digitalocean_firewall" "edge" {
  name        = "${var.name_prefix}-edge-fw"
  droplet_ids = [digitalocean_droplet.edge.id]

  inbound_rule {
    protocol         = "tcp"
    port_range       = "22"
    source_addresses = local.ssh_sources
  }

  inbound_rule {
    protocol         = "tcp"
    port_range       = "80"
    source_addresses = ["0.0.0.0/0", "::/0"]
  }

  inbound_rule {
    protocol         = "tcp"
    port_range       = "443"
    source_addresses = ["0.0.0.0/0", "::/0"]
  }

  inbound_rule {
    protocol         = "icmp"
    source_addresses = [var.vpc_ip_range]
  }

  outbound_rule {
    protocol              = "tcp"
    port_range            = "1-65535"
    destination_addresses = ["0.0.0.0/0", "::/0"]
  }

  outbound_rule {
    protocol              = "udp"
    port_range            = "1-65535"
    destination_addresses = ["0.0.0.0/0", "::/0"]
  }

  outbound_rule {
    protocol              = "icmp"
    destination_addresses = ["0.0.0.0/0", "::/0"]
  }
}

resource "digitalocean_record" "edge" {
  domain = var.dns_zone
  type   = "A"
  name   = "edge"
  value  = digitalocean_droplet.edge.ipv4_address
  ttl    = 300
}

resource "digitalocean_project_resources" "edge" {
  project   = var.project_id
  resources = [digitalocean_droplet.edge.urn]
}
