# Platform runtime (Droplet + Postgres + Redis)

Each environment VPC gets a control-plane **Droplet**, managed **PostgreSQL**,
and managed **Redis**. Declared in `packages/iac-engine/modules/runtime`.
Applied in CI ([iac-apply.md](iac-apply.md)), not from a laptop.

This module creates the host and data stores. It writes `control_plane_image`
to `/etc/aerodeck/control-plane-image`. It does **not** log in to the registry
or start the container ([control-plane-image.md](control-plane-image.md)).

## What exists after apply

| Resource | Name | Notes |
| -------- | ---- | ----- |
| Droplet | `aerodeck-<env>-control` | Ubuntu in `aerodeck-<env>-vpc` (`vpc_uuid`). Docker plus `/etc/aerodeck/control-plane-image`. |
| Droplet firewall | `aerodeck-<env>-control-fw` | SSH from the VPC (or `ssh_allow_cidrs`). Port 8000 from the VPC only. |
| PostgreSQL | `aerodeck-<env>-pg` | `engine = pg`, `private_network_uuid`. `prevent_destroy`. |
| Valkey (Redis-compatible) | `aerodeck-<env>-redis` | `engine = valkey` (DigitalOcean no longer creates new Redis clusters). `private_network_uuid`. `prevent_destroy`. |
| Database firewalls | (attached to each cluster) | Trusted source is the control-plane Droplet only. |
| Project members | Droplet + both clusters | `digitalocean_project_resources` on `aerodeck-<env>`. |

DigitalOcean Projects cannot own a VPC. Compute and databases attach to the
project; they still join the VPC with `vpc_uuid` / `private_network_uuid`.

Sizes (`envs/<env>.tfvars`):

| Environment | Droplet | Postgres | Cache |
| ----------- | ------- | -------- | ----- |
| dev | `s-2vcpu-4gb` | `db-s-1vcpu-1gb` | Docker Redis on the Droplet (`managed_cache_enabled = false`) |
| staging | `s-2vcpu-4gb` | `db-s-1vcpu-1gb` | same |
| prod | `s-2vcpu-4gb` | `db-s-1vcpu-1gb` | same |

New DigitalOcean teams cannot create Premium (`-amd` / `-intel`) Droplets
until the account tier is raised. Regular `s-1vcpu-1gb` and `s-1vcpu-2gb`
are not available in nyc3, so the stack uses Regular `s-2vcpu-4gb`. They
also cannot create a second managed database cluster; leave
`managed_cache_enabled = false` until **Resource Limits** allows it.

Outputs (`<env>/platform/terraform.tfstate`): `droplet_id`, `droplet_ipv4`,
`droplet_private_ipv4`, `postgres_id`, `postgres_private_host`,
`postgres_private_uri` (sensitive), `redis_id`, `redis_private_host`,
`redis_private_uri` (sensitive), `control_plane_image`. Network outputs from
[platform-network.md](platform-network.md) are unchanged.

## Preconditions

Same as the network stack: Spaces bucket, CI secrets, no laptop apply
([platform-network.md](platform-network.md)).

Optional, via tfvars (not committed with real values):

- `ssh_key_ids` — DigitalOcean SSH key IDs so the Droplet is reachable over SSH.
- `ssh_allow_cidrs` — public CIDRs for port 22. Empty means VPC-only SSH.

## Plan (no apply)

From `packages/iac-engine`:

```bash
export ENV=dev   # or staging / prod
export TF_VAR_do_token=<digitalocean token>
export AWS_ACCESS_KEY_ID=<spaces access key>
export AWS_SECRET_ACCESS_KEY=<spaces secret>

terraform init \
  -backend-config=backend.hcl \
  -backend-config="key=${ENV}/platform/terraform.tfstate"

terraform plan -var-file=envs/${ENV}.tfvars -out=${ENV}.tfplan
```

Expected creates (in addition to project + VPC): one Droplet, two database
clusters, two database firewalls, one Droplet firewall, and one
`digitalocean_project_resources` set.

Do **not** `terraform apply` from a laptop. Procedure:
[iac-apply.md](iac-apply.md). First apply bills for the Droplet and both
managed databases.

## After a future apply, verify

In the DigitalOcean console:

1. Droplet `aerodeck-<env>-control` is in VPC `aerodeck-<env>-vpc`, not default.
2. Database clusters `aerodeck-<env>-pg` and `aerodeck-<env>-redis` show the
   same VPC. Trusted sources list only that Droplet.
3. Project `aerodeck-<env>` members include the Droplet and both clusters.
4. `terraform output postgres_private_host` and `redis_private_host` are the
   hostnames to put in `AERODECK_DATABASE_URL` / `AERODECK_REDIS_URL`.
   Rewrite the Postgres scheme to `postgresql+asyncpg`.

The control-plane process is still started by hand on the Droplet. See
[deploy.md](deploy.md) section 5 and [control-plane-image.md](control-plane-image.md).

## Related

- #32 — this runbook.
- #7 — project + VPC ([platform-network.md](platform-network.md)).
- #8 — apply only from CI ([iac-apply.md](iac-apply.md)).
- #33 — publish the control-plane image ([control-plane-image.md](control-plane-image.md)).
