"""enroll bare-metal hosts as sandbox hypervisors

Revision ID: 0007
Revises: 0006
Create Date: 2026-10-14 23:20:00 UTC
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0007"
down_revision: str | None = "0006"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "sandbox_hosts",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(length=63), nullable=False),
        sa.Column("api_url", sa.String(length=253), nullable=False),
        sa.Column(
            "status",
            sa.Enum("enrolled", "disabled", name="sandbox_host_status", native_enum=False, length=16),
            nullable=False,
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_sandbox_hosts")),
        sa.UniqueConstraint("name", name="uq_sandbox_hosts_name"),
    )
    with op.batch_alter_table("sandboxes") as batch:
        batch.add_column(sa.Column("host_id", sa.Uuid(), nullable=True))
        batch.create_index(op.f("ix_sandboxes_host_id"), ["host_id"], unique=False)
        batch.create_foreign_key(
            op.f("fk_sandboxes_host_id_sandbox_hosts"),
            "sandbox_hosts",
            ["host_id"],
            ["id"],
            ondelete="SET NULL",
        )


def downgrade() -> None:
    with op.batch_alter_table("sandboxes") as batch:
        batch.drop_constraint(op.f("fk_sandboxes_host_id_sandbox_hosts"), type_="foreignkey")
        batch.drop_index(op.f("ix_sandboxes_host_id"))
        batch.drop_column("host_id")
    op.drop_table("sandbox_hosts")
