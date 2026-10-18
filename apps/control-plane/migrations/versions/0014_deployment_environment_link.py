"""nullable deployment project and environment link

Revision ID: 0014
Revises: 0013
Create Date: 2026-10-18 22:30:00 UTC

Console Deploy can remember which environment was targeted. Mock and
unlinked create stay null. A composite FK to environments(project_id, id)
with ON DELETE SET NULL clears both columns together so the both-or-neither
invariant survives an environment delete.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0014"
down_revision: str | None = "0013"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table("environments") as batch:
        batch.create_unique_constraint(
            "uq_environments_project_id_id",
            ["project_id", "id"],
        )

    with op.batch_alter_table("deployments") as batch:
        batch.add_column(sa.Column("project_id", sa.Uuid(), nullable=True))
        batch.add_column(sa.Column("environment_id", sa.Uuid(), nullable=True))
        batch.create_index(op.f("ix_deployments_project_id"), ["project_id"], unique=False)
        batch.create_index(op.f("ix_deployments_environment_id"), ["environment_id"], unique=False)
        batch.create_foreign_key(
            op.f("fk_deployments_project_environment"),
            "environments",
            ["project_id", "environment_id"],
            ["project_id", "id"],
            ondelete="SET NULL",
        )
        batch.create_check_constraint(
            "ck_deployments_project_environment_pair",
            "(project_id IS NULL) = (environment_id IS NULL)",
        )


def downgrade() -> None:
    with op.batch_alter_table("deployments") as batch:
        batch.drop_constraint("ck_deployments_project_environment_pair", type_="check")
        batch.drop_constraint(op.f("fk_deployments_project_environment"), type_="foreignkey")
        batch.drop_index(op.f("ix_deployments_environment_id"))
        batch.drop_index(op.f("ix_deployments_project_id"))
        batch.drop_column("environment_id")
        batch.drop_column("project_id")

    with op.batch_alter_table("environments") as batch:
        batch.drop_constraint("uq_environments_project_id_id", type_="unique")
