# IaC engine

Root Terraform module for the AeroDeck platform stack. DigitalOcean only.
Remote state: DigitalOcean Spaces via the built-in `s3` backend.

How to bootstrap the bucket, initialise a stack, and recover a lock:
**[docs/runbooks/terraform-state.md](../../docs/runbooks/terraform-state.md)**.

Project and private VPC per environment:
**[docs/runbooks/platform-network.md](../../docs/runbooks/platform-network.md)**.

Droplet, managed PostgreSQL, and Redis in that VPC:
**[docs/runbooks/platform-runtime.md](../../docs/runbooks/platform-runtime.md)**.

Control-plane image (DigitalOcean Container Registry, git SHA + `main`):
**[docs/runbooks/control-plane-image.md](../../docs/runbooks/control-plane-image.md)**.

Plan and apply (CI only; prod needs a stored plan and approval):
**[docs/runbooks/iac-apply.md](../../docs/runbooks/iac-apply.md)**.

Tear down one environment after a smoke test (CI only):
**[docs/runbooks/iac-destroy.md](../../docs/runbooks/iac-destroy.md)**.

Tenant environments (`stacks/tenant`, worker-applied, separate state):
**[docs/runbooks/provision-environments.md](../../docs/runbooks/provision-environments.md)**.

```bash
terraform fmt -check
terraform init -backend=false
terraform validate   # needs TF_VAR_do_token set to any non-empty string
```

Do not `terraform apply` from a laptop against shared state.
See [iac-apply.md](../../docs/runbooks/iac-apply.md).
