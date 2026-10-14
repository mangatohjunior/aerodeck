# Terraform remote state (DigitalOcean Spaces)

Every environment's Terraform state lives in one Spaces bucket, one object per
environment and stack. Plans are shared and locked. State files are never
committed.

Applies run in CI ([iac-apply.md](iac-apply.md)). Do not `terraform apply`
against this bucket from a laptop.

## Layout

| Path | Role |
| ---- | ---- |
| `packages/iac-engine/backend.hcl` | Non-secret backend config (bucket, endpoint, skip flags). Committed. |
| `packages/iac-engine/envs/<env>.tfvars` | Non-secret inputs per environment. Committed. |
| Object key `<env>/platform/terraform.tfstate` | State for that environment's platform stack. Not in git. |

The `s3` backend is built into Terraform. Using it does **not** pull the AWS
provider. The only cloud provider in this repo is `digitalocean/digitalocean`.

## Secrets (CI only)

| Secret | Used as | Purpose |
| ------ | ------- | ------- |
| Spaces access key | `AWS_ACCESS_KEY_ID` | Backend read/write |
| Spaces secret key | `AWS_SECRET_ACCESS_KEY` | Backend read/write |
| DigitalOcean API token | `TF_VAR_do_token` | Provider (needed to plan/apply, not to init) |

Never write these into `.tf`, `.tfvars`, or `backend.hcl`.

## One-time: create the bucket

The platform stack **uses** the bucket; it does not create it (chicken and egg).
Do this once in the DigitalOcean console or `doctl`, as an operator, not as
part of the stack.

1. Create Spaces bucket `aerodeck-tfstate` in `nyc3`.
2. Enable **versioning** on the bucket.
3. Restrict the bucket: private, no public list, HTTPS only.
4. Create a Spaces access key with read/write on that bucket. Store the pair in
   the GitHub Actions environment that will run Terraform, as
   `SPACES_ACCESS_KEY_ID` / `SPACES_SECRET_ACCESS_KEY` (mapped to
   `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` in the job).
5. Confirm the object key convention: `dev/platform/terraform.tfstate`,
   `staging/platform/terraform.tfstate`, `prod/platform/terraform.tfstate`.

If the bucket already exists, skip to "Initialise a stack".

## Initialise a stack

From `packages/iac-engine`, in CI (or a throwaway local clone that will not
apply):

```bash
export AWS_ACCESS_KEY_ID=<spaces access key>
export AWS_SECRET_ACCESS_KEY=<spaces secret>
export TF_VAR_do_token=<digitalocean token>   # only needed for plan/apply
export ENV=dev                                # or staging / prod

terraform init \
  -backend-config=backend.hcl \
  -backend-config="key=${ENV}/platform/terraform.tfstate"

terraform plan -var-file=envs/${ENV}.tfvars -out=${ENV}.tfplan
```

`terraform init` without `-backend-config=backend.hcl` will ask for a bucket
and is the wrong mode. Local state (`backend "local"`) is forbidden outside
`examples/` and unit tests.

## What CI checks today

`.github/workflows/iac-validate.yml` runs on every PR that touches
`packages/iac-engine/**`:

- `terraform fmt -check`
- `terraform init -backend=false`
- `terraform validate` with a dummy `TF_VAR_do_token`

It does **not** talk to Spaces or DigitalOcean. A real `plan` / `apply`
against the bucket is [iac-apply.md](iac-apply.md).

## Lock stuck

Terraform writes a lock object in the same bucket. If a runner dies mid-apply:

1. Confirm no other job is still applying that environment.
2. From CI (same credentials and key):
   `terraform force-unlock <LOCK_ID>`
3. Re-run the plan. Do not delete the `.tfstate` object to "clear" a lock.

## State missing or restored from versioning

Spaces versioning keeps previous objects. To restore:

1. In the Spaces UI, open `aerodeck-tfstate` →
   `<env>/platform/terraform.tfstate` → list versions.
2. Restore the last known-good version (do not skip a successful apply).
3. Re-init and plan. If the plan wants to recreate everything, stop — the
   restored object is the wrong version.

## Adding another stack

New root modules get their own key, never a shared file:

```text
<env>/<stack>/terraform.tfstate
```

Copy `backend.hcl`, keep the same bucket, change only the `key` at init.

## Related stories

- #6 (this runbook) — state in Spaces.
- #7 — project and private VPC per environment ([platform-network.md](platform-network.md)).
- #8 — apply only from CI ([iac-apply.md](iac-apply.md)).
