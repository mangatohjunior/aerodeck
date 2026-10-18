"""console deployments

Revision ID: 0010
Revises: 0009
Create Date: 2026-10-18 11:20:00 UTC

A stored deploy request. Creating a row does not call DigitalOcean.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0010"
down_revision: str | None = "0009"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "deployments",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("repo_url", sa.String(length=512), nullable=False),
        sa.Column("owner", sa.String(length=100), nullable=False),
        sa.Column("repo", sa.String(length=100), nullable=False),
        sa.Column(
            "status",
            sa.Enum("queued", "running", "succeeded", name="deployment_status", native_enum=False, length=16),
            nullable=False,
        ),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_deployments")),
    )
    op.create_index(op.f("ix_deployments_started_at"), "deployments", ["started_at"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_deployments_started_at"), table_name="deployments")
    op.drop_table("deployments")
