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

## 5. Copy the start scripts from the laptop

The scripts live in git. They must be **LF** (Unix) line endings. From
PowerShell in the repo:

```powershell
scp -i $env:USERPROFILE\.ssh\aerodeck_ed25519 `
  apps/control-plane/scripts/start-on-droplet.sh `
  apps/control-plane/scripts/rewrite_do_postgres_url.py `
  root@174.138.9.16:/root/
```

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

If the script’s first `curl` fails but `docker ps` shows **healthy**, uvicorn
was still starting. Wait a few seconds and curl again. `docker logs aerodeck-api`
shows the bind line `Uvicorn running on http://0.0.0.0:8000`.

## 9. Optional: API clients

`/healthz` and `/readyz` need no auth. For `/api/v1` later, set
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
