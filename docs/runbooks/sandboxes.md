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
returned. Mutations need a token; list and get do not.

## Destroy on TTL

A running sandbox whose `expires_at` is in the past is torn down when you GET
it, or in batch:

```bash
curl -s -X POST http://127.0.0.1:8000/api/v1/sandboxes/reap-expired \
  -H "authorization: Bearer $TOKEN"
```

The hypervisor receives a stop (`SendCtrlAltDel` on Firecracker; in-memory
pop). The row stays with `status: stopped`. Reaping again returns `[]`.

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
