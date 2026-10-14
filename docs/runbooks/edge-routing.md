# Edge routing (Traefik)

The control plane is the source of Traefik routes. Declare a hostname on a
project; Traefik pulls the HTTP provider snapshot. TLS (#11) and DNS records
(#12) are not in this runbook.

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
from Traefik. Mutations need a token; `GET /api/v1/projects/{id}/routes` does not.

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

providers:
  http:
    endpoint: "http://control-plane:8000/api/v1/edge/traefik"
    pollInterval: "5s"
    headers:
      Authorization: "Bearer <AERODECK_TRAEFIK_PROVIDER_TOKEN>"
```

Point `backend_host` at a name or address Traefik can reach (Docker service
name, private VPC IP). Until DigitalOcean exists, use a local process.

## What this does not do

- Issue certificates (#11).
- Create DNS records (#12).
- `terraform apply` a Traefik Droplet. Applies stay in CI
  ([iac-apply.md](iac-apply.md)).

## Related

- #10 — this runbook.
- #11 — TLS from DNS.
- #12 — DNS record lifecycle.
