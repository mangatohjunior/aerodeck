# Edge routing (Traefik)

The control plane is the source of Traefik routes. Declare a hostname on a
project; Traefik pulls the HTTP provider snapshot. Certificates use DNS-01.
Creating or deleting a route also publishes or withdraws the public address
record so DNS matches what the API (and Git) declared.

No DigitalOcean account is required. Traefik can run against a laptop API.

## Declare a route

After a token, project, and environment exist
([control-plane.md](control-plane.md)):

```bash
curl -s -X POST http://127.0.0.1:8000/api/v1/projects/<project-id>/routes \
  -H "authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' \
  -d '{
    "environment_id": "<environment-id>",
    "hostname": "payments.aero-deck.app",
    "path_prefix": "/",
    "backend_host": "10.10.1.20",
    "backend_port": 8080
  }'
```

Hostnames are unique platform-wide. `enabled: false` keeps the row but drops it
from Traefik and withdraws the public DNS record. Every route call, including
`GET /api/v1/projects/{id}/routes`, needs a token.

## Traefik HTTP provider

`GET /api/v1/edge/traefik` returns Traefik v3 dynamic configuration. Disabled
routes are omitted.

Authenticate with either:

1. A normal API bearer (`POST /api/v1/auth/token`), or
2. `AERODECK_TRAEFIK_PROVIDER_TOKEN` — a static secret Traefik can send without
   refreshing JWTs.

```yaml
# traefik.yaml (operator-managed; not applied by Terraform in this story)
entryPoints:
  web:
    address: ":80"
  websecure:
    address: ":443"

providers:
  http:
    endpoint: "http://control-plane:8000/api/v1/edge/traefik"
    pollInterval: "5s"
    headers:
      Authorization: "Bearer <AERODECK_TRAEFIK_PROVIDER_TOKEN>"
```

Point `backend_host` at a name or address Traefik can reach (Docker service
name, private VPC IP). Until DigitalOcean exists, use a local process.

## Zone: aero-deck.app

The product zone is **`aero-deck.app`** (registered at Namecheap; nameservers
are DigitalOcean `ns1`/`ns2`/`ns3.digitalocean.com`). The zone already exists
in DigitalOcean → **Networking → Domains**. Keep records in DigitalOcean;
**do not** add them at Namecheap.

Wait for NS to propagate (`nslookup -type=NS aero-deck.app`) before Traefik
and DNS-01 publish records. Intended names:

| Hostname | Role |
| -------- | ---- |
| `aero-deck.app` | Public site (`/about`, `/policy`) |
| `app.aero-deck.app` | Operator console |
| `api.aero-deck.app` | Control plane (via Traefik, not Droplet `:8000`) |
| `edge.aero-deck.app` | Traefik entry (`A` to the Traefik public IPv4) |
| `<project>.aero-deck.app` | Tenant apps; CNAME to `edge.aero-deck.app` |

The API publishes those tenant records when a route is created
(`AERODECK_DNS_RECORDS_PROVIDER=digitalocean`,
`AERODECK_DNS_RECORD_TARGET=edge.aero-deck.app`). Port 8000 stays VPC-only.

## Public DNS records

Creating an enabled route publishes an address record for its hostname.
Deleting the route, renaming it, or setting `enabled: false` withdraws that
record. Inspect it:

```bash
curl -s http://127.0.0.1:8000/api/v1/projects/<project-id>/routes/<route-id>/dns
```

| Setting | Default | Role |
| ------- | ------- | ---- |
| `AERODECK_DNS_RECORDS_PROVIDER` | `memory` | In-process store, or `digitalocean` |
| `AERODECK_DNS_RECORD_TYPE` | `CNAME` | `A`, `AAAA`, or `CNAME` |
| `AERODECK_DNS_RECORD_TARGET` | `edge.aero-deck.app` | Value the hostname should resolve to (Traefik) |
| `AERODECK_DNS_RECORD_TTL` | `300` | TTL in seconds |
| `AERODECK_DIGITALOCEAN_TOKEN` | unset | Required when the provider is `digitalocean` |

`memory` needs no cloud account. DigitalOcean uses the Domains API
(`POST/DELETE /v2/domains/{zone}/records`). Apex hostnames use `@`.

## Certificates (DNS-01)

Publishing a route creates a **pending** certificate. Issue it:

```bash
curl -s -X POST \
  http://127.0.0.1:8000/api/v1/projects/<project-id>/routes/<route-id>/certificate/issue \
  -H "authorization: Bearer $TOKEN"
```

The issuer presents a TXT record at `_acme-challenge.<hostname>` through the
DNS-01 provider, then stores the cert. The public PEM stays on the certificate
row. The private key is a file under `AERODECK_CERTIFICATE_KEY_DIR`
(default `/var/lib/aerodeck/certs`, mode `0600`), not `certificates.private_key_pem`.
`GET` on that certificate never returns PEM or the private key. Traefik still
receives both on `GET /api/v1/edge/traefik`, read from that directory.

On the Droplet the start script bind-mounts `/var/lib/aerodeck/certs` into
the API container and `chown`s it to uid `10001`. `docker rm` does not delete
the keys. Alembic `0008` drops `private_key_pem`. Keys already in Postgres are
discarded; issue the certificate again after the migration. Do not log the
file contents. Rotation is `POST .../certificate/renew`, which replaces the
same `{certificate-id}.key`.

| Setting | What happens |
| ------- | ------------ |
| `AERODECK_DNS01_PROVIDER=memory` | In-process TXT store. Laptop/CI. |
| `AERODECK_DNS01_PROVIDER=digitalocean` | TXT via the DigitalOcean Domains API. Needs `AERODECK_DIGITALOCEAN_TOKEN`. |
| `AERODECK_ACME_ISSUER=fake` (default) | Self-signed cert, issuer CN `AeroDeck Fake CA`. |
| `AERODECK_ACME_ISSUER=letsencrypt` | RFC 8555 against `AERODECK_ACME_DIRECTORY_URL` (staging by default). Needs `AERODECK_ACME_ACCOUNT_EMAIL` and an RSA PEM in `AERODECK_ACME_ACCOUNT_KEY`. Missing either is `503 acme_unavailable`. |

Renew one route: `POST .../certificate/renew`. Renew everything due in the
next 30 days (`AERODECK_CERTIFICATE_RENEW_BEFORE_DAYS`):

```bash
curl -s -X POST http://127.0.0.1:8000/api/v1/edge/certificates/renew-due \
  -H "authorization: Bearer $TOKEN"
```

After issue, the Traefik snapshot puts the router on `websecure` and includes
`tls.certificates`. Switch production LE by setting the directory URL to
`https://acme-v02.api.letsencrypt.org/directory` after staging works.

## Traefik Droplet

`packages/iac-engine/modules/edge` creates `aerodeck-<env>-edge` in the same
VPC. Cloud-init runs pinned Traefik v3 (`--network host`) polling
`http://<control private ipv4>:8000/api/v1/edge/traefik`. Terraform also
creates the `edge.aero-deck.app` **A** record.

Apply from CI only ([iac-apply.md](iac-apply.md)). After apply:

```bash
terraform output -raw traefik_provider_token
terraform output edge_ipv4
```

Put the token on the control plane as `AERODECK_TRAEFIK_PROVIDER_TOKEN`
(`/etc/aerodeck/control-plane.env`, then
[startup-control-plane.md](startup-control-plane.md)). Do not commit it.

## What this does not do

- Put Traefik on the control-plane Droplet.
- Open port 8000 to the public internet.
- Store Let's Encrypt account keys in Git.

## Related

- #10 — route declarations.
- #11 — TLS from DNS-01.
- #12 — public DNS records (this section).
- #35 — Traefik Droplet and Let's Encrypt issuer.
- #38 — private keys on disk, not in Postgres (this section).
