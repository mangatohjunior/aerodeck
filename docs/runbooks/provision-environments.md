# Provision tenant environments (#34)

`POST /api/v1/projects/{id}/environments/{id}/provision` queues a worker job.
With `AERODECK_IAC_WORKER=true` the worker runs **Terraform against the tenant
stack**, not the platform Droplet/Postgres.

State key: `tenants/<project_id>/<environment_id>/terraform.tfstate` in
`aerodeck-tfstate`. Never `<env>/platform/`.

The tenant stack creates a DigitalOcean **Project** only. No Droplet, VPC, or
database (those stay on the platform stack).

## 1. Image

The worker image includes Terraform and `packages/iac-engine`. Build from the
**repository root**:

```bash
docker build -f apps/control-plane/Dockerfile -t aerodeck/control-plane:dev .
```

CI does the same ([control-plane-image.md](control-plane-image.md)).

## 2. Worker environment

On `aerodeck-worker` (in addition to the API env from
[deploy.md](deploy.md) section 5):

| Variable | Purpose |
| -------- | ------- |
| `AERODECK_IAC_WORKER=true` | Install `TerraformProvisioner`. Without this, jobs stay no-ops. |
| `AERODECK_IAC_APPLY=false` | **Plan only** (default). Outcome `changed` is truthful. |
| `AERODECK_IAC_APPLY=true` | Apply the stored plan file. Never `-auto-approve`. |
| `AERODECK_DIGITALOCEAN_TOKEN` | Same token as registry/IaC. |
| `AERODECK_SPACES_ACCESS_ID` | Spaces key for tenant state. |
| `AERODECK_SPACES_SECRET_KEY` | Spaces secret. |

Do not set `AERODECK_IAC_WORKER` on a laptop.

## 3. Enqueue and poll

Need an enrolled client ([control-plane.md](control-plane.md) token steps).

```bash
curl -s -X POST \
  http://127.0.0.1:8000/api/v1/projects/<project-id>/environments/<env-id>/provision \
  -H "authorization: Bearer $TOKEN"

curl -s http://127.0.0.1:8000/api/v1/jobs/<job-id> \
  -H "authorization: Bearer $TOKEN"
```

To stream progress on a console deployment's terminal, pass that deployment's
id in the JSON body (the deployment must already exist):

```bash
curl -s -X POST \
  http://127.0.0.1:8000/api/v1/projects/<project-id>/environments/<env-id>/provision \
  -H "authorization: Bearer $TOKEN" \
  -H "content-type: application/json" \
  -d '{"deployment_id":"<deployment-id>"}'
```

Enqueue publishes `Queued environment provision...` before returning 202 so the
log store is non-empty and the empty-stream stub (which ends in `Done`) cannot
race the worker. If broker dispatch fails after that seed, it also publishes
`Provision queue failed` (still no `Done`) before the error propagates. The
worker then adds start, then on success `Environment provision finished.` and
`Done`, or on final failure only `Provision failed: <ExceptionClass>` (no
`Done`). The console treats `Done` as deployment success, so failures must not
emit it; the SSE follower ends on follow-idle instead. Those lines never include
exception message text or provisioner `detail` (Terraform stdout/stderr can hold
secrets). Mapping the Deploy form onto this call is story #125 (console selects an environment and
queues provision). A `failed` deployment status stays a follow-up (#127).

Dry-run detail contains `terraform plan only`. Apply detail contains
`applied stored plan`. Locks retry (`TransientJobError`). Policy or bad
input fails permanently.

## 4. What this does not do

- Does not apply `dev/platform/terraform.tfstate`.
- Does not create tenant Droplets or DBaaS (account quota).
- Does not replace `NoopProvisioner` unless the worker env is set.
- Does not run from GitHub Actions for tenants; platform apply stays
  [iac-apply.md](iac-apply.md).

## Related

- Deploy checklist: [deploy.md](deploy.md) section 5
- Platform runtime: [platform-runtime.md](platform-runtime.md)
- Story #34
