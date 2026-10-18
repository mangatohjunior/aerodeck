#!/usr/bin/env bash
# Enroll (or rotate) the operator-console API client on the control Droplet.
# Re-running replaces the client secret. The previous value in
# /etc/aerodeck/dashboard.env stops working. This replaces the whole
# AERODECK_AUTH_CLIENTS map with the console client.
#
#   sudo bash enroll-console-client.sh
#
# Do not commit /etc/aerodeck/dashboard.env. Do not print the secret.
set -euo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  echo "run as root on the Droplet" >&2
  exit 1
fi

umask 077
CONTROL_ENV=/etc/aerodeck/control-plane.env
DASHBOARD_ENV=/etc/aerodeck/dashboard.env
CLIENT_ID=console

if [[ ! -f "${CONTROL_ENV}" ]]; then
  echo "missing ${CONTROL_ENV}" >&2
  exit 1
fi

SECRET=$(python3 -c "import secrets; print(secrets.token_urlsafe(48))")
DIGEST=$(SECRET="${SECRET}" python3 -c "import hashlib,os; print(hashlib.sha256(os.environ['SECRET'].encode()).hexdigest())")

# The start script sources this file (last assignment wins) and rewrites one copy.
printf 'AERODECK_AUTH_CLIENTS=%q\n' "{\"${CLIENT_ID}\":\"${DIGEST}\"}" >> "${CONTROL_ENV}"

cat > "${DASHBOARD_ENV}" <<EOF
CONTROL_PLANE_URL=http://127.0.0.1:8000
CONTROL_PLANE_CLIENT_ID=${CLIENT_ID}
CONTROL_PLANE_CLIENT_SECRET=${SECRET}
EOF
chmod 600 "${DASHBOARD_ENV}"
unset SECRET DIGEST

bash /root/start-on-droplet.sh

if docker inspect aerodeck-dashboard >/dev/null 2>&1; then
  docker rm -f aerodeck-dashboard >/dev/null
  docker run -d --name aerodeck-dashboard --network host --restart unless-stopped \
    --env-file "${DASHBOARD_ENV}" \
    -e HOSTNAME=0.0.0.0 \
    aerodeck/dashboard:dev
fi

echo "enrolled client ${CLIENT_ID}; secret is in ${DASHBOARD_ENV}"
