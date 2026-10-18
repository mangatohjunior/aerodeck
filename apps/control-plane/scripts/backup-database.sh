#!/usr/bin/env bash
# Dump control-plane Postgres and upload it to Spaces.
# Run on the Droplet. GitHub Actions cannot reach the private database host.
#
#   sudo bash /root/backup-database.sh dev
#
# Needs AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY in the environment
# (the Spaces key pair). The database URL is read from the env file and
# is not printed.
set -euo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  echo "run as root on the Droplet" >&2
  exit 1
fi

ENV_NAME="${1:-}"
if [[ ! "${ENV_NAME}" =~ ^[a-z0-9]{1,16}$ ]]; then
  echo "usage: $0 <env>   (dev, staging, or prod)" >&2
  exit 2
fi

ENV_FILE="${AERODECK_ENV_FILE:-/etc/aerodeck/control-plane.env}"
ROOT="$(cd "$(dirname "$0")" && pwd)"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
WORKDIR="$(mktemp -d)"
trap 'rm -rf "${WORKDIR}"' EXIT

# shellcheck disable=SC1090
set -a
# shellcheck disable=SC1090
source "${ENV_FILE}"
set +a

if [[ -z "${AERODECK_DATABASE_URL:-}" ]]; then
  echo "AERODECK_DATABASE_URL is missing from ${ENV_FILE}" >&2
  exit 2
fi

# asyncpg URL -> libpq URL. Captured into a variable, not echoed.
LIBPQ_URL="$(python3 -c 'import os; u=os.environ["AERODECK_DATABASE_URL"]; print(u.replace("postgresql+asyncpg://","postgresql://",1).replace("ssl=require","sslmode=require",1), end="")')"

docker run --rm --network host postgres:16-alpine \
  pg_dump --dbname="${LIBPQ_URL}" --format=custom --no-owner --no-acl \
  > "${WORKDIR}/control-plane.dump"

REVISION="$(docker run --rm --network host postgres:16-alpine \
  psql "${LIBPQ_URL}" -tAc 'SELECT version_num FROM alembic_version' | tr -d '[:space:]')"

python3 "${ROOT}/database_backup.py" put \
  --env "${ENV_NAME}" \
  --revision "${REVISION}" \
  --stamp "${STAMP}" \
  --file "${WORKDIR}/control-plane.dump"

echo "backup revision ${REVISION} stamp ${STAMP}"
