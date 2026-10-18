# Operator console

The Next.js app in `apps/dashboard`. The browser keeps the `aerodeck_session`
cookie. The server calls the control plane with an enrolled client. The
browser never sees that client secret or the control-plane bearer.

Overview and Projects read `GET /api/v1/projects`. Sandboxes, deployments, and
sign-in stay on the mock API ([dashboard-mock.md](dashboard-mock.md)).

Do not `terraform apply` from a laptop. Port 3000 stays VPC-only.

## 1. Enroll a client

On `aerodeck-dev-control`, run
`apps/control-plane/scripts/enroll-console-client.sh`. It generates a secret,
stores only the SHA-256 digest in `/etc/aerodeck/control-plane.env`, writes
the secret to `/etc/aerodeck/dashboard.env`, and restarts the API. Running it
again rotates that secret. It replaces the whole `AERODECK_AUTH_CLIENTS` map
with the `console` client. The start script keeps the other keys already in
the control-plane env file.

Copy the script onto the Droplet (the image does not include it until the
next control-plane image build), then:

```bash
sed -i 's/\r$//' /root/enroll-console-client.sh
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

## 4. Publish app.aero-deck.app

The route backend is the control Droplet **private** IPv4
(`terraform output -raw droplet_private_ipv4`), port 3000. From the Droplet,
using the secret already in `/etc/aerodeck/dashboard.env`:

```bash
set -a
source /etc/aerodeck/dashboard.env
set +a
TOKEN=$(curl -s -X POST http://127.0.0.1:8000/api/v1/auth/token \
  -H 'content-type: application/json' \
  -d "{\"client_id\":\"$CONTROL_PLANE_CLIENT_ID\",\"client_secret\":\"$CONTROL_PLANE_CLIENT_SECRET\"}" \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])")
```

Create a project and a `dev` environment in `ams3` if you do not have them,
then:

```bash
curl -s -X POST "http://127.0.0.1:8000/api/v1/projects/<project-id>/routes" \
  -H "authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' \
  -d '{
    "environment_id": "<environment-id>",
    "hostname": "app.aero-deck.app",
    "path_prefix": "/",
    "backend_host": "<control private ipv4>",
    "backend_port": 3000
  }'
```

That publishes the CNAME to `edge.aero-deck.app`. Issue the certificate:

```bash
curl -s -X POST \
  "http://127.0.0.1:8000/api/v1/projects/<project-id>/routes/<route-id>/certificate/issue" \
  -H "authorization: Bearer $TOKEN"
```

Open `https://app.aero-deck.app`. Let's Encrypt is still the staging
directory, so the browser warns until you switch to the production directory
([edge-routing.md](edge-routing.md)). Sign in there. Overview's project count
is the live `GET /api/v1/projects` total. An empty control plane shows
**No projects yet.**

Unset `TOKEN` when you are done. The session cookie is `Secure` in this
container, so sign-in is on HTTPS.
