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

echo
echo "Backlog ready in ${REPO}:"
echo "  Epic #${EPIC1}  stories #${S1_1} #${S1_2} #${S1_3}"
echo "  Epic #${EPIC2}  stories #${S2_1} #${S2_2} #${S2_3}"
echo "  Epic #${EPIC3}  stories #${S3_1} #${S3_2} #${S3_3}"
echo "  Epic #${EPIC4}  stories #${S4_1} #${S4_2} #${S4_3}"
