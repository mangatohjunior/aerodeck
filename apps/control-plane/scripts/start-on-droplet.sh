#!/usr/bin/env bash
# Start (or replace) the control-plane API + worker on the Droplet.
# First run: pass the DigitalOcean *private* connection string as the only arg.
# Later runs: omit the URI; values are reused from /etc/aerodeck/control-plane.env
#
#   sudo bash start-on-droplet.sh 'postgresql://doadmin:PASSWORD@private-…:25060/defaultdb?sslmode=require'
set -euo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  echo "run as root on the Droplet" >&2
  exit 1
fi

ROOT="$(cd "$(dirname "$0")" && pwd)"
ENV_FILE="/etc/aerodeck/control-plane.env"
IMAGE_FILE="/etc/aerodeck/control-plane-image"
REDIS_URL="${AERODECK_REDIS_URL:-redis://127.0.0.1:6379/0}"

if [[ ! -f "${IMAGE_FILE}" ]]; then
  echo "missing ${IMAGE_FILE}" >&2
  exit 1
fi
IMAGE="$(tr -d '[:space:]' < "${IMAGE_FILE}")"

load_env() {
  if [[ -f "${ENV_FILE}" ]]; then
    # shellcheck disable=SC1090
    set -a
    source "${ENV_FILE}"
    set +a
  fi
}

load_env

RAW_URI="${1:-${DO_POSTGRES_URI:-}}"
if [[ -n "${RAW_URI}" ]]; then
  AERODECK_DATABASE_URL="$(python3 "${ROOT}/rewrite_do_postgres_url.py" "${RAW_URI}")"
fi
if [[ -z "${AERODECK_DATABASE_URL:-}" ]]; then
  echo "usage: $0 '<full postgresql:// private URI from DigitalOcean VPC connection details>'" >&2
  exit 2
fi

if [[ -z "${AERODECK_AUTH_SIGNING_KEY:-}" ]]; then
  AERODECK_AUTH_SIGNING_KEY="$(openssl rand -hex 32)"
fi

mkdir -p /etc/aerodeck
umask 077
{
  printf 'AERODECK_ENV=dev\n'
  printf 'AERODECK_AUTH_SIGNING_KEY=%q\n' "${AERODECK_AUTH_SIGNING_KEY}"
  printf 'AERODECK_DATABASE_URL=%q\n' "${AERODECK_DATABASE_URL}"
  printf 'AERODECK_REDIS_URL=%q\n' "${REDIS_URL}"
  for key in \
    AERODECK_AUTH_CLIENTS \
    AERODECK_TRAEFIK_PROVIDER_TOKEN \
    AERODECK_DIGITALOCEAN_TOKEN \
    AERODECK_DNS_RECORDS_PROVIDER \
    AERODECK_DNS_RECORD_TYPE \
    AERODECK_DNS_RECORD_TARGET \
    AERODECK_DNS_RECORD_TTL \
    AERODECK_DNS01_PROVIDER \
    AERODECK_ACME_ISSUER \
    AERODECK_ACME_DIRECTORY_URL \
    AERODECK_ACME_ACCOUNT_EMAIL \
    AERODECK_ACME_ACCOUNT_KEY \
    AERODECK_IAC_WORKER \
    AERODECK_IAC_APPLY \
    AERODECK_SPACES_ACCESS_ID \
    AERODECK_SPACES_SECRET_KEY
  do
    val="${!key:-}"
    if [[ -n "${val}" ]]; then
      printf '%s=%q\n' "${key}" "${val}"
    fi
  done
} > "${ENV_FILE}"
chmod 600 "${ENV_FILE}"
load_env

if ! docker inspect aerodeck-redis >/dev/null 2>&1; then
  echo "aerodeck-redis is not running (cloud-init Docker Redis on 127.0.0.1:6379)" >&2
  exit 1
fi

echo "migrating with ${IMAGE}"
docker run --rm --network host --name aerodeck-migrate \
  -e AERODECK_AUTH_SIGNING_KEY \
  -e AERODECK_DATABASE_URL \
  "${IMAGE}" alembic upgrade head

docker rm -f aerodeck-api aerodeck-worker >/dev/null 2>&1 || true

docker run -d --name aerodeck-api --network host --restart unless-stopped \
  --env-file "${ENV_FILE}" \
  "${IMAGE}"

wait_for_health() {
  local i
  for i in $(seq 1 30); do
    if curl -fsS http://127.0.0.1:8000/healthz >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done
  echo "API did not listen on :8000" >&2
  docker ps -a --filter name=aerodeck-api --filter name=aerodeck-worker
  echo "--- aerodeck-api logs ---" >&2
  docker logs aerodeck-api >&2 || true
  dmesg -T 2>/dev/null | tail -n 20 >&2 || true
  return 1
}

wait_for_health
curl -fsS http://127.0.0.1:8000/healthz
echo
curl -fsS http://127.0.0.1:8000/readyz
echo

docker run -d --name aerodeck-worker --network host --restart unless-stopped \
  --env-file "${ENV_FILE}" \
  "${IMAGE}" \
  celery -A app.worker worker --queues aerodeck --loglevel INFO

echo "saved env at ${ENV_FILE}; next time: sudo bash $0"
