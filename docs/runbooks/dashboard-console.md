# Operator console

The Next.js app in `apps/dashboard`. The browser keeps the `aerodeck_session`
cookie. The server calls the control plane with an enrolled client. The
browser never sees that client secret or the control-plane bearer.

Overview and Projects read `GET /api/v1/projects`. Sandboxes read
`GET /api/v1/projects/{id}/sandboxes` through `GET /api/console/sandboxes`.
Creating a deployment uses `POST /api/v1/deployments` through
`POST /api/console/deployments` when the console client is set, and stays on
`/api/mock/v1/deployments` when it is not
([dashboard-mock.md](dashboard-mock.md)). The list and the deployment page
follow the same split. The terminal reads
`GET /api/v1/deployments/{id}/logs` through
`GET /api/console/deployments/{id}/logs` when the console client is set, and
stays on `/api/mock/v1/deployments/{id}/logs` when it is not. An unknown
deployment id does not stream. When Redis is set and `aerodeck:deployment-logs:{id}` already has lines, the
control-plane stream follows until `Done`, or until
`AERODECK_DEPLOYMENT_LOG_FOLLOW_IDLE_SECONDS` (default 1800) elapses with no
new line (it does not invent `Done`). Publishes do not left-trim the list (SSE
cursor stays stable; TTL expires the key) and refuse past `MAX_LINES`. If the
list is empty at open, it polls for up to
`AERODECK_DEPLOYMENT_LOG_FIRST_PUBLISH_GRACE_SECONDS` (default 2) for the first
line, then emits the three-line stub so the Terminal still reaches `Done`.
Without Redis, the in-memory store is a snapshot of lines present at open, or
the stub when empty. A provision job may publish those lines when queued with
`{"deployment_id":"..."}` ([provision-environments.md](provision-environments.md)).
Success ends with `Done`; final provision failure publishes a failure line
without `Done`. When the stream emits `Done`, the dashboard server records
`succeeded` with `POST /api/v1/deployments/{id}/succeeded`. A down Redis broker
returns `503` before the SSE body starts.
The mock log route still marks its own row succeeded. Sign-in still
posts to `/api/mock/v1/auth/login`. When the console client is set, that
route checks `POST /api/v1/console-users/login` and sets `aerodeck_session`
from the stored user and opens `POST /api/v1/console-sessions`. The cookie
holds that token. A later read uses `POST /api/v1/console-sessions/resolve`,
so a dashboard restart keeps the operator signed in. Sign-out of a control-plane session posts
`POST /api/v1/console-sessions/logout` and clears the cookie only after that
revoke succeeds. A mock-store cookie (mock Google) clears locally and does
not call revoke. A failed revoke leaves the cookie in place. A resolve
failure other than a missing session returns 502 and leaves the operator on
the console. A wrong password
and an unknown email return the same error. Without the client, sign-in and
the session stay in the mock store. A real Google callback
links that verified email with `POST /api/v1/console-users/google` when the
console client is also set. The mock Google profile stays in the dashboard
process, including when the console client is set. That cookie is read from
the mock store first so a restart of Next.js still drops it. Registration uses `POST /api/v1/console-users` through
`POST /api/console/register` when the console client is set, and stays on
`/api/mock/v1/auth/register` when it is not. When `CONTROL_PLANE_URL` is
unset, projects and sandboxes fall back to the local seed.

Do not `terraform apply` from a laptop. Port 3000 stays VPC-only.

## 1. Enroll a client

On `aerodeck-dev-control`, run
`apps/control-plane/scripts/enroll-console-client.sh`. It generates a secret,
stores only the SHA-256 digest in `/etc/aerodeck/control-plane.env`, writes
the secret to `/etc/aerodeck/dashboard.env`, and restarts the API. Running it
again rotates that secret and keeps `GOOGLE_CLIENT_ID` and
`GOOGLE_CLIENT_SECRET` when those lines are already in `dashboard.env`. It
replaces the whole `AERODECK_AUTH_CLIENTS` map with the `console` client. The
start script keeps the other keys already in the control-plane env file.
Google setup is [google-sign-in.md](google-sign-in.md).

Copy `enroll-console-client.sh` and `dashboard_env.py` into the same directory
on the Droplet (the image does not include them until the next control-plane
image build), then:

```bash
sed -i 's/\r$//' /root/enroll-console-client.sh /root/dashboard_env.py
sudo bash /root/enroll-console-client.sh
```

Do not commit `/etc/aerodeck/dashboard.env`. Do not paste the secret into chat.
If `aerodeck-dashboard` is already running, the script recreates it so it
picks up the new secret.

## 2. Open port 3000 to the VPC

The control firewall allows the VPC to reach port 8000 and port 3000. Apply
that rule from GitHub Actions: **IaC plan and apply**, branch `main`,
environment **dev**, Apply checked. The plan adds the port 3000 rule. It must
not replace the control Droplet or Postgres.

Until that apply finishes, Traefik cannot open the console.

## 3. Build and run the dashboard

Build off the Droplet. The `s-1vcpu-1gb` host will not finish `next build`.

From Git Bash, build in `apps/dashboard`, then copy a tar. Do not pipe `docker save` into `ssh` on Windows; Git Bash corrupts the stream and `docker load` reports `unrecognized image format`.

```bash
cd /c/Users/bonito/Desktop/aerodeck/aerodeck/apps/dashboard
docker build -t aerodeck/dashboard:dev .
docker save -o dashboard.tar aerodeck/dashboard:dev
scp -i ~/.ssh/aerodeck_ed25519 dashboard.tar root@<control-public-ipv4>:/tmp/dashboard.tar
ssh -i ~/.ssh/aerodeck_ed25519 root@<control-public-ipv4> "docker load -i /tmp/dashboard.tar && rm /tmp/dashboard.tar"
```

On the Droplet:

```bash
docker rm -f aerodeck-dashboard
docker rm -f aerodeck-dashboard
docker run -d --name aerodeck-dashboard --network host --restart unless-stopped \
  --env-file /etc/aerodeck/dashboard.env \
  -e HOSTNAME=0.0.0.0 \
  aerodeck/dashboard:dev
curl -fsS -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3000/login
```

`200` means the console is listening. Port 3000 does not answer from your
laptop. `--network host` is what lets the server reach the API on
`127.0.0.1:8000`.

## 4. Publish dev.app.aero-deck.app

Operator scripts live in `/root/aerodeck` on the control Droplet. Copy
`apps/control-plane/scripts/publish-console-route.py` there. It creates the
console project, the dev environment, and the route to the control private
IPv4 port 3000, then issues the certificate. The client secret stays in
`/etc/aerodeck/dashboard.env`.

```bash
mkdir -p /root/aerodeck
python3 /root/aerodeck/publish-console-route.py
```

That publishes a CNAME `dev.app` to `edge.aero-deck.app`. Open
`https://dev.app.aero-deck.app`. `dev` uses a trusted certificate only when
`AERODECK_ACME_DIRECTORY_URL` is the Let's Encrypt production directory.
`AERODECK_ENV=staging` and `AERODECK_ENV=production` always use that directory
([edge-routing.md](edge-routing.md)). Sign in there. The session cookie is
`Secure` in this container, so sign-in is on HTTPS. `app.aero-deck.app` stays
unused until the production console exists.
