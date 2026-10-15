# Dashboard mock API

Exercise the operator console locally **without** FastAPI, Redis, Postgres, or
DigitalOcean. The Next.js app serves a same-origin stand-in at
`/api/mock/v1`. State is in process memory and resets when `next dev` restarts.

Do not point the browser at `http://127.0.0.1:8000`. That is the real control
plane and is out of scope for this runbook.

## Start the console

```bash
cd apps/dashboard
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). You should see the
Overview cards (2 projects, 1 running sandbox, 0 deployments).

Public marketing pages do **not** use the operator sidebar:

| Path | What it is |
| ---- | ---------- |
| `/about` | Static About copy (GitOps, DigitalOcean, Firecracker). Header + footer only. |
| `/policy` | Static Privacy and Acceptable use. Header + footer Policy links land here. |
| `/register` | Email/password form. Success → `/login?registered=1` (no session cookie). |
| `/login` | Landing for that redirect. Sign-in POST is story #52. |

## Mock contract

| Method | Path | What it does |
| ------ | ---- | ------------ |
| GET | `/api/mock/v1/healthz` | Liveness for the mock layer (`mode: mock`). |
| GET | `/api/mock/v1/projects` | Seeded projects (`payments`, `platform`). |
| GET | `/api/mock/v1/sandboxes` | Seeded Firecracker rows (not real VMs). |
| GET | `/api/mock/v1/deployments` | Deployments created this process. |
| POST | `/api/mock/v1/deployments` | Body `{ "repo_url": "https://github.com/org/repo" }`. `201` + deployment. |
| POST | `/api/mock/v1/auth/register` | Body `{ "email", "password" }`. `201` `{ id, email, created_at }`. Duplicate → `409 email_taken`. Weak password → `400 weak_password`. |
| GET | `/api/mock/v1/deployments/{id}` | One deployment, or `404`. |
| GET | `/api/mock/v1/deployments/{id}/logs` | `text/event-stream`. Lines include `Initializing Terraform...`, `Provisioning K3s...`, `Done`. |

Errors use `{ "detail": string, "code": string }` (same shape as the control plane).

## Curl checks

From another terminal, with the dashboard still running:

```bash
curl -s http://localhost:3000/api/mock/v1/healthz
curl -s http://localhost:3000/api/mock/v1/projects
curl -s http://localhost:3000/api/mock/v1/sandboxes

# Invalid URL → 400 invalid_github_url
curl -s -o /tmp/mock-bad.json -w "%{http_code}" \
  -H "content-type: application/json" \
  -d "{\"repo_url\":\"https://example.com/not-github\"}" \
  http://localhost:3000/api/mock/v1/deployments

# Valid deploy → 201
curl -s -X POST \
  -H "content-type: application/json" \
  -d "{\"repo_url\":\"https://github.com/mangatohjunior/aerodeck\"}" \
  http://localhost:3000/api/mock/v1/deployments
```

Copy the `id` from the last response, then stream logs (wait ~8s):

```bash
curl -N http://localhost:3000/api/mock/v1/deployments/<id>/logs
```

You should see `data: Initializing Terraform...`, `data: Provisioning K3s...`,
and `data: Done`.

PowerShell equivalent for the POST:

```powershell
Invoke-RestMethod -Method Post -ContentType "application/json" `
  -Body '{"repo_url":"https://github.com/mangatohjunior/aerodeck"}' `
  -Uri http://localhost:3000/api/mock/v1/deployments
```

Register (password is never returned; users reset when `next dev` restarts):

```bash
# Valid → 201 { id, email, created_at }
curl -s -X POST \
  -H "content-type: application/json" \
  -d "{\"email\":\"dev@example.com\",\"password\":\"long-enough\"}" \
  http://localhost:3000/api/mock/v1/auth/register

# Duplicate → 409 email_taken
curl -s -X POST \
  -H "content-type: application/json" \
  -d "{\"email\":\"dev@example.com\",\"password\":\"long-enough\"}" \
  http://localhost:3000/api/mock/v1/auth/register

# Weak → 400 weak_password
curl -s -X POST \
  -H "content-type: application/json" \
  -d "{\"email\":\"other@example.com\",\"password\":\"short\"}" \
  http://localhost:3000/api/mock/v1/auth/register
```

```powershell
Invoke-RestMethod -Method Post -ContentType "application/json" `
  -Body '{"email":"dev@example.com","password":"long-enough"}' `
  -Uri http://localhost:3000/api/mock/v1/auth/register
```

Decision: a 201 does **not** sign the browser in. The UI redirects to
`/login?registered=1`. No `localStorage` token. Session cookies are story #52.

## Browser checks

1. Overview — three stat cards populate from GET projects / sandboxes / deployments.
2. Projects / Sandboxes — seeded rows render.
3. Deploy — submit `https://example.com/x` and stay on the form with a validation error.
4. Deploy — submit `https://github.com/mangatohjunior/aerodeck`. The UI navigates to `/deployments/{id}`.
5. Status — the terminal prints SSE lines, then the badge becomes Succeeded.
6. Deployments — the new row is listed. Refresh keeps it until the Next.js process restarts.
7. Narrow viewport — hamburger opens the sidebar; a nav link closes it.
8. About — open [http://localhost:3000/about](http://localhost:3000/about). There is no Overview / Deploy / Sandboxes sidebar. The header About link stays on `/about`. Narrow viewport: hamburger opens the public nav and About is in it.
9. Policy — open [http://localhost:3000/policy](http://localhost:3000/policy). Privacy and Acceptable use sections are present. Header and footer Policy links land on `/policy`. No analytics pixels; no FastAPI.
10. Register — open [http://localhost:3000/register](http://localhost:3000/register). Mismatched or short passwords stay on the form (no POST). A valid submit lands on `/login?registered=1`. Duplicate email shows `That email is already registered.` Login, About, and Policy links work. Password fields are `type=password`.

## What this is not

- Not FastAPI. Replacing `/api/mock/v1` with `http://127.0.0.1:8000/api/v1` is a later Story (#46 is the runbook; the FastAPI wire-up is still Epic #43 follow-on / existing Story on User Dashboard).
- Not Terraform. Log lines are theatre.
- Not durable. Do not treat the in-memory list as a database.
