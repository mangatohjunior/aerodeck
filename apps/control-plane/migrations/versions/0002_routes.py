"""routes for Traefik hostnames

Revision ID: 0002
Revises: 0001
Create Date: 2026-10-14 20:00:00 UTC
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0002"
down_revision: str | None = "0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "routes",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("project_id", sa.Uuid(), nullable=False),
        sa.Column("environment_id", sa.Uuid(), nullable=False),
        sa.Column("hostname", sa.String(length=253), nullable=False),
        sa.Column("path_prefix", sa.String(length=200), nullable=False),
        sa.Column("backend_host", sa.String(length=253), nullable=False),
        sa.Column("backend_port", sa.Integer(), nullable=False),
        sa.Column("entrypoint", sa.String(length=32), nullable=False),
        sa.Column("enabled", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(
            ["project_id"], ["projects.id"], name=op.f("fk_routes_project_id_projects"), ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["environment_id"],
            ["environments.id"],
            name=op.f("fk_routes_environment_id_environments"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_routes")),
        sa.UniqueConstraint("hostname", name="uq_routes_hostname"),
    )
    op.create_index(op.f("ix_routes_project_id"), "routes", ["project_id"], unique=False)
    op.create_index(op.f("ix_routes_environment_id"), "routes", ["environment_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_routes_environment_id"), table_name="routes")
    op.drop_index(op.f("ix_routes_project_id"), table_name="routes")
    op.drop_table("routes")
