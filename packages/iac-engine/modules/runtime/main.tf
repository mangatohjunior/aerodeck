# Control-plane Droplet + managed Postgres + managed Redis in the environment
# VPC. Child modules must not declare provider or backend blocks.
#
# Databases use private_network_uuid (never the default VPC). Public access is
# denied except via digitalocean_database_firewall, which trusts only this
# Droplet. Stateful clusters have prevent_destroy.
#
# This module does not start the control-plane process. It writes
# var.control_plane_image to /etc/aerodeck/control-plane-image so an operator
# (or a later workflow) can pull the SHA-tagged image from DOCR.

locals {
  ssh_sources = length(var.ssh_allow_cidrs) > 0 ? var.ssh_allow_cidrs : [var.vpc_ip_range]
}

resource "digitalocean_droplet" "control" {
  name     = "${var.name_prefix}-control"
  region   = var.region
  size     = var.droplet_size
  image    = var.droplet_image
  vpc_uuid = var.vpc_id
  ssh_keys = var.ssh_key_ids
  tags     = var.tags

  ipv6       = false
  monitoring = true
  user_data = templatefile("${path.module}/cloud-init.yaml", {
    control_plane_image   = var.control_plane_image
    managed_cache_enabled = var.managed_cache_enabled
  })

  # ssh_keys is ForceNew. Do not rebuild a live Droplet to inject keys;
  # paste the pubkey via Droplet Console into authorized_keys instead.
  lifecycle {
    ignore_changes = [ssh_keys]
  }
}

resource "digitalocean_firewall" "control" {
  name        = "${var.name_prefix}-control-fw"
  droplet_ids = [digitalocean_droplet.control.id]

  inbound_rule {
    protocol         = "tcp"
    port_range       = "22"
    source_addresses = local.ssh_sources
  }

  inbound_rule {
    protocol         = "tcp"
    port_range       = "8000"
    source_addresses = [var.vpc_ip_range]
  }

  # Operator console on this Droplet. Traefik on the edge reaches it over the VPC.
  # Do not open 3000 to the public internet.
  inbound_rule {
    protocol         = "tcp"
    port_range       = "3000"
    source_addresses = [var.vpc_ip_range]
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

resource "digitalocean_database_cluster" "postgres" {
  name                 = "${var.name_prefix}-pg"
  engine               = "pg"
  version              = var.postgres_version
  size                 = var.postgres_size
  region               = var.region
  node_count           = var.postgres_node_count
  private_network_uuid = var.vpc_id
  tags                 = var.tags

  lifecycle {
    prevent_destroy = true
  }
}

resource "digitalocean_database_cluster" "redis" {
  # Off by default: new teams often cannot create a second DBaaS cluster.
  count = var.managed_cache_enabled ? 1 : 0

  # DigitalOcean no longer creates new Redis clusters. Valkey is Redis-protocol
  # compatible (AERODECK_REDIS_URL still works).
  name                 = "${var.name_prefix}-redis"
  engine               = "valkey"
  version              = var.redis_version
  size                 = var.redis_size
  region               = var.region
  node_count           = var.redis_node_count
  private_network_uuid = var.vpc_id
  eviction_policy      = "allkeys_lru"
  tags                 = var.tags

  lifecycle {
    prevent_destroy = true
  }
}

# Trusted sources only. Without these rules the public hostname is reachable.
resource "digitalocean_database_firewall" "postgres" {
  cluster_id = digitalocean_database_cluster.postgres.id

  rule {
    type  = "droplet"
    value = digitalocean_droplet.control.id
  }
}

resource "digitalocean_database_firewall" "redis" {
  count      = var.managed_cache_enabled ? 1 : 0
  cluster_id = digitalocean_database_cluster.redis[0].id

  rule {
    type  = "droplet"
    value = digitalocean_droplet.control.id
  }
}

resource "digitalocean_project_resources" "runtime" {
  project = var.project_id
  resources = compact([
    digitalocean_droplet.control.urn,
    digitalocean_database_cluster.postgres.urn,
    var.managed_cache_enabled ? digitalocean_database_cluster.redis[0].urn : "",
  ])
}
