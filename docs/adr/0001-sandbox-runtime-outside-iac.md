# ADR 0001: Sandbox runtime stays outside the IaC engine

- Status: Accepted
- Date: 2026-10-14
- Issue: #13, #14

## Context

Untrusted, short-lived workloads run as Firecracker microVMs. Firecracker
requires KVM. `packages/iac-engine` provisions DigitalOcean only; the Terraform
allow-list forbids `hetznercloud/hcloud` and every other non-DigitalOcean
provider. Nested virtualization on a Droplet is not an acceptable Firecracker
host.

## Decision

The sandbox hypervisor is a control-plane concern, not a Terraform stack:

- Do not add a second cloud provider to `packages/iac-engine`.
- Do not `terraform apply` Firecracker hosts from this repository.
- Bare-metal KVM machines (the Hetzner pool in Epic 4) are enrolled later
  through the control plane (#16), not through IaC.
- Until a host exists, the API uses an in-memory hypervisor so laptops and CI
  can boot a sandbox without KVM.

## Consequences

- Epic 2 (DigitalOcean project/VPC/Spaces) stays the only Terraform surface.
- Starting a sandbox (#14) does not wait on cloud credentials.
- Destroy-on-TTL (#15) and host registration (#16) extend this API; they still
  must not introduce Hetzner (or any other cloud) into the IaC engine.
