# Startup control plane (dev Droplet)

Terraform creates the Droplet, Postgres, and Redis. CI publishes the image.
Neither logs into the registry nor starts the API. This runbook starts it on
`aerodeck-dev-control`.

Do not `terraform apply` from a laptop ([iac-apply.md](iac-apply.md)).
Do not set GitHub variable `SSH_KEY_IDS` on this live Droplet (ForceNew).
Do not open port 22 to `0.0.0.0/0`.

Port **8000** is VPC-only. Probe from the Droplet, not from your laptop.

## 1. Prerequisites

1. SSH works ([ssh-dev.md](ssh-dev.md)).
2. Dev apply has already created Postgres in the VPC and Docker Redis on the
   Droplet (`aerodeck-redis` on `127.0.0.1:6379`).
3. DigitalOcean Container Registry named `aerodeck` exists
   ([control-plane-image.md](control-plane-image.md)).

From PowerShell:

```powershell
ssh -i $env:USERPROFILE\.ssh\aerodeck_ed25519 root@174.138.9.16
```

Replace the IPv4 if `terraform output droplet_ipv4` differs.

## 2. Confirm Redis and the image name

On the Droplet:

```bash
docker ps
cat /etc/aerodeck/control-plane-image
```

You should see `aerodeck-redis` and a line like
`registry.digitalocean.com/aerodeck/control-plane:main`.

## 3. Log in to the registry

Use the **DigitalOcean API token** (GitHub secret `DIGITALOCEAN_TOKEN`). Do
**not** use Docker Hub username or password.

```bash
docker login registry.digitalocean.com
```

Username: the token (or your DigitalOcean email). Password: the same token.

## 4. Publish the image if pull 404s

```bash
image=$(cat /etc/aerodeck/control-plane-image)
docker pull "$image"
```

If you get `not found`, CI built before `DIGITALOCEAN_TOKEN` existed and
skipped the push. Actions → **Control plane image** → re-run the latest
**main** workflow. Confirm DigitalOcean → Container Registry → `aerodeck`
shows `control-plane` tags `main` and a git SHA. Then `docker pull` again.

## 5. Install the start scripts from the image

The scripts are in the image at `/app/scripts/`. Use those. An old file at
`/root/start-on-droplet.sh` (copied earlier with `scp`) curls `:8000` once
and exits with `curl: (7) ... after 0 ms` while uvicorn is still binding.

On the Droplet, after the pull in step 4:

```bash
IMAGE=$(tr -d '[:space:]' < /etc/aerodeck/control-plane-image)
docker run --rm --entrypoint cat "$IMAGE" /app/scripts/start-on-droplet.sh > /root/start-on-droplet.sh
docker run --rm --entrypoint cat "$IMAGE" /app/scripts/rewrite_do_postgres_url.py > /root/rewrite_do_postgres_url.py
sed -i 's/\r$//' /root/start-on-droplet.sh /root/rewrite_do_postgres_url.py
chmod +x /root/start-on-droplet.sh
grep -n 'waiting up to 30s' /root/start-on-droplet.sh
```

`grep` must print a line. The script then waits up to 30s and does not print
`curl: (7)` while uvicorn is binding.

Laptop `scp` still works when SSH is open, but the image copy is the one
that matches the tag you just pulled.

On the Droplet, strip CR if you still see `set: pipefail: invalid option name`:

```bash
sed -i 's/\r$//' /root/start-on-droplet.sh /root/rewrite_do_postgres_url.py
chmod +x /root/start-on-droplet.sh
```

Run with `sudo bash`, not `sh`.

## 6. Copy the full private Postgres URI

DigitalOcean → Databases → `aerodeck-dev-pg` → **Connection details** →
**VPC / private**.

Copy the **entire** URI. It looks like:

```
postgresql://doadmin:PASSWORD@private-aerodeck-dev-pg-do-user-…:25060/defaultdb?sslmode=require
```

Required pieces: user, password, `private-…` host, port **25060**, database
name. Not the hostname alone. No extra `"` after `://`.

The start script rewrites `postgresql://` → `postgresql+asyncpg://` and
`sslmode=require` → `ssl=require`.

## 7. Migrate and start API + worker

On the Droplet, one argument: the URI from step 6 (single quotes):

```bash
sudo bash /root/start-on-droplet.sh 'postgresql://doadmin:PASSWORD@private-…:25060/defaultdb?sslmode=require'
```

The script:

1. Writes `/etc/aerodeck/control-plane.env` (mode `600`).
2. Runs `alembic upgrade head` (expect `0001` … `0007`).
3. Starts `aerodeck-api` (`uvicorn` on `0.0.0.0:8000`, `--network host`).
4. Waits for `/healthz`, then starts `aerodeck-worker`.

Alembic needs `AERODECK_AUTH_SIGNING_KEY` as well as the database URL; the
script generates one on first run and reuses it after that.

The script rewrites core keys but **keeps** extra `AERODECK_*` values already
in the env file (Traefik token, DigitalOcean DNS, Let's Encrypt, IaC worker).
The file is bash-quoted (`%q`) so it can be sourced; Docker gets `-e NAME`
from the sourced shell (not `--env-file`) so PEM account keys keep newlines.

Later starts (same env file, no URI):

```bash
sudo bash /root/start-on-droplet.sh
```

## 8. Verify on the Droplet

```bash
docker ps
curl -sS http://127.0.0.1:8000/healthz
curl -sS http://127.0.0.1:8000/readyz
```

Expect `aerodeck-api`, `aerodeck-worker`, and `aerodeck-redis` **Up**.
`/healthz` is `200`. `/readyz` shows `database: ok` and `queue: ok`.

`curl` to `:8000` from the laptop will time out. That is the cloud firewall,
not a dead process.

The script prints `waiting up to 30s for the API on :8000`, then the JSON
from `/healthz` and `/readyz`. `curl: (7) ... after 0 ms` means
`/root/start-on-droplet.sh` is still the old copy. Repeat step 5 from the
image, then run the script again. `docker logs aerodeck-api` shows
`Uvicorn running on http://0.0.0.0:8000` once it has bound.

## 9. Optional: API clients

`/healthz` and `/readyz` need no auth. Every `/api/v1` resource, including
reads, needs a bearer from `POST /api/v1/auth/token`. Set
`AERODECK_AUTH_CLIENTS` to SHA-256 hex digests of client secrets (never the
secrets). Procedure: [control-plane.md](control-plane.md).

## Troubleshooting

1. **`pipefail: invalid option name`** — CRLF. Repeat step 5 `sed`.
2. **`auth_signing_key Field required`** — ran `docker … alembic` without the
   env file. Use the start script.
3. **`getaddrinfo` / DNS** — URI is hostname-only or a stray quote. Repeat
   step 6 with the full private URI, then:
   `python3 -c "import os,urllib.parse; u=urllib.parse.urlparse(os.environ['AERODECK_DATABASE_URL']); print(u.scheme, u.hostname, u.port)"`
   Host must be `private-…`, port `25060`.
4. **`control-plane:main: not found`** — step 4.
5. **Docker login password** — DigitalOcean token, not Docker Hub.
6. **Ping to the Droplet times out** — ICMP is VPC-only. Use SSH, not ping.

## Related

- SSH: [ssh-dev.md](ssh-dev.md)
- Image publish: [control-plane-image.md](control-plane-image.md)
- Deploy checklist: [deploy.md](deploy.md) section 5
- Local API: [control-plane.md](control-plane.md)
- Runtime stack: [platform-runtime.md](platform-runtime.md)
