"""Firecracker sandboxes booted from a declared image

Revision ID: 0005
Revises: 0004
Create Date: 2026-10-14 22:55:00 UTC
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0005"
down_revision: str | None = "0004"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "sandboxes",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("project_id", sa.Uuid(), nullable=False),
        sa.Column("image", sa.String(length=64), nullable=False),
        sa.Column("vcpu", sa.Integer(), nullable=False),
        sa.Column("memory_mib", sa.Integer(), nullable=False),
        sa.Column(
            "status",
            sa.Enum("running", name="sandbox_status", native_enum=False, length=16),
            nullable=False,
        ),
        sa.Column("hypervisor_vm_id", sa.String(length=64), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(
            ["project_id"], ["projects.id"], name=op.f("fk_sandboxes_project_id_projects"), ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_sandboxes")),
    )
    op.create_index(op.f("ix_sandboxes_project_id"), "sandboxes", ["project_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_sandboxes_project_id"), table_name="sandboxes")
    op.drop_table("sandboxes")
