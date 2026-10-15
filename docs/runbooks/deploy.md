# Deploy AeroDeck

What exists on `main` vs what an operator must still do before anything
runs in DigitalOcean. Follow this instead of improvising from chat.

Stories #1–#16 are merged. The platform is **not yet deployed**. The first
Terraform apply creates a DigitalOcean project, a private VPC, a control-plane
Droplet, managed PostgreSQL, and Redis per environment. It does **not**
publish or start the control-plane container, load balancer, or Traefik.

Do not `terraform apply` from a laptop. Applies stay in CI
([iac-apply.md](iac-apply.md)).

## What "deployed" means here

| Layer | On `main` today | Still required to run it |
| ----- | --------------- | ------------------------ |
| Git + CI | Tests, IaC validate, plan/apply workflow | GitHub secrets and a `production` reviewer |
| Remote state | `backend.hcl` + runbook | Spaces bucket `aerodeck-tfstate` with versioning |
| Network | Project + VPC module | First CI apply after secrets exist |
| Runtime | Droplet + Postgres + Redis in the VPC | Same CI apply; bills for compute and databases |
| Control plane | FastAPI image, Alembic `0007`, Celery worker | Publish the image (#33), env vars, start the container |
| Jobs | Queue + `NoopProvisioner` | A provisioner that actually runs Terraform |
| Edge | Traefik HTTP snapshot, memory DNS, fake ACME | Traefik process, DigitalOcean domain + token, Let's Encrypt account |
| Sandboxes | Boot / TTL reap / host enroll APIs | KVM hosts with Firecracker; enroll them via the API |

Laptop/CI can exercise the API with the in-memory DNS, ACME, and hypervisor
fakes. That is not a production deploy.

## Operator checklist (in order)

Do these once. Tick them in this file or on the board as you go.

### 1. DigitalOcean account

- [ ] Account exists; billing is enabled.
- [ ] API token with write on projects, VPCs, Spaces, Droplets, and databases.
- [ ] Optional: a Domain in DigitalOcean for public hostnames (`example.com`).

Without the account, plan/apply jobs skip and stay green. That is expected.

### 2. Terraform state bucket

Procedure: [terraform-state.md](terraform-state.md).

- [ ] Spaces bucket `aerodeck-tfstate` in `nyc3`.
- [ ] Versioning on.
- [ ] Private; no public list; HTTPS only.
- [ ] Spaces access key with read/write on that bucket.

The platform stack **uses** this bucket; it does not create it.

### 3. GitHub Actions credentials

Procedure: [iac-apply.md](iac-apply.md).

- [ ] Repo secret `DIGITALOCEAN_TOKEN`.
- [ ] Repo secrets `SPACES_ACCESS_KEY_ID` and `SPACES_SECRET_ACCESS_KEY`.
- [ ] Environments `dev` and `staging` (no required reviewers).
- [ ] Environment `production` with at least one required reviewer.
      Do **not** enable "prevent self review" on a solo maintainer account.

All three secrets must be set together. Partial secrets fail the workflow.

### 4. First apply (project + VPC + runtime)

- [ ] Merge to `main` (or run **IaC plan and apply** with Apply checked).
- [ ] Confirm each environment created `aerodeck-<env>`,
      `aerodeck-<env>-vpc`, `aerodeck-<env>-control`, `aerodeck-<env>-pg`,
      and `aerodeck-<env>-redis` ([platform-network.md](platform-network.md),
      [platform-runtime.md](platform-runtime.md)).
- [ ] Approve the `production` apply in the Actions UI.

Expected creates per environment: one project, one VPC, one Droplet, two
managed databases, firewalls, and project members. This **bills** for the
Droplet and both databases. No container is started.

### 5. Control-plane process (image not published yet)

Terraform created the Droplet, Postgres, and Redis. The image still builds
locally; nothing in this repo publishes it or starts it on the Droplet
([#33](https://github.com/mangatohjunior/aerodeck/issues/33)). Until then,
run the container yourself **on `aerodeck-<env>-control`**:

- [ ] `AERODECK_DATABASE_URL` from `terraform output postgres_private_uri`
      (`postgresql+asyncpg://…` on the private host).
- [ ] `AERODECK_REDIS_URL` from `terraform output redis_private_uri`.
- [ ] `alembic upgrade head` (expect `0007`).
- [ ] `AERODECK_AUTH_SIGNING_KEY` (≥ 32 random characters, unique per env).
- [ ] `AERODECK_AUTH_CLIENTS` with SHA-256 digests of client secrets — never
      the secrets themselves.
- [ ] `AERODECK_ENV=production` so `/docs` is off.
- [ ] Start API and worker from the same image
      ([control-plane.md](control-plane.md) Docker section).
- [ ] `GET /healthz` is 200; `GET /readyz` shows `database: ok` and
      `queue: ok`.

### 6. Edge (Traefik + real DNS + real TLS)

Procedure: [edge-routing.md](edge-routing.md). Defaults are in-memory.

- [ ] DigitalOcean Domain exists for the zone you will publish.
- [ ] `AERODECK_DIGITALOCEAN_TOKEN` on the control plane (same or scoped token).
- [ ] `AERODECK_DNS_RECORDS_PROVIDER=digitalocean`.
- [ ] `AERODECK_DNS_RECORD_TARGET` set to the Traefik public name or address.
- [ ] Traefik v3 process polling `GET /api/v1/edge/traefik` with
      `AERODECK_TRAEFIK_PROVIDER_TOKEN`.
- [ ] `AERODECK_DNS01_PROVIDER=digitalocean` once you want real TXT challenges.
- [ ] Let's Encrypt (or another ACME) account — fake ACME is still the issuer.

A Traefik Droplet is **not** in the platform stack. Add it as a later module
in the environment VPC; do not apply it from a laptop.

### 7. Sandboxes (optional, separate from DigitalOcean)

Procedure: [sandboxes.md](sandboxes.md). ADR:
[0001](../adr/0001-sandbox-runtime-outside-iac.md).

- [ ] One or more KVM hosts with Firecracker, **not** on the control-plane
      Droplet and **not** provisioned by `packages/iac-engine`.
- [ ] `POST /api/v1/sandbox-hosts` for each (`name` + `http(s)` API URL).
- [ ] `AERODECK_SANDBOX_HYPERVISOR=firecracker`.
- [ ] Guest images under `{AERODECK_SANDBOX_IMAGE_ROOT}/{image}/` (`vmlinux`,
      `rootfs.ext4`).
- [ ] A scheduler (cron or Celery beat) calling
      `POST /api/v1/sandboxes/reap-expired` so TTL reclaim is not manual.

Do not add `hetznercloud/hcloud` (or any non-DigitalOcean provider) to the
IaC engine.

### 8. Board hygiene

- [ ] Epic #9 and #13 story checklists are ticked; close the epics if the
      scope is done ([issue-workflow.md](issue-workflow.md)).

## Gaps that block a full production shape

These are tracked as Epic **#31**. They are **not** hidden in the checklist
above as if an operator can finish them without new code.

| Story | Outcome |
| ----- | ------- |
| #33 | Publish the control-plane image from CI |
| #34 | Run environment provision jobs through the IaC engine |
| #35 | Traefik in the VPC with real DNS and Let's Encrypt |
| #36 | Require a token on control-plane reads |
| #37 | Reap expired sandboxes on a schedule |
| #38 | Keep certificate private keys off the API database |
| #39 | Metrics and alerts for readiness, applies, and reaps |
| #40 | Back up the control-plane database |

Do not add Hetzner (or any other cloud) to `packages/iac-engine`. Sandbox
hosts stay API-enrolled ([ADR 0001](../adr/0001-sandbox-runtime-outside-iac.md)).

## Related

- Local API: [control-plane.md](control-plane.md)
- State: [terraform-state.md](terraform-state.md)
- Apply: [iac-apply.md](iac-apply.md)
- Network: [platform-network.md](platform-network.md)
- Runtime: [platform-runtime.md](platform-runtime.md)
- Edge: [edge-routing.md](edge-routing.md)
- Sandboxes: [sandboxes.md](sandboxes.md)
