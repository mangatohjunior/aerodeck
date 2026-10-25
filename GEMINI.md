# AeroDeck — Workspace Guardrails (Gemini / Antigravity)

AeroDeck is a GitOps-driven infrastructure orchestration platform. The control plane is a FastAPI service; the operator UI is a Next.js App Router console; the IaC engine provisions **DigitalOcean only** with Terraform state stored in DigitalOcean Spaces (`aerodeck-tfstate`). Applies run in CI, never from a laptop.

## Repository Layout

- `apps/control-plane/` — FastAPI API, Celery worker, Alembic migrations (`apps/control-plane/GEMINI.md`)
- `apps/dashboard/` — Next.js operator UI (`apps/dashboard/GEMINI.md`)
- `packages/iac-engine/` — Terraform root module and tenant stack (`packages/iac-engine/GEMINI.md`)
- `docs/runbooks/` — Operational procedures (always follow runbooks rather than inventing parallel procedures)
- `.github/workflows/` — Tests, IaC validation/plan/apply, issue status automation, and Gemini AI PR review
- `.cursor/rules/` — Legacy Cursor rule files kept in sync with `GEMINI.md` for backward compatibility

## Issue & Pull Request Workflow

Follow `docs/runbooks/issue-workflow.md`:

1. Every Story belongs to an Epic and uses `.github/ISSUE_TEMPLATE/story.md`.
2. Start work from `main` on a feature branch named `feat/<n>-short-slug` (or `fix/<n>-short-slug` / `docs/<n>-short-slug`).
3. Assign the issue and move its label to `status: in-progress`.
4. Open the pull request with `Closes #<n>` in the PR body/title so `.github/workflows/issue-workflow.yml` transitions the issue to `status: in-review` on open and `status: done` on merge.

## Component Guardrails

- **Control Plane (`apps/control-plane/`):** See `apps/control-plane/GEMINI.md` (and `.cursor/rules/fastapi-architecture.mdc`).
- **Operator Dashboard (`apps/dashboard/`):** See `apps/dashboard/GEMINI.md` (and `.cursor/rules/nextjs-dashboard.mdc`).
- **Terraform IaC (`packages/iac-engine/`):** See `packages/iac-engine/GEMINI.md` (and `.cursor/rules/terraform-digitalocean.mdc`).

## AeroDeck PR Review Standards

This rubric (mirrored from `.cursor/rules/pr-review-standards.mdc`) is the single source of truth for automated (`.github/workflows/ai-pr-review.yml`) and human code review.

Severity scale:

- **BLOCKER** — must be fixed before merge (security, data loss, broken contract, forbidden provider).
- **MAJOR** — should be fixed before merge unless the author justifies it in the PR.
- **MINOR** — style/maintainability; fix now or in a follow-up.
- **NIT** — optional polish.

### 1. Scope & change hygiene

- The diff does one thing. Unrelated refactors, formatting churn, or drive-by changes → MAJOR; ask to split.
- PR description references an Issue (`Closes #123`) created from `.github/ISSUE_TEMPLATE/`. Missing link → MINOR.
- No commented-out code, debug prints, `TODO` without an issue reference, or leftover `breakpoint()` → MINOR (MAJOR if shipped to a runtime path).
- Generated files, lockfiles, and vendored code are changed only together with their source.

### 2. SOLID principles

- **S — Single Responsibility:** a module/class/function has one reason to change. Routers that contain business logic, or services that format HTTP responses → MAJOR.
- **O — Open/Closed:** extend behaviour via new classes, strategies, or registrations rather than editing `if/elif` chains on type flags → MINOR (MAJOR if the chain is in a hot path or already > 3 branches).
- **L — Liskov Substitution:** subclasses/implementations must honour the base contract (no narrowed input types, no `NotImplementedError` in required methods) → MAJOR.
- **I — Interface Segregation:** dependencies accept the narrowest protocol they need (`typing.Protocol`, ABCs), not god-objects → MINOR.
- **D — Dependency Inversion:** high-level code depends on abstractions injected via FastAPI `Depends` or constructor args, never on concrete clients instantiated inline → MAJOR.

### 3. DRY & maintainability

- Duplicated logic (≥ ~5 semantically identical lines, or the same validation/mapping in two places) → MAJOR; propose the shared helper and where it should live.
- Magic numbers/strings used more than once must be named constants or settings → MINOR.
- Functions > ~50 lines or > 5 parameters → MINOR; suggest decomposition or a parameter object.
- Public functions/classes have type hints on all parameters and return values → MINOR.
- Naming follows the project conventions (`snake_case` Python, `kebab-case` resource names, `aerodeck-<env>-<component>` in Terraform) → NIT.

### 4. Security checks (default to BLOCKER)

- Hard-coded secrets, tokens, API keys, private keys, connection strings, or `.env` contents committed → BLOCKER.
- Injection surfaces: string-built SQL (`f"SELECT ... {x}"`), `shell=True` / string-built shell commands, `eval`/`exec`, unsafe `yaml.load`, `pickle` on untrusted input → BLOCKER.
- Authentication/authorization bypass: new endpoint without the auth dependency when siblings have it; object access without ownership/tenant check → BLOCKER.
- Logging sensitive data (passwords, tokens, PII, full request bodies) → MAJOR.
- Unbounded input: missing `max_length`/`le` constraints on user-supplied fields; file uploads without size/type limits → MAJOR.
- Insecure defaults: `allow_origins=["*"]`, `verify=False`, `debug=True`, HTTP (not HTTPS) endpoints for external calls → MAJOR (BLOCKER in production config).
- Dependency changes: new runtime dependency without an upper-bound pin, or a dependency with known critical CVEs → MAJOR.
- Dockerfiles: running as root, `latest` base tags, secrets passed via `ARG`/`ENV`, missing `HEALTHCHECK` → MAJOR.
- GitHub Actions: unpinned third-party actions (not SHA-pinned), overly broad `permissions:`, `pull_request_target` with checkout of the PR head → MAJOR (BLOCKER if secrets are exposed to fork code).

### 5. FastAPI / Python specifics

Apply `apps/control-plane/GEMINI.md` (`.cursor/rules/fastapi-architecture.mdc`) in full.

### 6. Terraform / IaC specifics

Apply `packages/iac-engine/GEMINI.md` (`.cursor/rules/terraform-digitalocean.mdc`) in full.

### 7. Next.js / dashboard specifics

Apply `apps/dashboard/GEMINI.md` (`.cursor/rules/nextjs-dashboard.mdc`) in full.

### 8. Tests & observability

- Behaviour changes ship with tests (new route → new test module; bug fix → regression test). Missing tests → MAJOR.
- Tests assert behaviour, not implementation details; no network calls or real cloud resources in unit tests → MINOR.
- New external calls or background jobs have structured log lines and error handling that preserves the stack (`raise ... from e`) → MINOR.
- Swallowed exceptions (`except Exception: pass`) → MAJOR.
