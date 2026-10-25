# Operator console

The Next.js app in `apps/dashboard`. The browser keeps the `aerodeck_session`
cookie. The server calls the control plane with an enrolled client. The
browser never sees that client secret or the control-plane bearer.

Overview and Projects read `GET /api/v1/projects`. Project detail uses
`GET /api/v1/projects/{id}` plus that project's environments and routes through
`GET /api/console/projects/{id}` (routes from `GET /api/v1/projects/{id}/routes`;
seed detail with empty env and route lists when the console client is unset).
The Routes section shows hostname and enabled state only; when the console
client is set, operators can also declare a route (`POST /api/console/projects/{id}/routes`
→ `POST /api/v1/projects/{id}/routes`), inspect DNS target/CNAME guidance
(`GET /api/console/projects/{id}/routes/{routeId}/dns` → `GET /api/v1/projects/{id}/routes/{routeId}/dns`),
and view or issue the route's TLS certificate (`GET /api/console/projects/{id}/routes/{routeId}/certificate`
and `POST /api/console/projects/{id}/routes/{routeId}/certificate/issue`, returning only
`route_id`, `hostname`, `status`, and `not_after` — never PEM or private key material).
Without the client, route/DNS/certificate endpoints return 404 and mock routes never call DigitalOcean DNS or ACME. Creating a project uses `POST /api/v1/projects`
through `POST /api/console/projects` when the console client is set; the
Projects form is hidden and create returns 404 when it is not, so the seed
list stays unchanged. Creating an environment uses
`POST /api/v1/projects/{id}/environments` through
`POST /api/console/environments` when the console client is set (slug, name,
kind, DigitalOcean region); create returns 404 when the client is unset.
Deployment environment labels link to `/projects/{id}#environments`. Project detail
can PATCH/DELETE the project (`/api/console/projects/{id}`) and its environments
(`/api/console/projects/{id}/environments/{environmentId}`) when the console client
is set; deletes clear deployment links on the control plane. Mock stays read-only.
Sandboxes read `GET /api/v1/projects/{id}/sandboxes` through
`GET /api/console/sandboxes` (grouped by project on `/sandboxes` with each
guest's UTC `expires_at` timestamp and an empty-state CTA to boot when
enrolled) and, when the console client is set, boot new
microVMs through `POST /api/console/sandboxes` (→
`POST /api/v1/projects/{id}/sandboxes`, returning `id`, `project_id`, `image`,
`vcpu`, `memory_mib`, `status`, `expires_at`, and `created_at`, never `host_id`
or `hypervisor_vm_id`). When no Firecracker host is enrolled, `503`
`sandbox_unavailable` surfaces a clear operator message; without the client,
sandbox create returns 404 and the form stays hidden. Creating a deployment uses
`POST /api/v1/deployments` through `POST /api/console/deployments` when the
console client is set, and stays on `/api/mock/v1/deployments` when it is not
([dashboard-mock.md](dashboard-mock.md)). With the console client, Deploy also
lists environments via `GET /api/console/environments` and, on submit, creates
the deployment with that `project_id`/`environment_id` (so list/detail keep the
link after a restart) then queues `POST .../environments/{id}/provision` with
the new `deployment_id` so the terminal can follow worker lines. A successful
provision enqueue also stores `provision_job_id` on the deployment so list/detail
can reload that Celery job later; older rows and enqueue failures leave it null.
When the console client is set and a deployment has `provision_job_id`, detail
shows a Provision job panel that polls `GET /api/console/jobs/{id}` (→
`GET /api/v1/jobs/{id}`) about every 5s until succeeded/failed, a poll
ceiling (~3 min), consecutive fetch failures, or forever-`queued` stale stop
(control plane maps unknown/expired jobs to `queued`). Already-terminal
deployments (including live Terminal Done/fail) fetch once and stop; if the
job is still active they show a Stale badge and an expiry note instead of a
spinner. Mock detail hides the panel (no jobs API). On a control-plane project
detail, each environment row has **Reconcile**, which POSTs
`/api/console/projects/{id}/environments/{environmentId}/reconcile`
(→ `POST .../reconcile` on the control plane) and shows the accepted
`job_id`. Queue down surfaces a generic unavailable message with no
success state. Without the client, reconcile returns 404. The browser
never calls FastAPI.
An empty Deploy select links operators to Projects to create an environment. Mock
create stays unlinked. If provision cannot be queued after create,
the form stays put, disables Deploy, and shows a generic message so a retry
does not create another orphan row; enqueue also marks that row `failed`. The
JSON body still returns `deployment_id` for typed client handling and server
logs, but the UI must not navigate to the terminal (opening empty logs would
stub `Done`). Without the client, Deploy does not call provision. The list and
the deployment page follow the same mock/control-plane split. Deploy uses a
native `<select>` for environments until the dashboard UI kit gains a shadcn
`Select`. The terminal reads
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
Enqueue seeds a queued line first so the stub cannot emit `Done` before the
worker. Success ends with `Done`; final provision failure publishes a failure
line without `Done` and sets status `failed`. When the stream emits `Done`, the
dashboard server records `succeeded` with `POST /api/v1/deployments/{id}/succeeded`.
A failure line (`Provision queue failed` or `Provision failed:…`, matching the
control-plane constants) triggers `POST /api/v1/deployments/{id}/failed`
(idempotent if the worker already wrote it). A down Redis broker returns `503`
before the SSE body starts.
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

Extract `enroll-console-client.sh`, `dashboard_env.py`, and
`publish-console-route.py` from the control-plane image (or copy them from the
repo if not yet extracted in [startup-control-plane.md](startup-control-plane.md)):

```bash
IMAGE=$(tr -d ' \t\r\n' < /etc/aerodeck/control-plane-image)
mkdir -p /root/aerodeck
docker run --rm --entrypoint cat "$IMAGE" /app/scripts/enroll-console-client.sh > /root/enroll-console-client.sh
docker run --rm --entrypoint cat "$IMAGE" /app/scripts/dashboard_env.py > /root/dashboard_env.py
docker run --rm --entrypoint cat "$IMAGE" /app/scripts/publish-console-route.py > /root/aerodeck/publish-console-route.py
chmod +x /root/enroll-console-client.sh
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

On the Droplet (wait a few seconds for Next.js to bind port 3000 before probing `/login`):

```bash
docker rm -f aerodeck-dashboard
docker run -d --name aerodeck-dashboard --network host --restart unless-stopped \
  --env-file /etc/aerodeck/dashboard.env \
  -e HOSTNAME=0.0.0.0 \
  aerodeck/dashboard:dev
for i in {1..15}; do
  code=$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3000/login || true)
  if [ "$code" = "200" ]; then echo "200"; break; fi
  sleep 1
done
```

`200` means the console is listening. Port 3000 does not answer from your
laptop. `--network host` is what lets the server reach the API on
`127.0.0.1:8000`.

## 4. Publish dev.app.aero-deck.app

Before running `publish-console-route.py`, ensure `/etc/aerodeck/control-plane.env`
has the DigitalOcean DNS and Let's Encrypt settings configured ([edge-routing.md](edge-routing.md)),
otherwise the route stays in memory and issues a self-signed `AeroDeck Fake CA` certificate.

Operator scripts live in `/root/aerodeck` on the control Droplet.
`apps/control-plane/scripts/publish-console-route.py` creates the
console project, the dev environment, and the route to the control private
IPv4 (`10.41.0.2`, or `AERODECK_CONTROL_PRIVATE_IP`) port 3000, then issues or
renews the certificate. If the route was previously created with an older
`backend_host` or a fake/staging certificate (`AeroDeck Fake CA` or staging),
re-running the script updates `backend_host` and automatically calls
`/certificate/renew` (or pass `--renew` to force renewal). The client secret
stays in `/etc/aerodeck/dashboard.env`.

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
