# Deploy AeroDeck

What exists on `main` vs what an operator must still do before anything
runs in DigitalOcean. Follow this instead of improvising from chat.

Stories #1–#16 are merged. The platform is **not yet deployed**. The first
Terraform apply creates a DigitalOcean project, a private VPC, a control-plane
Droplet, managed PostgreSQL, and Redis per environment. CI publishes the
control-plane image to DigitalOcean Container Registry on `main`. Apply does
**not** start the container, load balancer, or Traefik.

Do not `terraform apply` from a laptop. Applies stay in CI
([iac-apply.md](iac-apply.md)).

## What "deployed" means here

| Layer | On `main` today | Still required to run it |
| ----- | --------------- | ------------------------ |
| Git + CI | Tests, IaC validate, plan/apply, image build/push | GitHub secrets, a `production` reviewer, DOCR `aerodeck` |
| Remote state | `backend.hcl` + runbook | Spaces bucket `aerodeck-tfstate` with versioning |
| Network | Project + VPC module | First CI apply after secrets exist |
| Runtime | Droplet + Postgres + Redis in the VPC | Same CI apply; bills for compute and databases |
| Control plane | FastAPI image, Alembic `0007`, Celery worker, SHA-tagged DOCR image | Registry login on the Droplet, env vars, start the container |
| Jobs | Queue + `NoopProvisioner` | A provisioner that actually runs Terraform |
| Edge | Traefik HTTP snapshot, memory DNS, fake ACME | Traefik process, DigitalOcean domain + token, Let's Encrypt account |
| Sandboxes | Boot / TTL reap / host enroll APIs | KVM hosts with Firecracker; enroll them via the API |

Laptop/CI can exercise the API with the in-memory DNS, ACME, and hypervisor
fakes. That is not a production deploy.

## Operator checklist (in order)

Do these once. Tick them in this file or on the board as you go.

### 1–3. Account, state bucket, GitHub credentials

Procedure (click-by-click): [digitalocean-account.md](digitalocean-account.md).
Do **not** `terraform apply` from a laptop when this is done.

- [ ] DigitalOcean account exists; billing is enabled.
- [ ] Write API token stored as GitHub secret `DIGITALOCEAN_TOKEN`.
- [ ] Spaces bucket `aerodeck-tfstate` in `nyc3` with versioning
      ([terraform-state.md](terraform-state.md)).
- [ ] Spaces access key stored as `SPACES_ACCESS_KEY_ID` /
      `SPACES_SECRET_ACCESS_KEY`.
- [ ] Container Registry named `aerodeck` (or `DOCR_NAME` + matching
      `control_plane_image`).
- [ ] GitHub environments `dev`, `staging`, and `production` (prod has a
      reviewer; do not enable "prevent self review" on a solo account).
- [ ] **IaC plan and apply** run on `main` with Apply **unchecked**; plans
      succeed.

Without the account, plan/apply jobs skip and stay green. That is expected.
Saving secrets does not create Droplets.

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

### 5. Control-plane process (image published, not started)

CI builds `apps/control-plane` on pull requests and, on `main`, pushes
`<git sha>` and `main` to DigitalOcean Container Registry
([control-plane-image.md](control-plane-image.md)). Terraform writes that
reference to `/etc/aerodeck/control-plane-image` on the Droplet. It does
not log in or start the process. On `aerodeck-<env>-control`:

- [ ] `AERODECK_DATABASE_URL` from `terraform output postgres_private_uri`
      (`postgresql+asyncpg://…` on the private host).
- [ ] `AERODECK_REDIS_URL` from `terraform output redis_private_uri`.
- [ ] `alembic upgrade head` (expect `0007`).
- [ ] `AERODECK_AUTH_SIGNING_KEY` (≥ 32 random characters, unique per env).
- [ ] `AERODECK_AUTH_CLIENTS` with SHA-256 digests of client secrets — never
      the secrets themselves.
- [ ] `AERODECK_ENV=production` so `/docs` is off.
- [ ] `docker pull` the image in `/etc/aerodeck/control-plane-image` (registry
      login required on the Droplet).
- [ ] Start API and worker from that image
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

- Account bootstrap: [digitalocean-account.md](digitalocean-account.md)
- Local API: [control-plane.md](control-plane.md)
- State: [terraform-state.md](terraform-state.md)
- Apply: [iac-apply.md](iac-apply.md)
- Destroy: [iac-destroy.md](iac-destroy.md)
- Network: [platform-network.md](platform-network.md)
- Runtime: [platform-runtime.md](platform-runtime.md)
- Image: [control-plane-image.md](control-plane-image.md)
- Edge: [edge-routing.md](edge-routing.md)
- Sandboxes: [sandboxes.md](sandboxes.md)
