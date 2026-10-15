# AeroDeck

GitOps-driven infrastructure orchestration. The control plane is a FastAPI
service; the IaC engine provisions **DigitalOcean only**. Terraform state lives
in a DigitalOcean Spaces bucket. Applies run in CI, never from a laptop.

## Layout

```
apps/control-plane/     FastAPI API, Celery worker, Alembic migrations
apps/dashboard/         Next.js operator UI (TypeScript, App Router, Tailwind)
packages/iac-engine/    Terraform root module (DigitalOcean + Spaces backend)
docs/runbooks/          How to run, recover, and operate the platform
.github/workflows/      Tests, IaC validate, issue board, AI PR review
```

## What to do next

Follow the runbooks; do not invent a parallel procedure.

Stories #1–#16 are on `main`. The backlog is empty; the platform is not
deployed until an operator finishes
[docs/runbooks/deploy.md](docs/runbooks/deploy.md).

1. **Deploy (operator):** [docs/runbooks/deploy.md](docs/runbooks/deploy.md)
   — DigitalOcean account, Spaces bucket, GitHub secrets, first apply
   (project + VPC only), then the control-plane runtime that Terraform
   does not create yet.
2. **Local API:** [docs/runbooks/control-plane.md](docs/runbooks/control-plane.md)
   (venv, `.env`, `alembic upgrade head`, uvicorn, Celery worker).
   Traefik routes: [docs/runbooks/edge-routing.md](docs/runbooks/edge-routing.md).
   Sandboxes: [docs/runbooks/sandboxes.md](docs/runbooks/sandboxes.md).
3. **Dashboard (local mock):** [dashboard-mock.md](docs/runbooks/dashboard-mock.md)
   — `cd apps/dashboard && npm install && npm run dev`, then curl
   `/api/mock/v1`. Does not need FastAPI.
4. **Network / apply detail:** [platform-network.md](docs/runbooks/platform-network.md),
   [iac-apply.md](docs/runbooks/iac-apply.md).
5. **Board:** [docs/runbooks/issue-workflow.md](docs/runbooks/issue-workflow.md).

## Guardrails

- `.cursor/rules/fastapi-architecture.mdc` — Pydantic V2, async sessions,
  Celery/Redis, SSE logs, router → service → repository.
- `.cursor/rules/nextjs-dashboard.mdc` — App Router, shadcn/ui, mock-first UI.
- `.cursor/rules/terraform-digitalocean.mdc` — DigitalOcean only, Spaces
  backend, no AWS/GCP modules.
- `.cursor/rules/pr-review-standards.mdc` — rubric for the AI PR reviewer.

## Status

Stories #1–#16 are on `main`. Production gaps are Epic
[#31](https://github.com/mangatohjunior/aerodeck/issues/31)
([docs/runbooks/deploy.md](docs/runbooks/deploy.md)). IaC plan/apply
**skips** until DigitalOcean and Spaces secrets exist.
