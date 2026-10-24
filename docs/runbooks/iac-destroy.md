# Destroy infrastructure from CI

Tear down **one** environment's platform stack after a smoke-test apply.
Destroy is **manual**, on `main` only, never on a pull request, and never
from a laptop.

Workflow: `.github/workflows/iac-destroy.yml`.
Helper: `packages/iac-engine/scripts/ci.sh destroy-plan|destroy-apply`
(refuses unless `GITHUB_ACTIONS=true`).

This does **not** delete:

- Spaces bucket `aerodeck-tfstate` (state backend; not in the stack)
- Container Registry `aerodeck` (not in the stack)
- GitHub secrets

It **does** destroy whatever that environment's state file owns: project,
VPC, Droplet, Postgres, Redis, firewalls.

## What runs when

| Event | Destroy plan | Destroy apply |
| ----- | ------------ | ------------- |
| Pull request | Never | Never |
| Push | Never | Never |
| `workflow_dispatch` on `main`, Apply destroy **unchecked** | That environment | Never |
| `workflow_dispatch` on `main`, Apply destroy **checked**, confirm `destroy-<env>` | That environment | After the plan; `prod` waits on `production` |
| Laptop | Refused | Refused |

Confirm must be exactly `destroy-dev`, `destroy-staging`, or `destroy-prod`.
A typo fails the first job and nothing is planned.

Postgres and Redis have `prevent_destroy` in git. The destroy jobs lift that
flag **only in the Actions runner checkout** so a smoke-test stack can go
away without a laptop destroy. Merged code keeps `prevent_destroy = true`.

DigitalOcean will not DELETE a VPC that is the region default
(`Can not delete default VPCs`). Plan/apply/destroy on `main` move the
default onto another VPC when the API allows it, rename the leftover to
`…-kept-default` (so the next apply can recreate the stack name), then
**drop it from Terraform state** so destroy does not call DELETE. The
leftover stays in the account (free) and is not in state.

## How to run it

1. Wait until the **IaC plan and apply** run for that environment has
   finished (do not destroy mid-apply).
2. GitHub → **Actions** → **IaC destroy** → **Run workflow**.
3. Branch: `main`.
4. Environment: the one you applied (`dev` if you only smoke-tested one).
5. Confirm: `destroy-dev` (or `destroy-staging` / `destroy-prod`).
6. First run: leave **Apply destroy** **unchecked**. Read the plan summary.
7. Second run: same inputs, **Apply destroy** checked. Approve `production`
   if you chose prod.

Expected deletes: project `aerodeck-<env>`, VPC, Droplet, both database
clusters, firewalls. Billing for those resources stops after DigitalOcean
finishes the deletes (databases can take a while).

## What not to do

```bash
# Wrong — shared state, no stored plan, no approval
terraform destroy -var-file=envs/prod.tfvars
terraform apply -destroy -auto-approve
```

`scripts/ci.sh destroy-plan` and `destroy-apply` exit unless they are
running inside GitHub Actions.

## After destroy

State file `<env>/platform/terraform.tfstate` remains in Spaces and should
be empty of resources. Keep the bucket. You can apply again later from
[iac-apply.md](iac-apply.md).

## Related

- #68 — this runbook.
- Apply: [iac-apply.md](iac-apply.md).
- Account: [digitalocean-account.md](digitalocean-account.md).
