#!/usr/bin/env bash
# Plan or apply one environment from GitHub Actions.
# Applies are refused unless GITHUB_ACTIONS=true. Never pass -auto-approve;
# applying a stored plan file is already non-interactive.
set -euo pipefail

usage() {
  echo "usage: $0 plan|apply <dev|staging|prod>" >&2
  exit 2
}

CMD="${1:-}"
ENV_NAME="${2:-}"
case "${CMD}" in plan|apply) ;; *) usage ;; esac
case "${ENV_NAME}" in dev|staging|prod) ;; *) usage ;; esac

if [[ "${CMD}" == "apply" && "${GITHUB_ACTIONS:-}" != "true" ]]; then
  echo "Refusing terraform apply outside GitHub Actions. See docs/runbooks/iac-apply.md" >&2
  exit 1
fi

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "${ROOT}"

PLANFILE="${ENV_NAME}.tfplan"
TFVARS="envs/${ENV_NAME}.tfvars"
STATE_KEY="${ENV_NAME}/platform/terraform.tfstate"

export TF_IN_AUTOMATION=1
export TF_INPUT=0

terraform init -input=false \
  -backend-config=backend.hcl \
  -backend-config="key=${STATE_KEY}"

if [[ "${CMD}" == "plan" ]]; then
  terraform plan -input=false -var-file="${TFVARS}" -out="${PLANFILE}"
  terraform show -no-color "${PLANFILE}"
  exit 0
fi

if [[ ! -f "${PLANFILE}" ]]; then
  echo "missing stored plan ${PLANFILE}; plan in CI and download the artefact first" >&2
  exit 1
fi

# Prod and non-prod both apply the stored plan. Do not add -auto-approve.
terraform apply -input=false "${PLANFILE}"
