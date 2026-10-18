# Runbooks

Operational procedures for AeroDeck. Follow these instead of improvising from
chat history.

| Runbook | When to use it |
| ------- | -------------- |
| [DigitalOcean account](digitalocean-account.md) | Create the account, billing, token, Spaces bucket, registry, and GitHub secrets. Do this before the first apply. |
| [Deploy](deploy.md) | What is left to get this into DigitalOcean; operator checklist and production gaps. |
| [Control plane](control-plane.md) | Run the API, worker, and tests locally; apply Alembic migrations. |
| [Metrics](metrics.md) | Scrape `/metrics`; alert on readiness, reap failures, and IaC apply failures. |
| [Edge routing](edge-routing.md) | Declare hostnames; Traefik snapshot, DNS records, DNS-01 certs. |
| [Sandboxes](sandboxes.md) | Boot a Firecracker microVM; reap on TTL; enroll hypervisor hosts. |
| [Terraform remote state](terraform-state.md) | Bootstrap the Spaces bucket, initialise a stack, recover a locked state file. |
| [Database backup](database-backup.md) | Dump the control-plane database to Spaces and restore a chosen Alembic revision. |
| [Platform network](platform-network.md) | Project and private VPC per environment; how later stacks attach. |
| [SSH to dev](ssh-dev.md) | Inject an SSH key and open port 22 to your IP so you can log in to the control-plane Droplet. |
| [Startup control plane](startup-control-plane.md) | Pull the image on the Droplet, migrate Postgres, start API and worker. |
| [Provision environments](provision-environments.md) | Worker runs the tenant Terraform stack (#34); not the platform stack. |
| [Apply from CI](iac-apply.md) | Plan in Actions; apply only on main; prod needs a stored plan and approval. |
| [Destroy from CI](iac-destroy.md) | Tear down one environment after a smoke-test apply. Manual, main only. |
| [Issue workflow](issue-workflow.md) | How Epics and Stories move across the board. |
| [Dashboard mock](dashboard-mock.md) | Run the Next.js console and curl `/api/mock/v1` without FastAPI. |
| [Dashboard console](dashboard-console.md) | Serve the operator console and read live projects from the control plane. |

Do not `terraform apply` against shared state from a laptop. Procedure:
[iac-apply.md](iac-apply.md).
