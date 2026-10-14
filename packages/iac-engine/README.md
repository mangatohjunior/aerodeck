# IaC engine

Root Terraform module for the AeroDeck platform stack. DigitalOcean only.
Remote state: DigitalOcean Spaces via the built-in `s3` backend.

How to bootstrap the bucket, initialise a stack, and recover a lock:
**[docs/runbooks/terraform-state.md](../../docs/runbooks/terraform-state.md)**.

```bash
terraform fmt -check
terraform init -backend=false
terraform validate   # needs TF_VAR_do_token set to any non-empty string
```

Do not `terraform apply` from a laptop against shared state. That is #8.
