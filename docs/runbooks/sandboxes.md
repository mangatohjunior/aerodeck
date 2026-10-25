# Sandboxes (Firecracker)

The control plane boots a Firecracker microVM from a declared image so a
change can be exercised in isolation. The default hypervisor is in-memory: no
KVM, no bare-metal host, and no DigitalOcean account.

When the sandbox TTL elapses, the control plane stops the microVM so capacity
returns to the pool. Bare-metal KVM hosts are enrolled here — never through
Terraform. See [ADR 0001](../adr/0001-sandbox-runtime-outside-iac.md).

## Boot a sandbox

After a token and project exist ([control-plane.md](control-plane.md)):

```bash
curl -s -X POST http://127.0.0.1:8000/api/v1/projects/<project-id>/sandboxes \
  -H "authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' \
  -d '{"image":"alpine-3.20","vcpu":1,"memory_mib":128,"ttl_seconds":3600}'
```

`image` is a directory name under the image root (`vmlinux` + `rootfs.ext4`),
not a Docker tag and not a filesystem path. Path separators are rejected.
`ttl_seconds` defaults to 3600 (30–86400).

| Setting | Default | Role |
| ------- | ------- | ---- |
| `AERODECK_SANDBOX_HYPERVISOR` | `memory` | In-process fake, or `firecracker` |
| `AERODECK_SANDBOX_IMAGE_ROOT` | `/var/lib/aerodeck/images` | `{root}/{image}/vmlinux` and `rootfs.ext4` |
| `AERODECK_FIRECRACKER_API_URL` | `http://127.0.0.1:8080` | Firecracker HTTP API (required when the hypervisor is `firecracker`) |

`GET /api/v1/projects/{id}/sandboxes` lists them. `hypervisor_vm_id` is never
returned. Every call needs a token ([control-plane.md](control-plane.md)).

### From the operator console (`/sandboxes`)

When the console client is enrolled ([dashboard-console.md](dashboard-console.md)),
operators can also boot and inspect sandboxes on `/sandboxes`:

- **Create:** Submitting **New sandbox** (`project`, `image`, `vcpu` `1–8`,
  `memory_mib` `32–4096`, `ttl_seconds` `30–86400`) POSTs `/api/console/sandboxes`
  → `POST /api/v1/projects/{project_id}/sandboxes`. The console strips
  `host_id` and `hypervisor_vm_id`.
- **List & expiry:** `/sandboxes` groups guests by project and shows each row's
  UTC `expires_at` timestamp (`YYYY-MM-DD HH:MM:SS UTC`). When no sandboxes
  exist yet, an empty-state CTA links directly to **New sandbox** (or
  `/projects` if no project exists yet).
- **Unavailable host (`503 sandbox_unavailable`):** When
  `AERODECK_SANDBOX_HYPERVISOR=firecracker` and no active host is enrolled via
  `POST /api/v1/sandbox-hosts`, console create surfaces
  `No enrolled Firecracker sandbox host is available.` (`503`,
  `code: "sandbox_unavailable"`). If the hypervisor rejects the boot, the
  console surfaces `Hypervisor failed to boot the sandbox microVM.` (`502`,
  `code: "sandbox_failed"`).
- **Mock / local seed:** When `CONTROL_PLANE_URL` is unset, `/sandboxes` renders
  the local seed, hides the create form, returns `404` on
  `POST /api/console/sandboxes`, and never boots real microVMs.

## Destroy on TTL

A running sandbox whose `expires_at` is in the past is torn down when you GET
it, when the worker beat fires, or in a manual batch:

```bash
curl -s -X POST http://127.0.0.1:8000/api/v1/sandboxes/reap-expired \
  -H "authorization: Bearer $TOKEN"
```

The hypervisor receives a stop (`SendCtrlAltDel` on Firecracker; in-memory
pop). The row stays with `status: stopped`. Reaping again returns `[]`. A
hypervisor 502 on one VM is logged and the rest of the batch continues.

The worker runs beat in the same process:

```bash
celery -A app.worker worker --beat --queues aerodeck --loglevel INFO
```

| Setting | Default | Role |
| ------- | ------- | ---- |
| `AERODECK_SANDBOX_REAP_INTERVAL_SECONDS` | `60` | How often beat enqueues the reap. `0` disables the schedule; the POST stays. |

No KVM is required. The laptop/CI hypervisor is still `memory`.

## Enroll a hypervisor host

Provision the KVM machine outside this repository. Then enroll it so
untrusted microVMs land there instead of on the control-plane network:

```bash
curl -s -X POST http://127.0.0.1:8000/api/v1/sandbox-hosts \
  -H "authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' \
  -d '{"name":"kvm-1","api_url":"http://10.0.20.4:8080"}'
```

`api_url` must be `http` or `https`. New sandboxes land on the enrolled host
with the fewest running VMs. `PATCH` `{"status":"disabled"}` to stop
scheduling. `DELETE` is a conflict while any sandbox on that host is running.

With `AERODECK_SANDBOX_HYPERVISOR=memory`, hosts are optional (laptop/CI).
With `firecracker`, create returns `503 sandbox_unavailable` until a host is
enrolled.

## What this does not do

- Add a second cloud provider to `packages/iac-engine`.
- `terraform apply` a Firecracker or Hetzner host.

## Related

- #14 — boot a microVM.
- #15 — destroy on TTL.
- #16 — enroll sandbox hosts (this section).
- #37 — scheduled reap (this section).
- #145, #146, #147 — console sandbox boot, project grouping + expiry, and runbook.
