#!/usr/bin/env bash
# AeroDeck — create the Epic/Story backlog in the current GitHub repository.
#
# Usage (from anywhere; the script cds to the repo root):
#   gh auth login
#   bash scripts/setup_github_backlog.sh
#
# Re-running is safe: existing issues with the same title are reused, and each
# Epic body is rewritten so its story checklist stays accurate.
#
# Requires: GitHub CLI (gh) authenticated against a repo with Issues enabled.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT}"

if ! command -v gh >/dev/null 2>&1; then
  echo "error: GitHub CLI (gh) is not installed. See https://cli.github.com/" >&2
  exit 1
fi

echo "Checking GitHub CLI authentication..."
gh auth status

REPO="$(gh repo view --json nameWithOwner --jq .nameWithOwner)"
echo "Target repository: ${REPO}"

# --------------------------------------------------------------------------- #
# Taxonomy labels. Hex colors have no leading '#'. --force updates existing.
# --------------------------------------------------------------------------- #

create_label() {
  local name="$1"
  local color="$2"
  local description="$3"
  gh label create "${name}" \
    --color "${color}" \
    --description "${description}" \
    --force >/dev/null
  echo "label: ${name}"
}

create_label "type: epic"  "6B46C1" "Large capability, broken down into user stories"
create_label "type: story" "3182CE" "Independently shippable increment of value"
create_label "type: task"  "A0AEC0" "Implementation task under a story"
create_label "type: bug"   "E53E3E" "Defect against existing behaviour"

# --------------------------------------------------------------------------- #
# Issue helpers. Numbers are parsed from the URL gh prints on create.
# --------------------------------------------------------------------------- #

find_issue_number() {
  local title="$1"
  # shellcheck disable=SC2016  # jq program is evaluated by gh, not the shell
  gh issue list \
    --state all \
    --limit 20 \
    --search "in:title \"${title}\"" \
    --json number,title \
    --jq "[.[] | select(.title == \"${title}\")][0].number // \"\""
}

ensure_issue() {
  local title="$1"
  local label="$2"
  local body="$3"
  local number url

  number="$(find_issue_number "${title}")"
  if [[ -z "${number}" ]]; then
    url="$(gh issue create --title "${title}" --label "${label}" --body "${body}")"
    number="$(basename "${url}")"
    echo "created #${number}  ${title}" >&2
  else
    echo "exists  #${number}  ${title}" >&2
  fi
  printf '%s' "${number}"
}

# Replace the Epic body with its description plus a native task-list of stories.
# GitHub tracks checklist progress on the parent issue.
link_epic() {
  local epic_number="$1"
  local description="$2"
  shift 2

  local checklist="" story
  for story in "$@"; do
    checklist+="- [ ] #${story}"$'\n'
  done

  gh issue edit "${epic_number}" --body "$(cat <<EOF
${description}

## Scope & User Stories

${checklist}
EOF
)" >/dev/null
  echo "linked  #${epic_number}  stories: $*"
}

# --------------------------------------------------------------------------- #
# Epic 1 — Control Plane Fundamentals
# --------------------------------------------------------------------------- #

EPIC1_BODY="$(cat <<'EOF'
Stand up the AeroDeck control plane: a FastAPI service that authenticates callers, persists platform state through async SQLAlchemy, and hands long-running work to Celery workers backed by Redis.

In scope: application factory, Pydantic V2 schemas, async session dependency injection, token auth, and the Celery/Redis worker process.
Out of scope: cloud resource provisioning (Epic 2) and edge routing (Epic 3).
EOF
)"

EPIC1="$(ensure_issue "[EPIC] Control Plane Fundamentals" "type: epic" "${EPIC1_BODY}")"

S1_1="$(ensure_issue "[STORY] Authenticate control-plane requests" "type: story" "$(cat <<'EOF'
As a platform engineer, I want every mutating control-plane request to require a short-lived signed token so that only enrolled clients can change platform state.
EOF
)")"

S1_2="$(ensure_issue "[STORY] Persist platform state with async SQLAlchemy" "type: story" "$(cat <<'EOF'
As a platform engineer, I want projects and environments stored through an async SQLAlchemy session so that the API keeps its state across restarts without blocking the event loop.
EOF
)")"

S1_3="$(ensure_issue "[STORY] Dispatch long-running work to Celery via Redis" "type: story" "$(cat <<'EOF'
As an SRE, I want provisioning and reconciliation jobs dispatched to Celery with Redis as the broker so that HTTP requests stay short and failed jobs retry on their own.
EOF
)")"

link_epic "${EPIC1}" "${EPIC1_BODY}" "${S1_1}" "${S1_2}" "${S1_3}"

# --------------------------------------------------------------------------- #
# Epic 2 — Infrastructure as Code Engine
# --------------------------------------------------------------------------- #

EPIC2_BODY="$(cat <<'EOF'
Wrap DigitalOcean in a Terraform root module under packages/iac-engine. State lives in a DigitalOcean Spaces bucket via the S3-compatible backend. Applies run in CI, never from a laptop.

In scope: provider pin, partial S3 backend, per-environment project and VPC, variable validation.
Out of scope: any non-DigitalOcean cloud provider, and AWS or GCP registry modules.
EOF
)"

EPIC2="$(ensure_issue "[EPIC] Infrastructure as Code Engine" "type: epic" "${EPIC2_BODY}")"

S2_1="$(ensure_issue "[STORY] Store Terraform state in DigitalOcean Spaces" "type: story" "$(cat <<'EOF'
As a platform engineer, I want each environment's Terraform state in a DigitalOcean Spaces bucket so that plans are shared, locked, and never committed to git.
EOF
)")"

S2_2="$(ensure_issue "[STORY] Provision a project and private VPC per environment" "type: story" "$(cat <<'EOF'
As a platform engineer, I want a DigitalOcean project and a private VPC created for each environment so that workloads never land in the default network.
EOF
)")"

S2_3="$(ensure_issue "[STORY] Apply infrastructure only from CI" "type: story" "$(cat <<'EOF'
As an SRE, I want terraform plan to run in CI and production applies to require a stored plan plus a manual approval so that shared state is never applied from a laptop.
EOF
)")"

link_epic "${EPIC2}" "${EPIC2_BODY}" "${S2_1}" "${S2_2}" "${S2_3}"

# --------------------------------------------------------------------------- #
# Epic 3 — Edge Routing & SSL Automation
# --------------------------------------------------------------------------- #

EPIC3_BODY="$(cat <<'EOF'
Publish application hostnames through Traefik and keep their DNS records and TLS certificates in sync with the control plane, using the DNS provider's API for issuance and renewal.

In scope: route declarations, Traefik configuration, DNS record lifecycle, automatic certificate issue and renew.
Out of scope: the sandbox microVM runtime (Epic 4).
EOF
)"

EPIC3="$(ensure_issue "[EPIC] Edge Routing & SSL Automation" "type: epic" "${EPIC3_BODY}")"

S3_1="$(ensure_issue "[STORY] Route a hostname through Traefik" "type: story" "$(cat <<'EOF'
As an application developer, I want a declared hostname routed through Traefik to my service so that traffic arrives without hand-written proxy configuration.
EOF
)")"

S3_2="$(ensure_issue "[STORY] Issue and renew TLS certificates from DNS" "type: story" "$(cat <<'EOF'
As an application developer, I want a certificate issued and renewed through the DNS API when I publish a route so that HTTPS works without a platform ticket.
EOF
)")"

S3_3="$(ensure_issue "[STORY] Create and remove DNS records with the route" "type: story" "$(cat <<'EOF'
As a platform engineer, I want the control plane to create and delete the DNS record for a route so that hostnames stay aligned with what Git declares.
EOF
)")"

link_epic "${EPIC3}" "${EPIC3_BODY}" "${S3_1}" "${S3_2}" "${S3_3}"

# --------------------------------------------------------------------------- #
# Epic 4 — Ephemeral Sandbox Engine
# --------------------------------------------------------------------------- #

EPIC4_BODY="$(cat <<'EOF'
Run untrusted, short-lived workloads as Firecracker microVMs on a Hetzner bare-metal pool, started and destroyed through an API the control plane calls.

In scope: host registration, microVM create/destroy, and a TTL that returns capacity when a sandbox expires.
Out of scope: DigitalOcean platform infrastructure (Epic 2). This runtime is bare metal because Firecracker needs KVM; an ADR is required before any Terraform for it lands, and it must not introduce a second cloud provider into packages/iac-engine.
EOF
)"

EPIC4="$(ensure_issue "[EPIC] Ephemeral Sandbox Engine" "type: epic" "${EPIC4_BODY}")"

S4_1="$(ensure_issue "[STORY] Start a Firecracker microVM for a sandbox" "type: story" "$(cat <<'EOF'
As an application developer, I want a sandbox API call to boot a Firecracker microVM from a declared image so that I can exercise a change in isolation.
EOF
)")"

S4_2="$(ensure_issue "[STORY] Destroy sandboxes when their TTL expires" "type: story" "$(cat <<'EOF'
As an SRE, I want a sandbox torn down when its TTL elapses so that bare-metal capacity returns to the pool without a manual cleanup.
EOF
)")"

S4_3="$(ensure_issue "[STORY] Register sandbox hosts from the bare-metal pool" "type: story" "$(cat <<'EOF'
As a platform engineer, I want Hetzner bare-metal hosts enrolled as sandbox hypervisors so that untrusted microVMs never share the control-plane network.
EOF
)")"

link_epic "${EPIC4}" "${EPIC4_BODY}" "${S4_1}" "${S4_2}" "${S4_3}"

# --------------------------------------------------------------------------- #
# Epic 5 — Production runtime & hardening
# --------------------------------------------------------------------------- #

EPIC5_BODY="$(cat <<'EOF'
Stand up the missing production runtime: compute, data stores, a published image, a real edge, and the operational loops the first four epics left to the operator.

In scope: DigitalOcean compute + Postgres + Redis in the environment VPC, image publish from CI, wiring the worker to the IaC engine, Traefik with real DNS and Let's Encrypt, authenticated reads, scheduled sandbox reap, private-key handling, metrics/alerts, and API-database backups.
Out of scope: a second cloud provider (no Hetzner/AWS/GCP in packages/iac-engine). Sandbox KVM hosts stay API-enrolled (ADR 0001). Laptop applies stay forbidden.
EOF
)"

EPIC5="$(ensure_issue "[EPIC] Production runtime & hardening" "type: epic" "${EPIC5_BODY}")"

S5_1="$(ensure_issue "[STORY] Provision compute, Postgres, and Redis in the environment VPC" "type: story" "$(cat <<'EOF'
As a platform engineer, I want a Droplet (or App Platform service), managed PostgreSQL, and Redis created in each environment VPC so that the control plane has a place to run without a hand-built box.
EOF
)")"

S5_2="$(ensure_issue "[STORY] Publish the control-plane image from CI" "type: story" "$(cat <<'EOF'
As an SRE, I want apps/control-plane built and pushed on main, tagged by git SHA, so that the environment runtime pulls an immutable image instead of a laptop docker build.
EOF
)")"

S5_3="$(ensure_issue "[STORY] Run environment provision jobs through the IaC engine" "type: story" "$(cat <<'EOF'
As an SRE, I want POST /api/v1/projects/{id}/environments/{id}/provision to run the IaC engine from the worker so that environment jobs change real infrastructure instead of reporting changed: false.
EOF
)")"

S5_4="$(ensure_issue "[STORY] Run Traefik in the VPC with real DNS and Let's Encrypt" "type: story" "$(cat <<'EOF'
As an application developer, I want Traefik running in the environment VPC with DigitalOcean DNS and Let's Encrypt so that published hostnames terminate real HTTPS without the fake ACME issuer.
EOF
)")"

S5_5="$(ensure_issue "[STORY] Require a token on control-plane reads" "type: story" "$(cat <<'EOF'
As a platform engineer, I want GET of projects, routes, sandboxes, and related resources to require a token so that the API is safe to put on the internet.
EOF
)")"

S5_6="$(ensure_issue "[STORY] Reap expired sandboxes on a schedule" "type: story" "$(cat <<'EOF'
As an SRE, I want expired sandboxes torn down on a schedule so that hypervisor capacity returns without someone calling POST /sandboxes/reap-expired.
EOF
)")"

S5_7="$(ensure_issue "[STORY] Keep certificate private keys off the API database" "type: story" "$(cat <<'EOF'
As a platform engineer, I want TLS private keys stored where Traefik can read them, not in the control-plane database, so that a database dump does not leak every issued key.
EOF
)")"

S5_8="$(ensure_issue "[STORY] Emit metrics and alerts for readiness, applies, and reaps" "type: story" "$(cat <<'EOF'
As an SRE, I want metrics and alerts on /readyz, IaC apply failures, and sandbox reap errors so that a silent outage is visible without tailing container logs.
EOF
)")"

S5_9="$(ensure_issue "[STORY] Back up the control-plane database" "type: story" "$(cat <<'EOF'
As an SRE, I want a versioned backup of the control-plane PostgreSQL database so that API state can be restored the same way Terraform state is restored from Spaces.
EOF
)")"

link_epic "${EPIC5}" "${EPIC5_BODY}" "${S5_1}" "${S5_2}" "${S5_3}" "${S5_4}" "${S5_5}" "${S5_6}" "${S5_7}" "${S5_8}" "${S5_9}"

# --------------------------------------------------------------------------- #
# Epic 6 — User Dashboard (foundational operator UI)
# --------------------------------------------------------------------------- #

EPIC6_BODY="$(cat <<'EOF'
Give operators a Next.js App Router console: a GitHub URL deploy form, a deployment-status view, and a live log terminal. The UI is mock-first — it simulates the create-deployment POST and SSE stream before FastAPI is wired.

In scope: apps/dashboard shell (sidebar + main), shadcn/ui form, mock POST, Terminal that paces fake SSE lines, later a typed client against GET /api/v1/deployments/{id}/logs.
Out of scope: putting DigitalOcean tokens in the browser; calling FastAPI from the client until a Story replaces the mock; a second cloud provider.
EOF
)"

EPIC6="$(ensure_issue "[EPIC] User Dashboard" "type: epic" "${EPIC6_BODY}")"

S6_1="$(ensure_issue "[STORY] Collect a GitHub URL and start a mocked deploy" "type: story" "$(cat <<'EOF'
As an application developer, I want to paste a GitHub repository URL and click Deploy so that the console accepts the repo and transitions to a deployment-status view without calling FastAPI yet.
EOF
)")"

S6_2="$(ensure_issue "[STORY] Stream fake provisioner logs in a terminal" "type: story" "$(cat <<'EOF'
As an application developer, I want a black, monospace terminal that slowly prints mock SSE lines (Initializing Terraform..., Provisioning K3s..., Done) so that I can see deploy progress before the control-plane stream exists.
EOF
)")"

S6_3="$(ensure_issue "[STORY] Wire the dashboard terminal to control-plane SSE" "type: story" "$(cat <<'EOF'
As an application developer, I want the terminal to consume GET /api/v1/deployments/{id}/logs as text/event-stream so that the same UI shows real worker output once the mock client is replaced.
EOF
)")"

link_epic "${EPIC6}" "${EPIC6_BODY}" "${S6_1}" "${S6_2}" "${S6_3}"

echo
echo "Backlog ready in ${REPO}:"
echo "  Epic #${EPIC1}  stories #${S1_1} #${S1_2} #${S1_3}"
echo "  Epic #${EPIC2}  stories #${S2_1} #${S2_2} #${S2_3}"
echo "  Epic #${EPIC3}  stories #${S3_1} #${S3_2} #${S3_3}"
echo "  Epic #${EPIC4}  stories #${S4_1} #${S4_2} #${S4_3}"
echo "  Epic #${EPIC5}  stories #${S5_1} #${S5_2} #${S5_3} #${S5_4} #${S5_5} #${S5_6} #${S5_7} #${S5_8} #${S5_9}"
echo "  Epic #${EPIC6}  stories #${S6_1} #${S6_2} #${S6_3}"
