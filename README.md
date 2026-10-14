# AeroDeck

GitOps-driven infrastructure orchestration. The control plane is a FastAPI
service; the IaC engine provisions **DigitalOcean only**. Terraform state lives
in a DigitalOcean Spaces bucket. Applies run in CI, never from a laptop.

## Layout

```
apps/control-plane/     FastAPI API, Celery worker, Alembic migrations
packages/iac-engine/    Terraform root module (DigitalOcean + Spaces backend)
docs/runbooks/          How to run, recover, and operate the platform
.github/workflows/      Tests, IaC validate, issue board, AI PR review
```

## What to do next

Follow the runbooks; do not invent a parallel procedure.

1. **Operator, once:** create the `aerodeck-tfstate` Spaces bucket with
   versioning. Procedure: [docs/runbooks/terraform-state.md](docs/runbooks/terraform-state.md).
2. **Local API:** [docs/runbooks/control-plane.md](docs/runbooks/control-plane.md)
   (venv, `.env`, `alembic upgrade head`, uvicorn, Celery worker).
3. **Network:** [docs/runbooks/platform-network.md](docs/runbooks/platform-network.md)
   (project + private VPC per environment).
4. **Apply:** [docs/runbooks/iac-apply.md](docs/runbooks/iac-apply.md)
   (plan in Actions; apply only on main; prod needs approval).
5. **Board:** [docs/runbooks/issue-workflow.md](docs/runbooks/issue-workflow.md).

## Guardrails

- `.cursor/rules/fastapi-architecture.mdc` — Pydantic V2, async sessions,
  router → service → repository.
- `.cursor/rules/terraform-digitalocean.mdc` — DigitalOcean only, Spaces
  backend, no AWS/GCP modules.
- `.cursor/rules/pr-review-standards.mdc` — rubric for the AI PR reviewer.

## Status

Epic 1, #6 (Spaces state), and #7 (project + VPC) are on `main`. Applies run
from GitHub Actions only ([iac-apply.md](docs/runbooks/iac-apply.md)); they
stay skipped until DigitalOcean and Spaces secrets exist.
