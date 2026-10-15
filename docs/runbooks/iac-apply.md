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
| Push to `main` touching that tree | All three environments | `dev` and `staging` immediately; `prod` after `production` approval |
| `workflow_dispatch` on `main` with Apply checked | All three | Same as a main push |
| Laptop | `terraform plan` only, against a throwaway clone | Refused |

If `DIGITALOCEAN_TOKEN`, `SPACES_ACCESS_KEY_ID`, and `SPACES_SECRET_ACCESS_KEY`
are all unset, plan and apply **skip** so pull requests stay green. If only
some of them are set, the workflow fails (misconfiguration).

Full operator sequence (account → secrets → first apply of project, VPC,
Droplet, Postgres, and Redis): [deploy.md](deploy.md). The control-plane
image is still started by hand until #33.

## Operator setup (once)

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

After secrets and the bucket exist, merge to `main` (or run **IaC plan and
apply** with Apply checked). Expected first creates per environment: one
project and one VPC ([platform-network.md](platform-network.md)).

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

## Related

- #6 — state in Spaces ([terraform-state.md](terraform-state.md)).
- #7 — project and VPC ([platform-network.md](platform-network.md)).
- #8 — this runbook.
