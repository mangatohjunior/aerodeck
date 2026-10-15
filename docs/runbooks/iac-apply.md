# Apply infrastructure from CI

Terraform **plan** runs in GitHub Actions. **Apply** runs only on `main`,
never on a pull request, and never from a laptop. Production apply uses the
stored plan artefact and waits on the GitHub `production` environment.

Workflow: `.github/workflows/iac-plan-apply.yml`.
Helper: `packages/iac-engine/scripts/ci.sh` (refuses `apply` unless
`GITHUB_ACTIONS=true`).

## What runs when

| Event | Plan | Apply |
| ----- | ---- | ----- |
| Pull request touching `packages/iac-engine/**` | All three environments, if secrets are set | Never |
| Push to `main` touching that tree | All three environments | Never (avoids burning a new team's one database-cluster quota on three stacks) |
| `workflow_dispatch` on `main` with Apply checked | All three | **One** environment (`dev` by default). `prod` still waits on `production` |
| Laptop | `terraform plan` only, against a throwaway clone | Refused |

If `DIGITALOCEAN_TOKEN`, `SPACES_ACCESS_KEY_ID`, and `SPACES_SECRET_ACCESS_KEY`
are all unset, plan and apply **skip** so pull requests stay green. If only
some of them are set, the workflow fails (misconfiguration).

Full operator sequence: [digitalocean-account.md](digitalocean-account.md)
then [deploy.md](deploy.md). The control-plane image is published to
DigitalOcean Container Registry on `main`
([control-plane-image.md](control-plane-image.md)) and still started by hand.

## Operator setup (once)

Click-by-click: [digitalocean-account.md](digitalocean-account.md).

1. Create the `aerodeck-tfstate` Spaces bucket with versioning
   ([terraform-state.md](terraform-state.md)).
2. Repo **Settings → Secrets and variables → Actions**, add:

   | GitHub secret | Mapped in the job to |
   | ------------- | -------------------- |
   | `DIGITALOCEAN_TOKEN` | `TF_VAR_do_token` |
   | `SPACES_ACCESS_KEY_ID` | `AWS_ACCESS_KEY_ID` |
   | `SPACES_SECRET_ACCESS_KEY` | `AWS_SECRET_ACCESS_KEY` |

3. Repo **Settings → Environments**:
   - `dev` and `staging` — no required reviewers (first apply creates them if missing).
   - `production` — add at least one required reviewer. Do **not** enable
     "prevent self review" on a solo maintainer account or prod can never
     apply. The apply job uses this environment; it does not use
     `-auto-approve`.
4. Confirm object keys will be `dev/platform/terraform.tfstate`,
   `staging/platform/terraform.tfstate`, `prod/platform/terraform.tfstate`.

## Reading a plan on a pull request

Open the workflow run → each `plan (<env>)` job → job summary. The binary
plan is uploaded as artefact `tfplan-<env>` (14 days). Apply jobs download
that exact file; they do not re-plan.

## First apply

After secrets and the bucket exist, run **IaC plan and apply** on `main`:
environment **`dev`**, Apply **checked**. New DigitalOcean teams are
[Tier 1](https://docs.digitalocean.com/platform/resource-limits/): Basic
shared-CPU Droplets only (no Premium `-amd` / `-intel`), and often **one**
managed database cluster. This stack uses `s-1vcpu-1gb` and runs Redis in
Docker on the Droplet so Postgres can use that single cluster slot.

Do **not** apply staging or prod until
**Settings → Resource Limits** shows room for another Droplet and another
database cluster.

If a previous apply already created Postgres clusters, destroy extras first
([iac-destroy.md](iac-destroy.md)) or the next Valkey/Postgres create will
return `maximum clusters reached`.

Expected creates for **dev**: one project, one VPC, one Droplet, one
Postgres cluster, firewalls. Redis listens on `127.0.0.1:6379` unless
`managed_cache_enabled = true`.

Prod stays queued on the `production` environment until a reviewer approves
in the Actions UI.

## What not to do

```bash
# Wrong — shared state, no stored plan, no approval
terraform apply -var-file=envs/prod.tfvars
terraform apply -auto-approve
```

Local `terraform plan` against Spaces is allowed for debugging. Local
`terraform apply` is not; `scripts/ci.sh apply` exits unless it is running
inside GitHub Actions.

To tear down a smoke-test apply: [iac-destroy.md](iac-destroy.md). Do not
`terraform destroy` from a laptop.

## Related

- #6 — state in Spaces ([terraform-state.md](terraform-state.md)).
- #7 — project and VPC ([platform-network.md](platform-network.md)).
- #8 — this runbook.
- #68 — destroy from CI ([iac-destroy.md](iac-destroy.md)).
