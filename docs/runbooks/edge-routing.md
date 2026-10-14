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
    "hostname": "payments.example.com",
    "path_prefix": "/",
    "backend_host": "10.10.1.20",
    "backend_port": 8080
  }'
```

Hostnames are unique platform-wide. `enabled: false` keeps the row but drops it
from Traefik and withdraws the public DNS record. Mutations need a token;
`GET /api/v1/projects/{id}/routes` does not.

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
| `AERODECK_DNS_RECORD_TARGET` | `edge.example.com` | Value the hostname should resolve to (Traefik) |
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
DNS-01 provider, then stores the cert. `GET` on that certificate never returns
PEM or the private key. Traefik receives them only on `GET /api/v1/edge/traefik`.

| `AERODECK_DNS01_PROVIDER` | What happens |
| ------------------------- | ------------ |
| `memory` (default) | In-process TXT store + fake ACME (self-signed, 90 days). Laptop/CI. |
| `digitalocean` | TXT records via the DigitalOcean Domains API. Needs `AERODECK_DIGITALOCEAN_TOKEN`. |

Renew one route: `POST .../certificate/renew`. Renew everything due in the
next 30 days (`AERODECK_CERTIFICATE_RENEW_BEFORE_DAYS`):

```bash
curl -s -X POST http://127.0.0.1:8000/api/v1/edge/certificates/renew-due \
  -H "authorization: Bearer $TOKEN"
```

After issue, the Traefik snapshot puts the router on `websecure` and includes
`tls.certificates`. Let's Encrypt is not wired until an ACME account exists;
the fake issuer still exercises the DNS-01 path.

## What this does not do

- Talk to Let's Encrypt until an account is configured.
- `terraform apply` a Traefik Droplet. Applies stay in CI
  ([iac-apply.md](iac-apply.md)).

## Related

- #10 — route declarations.
- #11 — TLS from DNS-01.
- #12 — public DNS records (this section).
