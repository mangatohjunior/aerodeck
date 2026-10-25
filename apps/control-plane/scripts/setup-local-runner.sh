#!/usr/bin/env bash
# Register (or update) this operator machine as a GitHub Actions self-hosted
# runner for AeroDeck and set DEPLOY_DASHBOARD_SELF_HOSTED=true +
# CONTROL_DROPLET_HOST on the repository.
#
#   bash apps/control-plane/scripts/setup-local-runner.sh <control-public-ipv4>
set -euo pipefail

CONTROL_HOST="${1:-${CONTROL_DROPLET_HOST:-}}"
if [[ -z "${CONTROL_HOST}" ]]; then
  echo "usage: $0 <control-droplet-public-ipv4>" >&2
  exit 2
fi

REPO="${AERODECK_GITHUB_REPO:-mangatohjunior/aerodeck}"
LATEST_VERSION="$(gh api repos/actions/runner/releases/latest --jq '.tag_name | ltrimstr("v")' 2>/dev/null || true)"
RUNNER_VERSION="${AERODECK_RUNNER_VERSION:-${LATEST_VERSION:-2.338.0}}"
RUNNER_DIR="${AERODECK_RUNNER_DIR:-$HOME/actions-runner-aerodeck}"
RUNNER_NAME="${AERODECK_RUNNER_NAME:-aerodeck-local}"

echo "setting GitHub Actions variables on ${REPO}"
gh variable set CONTROL_DROPLET_HOST --repo "${REPO}" --body "${CONTROL_HOST}"
gh variable set DEPLOY_DASHBOARD_SELF_HOSTED --repo "${REPO}" --body "true"

mkdir -p "${RUNNER_DIR}"
cd "${RUNNER_DIR}"

uname_s="$(uname -s)"
case "${uname_s}" in
  MINGW*|MSYS*|CYGWIN*|Windows_NT)
    RUNNER_OS="win"
    ARCHIVE="actions-runner-win-x64-${RUNNER_VERSION}.zip"
    CONFIG_CMD="./config.cmd"
    RUN_CMD="./run.cmd"
    ;;
  *)
    RUNNER_OS="linux"
    ARCHIVE="actions-runner-linux-x64-${RUNNER_VERSION}.tar.gz"
    CONFIG_CMD="./config.sh"
    RUN_CMD="./run.sh"
    ;;
esac

if [[ ! -f "${ARCHIVE}" || ! -f "${CONFIG_CMD}" ]]; then
  URL="https://github.com/actions/runner/releases/download/v${RUNNER_VERSION}/${ARCHIVE}"
  echo "downloading ${URL}"
  curl -fL -o "${ARCHIVE}" "${URL}"
  if [[ "${RUNNER_OS}" == "win" ]]; then
    powershell.exe -NoProfile -Command "Expand-Archive -Force -Path '${ARCHIVE}' -DestinationPath '.'"
  else
    tar xzf "${ARCHIVE}"
  fi
fi

if [[ ! -f ".runner" ]]; then
  REG_TOKEN="$(gh api -X POST "repos/${REPO}/actions/runners/registration-token" --jq .token)"
  "${CONFIG_CMD}" \
    --unattended \
    --url "https://github.com/${REPO}" \
    --token "${REG_TOKEN}" \
    --name "${RUNNER_NAME}" \
    --labels "self-hosted" \
    --work "_work" \
    --replace
  unset REG_TOKEN
fi

echo "runner configured in ${RUNNER_DIR}; start with: cd ${RUNNER_DIR} && ${RUN_CMD}"
