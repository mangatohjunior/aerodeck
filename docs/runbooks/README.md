# Runbooks

Operational procedures for AeroDeck. Follow these instead of improvising from
chat history.

| Runbook | When to use it |
| ------- | -------------- |
| [Control plane](control-plane.md) | Run the API, worker, and tests locally; apply Alembic migrations. |
| [Terraform remote state](terraform-state.md) | Bootstrap the Spaces bucket, initialise a stack, recover a locked state file. |
| [Platform network](platform-network.md) | Project and private VPC per environment; how later stacks attach. |
| [Apply from CI](iac-apply.md) | Plan in Actions; apply only on main; prod needs a stored plan and approval. |
| [Issue workflow](issue-workflow.md) | How Epics and Stories move across the board. |

Do not `terraform apply` against shared state from a laptop. Procedure:
[iac-apply.md](iac-apply.md).
