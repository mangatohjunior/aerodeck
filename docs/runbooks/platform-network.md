# Platform network (project + VPC)

Each environment gets its own DigitalOcean **Project** and a **private VPC**.
Workloads never use the region's default VPC. Declared in
`packages/iac-engine/modules/network`. Applied in CI
([iac-apply.md](iac-apply.md)), not from a laptop.

## What exists after apply

| Resource | Name | Notes |
| -------- | ---- | ----- |
| Project | `aerodeck-<env>` | `is_default = false`. Attach later Droplets, databases, and clusters with `digitalocean_project_resources`. |
| VPC | `aerodeck-<env>-vpc` | Private RFC1918 range. Set `vpc_uuid` on Droplets, databases, and clusters. |

DigitalOcean Projects cannot own a VPC. Supported project members are Droplets,
databases, Kubernetes clusters, load balancers, volumes, Spaces, domains,
floating IPs, and App Platform apps. The VPC stays a regional network; later
stacks still pass `vpc_id` as `vpc_uuid` and attach the *compute* resources to
the project.

CIDRs (must not overlap in the same region):

| Environment | `vpc_ip_range` | DigitalOcean project label |
| ----------- | -------------- | -------------------------- |
| dev | `10.10.0.0/16` | Development |
| staging | `10.20.0.0/16` | Staging |
| prod | `10.30.0.0/16` | Production |

Outputs to consume from this state (`<env>/platform/terraform.tfstate`):
`project_id`, `vpc_id`, `vpc_ip_range`, `vpc_urn`, `region`.

## Preconditions

1. Spaces bucket `aerodeck-tfstate` exists with versioning
   ([terraform-state.md](terraform-state.md)).
2. CI (or a throwaway local clone that will **not** apply) can set
   `TF_VAR_do_token`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`.

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

Expected creates: one project and one VPC. No Droplets, databases, clusters,
or `digitalocean_project_resources` (a VPC cannot be assigned to a project).

Do **not** `terraform apply` from a laptop. Procedure:
[iac-apply.md](iac-apply.md).

## After a future apply, verify

In the DigitalOcean console:

1. Project `aerodeck-<env>` exists and is not the account default.
2. VPC `aerodeck-<env>-vpc` exists in `nyc3` with the CIDR above.
3. The VPC is listed under Networking → VPC, not as a project member. That is
   expected.
4. `terraform output vpc_id` is a UUID later stacks pass as `vpc_uuid`.

## Attaching a later resource

```hcl
resource "digitalocean_droplet" "example" {
  vpc_uuid = var.vpc_id          # from this stack's vpc_id output
  # ...
}

resource "digitalocean_project_resources" "example" {
  project   = var.project_id     # from this stack's project_id output
  resources = [digitalocean_droplet.example.urn]
}
```

Never omit `vpc_uuid` on a Droplet, database cluster, or Kubernetes cluster.

## Related

- #6 — state in Spaces.
- #7 — this runbook.
- #8 — apply only from CI ([iac-apply.md](iac-apply.md)).
