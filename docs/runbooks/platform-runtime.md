# Platform runtime (Droplet + Postgres + Redis)

Each environment VPC gets a control-plane **Droplet**, managed **PostgreSQL**,
and managed **Redis**. Declared in `packages/iac-engine/modules/runtime`.
Applied in CI ([iac-apply.md](iac-apply.md)), not from a laptop.

This module creates the host and data stores. It does **not** pull or start
the control-plane image ([#33](https://github.com/mangatohjunior/aerodeck/issues/33)).

## What exists after apply

| Resource | Name | Notes |
| -------- | ---- | ----- |
| Droplet | `aerodeck-<env>-control` | Ubuntu in `aerodeck-<env>-vpc` (`vpc_uuid`). Docker is installed via cloud-init. |
| Droplet firewall | `aerodeck-<env>-control-fw` | SSH from the VPC (or `ssh_allow_cidrs`). Port 8000 from the VPC only. |
| PostgreSQL | `aerodeck-<env>-pg` | `engine = pg`, `private_network_uuid`. `prevent_destroy`. |
| Redis | `aerodeck-<env>-redis` | `engine = redis`, `private_network_uuid`. `prevent_destroy`. |
| Database firewalls | (attached to each cluster) | Trusted source is the control-plane Droplet only. |
| Project members | Droplet + both clusters | `digitalocean_project_resources` on `aerodeck-<env>`. |

DigitalOcean Projects cannot own a VPC. Compute and databases attach to the
project; they still join the VPC with `vpc_uuid` / `private_network_uuid`.

Sizes (`envs/<env>.tfvars`):

| Environment | Droplet | Postgres | Redis |
| ----------- | ------- | -------- | ----- |
| dev | `s-1vcpu-2gb` | `db-s-1vcpu-1gb` | `db-s-1vcpu-1gb` |
| staging | `s-1vcpu-2gb` | `db-s-1vcpu-1gb` | `db-s-1vcpu-1gb` |
| prod | `s-2vcpu-4gb` | `db-s-1vcpu-2gb` | `db-s-1vcpu-1gb` |

Outputs (`<env>/platform/terraform.tfstate`): `droplet_id`, `droplet_ipv4`,
`droplet_private_ipv4`, `postgres_id`, `postgres_private_host`,
`postgres_private_uri` (sensitive), `redis_id`, `redis_private_host`,
`redis_private_uri` (sensitive). Network outputs from
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

The control-plane process is still started by hand (or by #33) on the Droplet.
See [deploy.md](deploy.md) section 5.

## Related

- #32 — this runbook.
- #7 — project + VPC ([platform-network.md](platform-network.md)).
- #8 — apply only from CI ([iac-apply.md](iac-apply.md)).
- #33 — publish and run the control-plane image.
