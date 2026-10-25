#!/usr/bin/env bash
# Pull the dashboard image from DigitalOcean Container Registry (DOCR),
# recreate `aerodeck-dashboard`, prune dangling layers, and wait for :3000/login.
#
#   sudo bash start-dashboard-on-droplet.sh [image-ref]
set -euo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  echo "run as root on the Droplet" >&2
  exit 1
fi

DASHBOARD_ENV="/etc/aerodeck/dashboard.env"
CONTROL_ENV="/etc/aerodeck/control-plane.env"
IMAGE_FILE="/etc/aerodeck/dashboard-image"
DEFAULT_IMAGE="registry.digitalocean.com/aerodeck/control-plane:dashboard-main"

if [[ ! -f "${DASHBOARD_ENV}" ]]; then
  echo "missing ${DASHBOARD_ENV}; run enroll-console-client.sh first" >&2
  exit 1
fi

DASHBOARD_IMAGE="${1:-}"
if [[ -z "${DASHBOARD_IMAGE}" && -f "${IMAGE_FILE}" ]]; then
  DASHBOARD_IMAGE="$(tr -d '[:space:]' < "${IMAGE_FILE}")"
fi
DASHBOARD_IMAGE="${DASHBOARD_IMAGE:-${DEFAULT_IMAGE}}"

login_docr_if_token_available() {
  local token="${DOCR_TOKEN:-${DIGITALOCEAN_TOKEN:-}}"
  if [[ -z "${token}" && -f "${CONTROL_ENV}" ]]; then
    # shellcheck disable=SC1090
    token="$(set -a; source "${CONTROL_ENV}"; printf '%s' "${AERODECK_DIGITALOCEAN_TOKEN:-}")"
  fi
  if [[ -n "${token}" ]]; then
    printf '%s' "${token}" | docker login registry.digitalocean.com \
      --username "${token}" \
      --password-stdin >/dev/null
  fi
}

login_docr_if_token_available

echo "pulling ${DASHBOARD_IMAGE}"
docker pull "${DASHBOARD_IMAGE}"
docker tag "${DASHBOARD_IMAGE}" aerodeck/dashboard:dev

mkdir -p /etc/aerodeck
printf '%s\n' "${DASHBOARD_IMAGE}" > "${IMAGE_FILE}"

docker rm -f aerodeck-dashboard >/dev/null 2>&1 || true
docker run -d --name aerodeck-dashboard --network host --restart unless-stopped \
  --env-file "${DASHBOARD_ENV}" \
  -e HOSTNAME=0.0.0.0 \
  aerodeck/dashboard:dev

docker image prune -f >/dev/null 2>&1 || true

wait_for_dashboard() {
  local i code
  echo "waiting up to 30s for the dashboard on :3000/login"
  for i in $(seq 1 30); do
    code="$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3000/login || true)"
    if [[ "${code}" == "200" ]]; then
      echo "dashboard listening on :3000 (200)"
      return 0
    fi
    sleep 1
  done
  echo "dashboard did not answer 200 on :3000/login" >&2
  docker logs aerodeck-dashboard >&2 || true
  return 1
}

wait_for_dashboard

publish_console_route_if_present() {
  local script="/root/aerodeck/publish-console-route.py"
  if [[ ! -f "${script}" && -f "/root/publish-console-route.py" ]]; then
    script="/root/publish-console-route.py"
  fi
  if [[ -f "${script}" && -f "${DASHBOARD_ENV}" ]]; then
    echo "ensuring console route and certificate at dev.app.aero-deck.app"
    python3 "${script}" || echo "warning: publish-console-route.py returned non-zero status" >&2
  fi
}

publish_console_route_if_present
