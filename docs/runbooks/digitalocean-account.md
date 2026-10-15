# DigitalOcean account bootstrap

Do this once, by hand, in the DigitalOcean console and GitHub. It is the
operator work that unblocks CI. Terraform does **not** create the account,
the state bucket, the registry, or GitHub secrets.

When this runbook is done, plan/apply and image push can run. They still
**do not apply from your laptop**. First apply bills for compute and
databases — stop after step 8 until you are ready for that.

Related detail (do not start there): [terraform-state.md](terraform-state.md),
[iac-apply.md](iac-apply.md), [control-plane-image.md](control-plane-image.md),
[deploy.md](deploy.md).

## What you create vs what Terraform creates

| You create (this runbook) | Terraform / CI creates later |
| ------------------------- | ---------------------------- |
| DigitalOcean account + billing | Environment projects `aerodeck-dev`, `aerodeck-staging`, `aerodeck-prod` |
| One console project (default or `aerodeck-ops`) | VPCs, Droplets, Postgres, Redis, firewalls |
| API token | State objects `<env>/platform/terraform.tfstate` |
| One Spaces bucket `aerodeck-tfstate` + access key | Image tags `<git sha>` and `main` (on push to `main`) |
| Container Registry `aerodeck` | |
| GitHub Actions secrets and environments | Nothing in GitHub |

Do **not** hand-create a project, VPC, Droplet, or database named
`aerodeck-dev`, `aerodeck-staging`, or `aerodeck-prod`. CI would fight you
on the next apply.

Skip a domain and SSH keys for now. You can add them later without repeating
this runbook.

## 1. Account and billing

1. Open [https://cloud.digitalocean.com/registrations/new](https://cloud.digitalocean.com/registrations/new)
   and create an account (or sign in).
2. Confirm the email.
3. **Settings → Billing**: add a payment method. Droplets, managed databases,
   Spaces, and Container Registry all require billing. A free account cannot
   finish this runbook.
4. Stay in region **nyc3** for everything below. That is what
   `packages/iac-engine/envs/*.tfvars` and `backend.hcl` assume.

## 1b. Console project (Spaces needs one)

The DigitalOcean UI will not create a Spaces bucket without a **project**.
That project is a folder in the console, not an AeroDeck environment.

- **Do not** create `aerodeck-dev`, `aerodeck-staging`, or `aerodeck-prod`.
  Terraform creates those three on first apply, one per environment.
- **Do** use the account **default** project (DigitalOcean already made one),
  **or** create a single extra project named `aerodeck-ops`.
- Put the state bucket (and later the registry) in that one ops/default
  project. **One** bucket for all environments, not one bucket per env.

If you already created `aerodeck-dev` (or staging/prod) by hand: rename it
to `aerodeck-ops` or delete it while it is empty, before first apply.

## 2. API token

Spaces uses a **different** key (step 4). This token is for Terraform and
the registry login.

1. **API** → **Tokens** → **Generate New Token**
   ([https://cloud.digitalocean.com/account/api/tokens](https://cloud.digitalocean.com/account/api/tokens)).
2. Name it `aerodeck-ci`.
3. Expiration: 90 days is fine; rotate in GitHub when it expires. No expiry
   is convenient and riskier.
4. Scopes: **Write** (custom scopes if you prefer least privilege: Droplets,
   Firewalls, VPCs, Projects, Databases, Container Registry, Tags).
5. Copy the token once. You will not see it again.

Store it in a password manager until step 6. Never commit it, never put it
in `.tfvars` or `backend.hcl`.

## 3. Spaces bucket for Terraform state

The platform stack **uses** this bucket; it does not create it.

1. In the top bar, select the **default** project or `aerodeck-ops`
   (step 1b). Not `aerodeck-dev`.
2. **Create** → **Spaces Object Storage** → **Create a Spaces Bucket**
   ([https://cloud.digitalocean.com/spaces](https://cloud.digitalocean.com/spaces)).
3. Datacenter: **nyc3**.
4. Name: `aerodeck-tfstate` (must match `packages/iac-engine/backend.hcl`).
   Bucket names are globally unique; if this name is taken, stop and change
   `backend.hcl` in a PR before going further.
5. File listing: **Restrict File Listing**.
6. Create the bucket.
7. Bucket settings: enable **versioning**.
8. CDN: leave **off**. This bucket holds state, not public assets.

Confirm HTTPS endpoint `https://nyc3.digitaloceanspaces.com` (already in
`backend.hcl`).

## 4. Spaces access key

This is **not** the API token from step 2.

1. **API** → **Spaces Keys** → **Generate New Key**
   ([https://cloud.digitalocean.com/account/api/spaces](https://cloud.digitalocean.com/account/api/spaces)).
2. Name it `aerodeck-tfstate-ci`.
3. Copy **Key** (access key ID) and **Secret**. You will not see the secret
   again.

The GitHub job maps these to `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY`
because Terraform's built-in `s3` backend speaks the S3 protocol. That does
not add an AWS account or the AWS provider.

## 5. Container Registry

One registry per account, not per environment.

1. **Container Registry** → **Create Registry**
   ([https://cloud.digitalocean.com/registry](https://cloud.digitalocean.com/registry)).
2. Name: `aerodeck` (must match the default `control_plane_image` in
   Terraform). If you pick another name, set GitHub variable `DOCR_NAME` to
   that name in step 6 **and** change `control_plane_image` in
   `packages/iac-engine/envs/*.tfvars` via a PR.
3. Plan: **Starter** is enough.
4. Region: **nyc3** if asked.

Do not push from your laptop. CI pushes on `main` after the token is in
GitHub ([control-plane-image.md](control-plane-image.md)).

## 6. GitHub Actions secrets and environments

Repo: **Settings → Secrets and variables → Actions**.

Add **all three** repository secrets together. Partial secrets fail the
plan/apply workflow.

| GitHub secret | Paste | Used as |
| ------------- | ----- | ------- |
| `DIGITALOCEAN_TOKEN` | API token from step 2 | `TF_VAR_do_token`, registry login |
| `SPACES_ACCESS_KEY_ID` | Spaces key from step 4 | `AWS_ACCESS_KEY_ID` |
| `SPACES_SECRET_ACCESS_KEY` | Spaces secret from step 4 | `AWS_SECRET_ACCESS_KEY` |

Optional **variable** (not a secret): `DOCR_NAME` = `aerodeck` only if you
did not use that registry name.

Repo: **Settings → Environments**.

| Environment | Required reviewers |
| ----------- | ------------------ |
| `dev` | none |
| `staging` | none |
| `production` | at least one (you) |

The prod apply job uses the environment named **`production`**, not `prod`.
Do **not** enable "Prevent self-review" on a solo maintainer account or
production can never apply.

Saving secrets does **not** create Droplets. Nothing applies until you run
the workflow in step 9.

## 7. Confirm CI can see the credentials

1. GitHub → **Actions** → **IaC plan and apply** → **Run workflow**.
2. Branch: `main`. Leave **Apply** **unchecked**.
3. The `credentials present` job should set `ready=true` and the three
   `plan (...)` jobs should run. They talk to DigitalOcean and Spaces.
4. Open a plan summary. You should see creates for project, VPC, Droplet,
   Postgres, Redis, firewalls, and project members — three times (dev,
   staging, prod).
5. **Actions** → **Control plane image** only pushes after a later push to
   `main` that touches `apps/control-plane/**`. A dry run is not required
   now.

If `credentials present` still skips, a secret name is wrong or empty.
If it errors on **partial** secrets, add the missing one.

## 8. Stop and read this before apply

First apply creates **three** environments. Each one is a Droplet plus two
managed databases. That is real spend (DigitalOcean bills by the hour, but
managed databases are the expensive part).

| Do | Do not |
| -- | ------ |
| Keep **Apply** unchecked until you want to pay | `terraform apply` from a laptop |
| Apply from **Actions → IaC plan and apply** with Apply checked, on `main` | Hand-create `aerodeck-*` resources in the console |
| Approve **production** in the Actions UI when that job waits | Put tokens in git, `.env` committed, or `backend.hcl` |
| Use `scripts/ci.sh` only inside GitHub Actions | `terraform apply -auto-approve` |

When you are ready to create the resources: [iac-apply.md](iac-apply.md)
**First apply**, then [deploy.md](deploy.md) section 4–5. After apply you
still start the control-plane container by hand.

## Optional later (not required to finish this runbook)

- **SSH key**: DigitalOcean → **Settings → Security → SSH keys**. To inject
  it on the Droplet, put the key id in `ssh_key_ids` via a PR; empty means
  console-only access.
- **Domain**: add a domain in DigitalOcean when you do real DNS/TLS
  ([edge-routing.md](edge-routing.md)). Skip until story #35.

## If something already exists

| Situation | What to do |
| --------- | ---------- |
| Account exists, no billing | Add billing; continue from step 2 |
| Hand-created `aerodeck-dev` (or staging/prod) | Rename to `aerodeck-ops` or delete while empty, before first apply |
| Token lost | Revoke it, generate a new one, update `DIGITALOCEAN_TOKEN` |
| Bucket name taken | Rename in a PR (`backend.hcl`) **before** creating another bucket |
| Registry already named something else | Set `DOCR_NAME` and `control_plane_image` to match |
| Secrets were added one at a time and CI failed | Add the rest; re-run the workflow |

## Related

- Operator checklist: [deploy.md](deploy.md)
- State bucket details: [terraform-state.md](terraform-state.md)
- Plan/apply: [iac-apply.md](iac-apply.md)
- Image push: [control-plane-image.md](control-plane-image.md)
