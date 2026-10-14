# Runbooks

Operational procedures for AeroDeck. Follow these instead of improvising from
chat history.

| Runbook | When to use it |
| ------- | -------------- |
| [Control plane](control-plane.md) | Run the API, worker, and tests locally; apply Alembic migrations. |
| [Terraform remote state](terraform-state.md) | Bootstrap the Spaces bucket, initialise a stack, recover a locked state file. |
| [Issue workflow](issue-workflow.md) | How Epics and Stories move across the board. |

Applies still belong to CI (#8). Do not `terraform apply` against shared state
from a laptop.
