#!/usr/bin/env bash
# Plan, apply, or destroy one environment from GitHub Actions.
# Apply and destroy are refused unless GITHUB_ACTIONS=true. Never pass
# -auto-approve; applying a stored plan file is already non-interactive.
set -euo pipefail

usage() {
  echo "usage: $0 plan|apply|destroy-plan|destroy-apply <dev|staging|prod>" >&2
  exit 2
}

CMD="${1:-}"
ENV_NAME="${2:-}"
case "${CMD}" in plan|apply|destroy-plan|destroy-apply) ;; *) usage ;; esac
case "${ENV_NAME}" in dev|staging|prod) ;; *) usage ;; esac

if [[ "${CMD}" == "apply" && "${GITHUB_ACTIONS:-}" != "true" ]]; then
  echo "Refusing terraform apply outside GitHub Actions. See docs/runbooks/iac-apply.md" >&2
  exit 1
fi

if [[ "${CMD}" == destroy-plan || "${CMD}" == destroy-apply ]]; then
  if [[ "${GITHUB_ACTIONS:-}" != "true" ]]; then
    echo "Refusing terraform destroy outside GitHub Actions. See docs/runbooks/iac-destroy.md" >&2
    exit 1
  fi
fi

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "${ROOT}"

PLANFILE="${ENV_NAME}.tfplan"
if [[ "${CMD}" == destroy-plan || "${CMD}" == destroy-apply ]]; then
  PLANFILE="${ENV_NAME}.destroy.tfplan"
fi
export TFVARS="envs/${ENV_NAME}.tfvars"
STATE_KEY="${ENV_NAME}/platform/terraform.tfstate"

export TF_IN_AUTOMATION=1
export TF_INPUT=0

# Optional operator SSH from GitHub variables (comma-separated, not committed).
# SSH_KEY_IDS=fingerprint-or-id  SSH_ALLOW_CIDRS=203.0.113.10/32
export_operator_ssh() {
  json_string_list() {
    python3 -c 'import json,sys; print(json.dumps([p.strip() for p in sys.argv[1].split(",") if p.strip()]))' "$1"
  }
  if [[ -n "${SSH_KEY_IDS:-}" ]]; then
    TF_VAR_ssh_key_ids="$(json_string_list "${SSH_KEY_IDS}")"
    export TF_VAR_ssh_key_ids
  fi
  if [[ -n "${SSH_ALLOW_CIDRS:-}" ]]; then
    TF_VAR_ssh_allow_cidrs="$(json_string_list "${SSH_ALLOW_CIDRS}")"
    export TF_VAR_ssh_allow_cidrs
  fi
}
export_operator_ssh

# prevent_destroy cannot be a variable. Destroy CI lifts it in this runner
# checkout only so smoke-test stacks can be torn down without a laptop destroy.
lift_prevent_destroy_in_runner() {
  echo "Destroy path: clearing prevent_destroy in the runner checkout (not committed)"
  find "${ROOT}" -path '*/.terraform/*' -prune -o -name '*.tf' -print \
    | while IFS= read -r f; do
        sed -i 's/prevent_destroy = true/prevent_destroy = false/g' "${f}"
      done
}

if [[ "${CMD}" == destroy-plan || "${CMD}" == destroy-apply ]]; then
  lift_prevent_destroy_in_runner
fi

terraform init -input=false \
  -backend-config=backend.hcl \
  -backend-config="key=${STATE_KEY}"

# Only destroy may drop a region-default VPC from state. Running that on
# plan/apply removed the live ams3 VPC and ForceNew-replaced Postgres.
if [[ "${CMD}" == destroy-plan || "${CMD}" == destroy-apply ]]; then
  python3 scripts/rehome_default_vpc.py
elif [[ "${GITHUB_EVENT_NAME:-}" != "pull_request" ]]; then
  python3 scripts/import_missing_vpc.py
fi

if [[ "${CMD}" == "plan" ]]; then
  terraform plan -input=false -var-file="${TFVARS}" -out="${PLANFILE}"
  terraform show -no-color "${PLANFILE}"
  exit 0
fi

if [[ "${CMD}" == "destroy-plan" ]]; then
  terraform plan -destroy -input=false -var-file="${TFVARS}" -out="${PLANFILE}"
  terraform show -no-color "${PLANFILE}"
  exit 0
fi

if [[ ! -f "${PLANFILE}" ]] && [[ ! -f .rehome-vpc-dropped ]]; then
  echo "missing stored plan ${PLANFILE}; plan in CI and download the artefact first" >&2
  exit 1
fi

if [[ -f .rehome-vpc-dropped ]]; then
  echo "Default VPC was dropped from state; re-planning so apply does not DELETE it"
  if [[ "${CMD}" == "destroy-apply" ]]; then
    terraform plan -destroy -input=false -var-file="${TFVARS}" -out="${PLANFILE}"
  else
    terraform plan -input=false -var-file="${TFVARS}" -out="${PLANFILE}"
  fi
fi

if [[ ! -f "${PLANFILE}" ]]; then
  echo "missing stored plan ${PLANFILE}; plan in CI and download the artefact first" >&2
  exit 1
fi

# Prod and non-prod both apply the stored plan (create or destroy).
# Do not add -auto-approve.
terraform apply -input=false "${PLANFILE}"
