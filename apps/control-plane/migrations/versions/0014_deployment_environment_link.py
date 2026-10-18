"""nullable deployment project and environment link

Revision ID: 0014
Revises: 0013
Create Date: 2026-10-18 22:30:00 UTC

Console Deploy can remember which environment was targeted. Mock and
unlinked create stay null. ON DELETE SET NULL keeps history if the env
row is removed.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0014"
down_revision: str | None = "0013"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table("deployments") as batch:
        batch.add_column(sa.Column("project_id", sa.Uuid(), nullable=True))
        batch.add_column(sa.Column("environment_id", sa.Uuid(), nullable=True))
        batch.create_index(op.f("ix_deployments_project_id"), ["project_id"], unique=False)
        batch.create_index(op.f("ix_deployments_environment_id"), ["environment_id"], unique=False)
        batch.create_foreign_key(
            op.f("fk_deployments_project_id_projects"),
            "projects",
            ["project_id"],
            ["id"],
            ondelete="SET NULL",
        )
        batch.create_foreign_key(
            op.f("fk_deployments_environment_id_environments"),
            "environments",
            ["environment_id"],
            ["id"],
            ondelete="SET NULL",
        )


def downgrade() -> None:
    with op.batch_alter_table("deployments") as batch:
        batch.drop_constraint(op.f("fk_deployments_environment_id_environments"), type_="foreignkey")
        batch.drop_constraint(op.f("fk_deployments_project_id_projects"), type_="foreignkey")
        batch.drop_index(op.f("ix_deployments_environment_id"))
        batch.drop_index(op.f("ix_deployments_project_id"))
        batch.drop_column("environment_id")
        batch.drop_column("project_id")
